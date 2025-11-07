"""
================================================================================
MODULE:             FastAPI Worker with Intelligent Stream Processing
FILE:               fastapi_worker.py
VERSION:            2.0.0 - Clean Event Architecture
AUTHOR:             nikos-geranios_vgi
DATE:               2025-11-07
================================================================================

ARCHITECTURE IMPROVEMENTS:
- Intelligent stream processing that forwards events directly
- No double-wrapping of structured events
- Smart detection of event JSON vs log messages
- Clean separation of stdout (events) and stderr (logs)

DATA FLOW:
1. Worker receives job from Redis queue
2. Spawns subprocess for main.py script
3. Captures stdout (clean events) and stderr (debug logs)
4. Forwards events directly without wrapping
5. Wraps only actual log messages
6. Publishes to Redis PubSub for WebSocket delivery

RECOGNIZED EVENT TYPES:
- PRE_CHECK_RESULT: Individual check result
- PRE_CHECK_COMPLETE: Complete summary (enables Review tab)
- OPERATION_START: Operation initialization
- STEP_COMPLETE: Progress update
- OPERATION_COMPLETE: Final status
================================================================================
"""

import asyncio
import subprocess
import json
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Optional, Tuple, Any, Dict, cast, List, Set

import redis
import redis.asyncio as aioredis

# =============================================================================
# SECTION 1: LOGGING CONFIGURATION
# =============================================================================

logger = logging.getLogger("FASTAPI_WORKER")
logger.setLevel(logging.INFO)

console_handler = logging.StreamHandler()
console_handler.setLevel(logging.INFO)
formatter = logging.Formatter(
    "%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s"
)
console_handler.setFormatter(formatter)
logger.addHandler(console_handler)

# =============================================================================
# SECTION 2: CONFIGURATION CONSTANTS
# =============================================================================

REDIS_HOST = os.getenv("REDIS_HOST", "redis_broker")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_CHANNEL_PREFIX = "ws_channel:job:"
REDIS_JOB_QUEUE = "automation_jobs_queue"

PYTHON_INTERPRETER_PATH = "/usr/local/bin/python"
BASE_SCRIPT_ROOT = "/app/app_gateway/py_scripts"

# Event types that should be forwarded directly without wrapping
RECOGNIZED_EVENT_TYPES: Set[str] = {
    "PRE_CHECK_COMPLETE",
    "PRE_CHECK_RESULT",
    "OPERATION_COMPLETE",
    "OPERATION_START",
    "STEP_COMPLETE",
    "STEP_PROGRESS",
    "DEVICE_PROGRESS",
    "UPGRADE_PROGRESS",
}

# =============================================================================
# SECTION 3: REDIS CONNECTION MANAGEMENT
# =============================================================================

r: Optional[redis.Redis] = None

try:
    r = redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        decode_responses=True,
        socket_connect_timeout=5,
        retry_on_timeout=True,
    )
    r.ping()
    logger.info(f"✅ WORKER: Connected to Redis at {REDIS_HOST}:{REDIS_PORT}")
except Exception as e:
    logger.error(f"❌ WORKER: Failed to connect to Redis: {e}")

# =============================================================================
# SECTION 4: STREAM PROCESSOR CLASS
# =============================================================================

