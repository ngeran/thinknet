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
import logging

# --- Logging Setup for FastAPI ---
# IMPORTANT: This logs messages from the FastAPI process itself, not the subprocess.
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# --- Redis Configuration and Setup ---

# Environment variables are sourced from docker-compose.yml
REDIS_HOST = os.getenv("REDIS_HOST", "redis_broker")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
# CRITICAL: This prefix must match the channel the Rust WS Hub subscribes to
REDIS_CHANNEL_PREFIX = "ws_channel:job:"

# Confirmed absolute path to the Python interpreter inside the container
PYTHON_INTERPRETER_PATH = "/usr/local/bin/python"

r = None
try:
    # Initialize the Redis connection (decode_responses=True ensures we get strings)
    r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
    r.ping() # Check connection health
    print(f"✅ Operations: Connected to Redis at {REDIS_HOST}:{REDIS_PORT}")
except Exception as e:
    print(f"❌ Operations: Failed to connect to Redis: {e}")

# --- Pydantic Models ---

class JobTrigger(BaseModel):
    """Defines the payload structure for triggering a PyEZ/JSNAPy job."""
    command: str # "backup" or "restore"
    hostname: str = None
    inventory_file: str = None
    username: str
    password: str
    backup_path: str = "/var/backups"
    backup_file: str = None
    restore_type: str = "override"

# --- Background Subprocess Execution Logic (The Worker) ---

async def stream_reader(stream, redis_channel: str, stream_name: str, job_id: str, is_json_stream: bool = False):
    """
    Helper function to read a subprocess stream (stdout or stderr) line-by-line 
    and publish the data to Redis.
    """
    global r
    if not r: return # Cannot publish if Redis is down

    while True:
        try:
            line = await stream.readline()
        except Exception as e:
            logger.error(f"Error reading from {stream_name} stream for job {job_id}: {e}")
            break
            
        if not line:
            print(f"INFO: Job {job_id} {stream_name} stream finished.")
            break
        
        line = line.decode().strip()
        if not line:
            continue

        message_to_publish = None

        if is_json_stream:
            # Handle the standardized JSON output from run.py (expected on stdout)
            if line.startswith('{') and line.endswith('}'):
                message_to_publish = line # Publish raw JSON string
                # logger.info(f"Job {job_id} published JSON event from {stream_name}.")
            else:
                # Wrap any non-JSON data on stdout as a debug log
                message_to_publish = json.dumps({
                    "level": "DEBUG",
                    "event_type": "ORCHESTRATOR_LOG",
                    "message": f"[{stream_name.upper()}_RAW] {line}",
                    "timestamp": datetime.utcnow().isoformat(),
                    "job_id": job_id
                })
        else:
            # Handle Python orchestrator logger output (expected on stderr)
            # Wrap all stderr output into a standardized JSON message
            message_to_publish = json.dumps({
                "level": "LOG", 
                "event_type": "ORCHESTRATOR_LOG",
                "message": f"[{stream_name.upper()}] {line}",
                "timestamp": datetime.utcnow().isoformat(),
                "job_id": job_id
            })

        if message_to_publish:
            # CRITICAL PUBLISH STEP
            r.publish(redis_channel, message_to_publish)

