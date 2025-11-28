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
    "STEP_PROGRESS",
    "DEVICE_PROGRESS",
    "UPGRADE_PROGRESS",
    "PROGRESS_UPDATE",  # ← ADDED: Fix for progress bar double-escaping issue
    "UPLOAD_COMPLETE",  # ← ADDED: Fix for completion events in stderr
    "UPLOAD_START",     # ← ADDED: Fix for upload start events
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
            if "job_id" not in embedded_event:
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
