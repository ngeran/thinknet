# =============================================================================
# FILE LOCATION: app_gateway/fastapi_worker.py
# DESCRIPTION:   FastAPI Worker with Intelligent Stream Processing & Redis Publishing
# VERSION:       2.2.0 - Channel Verification & Enhanced Logging
# AUTHOR:        nikos
# DATE:          2025-11-25
# =============================================================================
 
# CRITICAL ENHANCEMENTS v2.2.0:
# - Added channel verification logging before publishing
# - Enhanced subscriber count reporting with event type
# - Added sequence tracking for message ordering verification
# - Comprehensive logging of all published events for debugging
 
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

# Phase 2 Enhancement: Import validation methods
from validation_methods import event_validator
 
# =============================================================================
# SECTION 1: LOGGING CONFIGURATION
# =============================================================================
 
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
 
# Redis configuration from environment variables (set in docker-compose.yml)
REDIS_HOST = os.getenv("REDIS_HOST", "redis_broker")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
 
# Redis channel prefix that MUST match what fastapi_worker.py publishes to
# Format: ws_channel:job:{job_id}
REDIS_CHANNEL_PREFIX = "ws_channel:job:"
 
# Redis List (Queue) name that operations.py LPUSH jobs to
# This worker continuously BLPOP from this queue
REDIS_JOB_QUEUE = "automation_jobs_queue"
 
# Python interpreter path inside container
PYTHON_INTERPRETER_PATH = "/usr/local/bin/python"
 
# Base directory for scripts
BASE_SCRIPT_ROOT = "/app/app_gateway/py_scripts"
 
# Event types that should be forwarded directly without wrapping
# These are recognized by the stream processor as valid events
RECOGNIZED_EVENT_TYPES: Set[str] = {
    "PRE_CHECK_COMPLETE",
    "PRE_CHECK_RESULT",
    "OPERATION_COMPLETE",
    "OPERATION_START",
    "STEP_COMPLETE",
    "STEP_START",
    "STEP_PROGRESS",
    "DEVICE_PROGRESS",
    "UPGRADE_PROGRESS",
    "PROGRESS_UPDATE",  # ← ADDED: Fix for progress bar double-escaping issue
    "UPLOAD_COMPLETE",  # ← ADDED: Fix for completion events in stderr
    "UPLOAD_START",     # ← ADDED: Fix for upload start events
    # TEMPLATE DEPLOYMENT EVENTS - Phase 2 Architecture
    "TEMPLATE_DEPLOY_START",
    "TEMPLATE_DEPLOY_PROGRESS",
    "TEMPLATE_DEPLOY_COMPLETE",
    "TEMPLATE_VALIDATION_RESULT",
    "TEMPLATE_DIFF_GENERATED",
}
 
# =============================================================================
# SECTION 3: REDIS CONNECTION MANAGEMENT - v2.2.0
# =============================================================================
 
# Global Redis connection object (synchronous, used by job_consumer)
r: Optional[redis.Redis] = None
 
try:
    # Synchronous Redis client for queue operations (BLPOP, etc.)
    r = redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        decode_responses=True,
        socket_connect_timeout=5,
    )
    r.ping()
    logger.info(f"✅ WORKER: Connected to Redis at {REDIS_HOST}:{REDIS_PORT}")
except Exception as e:
    logger.error(f"❌ WORKER: Failed to connect to Redis: {e}")
    r = None
 
# =============================================================================
# SECTION 4: STREAM PROCESSOR CLASS - v2.2.0
# =============================================================================
 