class StreamProcessor:
    """
    Intelligent stream processor that distinguishes between events and logs.

    DESIGN PRINCIPLES:
    - Events are JSON objects with "event_type" field
    - Events from stdout are forwarded directly (no wrapping)
    - Logs from stderr are wrapped as LOG_MESSAGE events
    - Embedded events in logs are extracted and forwarded

    ARCHITECTURE:
    - main.py sends events to stdout as clean JSON
    - main.py sends logs to stderr for debugging
    - Worker forwards stdout JSON events directly
    - Worker wraps stderr logs for display

    Author: nikos-geranios_vgi
    Date: 2025-11-07
    """

    def __init__(self, job_id: str):
        """
        Initialize stream processor for a specific job.

        Args:
            job_id: Unique job identifier
        """
        self.job_id = job_id
        self.event_count = 0
        self.log_count = 0

        logger.info(f"[PROCESSOR] Initialized for job {job_id}")

    def is_valid_event_json(self, line: str) -> bool:
        """
        Quick check if line might be event JSON before parsing.

        Args:
            line: Input line

        Returns:
            bool: True if line starts with { and contains event_type
        """
        stripped = line.strip()
        return (
            stripped.startswith('{') and
            '"event_type"' in stripped
        )

    def parse_and_validate_event(self, line: str) -> Optional[Dict[str, Any]]:
        """
        Parse JSON and validate it's a recognized event.

        Args:
            line: Input line

        Returns:
            Parsed event dict or None
        """
        try:
            data = json.loads(line)

            # Must be a dict with event_type
            if not isinstance(data, dict) or "event_type" not in data:
                return None

            event_type = data["event_type"]

            # Check if it's a recognized event type
            if event_type in RECOGNIZED_EVENT_TYPES:
                return data

            # Also allow LOG_MESSAGE events
            if event_type == "LOG_MESSAGE":
                return data

            logger.debug(f"[PROCESSOR] Unknown event type: {event_type}")
            return None

        except json.JSONDecodeError:
            return None
        except Exception as e:
            logger.debug(f"[PROCESSOR] Event validation error: {e}")
            return None

    def extract_embedded_event(self, line: str) -> Optional[Dict[str, Any]]:
        """
        Extract event JSON that might be embedded in a log line.

        Handles cases where logging framework outputs JSON as part of log message.

        Args:
            line: Log line that might contain embedded JSON

        Returns:
            Extracted event dict or None
        """
        if '{"event_type"' not in line:
            return None

        try:
            # Find JSON object boundaries
            json_start = line.find('{"event_type"')
            if json_start == -1:
                return None

            # Extract substring starting from JSON
            json_str = line[json_start:]

            # Find matching closing brace
            depth = 0
            end_pos = 0

            for i, char in enumerate(json_str):
                if char == '{':
                    depth += 1
                elif char == '}':
                    depth -= 1
                    if depth == 0:
                        end_pos = i + 1
                        break

            if end_pos > 0:
                clean_json = json_str[:end_pos]
                return self.parse_and_validate_event(clean_json)

        except Exception as e:
            logger.debug(f"[PROCESSOR] Embedded event extraction failed: {e}")

        return None

    async def process_stdout_line(self, line: str) -> Optional[str]:
        """
        Process stdout line - expect clean JSON events here.

        ARCHITECTURE NOTE:
        - main.py sends events to stdout as clean JSON
        - These should be forwarded directly without wrapping
        - Any non-JSON output is wrapped as LOG_MESSAGE

        Args:
            line: Line from stdout

        Returns:
            Message to publish or None
        """
        line = line.strip()
        if not line:
            return None

        # Check if it looks like event JSON
        if self.is_valid_event_json(line):
            event_data = self.parse_and_validate_event(line)

            if event_data:
                # Add job_id if not present
                if "job_id" not in event_data:
                    event_data["job_id"] = self.job_id

                self.event_count += 1

                logger.info(
                    f"[PROCESSOR] ✅ Event #{self.event_count} from stdout: "
                    f"{event_data['event_type']} (Job: {self.job_id})"
                )

                # Forward event as-is (just re-serialize after adding job_id)
                return json.dumps(event_data)

        # Not an event - wrap as log message
        self.log_count += 1
        return json.dumps({
            "event_type": "LOG_MESSAGE",
            "level": "INFO",
            "message": line,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "job_id": self.job_id
        })

    async def process_stderr_line(self, line: str) -> Optional[str]:
        """
        Process stderr line - expect Python logging output here.

        ARCHITECTURE NOTE:
        - main.py sends logs to stderr
        - These should be wrapped as LOG_MESSAGE events
        - But check for embedded events (legacy compatibility)

        Args:
            line: Line from stderr

        Returns:
            Message to publish or None
        """
        line = line.strip()
        if not line:
            return None

        # Check if there's an embedded event in the log line
        # (Handles legacy cases where events might be logged)
        embedded_event = self.extract_embedded_event(line)

        if embedded_event:
            # Add job_id if not present
            if "job_id" not in embedded_event:
                embedded_event["job_id"] = self.job_id

            self.event_count += 1

            logger.info(
                f"[PROCESSOR] ✅ Event #{self.event_count} extracted from stderr: "
                f"{embedded_event['event_type']} (Job: {self.job_id})"
            )

            return json.dumps(embedded_event)

        # Determine log level from Python logging format
        level = "INFO"
        if "ERROR" in line or "CRITICAL" in line:
            level = "ERROR"
        elif "WARNING" in line or "⚠️" in line:
            level = "WARNING"
        elif "DEBUG" in line:
            level = "DEBUG"

        # Wrap as log message
        self.log_count += 1
        return json.dumps({
            "event_type": "LOG_MESSAGE",
            "level": level,
            "message": line,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "job_id": self.job_id
        })

    def get_stats(self) -> Dict[str, int]:
        """Get processing statistics."""
        return {
            "events_processed": self.event_count,
            "logs_processed": self.log_count,
            "total_messages": self.event_count + self.log_count
        }

# =============================================================================
# SECTION 5: ASYNC REDIS PUBLISHING
# =============================================================================

