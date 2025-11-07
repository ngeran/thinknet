"""
================================================================================
MODULE:             FastAPI Worker with Intelligent Stream Processing
FILE:               worker.py
VERSION:            2.0.0 - Clean Event Architecture
AUTHOR:             nikos-geranios_vgi
DATE:               2025-11-06
================================================================================

ARCHITECTURE IMPROVEMENTS:
- Intelligent stream processing that forwards events directly
- No double-wrapping of structured events
- Smart detection of event JSON vs log messages
- Clean separation of stdout (events) and stderr (logs)

DATA FLOW:
1. Worker receives job from Redis queue
2. Spawns subprocess for main.py script
3. Captures stdout (events) and stderr (logs)
4. Forwards events directly without wrapping
5. Wraps only actual log messages
6. Publishes to Redis PubSub for WebSocket delivery
================================================================================
"""

import asyncio
import subprocess
import json
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Optional, Tuple, Any, Dict, cast, List

import redis
import redis.asyncio as aioredis

# =============================================================================
# SECTION 1: LOGGING CONFIGURATION
# =============================================================================

# Configure worker logging for debugging and monitoring
logger = logging.getLogger("FASTAPI_WORKER")
logger.setLevel(logging.DEBUG)

console_handler = logging.StreamHandler()
console_handler.setLevel(logging.DEBUG)
formatter = logging.Formatter(
    "%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s"
)
console_handler.setFormatter(formatter)
logger.addHandler(console_handler)

# =============================================================================
# SECTION 2: CONFIGURATION CONSTANTS
# =============================================================================

# Redis connection configuration
REDIS_HOST = os.getenv("REDIS_HOST", "redis_broker")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_CHANNEL_PREFIX = "ws_channel:job:"
REDIS_JOB_QUEUE = "automation_jobs_queue"

# Execution environment configuration
PYTHON_INTERPRETER_PATH = "/usr/local/bin/python"
BASE_SCRIPT_ROOT = "/app/app_gateway/py_scripts"

