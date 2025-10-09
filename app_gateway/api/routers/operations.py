
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import asyncio
import subprocess
import json
from pathlib import Path
import os
import redis
import uuid
from datetime import datetime

# --- Configuration and Setup ---

# Use environment variables set in docker-compose.yml
REDIS_HOST = os.getenv("REDIS_HOST", "redis_broker") 
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
# CRITICAL: This prefix must be known by the Rust WS Hub (e.g., in its configuration)
REDIS_CHANNEL_PREFIX = "ws_channel:job:" 

try:
    # Initialize the Redis connection (decode_responses=True ensures we get strings)
    r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
    r.ping()
    print(f"✅ Operations: Connected to Redis at {REDIS_HOST}:{REDIS_PORT}")
except Exception as e:
    print(f"❌ Operations: Failed to connect to Redis: {e}")
    r = None 

# --- Pydantic Models ---

class JobTrigger(BaseModel):
    """Defines the payload structure for triggering a PyEZ/JSNAPy job."""
    command: str # "backup" or "restore"
    hostname: str = None
    inventory_file: str = None
    username: str
    password: str
    backup_path: str = "/var/backups" # Path on the FastAPI container/host for config files
    backup_file: str = None          # Required for 'restore'
    restore_type: str = "override"   # For restore operations
    
# --- Background Subprocess Execution Logic ---

async def run_script_and_stream_to_redis(script_path, cmd_args, job_id: str):
    """
    Executes the PyEZ orchestrator script, captures its stdout line-by-line, 
    and publishes each line (expected to be JSON) to the dedicated Redis channel.
    """
    if not r: return
    redis_channel = f"{REDIS_CHANNEL_PREFIX}{job_id}"
    full_command = ["python", str(script_path)] + cmd_args
    
    # 1. Start the subprocess
    try:
        process = await asyncio.create_subprocess_exec(
            *full_command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT # Pipe stderr to stdout for capture
        )
    except Exception as e:
        error_msg = {"level": "CRITICAL", "message": f"Script execution initiation failed: {e}"}
        r.publish(redis_channel, json.dumps(error_msg))
        return

    # 2. Stream and Publish Output
    while True:
        # Readline is crucial for line-by-line streaming, ensuring low latency
        line = await process.stdout.readline()
        if not line: break
        
        line = line.decode().strip()
        
        # Only publish lines that look like the standardized JSON progress events
        if line.startswith('{') and line.endswith('}'):
            r.publish(redis_channel, line)
        else:
            # Catch raw output (like Python's logger or print statements not wrapped in JSON)
            r.publish(redis_channel, json.dumps({
                "level": "DEBUG",
                "event_type": "ORCHESTRATOR_LOG",
                "message": line,
                "timestamp": datetime.utcnow().isoformat(),
            }))

    # 3. Wait for the process to finish
    await process.wait()


# --- FastAPI Router Definition and Endpoint ---

# Initializes the router with the desired path prefix
router = APIRouter(
    prefix="/operations",
    tags=["Operations"] 
) 

@router.post("/execute", status_code=202)
async def execute_juniper_job(trigger: JobTrigger):
    """
    Triggers the PyEZ/JSNAPy script execution for Backup or Restore 
    and starts the real-time log streaming process.
    """
    if not r:
        raise HTTPException(status_code=503, detail="Redis connection failed. Cannot execute job.")

    # Generate a unique Job ID
    job_id = f"{trigger.command}-{uuid.uuid4()}"
    
    # 🔑 Path to your orchestrator script inside the container's working directory /app
    # Based on your structure: /app/app_gateway/py_scripts/backup_and_restore/run.py
    script_path = Path("/app/app_gateway/py_scripts/scripts/backup_and_restore/run.py")

    if not script_path.is_file():
        raise HTTPException(
            status_code=500, 
            detail=f"Script not found at {script_path}. Check volume mounts and file path."
        )

    # Build command-line arguments for the PyEZ script
    cmd_args = [
        "--command", trigger.command,
        "--username", trigger.username,
        "--password", trigger.password,
        "--backup_path", trigger.backup_path,
    ]
    
    # Add conditional arguments based on the command and parameters
    if trigger.hostname:
        cmd_args.extend(["--hostname", trigger.hostname])
    if trigger.inventory_file:
        cmd_args.extend(["--inventory_file", trigger.inventory_file])
    if trigger.command == 'restore':
        if not trigger.backup_file:
             raise HTTPException(status_code=400, detail="Restore command requires 'backup_file' parameter.")
        cmd_args.extend([
            "--backup_file", trigger.backup_file, 
            "--type", trigger.restore_type
        ])

    # 4. Start the streaming function as a non-blocking background task.
    # FastAPI returns immediately while the task runs in the background.
    asyncio.create_task(
        run_script_and_stream_to_redis(script_path, cmd_args, job_id)
    )

    return {
        "job_id": job_id,
        "status": f"Job {trigger.command} initiated successfully.",
        # Provide the expected WebSocket channel name for the frontend to subscribe to
        "ws_channel": f"job:{job_id}"
    }