async def async_publish_message(channel: str, message: str) -> None:
    """
    Publish a message to Redis Pub/Sub using async client.

    Args:
        channel: Redis channel name
        message: Message to publish (JSON string)
    """
    try:
        async_r = aioredis.from_url(
            f"redis://{REDIS_HOST}:{REDIS_PORT}",
            decode_responses=True,
            socket_connect_timeout=5,
        )
        await async_r.publish(channel, message)
        await async_r.close()

    except Exception as e:
        logger.error(f"❌ Failed to publish to {channel}: {e}")

# =============================================================================
# SECTION 6: STREAM READER
# =============================================================================

async def stream_reader(
    stream: asyncio.StreamReader,
    processor: StreamProcessor,
    stream_name: str,
    redis_channel: str
) -> None:
    """
    Read stream and process lines with intelligent handling.

    ARCHITECTURE:
    - Reads lines asynchronously from stream
    - Routes to appropriate processor method
    - Publishes processed messages to Redis
    - Handles errors gracefully

    Args:
        stream: Async stream to read from
        processor: Stream processor instance
        stream_name: Name of stream (stdout/stderr)
        redis_channel: Redis channel for publishing
    """
    logger.info(f"[STREAM] Starting {stream_name} reader for job {processor.job_id}")

    line_count = 0

    while True:
        try:
            line_bytes = await stream.readline()

            if not line_bytes:
                logger.info(
                    f"[STREAM] {stream_name} ended for job {processor.job_id} "
                    f"({line_count} lines processed)"
                )
                break

            line_count += 1
            line = line_bytes.decode('utf-8', errors='replace')

            # Process based on stream type
            if stream_name == "stdout":
                message = await processor.process_stdout_line(line)
            else:  # stderr
                message = await processor.process_stderr_line(line)

            # Publish if we have a message
            if message:
                asyncio.create_task(async_publish_message(redis_channel, message))

        except Exception as e:
            logger.error(
                f"❌ Error reading {stream_name} for job {processor.job_id}: {e}"
            )
            break

    # Log final statistics
    stats = processor.get_stats()
    logger.info(
        f"[STREAM] {stream_name} statistics for job {processor.job_id}: "
        f"{stats['events_processed']} events, {stats['logs_processed']} logs"
    )

# =============================================================================
# SECTION 7: SCRIPT EXECUTION
# =============================================================================

async def run_script_and_stream_to_redis(
    script_path: Path,
    cmd_args: List[str],
    job_id: str
) -> None:
    """
    Execute script and stream output with intelligent processing.

    ARCHITECTURE:
    1. Spawn subprocess for script execution
    2. Create separate tasks for stdout and stderr processing
    3. Forward events directly, wrap logs appropriately
    4. Handle completion and error states
    5. Send final status if process fails

    Args:
        script_path: Path to script to execute
        cmd_args: Command-line arguments
        job_id: Unique job identifier
    """
    global r

    logger.info("=" * 80)
    logger.info(f"[JOB] Starting job {job_id}")
    logger.info("=" * 80)

    if not r:
        logger.error(f"❌ Cannot run job {job_id}, Redis not connected")
        return

    redis_channel = f"{REDIS_CHANNEL_PREFIX}{job_id}"
    processor = StreamProcessor(job_id)

    # Build full command
    full_command = [PYTHON_INTERPRETER_PATH, "-u", str(script_path)] + cmd_args

    logger.info(f"[JOB] Command: {' '.join(full_command)}")
    logger.info(f"[JOB] Redis channel: {redis_channel}")

    # Setup environment
    subprocess_env = os.environ.copy()
    script_parent_dir = str(script_path.parent)
    subprocess_env["PYTHONPATH"] = (
        f"{BASE_SCRIPT_ROOT}:{script_parent_dir}:"
        + subprocess_env.get("PYTHONPATH", "")
    )
    subprocess_env["PARAMIKO_HOSTKEY_VERIFY"] = "0"

    # Start subprocess
    try:
        process = await asyncio.create_subprocess_exec(
            *full_command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=subprocess_env,
        )
        logger.info(f"✅ [JOB] Process started with PID {process.pid}")

    except Exception as e:
        error_event = json.dumps({
            "event_type": "OPERATION_COMPLETE",
            "level": "CRITICAL",
            "message": f"Failed to start script: {e}",
            "data": {
                "status": "FAILED",
                "success": False,
                "error": str(e)
            },
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "job_id": job_id
        })
        await async_publish_message(redis_channel, error_event)
        logger.critical(f"💥 [JOB] Failed to spawn process for {job_id}: {e}")
        return

    # Verify streams are available
    if process.stdout is None or process.stderr is None:
        logger.error(f"❌ [JOB] Process streams not available for {job_id}")
        return

    # Create stream processing tasks
    # CRITICAL: stdout = events, stderr = logs
    stdout_task = asyncio.create_task(
        stream_reader(
            process.stdout,
            processor,
            "stdout",
            redis_channel
        )
    )

    stderr_task = asyncio.create_task(
        stream_reader(
            process.stderr,
            processor,
            "stderr",
            redis_channel
        )
    )

    # Wait for streams to complete
    await asyncio.gather(stdout_task, stderr_task)

    # Wait for process to complete
    await process.wait()

    # Handle process completion
    stats = processor.get_stats()

    logger.info("=" * 80)
    if process.returncode == 0:
        logger.info(f"✅ [JOB] {job_id} completed successfully")
    else:
        logger.error(f"❌ [JOB] {job_id} failed with exit code {process.returncode}")

        # Send failure event if process failed unexpectedly
        error_event = json.dumps({
            "event_type": "OPERATION_COMPLETE",
            "level": "ERROR",
            "message": f"Process failed with exit code {process.returncode}",
            "data": {
                "status": "FAILED",
                "success": False,
                "exit_code": process.returncode
            },
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "job_id": job_id
        })
        await async_publish_message(redis_channel, error_event)

    logger.info(f"[JOB] Processing statistics: {stats}")
    logger.info("=" * 80)