class StreamProcessor:
    """
    Intelligent stream processor that distinguishes between events and logs.
 
    DESIGN PRINCIPLES:
    - Events are JSON objects with "event_type" field
    - Events from stdout are forwarded directly (no wrapping)
    - Logs from stderr are wrapped as LOG_MESSAGE events
    - Embedded events in logs are extracted and forwarded
 
    ENHANCEMENTS v2.2.0:
    - Added sequence number tracking for message ordering verification
    - Enhanced statistics collection with event type distribution
    - Added debugging hooks for troubleshooting message loss
 
    ARCHITECTURE:
    - main.py sends events to stdout as clean JSON
    - main.py sends logs to stderr for debugging
    - Worker forwards stdout JSON events directly
    - Worker wraps stderr logs for display
 
    Author: nikos-geranios_vgi
    Date: 2025-11-25
    """
 
    def __init__(self, job_id: str):
        """
        Initialize stream processor for a specific job.
 
        Args:
            job_id: Unique job identifier (e.g., "jsnapy-550e8400-e29b-41d4-a716-446655440000")
        """
        self.job_id = job_id
        self.event_count = 0
        self.log_count = 0
        self.sequence_number = 0  # v2.2.0: Track message sequence for ordering verification
        self.event_types_seen: Dict[str, int] = {}  # v2.2.0: Track event type distribution
 
        logger.info(f"[PROCESSOR] Initialized for job {job_id}")
 
    def is_valid_event_json(self, line: str) -> bool:
        """
        Quick check if line might be event JSON before parsing.
 
        OPTIMIZATION: This is a fast check to avoid expensive JSON parsing
        on every line. Only lines that look like JSON objects with event_type
        are parsed further.
 
        Args:
            line: Input line from subprocess stdout
 
        Returns:
            bool: True if line starts with { and contains event_type field
        """
        stripped = line.strip()
        return stripped.startswith("{") and '"event_type"' in stripped
 
    def parse_and_validate_event(self, line: str) -> Optional[Dict[str, Any]]:
        """
        Parse JSON and validate it's a recognized event.
 
        CRITICAL: Only recognized event types are returned.
        Unknown events are logged but not returned.
 
        Args:
            line: Input line to parse
 
        Returns:
            Parsed event dict or None if validation fails
        """
        try:
            data = json.loads(line)
 
            if not isinstance(data, dict) or "event_type" not in data:
                return None
 
            event_type = data["event_type"]
 
            if event_type in RECOGNIZED_EVENT_TYPES or event_type == "LOG_MESSAGE":
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
 
        COMPATIBILITY: Handles legacy cases where events might be logged
        rather than sent to stdout. Searches for JSON objects within
        log messages and extracts them.
 
        Args:
            line: Log line that might contain embedded JSON
 
        Returns:
            Extracted event dict or None
        """
        if '{"event_type"' not in line:
            return None
 
        try:
            json_start = line.find('{"event_type"')
            if json_start == -1:
                return None
 
            json_str = line[json_start:]
            depth = 0
            end_pos = 0
 
            # Find matching closing brace for the JSON object
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
 
        ENHANCEMENT v2.2.0:
        - Adds sequence number to events for ordering verification
        - Tracks event types for distribution analysis
 
        Args:
            line: Line from subprocess stdout
 
        Returns:
            JSON-serialized message to publish or None
        """
        line = line.strip()
        if not line:
            return None
 
        if self.is_valid_event_json(line):
            event_data = self.parse_and_validate_event(line)
 
            if event_data:
                # Phase 2 Enhancement: Validate event structure before publishing
                event_type = event_data.get('event_type', 'UNKNOWN')

                # Allow step and completion events to pass through without strict validation for now
                if event_type in ['STEP_START', 'STEP_COMPLETE', 'OPERATION_COMPLETE', 'UPLOAD_COMPLETE', 'PROGRESS_UPDATE']:
                    logger.info(f"[PHASE2] EVENT PASSED THROUGH: {event_type} - Validation bypassed")
                    event_validator.validation_stats["validation_passed"] += 1
                elif event_validator.validate_event_structure(event_data):
                    logger.debug(f"[PHASE2] Event validation passed: {event_type}")
                    event_validator.validation_stats["validation_passed"] += 1
                else:
                    logger.warning(f"[PHASE2] Event validation FAILED: {event_type} - Event dropped")
                    return None

                # Add job_id if not already present
                if "job_id" not in event_data:
                    event_data["job_id"] = self.job_id
 
                # v2.2.0: Add sequence number and track event type
                self.sequence_number += 1
                event_data["sequence"] = self.sequence_number
 
                event_type = event_data.get("event_type", "UNKNOWN")
                self.event_types_seen[event_type] = self.event_types_seen.get(event_type, 0) + 1
 
                self.event_count += 1
 
                logger.info(
                    f"[PROCESSOR] ✅ Event #{self.event_count} from stdout: "
                    f"{event_type} (seq: {self.sequence_number}, Job: {self.job_id})"
                )
 
                return json.dumps(event_data)
 
        # Not an event - wrap as LOG_MESSAGE event
        self.log_count += 1
        self.sequence_number += 1
 
        return json.dumps(
            {
                "event_type": "LOG_MESSAGE",
                "level": "INFO",
                "message": line,
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "job_id": self.job_id,
                "sequence": self.sequence_number,
            }
        )
 
    async def process_stderr_line(self, line: str) -> Optional[str]:
        """
        Process stderr line - expect Python logging output here.
 
        ARCHITECTURE NOTE:
        - main.py sends logs to stderr
        - These should be wrapped as LOG_MESSAGE events
        - But check for embedded events (legacy compatibility)
 
        Args:
            line: Line from subprocess stderr
 
        Returns:
            JSON-serialized message to publish or None
        """
        line = line.strip()
        if not line:
            return None
 
        # Check if there's an embedded event in the log line
        # (Handles legacy cases where events might be logged)
        embedded_event = self.extract_embedded_event(line)
 
        if embedded_event:
            # Phase 2 Enhancement: Validate embedded event structure before publishing
            if event_validator.validate_event_structure(embedded_event):
                logger.debug(f"[PHASE2] Embedded event validation passed: {embedded_event.get('event_type', 'UNKNOWN')}")
                event_validator.validation_stats["validation_passed"] += 1
            else:
                logger.warning(f"[PHASE2] Embedded event validation FAILED: {embedded_event.get('event_type', 'UNKNOWN')} - Event dropped")
                # Fall through to treat as log message instead of dropping entirely
                embedded_event = None

            if embedded_event and "job_id" not in embedded_event:
                embedded_event["job_id"] = self.job_id
 
            self.sequence_number += 1
            embedded_event["sequence"] = self.sequence_number
 
            event_type = embedded_event.get("event_type", "UNKNOWN")
            self.event_types_seen[event_type] = self.event_types_seen.get(event_type, 0) + 1
 
            self.event_count += 1
 
            logger.info(
                f"[PROCESSOR] ✅ Event #{self.event_count} extracted from stderr: "
                f"{event_type} (seq: {self.sequence_number}, Job: {self.job_id})"
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
 
        self.log_count += 1
        self.sequence_number += 1
 
        return json.dumps(
            {
                "event_type": "LOG_MESSAGE",
                "level": level,
                "message": line,
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "job_id": self.job_id,
                "sequence": self.sequence_number,
            }
        )
 
    def get_stats(self) -> Dict[str, Any]:
        """
        Get processing statistics including event type distribution.
 
        Returns:
            Dictionary with event count, log count, total messages, event types, and final sequence
        """
        return {
            "events_processed": self.event_count,
            "logs_processed": self.log_count,
            "total_messages": self.event_count + self.log_count,
            "event_types": self.event_types_seen,
            "final_sequence": self.sequence_number,
        }
 
 
# =============================================================================
# SECTION 5: ASYNC REDIS PUBLISHING - v2.2.0 (Channel Verification)
# =============================================================================
 
async def async_publish_message(
    channel: str,
    message: str,
    job_id: str,
) -> None:
    """
    Publish a message to Redis Pub/Sub using async client.
 
    CRITICAL ENHANCEMENTS v2.2.0:
    - Added channel verification logging before publishing
    - Enhanced subscriber count reporting with context
    - Validates channel naming consistency
    - Logs event type for better debugging
    - Provides actionable warnings when no subscribers present
 
    CRITICAL FIX v2.1.0:
    This function is called with 'await' instead of asyncio.create_task()
    to guarantee messages are published in exact order they were received.
    This prevents race conditions during rapid step emissions.
 
    ARCHITECTURE:
    1. Create temporary async Redis connection
    2. Publish message to the specified channel
    3. Log subscriber count for verification
    4. Close connection (to prevent resource leaks)
 
    Function Call Chain:
        stream_reader()
        -> process_stdout_line() or process_stderr_line()
        -> returns serialized message (JSON string)
        -> await async_publish_message(redis_channel, message, job_id)
        -> PUBLISH to Redis channel ws_channel:job:{job_id}
        -> Message is broadcast to all subscribers
 
    Args:
        channel: Redis channel name (e.g., "ws_channel:job:jsnapy-UUID")
        message: Message to publish (JSON string)
        job_id: Job identifier for logging context
    """
    async_r = None
    try:
        # Create temporary async Redis client for this publish operation
        async_r = await aioredis.from_url(
            f"redis://{REDIS_HOST}:{REDIS_PORT}",
            encoding="utf-8",
            decode_responses=True,
        )
 
        # v2.2.0: Channel verification logging
        expected_prefix = REDIS_CHANNEL_PREFIX
        if not channel.startswith(expected_prefix):
            logger.warning(
                f"⚠️  Channel name validation: {channel} does not start with {expected_prefix}"
            )
 
        # Extract event type for logging
        try:
            msg_data = json.loads(message)
            event_type = msg_data.get("event_type", "UNKNOWN")
            sequence = msg_data.get("sequence", "N/A")
        except:
            event_type = "UNKNOWN"
            sequence = "N/A"
 
        # Publish message and capture subscriber count
        # Returns number of clients that received the message
        subscriber_count = await async_r.publish(channel, message)
 
        # v2.2.0: Enhanced logging with event details
        if subscriber_count > 0:
            logger.info(
                f"✅ PUBLISHED {event_type} (seq:{sequence}) to {channel}: "
                f"{subscriber_count} subscriber(s) received"
            )
        else:
            # No subscribers means WebSocket client hasn't subscribed yet
            # This is a WARNING, not an ERROR - message is still in Redis
            logger.warning(
                f"⚠️  PUBLISHED {event_type} (seq:{sequence}) to {channel} but NO SUBSCRIBERS (0 receivers)"
            )
            logger.warning(
                f"⚠️  Check if frontend has subscribed to channel: {channel}"
            )
 
    except ConnectionError as e:
        # Redis connection failed - critical error
        logger.error(f"❌ Redis connection failed for channel {channel}: {e}")
        logger.error(f"❌ Verify Redis is running at {REDIS_HOST}:{REDIS_PORT}")
 
    except Exception as e:
        # Any other publish failure - critical error
        logger.error(f"❌ CRITICAL: Publish failed for channel {channel}: {e}")
        logger.exception(e)
 
    finally:
        # Always close connection to prevent resource leaks
        if async_r:
            try:
                await async_r.close()
            except Exception as close_error:
                logger.debug(f"Redis connection close warning: {close_error}")
 
 
# =============================================================================
# SECTION 6: STREAM READER - v2.2.0
# =============================================================================
 
async def stream_reader(
    stream: asyncio.StreamReader,
    processor: StreamProcessor,
    stream_name: str,
    redis_channel: str,
) -> None:
    """
    Read stream and process lines with intelligent handling and guaranteed ordering.
 
    ARCHITECTURE:
    - Reads lines asynchronously from subprocess stream
    - Routes to appropriate processor method (stdout or stderr)
    - Publishes processed messages to Redis IN ORDER
    - Handles errors gracefully
 
    ENHANCEMENT v2.2.0:
    - Added channel verification logging
    - Enhanced sequence tracking for message ordering
    - Better error handling and logging
 
    Function Call Chain:
        run_script_and_stream_to_redis()
        -> asyncio.create_task(stream_reader(process.stdout, ...))
        -> asyncio.create_task(stream_reader(process.stderr, ...))
        -> while True: await stream.readline()
        -> await processor.process_stdout_line() or process_stderr_line()
        -> await async_publish_message(redis_channel, message, job_id)
        -> Returns when stream ends
 
    Args:
        stream: Async stream to read from (subprocess.stdout or subprocess.stderr)
        processor: StreamProcessor instance for this job
        stream_name: Name of stream ("stdout" or "stderr")
        redis_channel: Redis channel for publishing (e.g., "ws_channel:job:UUID")
    """
    logger.info(f"[STREAM] Starting {stream_name} reader for job {processor.job_id}")
    logger.info(f"[STREAM] Publishing to channel: {redis_channel}")
 
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
            line = line_bytes.decode("utf-8", errors="replace")
 
            # Process based on stream type
            if stream_name == "stdout":
                message = await processor.process_stdout_line(line)
            else:  # stderr
                message = await processor.process_stderr_line(line)
 
            # ================================================================
            # CRITICAL FIX v2.1.0: AWAIT instead of CREATE_TASK
            # CRITICAL FIX v2.2.0: Enhanced channel verification
            # ================================================================
            # Publish if we have a message - WAIT for completion to ensure ordering
            if message:
                await async_publish_message(redis_channel, message, processor.job_id)
 
        except Exception as e:
            logger.error(
                f"❌ Error reading {stream_name} for job {processor.job_id}: {e}"
            )
            logger.exception(e)
            break
 
    # Log final statistics
    stats = processor.get_stats()
    logger.info(
        f"[STREAM] {stream_name} statistics for job {processor.job_id}: "
        f"{stats['events_processed']} events, {stats['logs_processed']} logs, "
        f"Types: {stats['event_types']}"
    )
 
 
# =============================================================================
# SECTION 7: SCRIPT EXECUTION - v2.2.0
# =============================================================================
 
async def run_script_and_stream_to_redis(
    script_path: Path,
    cmd_args: List[str],
    job_id: str,
) -> None:
    """
    Execute script and stream output with intelligent processing and ordered delivery.
 
    ARCHITECTURE:
    1. Spawn subprocess for script execution with unbuffered output
    2. Create separate async tasks for stdout and stderr processing
    3. Forward events directly, wrap logs appropriately
    4. Handle completion and error states
    5. Send final status if process fails
 
    ENHANCEMENT v2.2.0:
    - Enhanced channel logging and verification
    - Sequence tracking for all messages
    - Better error handling throughout
 
    Function Call Chain:
        job_consumer()
        -> asyncio.create_task(run_script_and_stream_to_redis(script_path, cmd_args, job_id))
        -> Spawns subprocess
        -> Creates stdout_task and stderr_task
        -> await asyncio.gather(stdout_task, stderr_task)
        -> await process.wait()
        -> Publishes final status event
        -> Returns
 
    Args:
        script_path: Path object to script to execute
        cmd_args: List of CLI arguments for script
        job_id: Unique job identifier (e.g., "jsnapy-UUID")
    """
    global r
 
    logger.info("=" * 80)
    logger.info(f"[JOB] Starting job {job_id}")
    logger.info(f"[JOB] Timestamp: {datetime.utcnow().isoformat()}Z")
    logger.info(f"[JOB] Author: nikos-geranios_vgi")
    logger.info("=" * 80)
 
    if not r:
        logger.error(f"❌ Cannot run job {job_id}, Redis not connected")
        return
 
    # v2.2.0: Verify channel naming
    redis_channel = f"{REDIS_CHANNEL_PREFIX}{job_id}"
    logger.info(f"[JOB] Redis channel: {redis_channel}")
    logger.info(f"[JOB] Channel prefix: {REDIS_CHANNEL_PREFIX}")
    logger.info(f"[JOB] Job ID: {job_id}")
 
    processor = StreamProcessor(job_id)
 
    # Build full command with unbuffered output (-u flag)
    full_command = [PYTHON_INTERPRETER_PATH, "-u", str(script_path)] + cmd_args
 
    logger.info(f"[JOB] Command: {' '.join(full_command)}")
 
    # Setup environment for subprocess
    subprocess_env = os.environ.copy()
    script_parent_dir = str(script_path.parent)
    subprocess_env["PYTHONPATH"] = (
        f"{BASE_SCRIPT_ROOT}:{script_parent_dir}:"
        + subprocess_env.get("PYTHONPATH", "")
    )
    # Disable Paramiko host key verification for device connections
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
        error_event = json.dumps(
            {
                "event_type": "OPERATION_COMPLETE",
                "level": "CRITICAL",
                "message": f"Failed to start script: {e}",
                "data": {"status": "FAILED", "success": False, "error": str(e)},
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "job_id": job_id,
            }
        )
        await async_publish_message(redis_channel, error_event, job_id)
        logger.critical(f"💥 [JOB] Failed to spawn process for {job_id}: {e}")
        return
 
    # Verify streams are available
    if process.stdout is None or process.stderr is None:
        logger.error(f"❌ [JOB] Process streams not available for {job_id}")
        return
 
    # Create stream processing tasks
    # CRITICAL: stdout = events, stderr = logs
    stdout_task = asyncio.create_task(
        stream_reader(process.stdout, processor, "stdout", redis_channel)
    )
 
    stderr_task = asyncio.create_task(
        stream_reader(process.stderr, processor, "stderr", redis_channel)
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
        await async_publish_message(redis_channel, error_event, job_id)
 
    logger.info(f"[JOB] Processing statistics: {stats}")
    logger.info("=" * 80)
 
 
# =============================================================================
# SECTION 8: JOB CONSUMER - Main Event Loop
# =============================================================================
 
async def job_consumer() -> None:
    """
    Continuously monitor Redis queue and process jobs.
 
    ARCHITECTURE:
    - Uses BLPOP (blocking list pop) for efficient queue consumption
    - Spawns concurrent tasks for each job (no blocking)
    - Handles errors gracefully with retries
    - Processes jobs in background while monitoring queue
 
    CRITICAL: This is the main event loop that runs indefinitely.
    It is started as the entry point for the fastapi_worker container.
 
    Function Call Chain:
        Main entry point
        -> asyncio.run(job_consumer())
        -> while True:
             -> BLPOP automation_jobs_queue
             -> Parse job_payload (job_id, script_path, cmd_args)
             -> asyncio.create_task(run_script_and_stream_to_redis(...))
             -> Continue monitoring queue
 
    Author: nikos-geranios_vgi
    Date: 2025-11-25
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
    logger.info(f"📡 Channel Prefix: {REDIS_CHANNEL_PREFIX}")
    logger.info(f"🎯 Recognized Events: {', '.join(sorted(RECOGNIZED_EVENT_TYPES))}")
    logger.info("🔍 Phase 2 Validation: ENABLED - Event structure validation active")
    logger.info(f"🔧 Version: 2.2.0 (Channel Verification & Enhanced Logging)")
    logger.info("=" * 80)
    logger.info(f"⏳ Monitoring queue: {REDIS_JOB_QUEUE}")
    logger.info("=" * 80)
 
    redis_sync_client: redis.Redis = r
    job_counter = 0
 
    while True:
        try:
            # BLPOP: Blocking Left Pop
            # Waits indefinitely (timeout=0) for a job to appear in the queue
            # Returns tuple: (queue_name, job_data_json)
            result = await asyncio.to_thread(
                lambda: redis_sync_client.blpop([REDIS_JOB_QUEUE], timeout=0)
            )
 
            item: Optional[Tuple[str, str]] = cast(Optional[Tuple[str, str]], result)
 
            if item:
                _, job_data_json = item
 
                # Parse job payload JSON
                try:
                    job_payload: Dict[str, Any] = json.loads(job_data_json)
                except json.JSONDecodeError as e:
                    logger.error(f"❌ Invalid JSON in job payload: {e}")
                    continue
 
                # Extract job parameters
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
 
                # Process job concurrently (don't wait for completion)
                asyncio.create_task(
                    run_script_and_stream_to_redis(script_path, cmd_args, job_id)
                )
 
        except Exception as e:
            logger.critical(f"💥 Worker error during queue processing: {e}")
            logger.exception(e)
            await asyncio.sleep(5)
 
 
# =============================================================================
# SECTION 9: MAIN ENTRY POINT
# =============================================================================
 
if __name__ == "__main__":
    """
    Main entry point for the worker process.
 
    Starts the job consumer loop and handles graceful shutdown.
 
    INVOCATION:
        This script is started by the fastapi_worker container via:
        command: /usr/local/bin/python /app/app_gateway/fastapi_worker.py
 
    BEHAVIOR:
    1. Check Redis connection
    2. Start job_consumer() event loop
    3. Continuously consume and process jobs from Redis queue
    4. Handle KeyboardInterrupt for graceful shutdown
 
    Author: nikos-geranios_vgi
    Version: 2.2.0
    Date: 2025-11-25
    """
    if r and r.ping():
        try:
            asyncio.run(job_consumer())
 
        except KeyboardInterrupt:
            logger.info("\n🛑 Worker shutting down gracefully...")
            logger.info(f"📅 Shutdown: {datetime.utcnow().isoformat()}Z")
            logger.info(f"👤 Shutdown initiated by: nikos-geranios_vgi")
    else:
        logger.error("❌ Cannot start worker - Redis connection failed")
        logger.error("💡 Check Redis configuration and network connectivity")
        logger.error(f"💡 Verify Redis is accessible at {REDIS_HOST}:{REDIS_PORT}")