# Recognized event types that should be forwarded directly
RECOGNIZED_EVENT_TYPES = {
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

# Initialize Redis connection for job queue monitoring
r: Optional[redis.Redis] = None

try:
    r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
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

    RESPONSIBILITIES:
    - Detects structured events and forwards them directly
    - Wraps only actual log messages in LOG_MESSAGE events
    - Extracts embedded events from log lines (legacy support)
    - Maintains clean event architecture for frontend

    Author: nikos-geranios_vgi
    Date: 2025-11-06
    """

    def __init__(self, job_id: str):
        """
        Initialize stream processor for a specific job.

        Args:
            job_id (str): Unique job identifier for message tracking
        """
        self.job_id = job_id
        self.processed_events = set()  # Track processed events to avoid duplicates

    def is_valid_event(self, data: Dict[str, Any]) -> bool:
        """
        Check if parsed JSON is a valid event that should be forwarded directly.

        CRITERIA:
        - Must be a dictionary
        - Must have 'event_type' field
        - Event type must be in recognized set

        Args:
            data (Dict[str, Any]): Parsed JSON data to validate

        Returns:
            bool: True if this is a recognized event type for direct forwarding
        """
        if not isinstance(data, dict):
            return False

        event_type = data.get("event_type")
        if not event_type:
            return False

        # Check if it's a recognized event type
        return event_type in RECOGNIZED_EVENT_TYPES

    def extract_json_from_line(self, line: str) -> Optional[Dict[str, Any]]:
        """
        Extract JSON object from a line that might contain other text.

        USE CASE:
        - Handles legacy logging where events might be embedded in log lines
        - Useful for debugging and backward compatibility

        Args:
            line (str): Input line that might contain JSON payload

        Returns:
            Optional[Dict[str, Any]]: Extracted JSON object or None if not found
        """
        # Quick check for JSON-like content
        if '{"event_type"' not in line:
            return None

        try:
            # Find the JSON object start position
            json_start = line.find('{"')
            if json_start == -1:
                return None

            # Extract from start to proper end
            json_str = line[json_start:]

            # Find matching closing brace with proper nesting
            depth = 0
            end_pos = 0
            for i, char in enumerate(json_str):
                if char == "{":
                    depth += 1
                elif char == "}":
                    depth -= 1
                    if depth == 0:
                        end_pos = i + 1
                        break

            if end_pos > 0:
                clean_json = json_str[:end_pos]
                return json.loads(clean_json)

        except (json.JSONDecodeError, Exception) as e:
            logger.debug(f"JSON extraction failed: {e}")

        return None

    async def process_stdout_line(self, line: str) -> Optional[str]:
        """
        Process stdout line - expect clean JSON events here.

        ARCHITECTURE:
        - main.py sends structured events to stdout as clean JSON
        - These should be forwarded directly without wrapping
        - Only add job_id if missing for proper routing

        Args:
            line (str): Raw line from stdout stream

        Returns:
            Optional[str]: JSON string to publish or None if not processable
        """
        line = line.strip()
        if not line:
            return None

        # Try to parse as JSON (primary path for structured events)
        if line.startswith("{"):
            try:
                data = json.loads(line)

                # Check if it's a valid event for direct forwarding
                if self.is_valid_event(data):
                    # Add job_id if not present for proper frontend routing
                    if "job_id" not in data:
                        data["job_id"] = self.job_id

                    logger.info(
                        f"✅ WORKER [{self.job_id}]: Forwarding {data['event_type']} event from stdout"
                    )
                    return json.dumps(data)

            except json.JSONDecodeError:
                logger.debug(f"STDOUT line is not valid JSON: {line[:100]}")

        # Not a structured event, wrap as log message
        return json.dumps(
            {
                "event_type": "LOG_MESSAGE",
                "level": "INFO",
                "message": line,
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "job_id": self.job_id,
            }
        )

    async def process_stderr_line(self, line: str) -> Optional[str]:
        """
        Process stderr line - expect Python logging output here.

        ARCHITECTURE:
        - main.py sends logs and errors to stderr
        - These should be wrapped as LOG_MESSAGE events
        - Check for embedded events for legacy compatibility

        Args:
            line (str): Raw line from stderr stream

        Returns:
            Optional[str]: JSON string to publish or None if not processable
        """
        line = line.strip()
        if not line:
            return None

        # Check if there's an embedded event in the log line (legacy support)
        extracted_data = self.extract_json_from_line(line)
        if extracted_data and self.is_valid_event(extracted_data):
            # Add job_id if not present
            if "job_id" not in extracted_data:
                extracted_data["job_id"] = self.job_id

            logger.info(
                f"✅ WORKER [{self.job_id}]: Extracted {extracted_data['event_type']} from stderr log"
            )
            return json.dumps(extracted_data)

        # Determine log level from Python logging format
        level = "INFO"
        if "ERROR" in line or "CRITICAL" in line:
            level = "ERROR"
        elif "WARNING" in line:
            level = "WARNING"
        elif "DEBUG" in line:
            level = "DEBUG"

        # Wrap as standardized log message event
        return json.dumps(
            {
                "event_type": "LOG_MESSAGE",
                "level": level,
                "message": line,
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "job_id": self.job_id,
            }
        )


# =============================================================================
# SECTION 5: ASYNC PUBLISHING SERVICE
# =============================================================================


async def async_publish_message(channel: str, message: str) -> None:
    """
    Publish a message to Redis Pub/Sub using async client.

    FEATURES:
    - Non-blocking Redis operations
    - Automatic connection management
    - Error handling and logging

    Args:
        channel (str): Redis channel name for publishing
        message (str): JSON message to publish to subscribers
    """
    try:
        async_r = aioredis.from_url(
            f"redis://{REDIS_HOST}:{REDIS_PORT}", decode_responses=True
        )
        await async_r.publish(channel, message)
        await async_r.close()
    except Exception as e:
        logger.critical(f"❌ CRITICAL: Failed to publish to {channel}: {e}")


# =============================================================================
# SECTION 6: STREAM READER IMPLEMENTATION
# =============================================================================


async def stream_reader(
    stream: asyncio.StreamReader,
    processor: StreamProcessor,
    stream_name: str,
    redis_channel: str,
) -> None:
    """
    Read stream and process lines with intelligent handling.

    PROCESS FLOW:
    1. Read line from stream asynchronously
    2. Process based on stream type (stdout/stderr)
    3. Convert to appropriate message format
    4. Publish to Redis channel

    Args:
        stream (asyncio.StreamReader): Async stream to read from
        processor (StreamProcessor): Intelligent stream processor instance
        stream_name (str): Identifier for stream type ('stdout' or 'stderr')
        redis_channel (str): Redis channel for publishing messages
    """
    logger.info(f"📖 WORKER [{processor.job_id}]: Starting {stream_name} reader")

    while True:
        try:
            # ===================================================================
            # SUBSECTION 6.1: STREAM READING
            # ===================================================================
            line_bytes = await stream.readline()
            if not line_bytes:
                logger.info(
                    f"📚 WORKER [{processor.job_id}]: {stream_name} stream ended"
                )
                break

            # ===================================================================
            # SUBSECTION 6.2: DECODING AND PROCESSING
            # ===================================================================
            line = line_bytes.decode("utf-8", errors="replace").strip()
            if not line:
                continue

            # ===================================================================
            # SUBSECTION 6.3: MESSAGE PROCESSING BY STREAM TYPE
            # ===================================================================
            if stream_name == "stdout":
                message = await processor.process_stdout_line(line)
            else:  # stderr
                message = await processor.process_stderr_line(line)

            # ===================================================================
            # SUBSECTION 6.4: MESSAGE PUBLISHING
            # ===================================================================
            if message:
                asyncio.create_task(async_publish_message(redis_channel, message))

        except Exception as e:
            logger.error(
                f"❌ Error reading {stream_name} for job {processor.job_id}: {e}"
            )
            break


# =============================================================================
# SECTION 7: SCRIPT EXECUTION ORCHESTRATOR
# =============================================================================


async def run_script_and_stream_to_redis(
    script_path: Path, cmd_args: List[str], job_id: str
) -> None:
    """
    Execute script and stream output with intelligent processing.

    EXECUTION FLOW:
    1. Validate environment and parameters
    2. Spawn subprocess with proper environment
    3. Create stream processing tasks for stdout and stderr
    4. Monitor process completion
    5. Handle success/failure states

    Args:
        script_path (Path): Path to Python script to execute
        cmd_args (List[str]): Command-line arguments for the script
        job_id (str): Unique job identifier for tracking
    """
    global r

    logger.info(f"🚀 WORKER: Starting job {job_id}")

    # =========================================================================
    # SUBSECTION 7.1: ENVIRONMENT VALIDATION
    # =========================================================================
    if not r:
        logger.error(f"❌ WORKER: Cannot run job {job_id}, Redis not connected")
        return

    if not script_path.exists():
        logger.error(f"❌ WORKER: Script not found: {script_path}")
        return

    # =========================================================================
    # SUBSECTION 7.2: INITIALIZATION
    # =========================================================================
    redis_channel = f"{REDIS_CHANNEL_PREFIX}{job_id}"
    processor = StreamProcessor(job_id)

    # Build full command with unbuffered output
    full_command = [PYTHON_INTERPRETER_PATH, "-u", str(script_path)] + cmd_args
    logger.debug(f"🛠️ WORKER [{job_id}]: Command: {' '.join(full_command)}")

    # =========================================================================
    # SUBSECTION 7.3: ENVIRONMENT SETUP
    # =========================================================================
    subprocess_env = os.environ.copy()
    script_parent_dir = str(script_path.parent)
    subprocess_env["PYTHONPATH"] = (
        f"{BASE_SCRIPT_ROOT}:{script_parent_dir}:"
        + subprocess_env.get("PYTHONPATH", "")
    )
    subprocess_env["PARAMIKO_HOSTKEY_VERIFY"] = "0"  # SSH host key verification

    # =========================================================================
    # SUBSECTION 7.4: PROCESS EXECUTION
    # =========================================================================
    try:
        process = await asyncio.create_subprocess_exec(
            *full_command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=subprocess_env,
        )
        logger.info(f"✅ WORKER [{job_id}]: Process started with PID {process.pid}")

    except Exception as e:
        error_event = json.dumps(
            {
                "event_type": "OPERATION_COMPLETE",
                "level": "CRITICAL",
                "message": f"Failed to start script: {e}",
                "data": {"status": "FAILED", "error": str(e)},
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "job_id": job_id,
            }
        )
        await async_publish_message(redis_channel, error_event)
        logger.critical(f"💥 WORKER [{job_id}]: Failed to spawn process: {e}")
        return

    # =========================================================================
    # SUBSECTION 7.5: STREAM VERIFICATION
    # =========================================================================
    if process.stdout is None or process.stderr is None:
        logger.error(f"❌ WORKER [{job_id}]: Process streams not available")
        return

    # =========================================================================
    # SUBSECTION 7.6: STREAM PROCESSING TASK CREATION
    # =========================================================================
    # CRITICAL: stdout gets events, stderr gets logs based on main.py architecture
    stdout_task = asyncio.create_task(
        stream_reader(process.stdout, processor, "stdout", redis_channel)
    )

    stderr_task = asyncio.create_task(
        stream_reader(process.stderr, processor, "stderr", redis_channel)
    )

    # =========================================================================
    # SUBSECTION 7.7: TASK EXECUTION AND MONITORING
    # =========================================================================
    await asyncio.gather(stdout_task, stderr_task)

    # Wait for process to complete
    await process.wait()

    # =========================================================================
    # SUBSECTION 7.8: COMPLETION HANDLING
    # =========================================================================
    if process.returncode == 0:
        logger.info(f"✅ WORKER [{job_id}]: Process completed successfully")

        # Send success event if not already sent by the script
        success_event = json.dumps(
            {
                "event_type": "OPERATION_COMPLETE",
                "level": "SUCCESS",
                "message": "Process completed successfully",
                "data": {
                    "status": "SUCCESS",
                    "success": True,
                    "exit_code": process.returncode,
                },
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "job_id": job_id,
            }
        )
        await async_publish_message(redis_channel, success_event)

    else:
        logger.error(
            f"❌ WORKER [{job_id}]: Process failed with code {process.returncode}"
        )

        # Send failure event
        error_event = json.dumps(
            {
                "event_type": "OPERATION_COMPLETE",
                "level": "ERROR",
                "message": f"Process failed with exit code {process.returncode}",
                "data": {
                    "status": "FAILED",
                    "success": False,
                    "exit_code": process.returncode,
                },
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "job_id": job_id,
            }
        )
        await async_publish_message(redis_channel, error_event)

    logger.info(f"🏁 WORKER [{job_id}]: Job processing complete")


# =============================================================================
# SECTION 8: JOB CONSUMER SERVICE
# =============================================================================


async def job_consumer() -> None:
    """
    Continuously monitor Redis queue and process jobs.

    ARCHITECTURE:
    - Uses BLPOP for efficient blocking queue consumption
    - Spawns concurrent tasks for each job
    - Handles errors gracefully with retries
    - Maintains separation between job consumption and execution

    Author: nikos-geranios_vgi
    Date: 2025-11-06
    """
    global r

    # =========================================================================
    # SUBSECTION 8.1: SERVICE VALIDATION
    # =========================================================================
    if not r or not r.ping():
        logger.error("❌ Worker cannot start, Redis is not connected")
        return

    logger.info(f"👷 Worker started, monitoring queue: {REDIS_JOB_QUEUE}")

    redis_sync_client: redis.Redis = r

    # =========================================================================
    # SUBSECTION 8.2: MAIN CONSUMER LOOP
    # =========================================================================
    while True:
        try:
            # Use asyncio.to_thread to prevent blocking the event loop
            result = await asyncio.to_thread(
                lambda: redis_sync_client.blpop([REDIS_JOB_QUEUE], timeout=0)
            )

            item: Optional[Tuple[str, str]] = cast(Optional[Tuple[str, str]], result)

            if item:
                # =============================================================
                # SUBSECTION 8.3: JOB PROCESSING
                # =============================================================
                _, job_data_json = item

                # Parse job payload
                job_payload: Dict[str, Any] = json.loads(job_data_json)

                job_id = job_payload.get("job_id")
                script_path = Path(job_payload.get("script_path", ""))
                cmd_args = job_payload.get("cmd_args", [])

                # =============================================================
                # SUBSECTION 8.4: PAYLOAD VALIDATION
                # =============================================================
                if not job_id:
                    logger.error("❌ Job missing job_id")
                    continue

                if not script_path.exists():
                    logger.error(f"❌ Script not found: {script_path}")
                    continue

                if not isinstance(cmd_args, list):
                    logger.error(f"❌ Invalid cmd_args type: {type(cmd_args)}")
                    continue

                logger.info(f"📥 Worker picked up job: {job_id}")

                # =============================================================
                # SUBSECTION 8.5: CONCURRENT JOB EXECUTION
                # =============================================================
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

    RESPONSIBILITIES:
    - Starts the job consumer loop
    - Handles graceful shutdown on interrupt
    - Provides startup diagnostics

    Execution: python worker.py
    """
    if r and r.ping():
        try:
            # =================================================================
            # SUBSECTION 9.1: STARTUP BANNER
            # =================================================================
            logger.info("=" * 80)
            logger.info("🚀 FastAPI Worker v2.0.0 - Starting")
            logger.info("=" * 80)
            logger.info(f"📅 Started at: {datetime.utcnow().isoformat()}Z")
            logger.info(f"👤 Author: nikos-geranios_vgi")
            logger.info(f"🔧 Redis: {REDIS_HOST}:{REDIS_PORT}")
            logger.info(f"📦 Queue: {REDIS_JOB_QUEUE}")
            logger.info("=" * 80)

            # =================================================================
            # SUBSECTION 9.2: MAIN SERVICE LOOP
            # =================================================================
            asyncio.run(job_consumer())

        except KeyboardInterrupt:
            logger.info("🛑 Worker shutting down gracefully...")
    else:
        logger.error("❌ Cannot start worker - Redis connection failed")