async def run_script_and_stream_to_redis(script_path, cmd_args, job_id: str):
    """
    Executes the PyEZ orchestrator script and concurrently streams output from 
    both stdout (JSON logs) and stderr (standard Python logger info) to Redis.
    """
    global r
    print(f"INFO: Job {job_id} background worker STARTING.")

    if not r:
        print(f"ERROR: Job {job_id} cannot run, Redis is not connected.")
        return 

    redis_channel = f"{REDIS_CHANNEL_PREFIX}{job_id}"
    full_command = [PYTHON_INTERPRETER_PATH, str(script_path)] + cmd_args
    script_dir = str(script_path.parent)

    subprocess_env = os.environ.copy()
    subprocess_env['PYTHONPATH'] = script_dir + ':' + subprocess_env.get('PYTHONPATH', '')

    logger.debug(f"Job {job_id} command: {' '.join(full_command)}")
    logger.debug(f"Job {job_id} PYTHONPATH set to: {subprocess_env['PYTHONPATH']}")


    # 1. Start the subprocess
    try:
        process = await asyncio.create_subprocess_exec(
            *full_command, 
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, # Explicitly PIPE to allow async reading
            env=subprocess_env 
        )
        print(f"INFO: Job {job_id} subprocess spawned successfully with PID {process.pid}.")

    except Exception as e:
        # Publish a CRITICAL error message if the script fails to even start
        error_payload = json.dumps({
            "level": "CRITICAL", 
            "event_type": "OPERATION_COMPLETE",
            "message": f"Script execution initiation failed: {e}", 
            "data": {"status": "FAILED", "error": str(e)},
            "timestamp": datetime.utcnow().isoformat()
        })
        r.publish(redis_channel, error_payload) 
        print(f"FATAL ERROR: Job {job_id} failed to spawn: {e}")
        return

    # 2. Concurrently Stream and Publish Output from both streams
    # stdout: Primary JSON stream from send_progress()
    stdout_task = stream_reader(process.stdout, redis_channel, "stdout", job_id, is_json_stream=True)
    # stderr: Standard orchestrator logger messages (like INFO, ERROR)
    stderr_task = stream_reader(process.stderr, redis_channel, "stderr", job_id, is_json_stream=False)

    # Wait for BOTH streams to close before proceeding
    await asyncio.gather(stdout_task, stderr_task)
    
    # 3. Wait for the process to finish
    await process.wait()

    # 4. Final log and error handling (Exit code check)
    print(f"INFO: Job {job_id} finished execution. Exit code: {process.returncode}")

    if process.returncode != 0:
        # Ensures that if the orchestrator crashes before sending OPERATION_COMPLETE,
        # the frontend still gets a final failure status.
        error_msg = json.dumps({
            "level": "ERROR", 
            "event_type": "OPERATION_COMPLETE",
            "message": f"Job terminated unexpectedly with exit code {process.returncode}.", 
            "data": {"status": "FAILED", "returncode": process.returncode},
            "timestamp": datetime.utcnow().isoformat()
        })
        r.publish(redis_channel, error_msg)
        print(f"ERROR: Job {job_id} failed with return code {process.returncode}.")

# --- FastAPI Router Definition and Endpoint ---

# Initializes the router with the desired path prefix
router = APIRouter(
    prefix="/operations",
    tags=["Operations"]
)

@router.post("/execute", status_code=202)
async def execute_juniper_job(trigger: JobTrigger):
    """
    Triggers the PyEZ/JSNAPy script execution for Backup or Restore.
    Returns 202 Accepted immediately while the job runs in the background.
    """
    global r
    if not r or not r.ping(): # Double-check connection health
        raise HTTPException(status_code=503, detail="Redis connection failed. Cannot execute job.")

    # Generate a unique Job ID
    job_id = f"{trigger.command}-{uuid.uuid4()}"

    # CONFIRMED CORRECT SCRIPT PATH
    script_path = Path("/app/app_gateway/py_scripts/scripts/backup_and_restore/run.py")

    if not script_path.is_file():
        raise HTTPException(
            status_code=500,
            detail=f"Script not found at {script_path}. Check volume mounts and file path."
        )

    # Build command-line arguments list
    cmd_args = [
        "--command", trigger.command,
        "--username", trigger.username,
        "--password", trigger.password,
        "--backup_path", trigger.backup_path,
    ]

    # Add conditional arguments
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
    asyncio.create_task(
        run_script_and_stream_to_redis(script_path, cmd_args, job_id)
    )

    return {
        "job_id": job_id,
        "status": f"Job {trigger.command} initiated successfully.",
        # Provide the expected WebSocket channel name for the frontend to subscribe to
        "ws_channel": f"job:{job_id}"
    }