# =============================================================================
# SECTION 8: JOB CONSUMER
# =============================================================================

async def job_consumer() -> None:
    """
    Continuously monitor Redis queue and process jobs.

    ARCHITECTURE:
    - Uses BLPOP for efficient blocking queue consumption
    - Spawns concurrent tasks for each job
    - Handles errors gracefully with retries
    - Processes jobs in background while monitoring queue

    Author: nikos-geranios_vgi
    Date: 2025-11-07
    """
    global r

    if not r or not r.ping():
        logger.error("❌ Worker cannot start, Redis is not connected")
        return

    logger.info("=" * 80)
    logger.info("👷 FastAPI Worker Started")
    logger.info("=" * 80)
    logger.info(f"📅 Started: {datetime.utcnow().isoformat()}Z")
    logger.info(f"👤 Author: nikos-geranios_vgi")
    logger.info(f"🔧 Redis: {REDIS_HOST}:{REDIS_PORT}")
    logger.info(f"📦 Queue: {REDIS_JOB_QUEUE}")
    logger.info(f"🎯 Recognized Events: {', '.join(sorted(RECOGNIZED_EVENT_TYPES))}")
    logger.info("=" * 80)
    logger.info(f"⏳ Monitoring queue: {REDIS_JOB_QUEUE}")
    logger.info("=" * 80)

    redis_sync_client: redis.Redis = r
    job_counter = 0

    while True:
        try:
            # Use asyncio.to_thread to prevent blocking the event loop
            result = await asyncio.to_thread(
                lambda: redis_sync_client.blpop([REDIS_JOB_QUEUE], timeout=0)
            )

            item: Optional[Tuple[str, str]] = cast(Optional[Tuple[str, str]], result)

            if item:
                _, job_data_json = item

                # Parse job payload
                try:
                    job_payload: Dict[str, Any] = json.loads(job_data_json)
                except json.JSONDecodeError as e:
                    logger.error(f"❌ Invalid JSON in job payload: {e}")
                    continue

                job_id = job_payload.get("job_id")
                script_path = Path(job_payload.get("script_path", ""))
                cmd_args = job_payload.get("cmd_args", [])

                # Validate job payload
                if not job_id:
                    logger.error("❌ Job missing job_id")
                    continue

                if not script_path.exists():
                    logger.error(f"❌ Script not found: {script_path}")
                    continue

                if not isinstance(cmd_args, list):
                    logger.error(f"❌ Invalid cmd_args type: {type(cmd_args)}")
                    continue

                job_counter += 1
                logger.info(f"📥 [#{job_counter}] Picked up job: {job_id}")

                # Process job concurrently
                asyncio.create_task(
                    run_script_and_stream_to_redis(script_path, cmd_args, job_id)
                )

        except Exception as e:
            logger.critical(f"💥 Worker error during queue processing: {e}")
            await asyncio.sleep(5)  # Wait before retrying

# =============================================================================
# SECTION 9: MAIN ENTRY POINT
# =============================================================================

if __name__ == "__main__":
    """
    Main entry point for the worker process.

    Starts the job consumer loop and handles graceful shutdown.
    """
    if r and r.ping():
        try:
            asyncio.run(job_consumer())

        except KeyboardInterrupt:
            logger.info("\n🛑 Worker shutting down gracefully...")
            logger.info(f"📅 Shutdown: {datetime.utcnow().isoformat()}Z")
    else:
        logger.error("❌ Cannot start worker - Redis connection failed")
        logger.error("💡 Check Redis configuration and network connectivity")
