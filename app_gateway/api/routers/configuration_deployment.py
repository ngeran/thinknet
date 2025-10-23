import json
import os
import uuid
import logging
from pathlib import Path
from typing import Optional, Dict, Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import redis

# --- Logging Setup ---
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# --- Configuration Constants (Adjust as necessary) ---
REDIS_HOST = os.getenv("REDIS_HOST", "redis_broker")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_JOB_QUEUE = "automation_jobs_queue"  # Use the same queue as other operations

# CRITICAL PATH: Update to the correct location of your run.py
# Based on your prompt: /app/app_gateway/py_scripts/scripts/configuration/run.py
SCRIPT_PATH = Path("/app/app_gateway/py_scripts/scripts/configuration/run.py")


# --- Redis Connection Check ---
r = None
try:
    r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
    r.ping()
    logger.info(
        f"✅ ConfigurationDeployment: Connected to Redis at {REDIS_HOST}:{REDIS_PORT}"
    )
except Exception as e:
    logger.error(f"❌ ConfigurationDeployment: Failed to connect to Redis: {e}")


# --- Pydantic Models for API Request ---
class TemplateDeployment(BaseModel):
    """Defines the payload structure from Templates.jsx's deployTemplate function."""

    template_path: str
    config: str  # This is the 'generatedConfig' (rendered_config)
    hostname: Optional[str] = None
    inventory_file: Optional[str] = None
    username: str
    password: str
    template_vars: Dict[str, Any] = {}  # Variables for context/logging


# --- FastAPI Router and Endpoint ---
router = APIRouter(prefix="/deploy", tags=["Configuration Deployment"])


@router.post("/")
async def deploy_template_configuration(deployment: TemplateDeployment):
    """
    Handles the configuration deployment request, queues the run.py script
    for execution by the worker, and returns the job ID for real-time tracking.
    """
    global r

    # 1. Critical connection check
    if not r or not r.ping():
        raise HTTPException(
            status_code=503, detail="Redis connection failed. Cannot queue job."
        )

    # 2. Generate a unique Job ID
    job_id = f"config-deploy-{uuid.uuid4()}"

    # 3. Check for script existence
    if not SCRIPT_PATH.is_file():
        raise HTTPException(
            status_code=500,
            detail=f"Script not found at {SCRIPT_PATH}. Check mounts.",
        )

    # 4. Construct arguments for run.py
    # The run.py script expects a single JSON string argument via --args.
    run_py_payload = {
        "template_id": deployment.template_path.split("/")[-1].replace(
            ".j2", ""
        ),  # Extracts the name
        "rendered_config": deployment.config,
        "target_host": deployment.hostname
        or deployment.inventory_file,  # run.py only supports one target for now
        "username": deployment.username,
        "password": deployment.password,
        # Optional: You can add "commit_check": True for a dry-run feature
    }

    # The command to execute in the worker: python run.py --args '{"key": "value", ...}'
    cmd_args = ["--args", json.dumps(run_py_payload)]

    # 5. Prepare the complete job payload for the worker
    job_payload = {
        "job_id": job_id,
        "script_path": str(SCRIPT_PATH),
        "cmd_args": cmd_args,
    }

    # 6. Queue the job in the Redis List
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

    # 7. Return the subscription channel information (The front end needs this)
    return {
        "job_id": job_id,
        "status": "Configuration deployment queued successfully.",
        "ws_channel": f"job:{job_id}",
        "message": "Deployment started successfully. Check WebSocket for progress.",
    }
