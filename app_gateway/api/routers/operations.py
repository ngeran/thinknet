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

# --- Logging Setup for FastAPI Gateway ---
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# --- Redis Configuration and Setup (Shared) ---
REDIS_HOST = os.getenv("REDIS_HOST", "redis_broker")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))

# CRITICAL NEW CONSTANT: Name of the Redis List (Queue) the worker will monitor
REDIS_JOB_QUEUE = "automation_jobs_queue"

# Confirmed absolute path to the automation script (Backup & Restore Orchestrator)
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
class OperationTrigger(BaseModel):
    # FIX: Removed the 'tests' field entirely, as it is no longer used for backup/restore.
    command: str  # Expected: 'backup' or 'restore'
    hostname: Optional[str] = None
    inventory_file: Optional[str] = None
    username: str
    password: str


router = APIRouter()


def build_cmd_args(trigger: OperationTrigger) -> list[str]:
    """Builds a list of command-line arguments for the run.py script."""
    args = [f"--command", trigger.command]
    args.extend([f"--username", trigger.username])
    args.extend([f"--password", trigger.password])

    if trigger.hostname:
        args.extend([f"--hostname", trigger.hostname])
    if trigger.inventory_file:
        args.extend([f"--inventory-file", trigger.inventory_file])

    return args


@router.post("/operations/backup")
async def execute_operation(trigger: OperationTrigger):
    """
    Triggers an asynchronous backup or restore operation.
    """
    # 1. Basic Health Check
    if r is None:
        raise HTTPException(
            status_code=503,
            detail="Automation service unavailable: Cannot connect to Redis queue.",
        )

    # 2. Command Validation and Script Path Check
    if trigger.command not in ["backup", "restore"]:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid command: {trigger.command}. Supported commands are 'backup' or 'restore'.",
        )

    if not SCRIPT_PATH.is_file():
        raise HTTPException(
            status_code=500,
            detail=f"Script not found at {SCRIPT_PATH}. Check mounts.",
        )

    # 3. Prepare the complete job payload for the worker
    job_id = f"{trigger.command}-{uuid.uuid4()}"
    job_payload = {
        "job_id": job_id,
        "script_path": str(SCRIPT_PATH),
        "cmd_args": build_cmd_args(trigger),
    }

    # 4. Queue the job in the Redis List
    try:
        r.lpush(REDIS_JOB_QUEUE, json.dumps(job_payload))
        logger.info(
            f"Job {job_id} successfully queued to Redis list '{REDIS_JOB_QUEUE}'."
        )

    except Exception as e:
        logger.error(f"Failed to queue job {job_id} to Redis List: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to queue job due to Redis error."
        )

    # 5. Return the subscription channel information
    return {
        "job_id": job_id,
        "status": f"Job {trigger.command} queued successfully.",
        "ws_channel": f"job:{job_id}",
    }
