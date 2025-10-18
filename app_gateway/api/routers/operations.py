# app_gateway/api/routers/operations.py

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import json
from pathlib import Path
import os
import redis
import uuid
import logging
# asyncio, subprocess, and datetime are no longer needed in this file

# --- Logging Setup for FastAPI Gateway ---
# IMPORTANT: Logs messages about the API call and queueing status.
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# --- Redis Configuration and Setup (Shared) ---
# Environment variables are sourced from docker-compose.yml
REDIS_HOST = os.getenv("REDIS_HOST", "redis_broker")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))

# CRITICAL NEW CONSTANT: Name of the Redis List (Queue) the worker will monitor
REDIS_JOB_QUEUE = "automation_jobs_queue"

# Confirmed absolute path to the automation script
SCRIPT_PATH = Path("/app/app_gateway/py_scripts/scripts/backup_and_restore/run.py")

r = None
try:
    # Initialize the Redis connection
    r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
    r.ping()  # Check connection health
    logger.info(f"✅ Operations: Connected to Redis at {REDIS_HOST}:{REDIS_PORT}")
except Exception as e:
    logger.error(f"❌ Operations: Failed to connect to Redis: {e}")
    # Set r to None if connection fails, so API endpoint can raise 503

# --- Pydantic Models ---


class JobTrigger(BaseModel):
    """Defines the payload structure for triggering a PyEZ/JSNAPy job."""

    command: str  # "backup" or "restore"
    hostname: Optional[str] = None
    inventory_file: Optional[str] = None
    username: str
    password: str
    backup_path: str = "/app/shared/data/backups"
    backup_file: Optional[str] = None
    restore_type: str = "override"


# --- Helper Function ---


def build_cmd_args(trigger: JobTrigger) -> list[str]:
    """
    Constructs the list of command-line arguments needed by the
    automation script (run.py).
    """
    cmd_args = [
        "--command",
        trigger.command,
        "--username",
        trigger.username,
        "--password",
        trigger.password,
        "--backup_path",
        trigger.backup_path,
    ]

    # Add conditional arguments
    if trigger.hostname:
        cmd_args.extend(["--hostname", trigger.hostname])
    if trigger.inventory_file:
        cmd_args.extend(["--inventory_file", trigger.inventory_file])

    if trigger.command == "restore":
        # Validate required fields for restore command
        if not trigger.backup_file:
            raise HTTPException(
                status_code=400,
                detail="Restore command requires 'backup_file' parameter.",
            )
        cmd_args.extend(
            ["--backup_file", trigger.backup_file, "--type", trigger.restore_type]
        )
    return cmd_args


# --- FastAPI Router Definition and Endpoint (The Querer) ---

# Initializes the router with the desired path prefix
router = APIRouter(prefix="/operations", tags=["Operations"])


@router.post("/execute", status_code=202)
async def execute_juniper_job(trigger: JobTrigger):
    """
    Receives the job request, validates it, and pushes the payload
    to the Redis List (Queue) for the dedicated worker to process.
    Returns 202 Accepted immediately.
    """
    global r

    # 1. Critical connection check
    if not r or not r.ping():
        raise HTTPException(
            status_code=503, detail="Redis connection failed. Cannot queue job."
        )

    # 2. Generate a unique Job ID
    job_id = f"{trigger.command}-{uuid.uuid4()}"

    # Check if the script path is valid (for informational logging/debugging)
    if not SCRIPT_PATH.is_file():
        raise HTTPException(
            status_code=500,
            detail=f"Script not found at {SCRIPT_PATH}. Check mounts.",
        )

    # 3. Prepare the complete job payload for the worker
    job_payload = {
        "job_id": job_id,
        "script_path": str(SCRIPT_PATH),
        "cmd_args": build_cmd_args(trigger),
    }

    # 4. Queue the job in the Redis List
    try:
        # r.lpush adds the item to the left (head) of the list.
        # The worker uses r.blpop to block and wait for an item from the list.
        r.lpush(REDIS_JOB_QUEUE, json.dumps(job_payload))
        logger.info(
            f"Job {job_id} successfully queued to Redis list '{REDIS_JOB_QUEUE}'."
        )

    except Exception as e:
        logger.error(f"Failed to queue job {job_id} to Redis List: {e}")
        # If the push fails, return a 500 error, not 202
        raise HTTPException(
            status_code=500, detail="Failed to queue job due to Redis error."
        )

    # 5. Return the subscription channel information
    return {
        "job_id": job_id,
        "status": f"Job {trigger.command} queued successfully.",
        # The frontend will subscribe to this channel via the Rust WS Hub
        "ws_channel": f"job:{job_id}",
    }


# --- REMOVED LOGIC ---
# The following components MUST be removed from this file:
# - The 'stream_reader' function
# - The 'run_script_and_stream_to_redis' function
# - Any usage of 'asyncio.create_task'
