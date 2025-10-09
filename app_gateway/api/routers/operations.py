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

# --- Redis Configuration and Setup ---

# Environment variables are sourced from docker-compose.yml
REDIS_HOST = os.getenv("REDIS_HOST", "redis_broker")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
# CRITICAL: This prefix must match the channel the Rust WS Hub subscribes to
REDIS_CHANNEL_PREFIX = "ws_channel:job:"

# 🔑 FIX: Confirmed absolute path to the Python interpreter inside the container
PYTHON_INTERPRETER_PATH = "/usr/local/bin/python"

try:
    # Initialize the Redis connection (decode_responses=True ensures we get strings)
    r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
    r.ping() # Check connection health
    print(f"✅ Operations: Connected to Redis at {REDIS_HOST}:{REDIS_PORT}")
except Exception as e:
    print(f"❌ Operations: Failed to connect to Redis: {e}")
    r = None # Set to None if connection fails

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

async def run_script_and_stream_to_redis(script_path, cmd_args, job_id: str):
    """
    Executes the PyEZ orchestrator script, captures its stdout line-by-line,
    and publishes each line (expected to be JSON) to the dedicated Redis channel.
    This runs as a non-blocking background task.
    """
    print(f"INFO: Job {job_id} background worker STARTING.")

    if not r: 
        print(f"ERROR: Job {job_id} cannot run, Redis is not connected.")
        return # Exit if Redis is not connected
    
    redis_channel = f"{REDIS_CHANNEL_PREFIX}{job_id}"

    full_command = [PYTHON_INTERPRETER_PATH, str(script_path)] + cmd_args

    # 🔑 CRITICAL FIX: Set PYTHONPATH for Subprocess
    script_dir = str(script_path.parent)

    # Create a copy of the current environment and inject the script's directory
    subprocess_env = os.environ.copy()
    subprocess_env['PYTHONPATH'] = script_dir + ':' + subprocess_env.get('PYTHONPATH', '')
    
    print(f"DEBUG: Job {job_id} command: {' '.join(full_command)}")
    print(f"DEBUG: Job {job_id} PYTHONPATH set to: {subprocess_env['PYTHONPATH']}")


    # 1. Start the subprocess, passing the modified environment
    try:
        process = await asyncio.create_subprocess_exec(
            *full_command, # Unpack the command and arguments list
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT, # Capture all output
            env=subprocess_env # <--- PASS THE NEW ENVIRONMENT HERE
        )
        print(f"INFO: Job {job_id} subprocess spawned successfully with PID {process.pid}.")
        
    except Exception as e:
        # Publish a CRITICAL error message if the script fails to even start
        error_msg = {"level": "CRITICAL", "message": f"Script execution initiation failed: {e}", "job_id": job_id}
        r.publish(redis_channel, json.dumps(error_msg))
        print(f"FATAL ERROR: Job {job_id} failed to spawn: {e}")
        return

    # 2. Stream and Publish Output
    while True:
        # Readline is crucial for line-by-line streaming (real-time output)
        line = await process.stdout.readline()
        
        # 🔑 ADD LOGGING: Log when the stream ends (the subprocess is finished)
        if not line: 
            print(f"INFO: Job {job_id} subprocess stream finished.")
            break # Exit loop when process output ends

        line = line.decode().strip()

        # 🔑 ADD LOGGING: Log the raw line received from the subprocess
        print(f"DEBUG: Job {job_id} received line: {line}")

        # Check if the line is the standardized JSON progress event from the worker script
        if line.startswith('{') and line.endswith('}'):
            r.publish(redis_channel, line)
            # 🔑 ADD LOGGING: Log that a JSON event was published
            print(f"INFO: Job {job_id} published JSON event to Redis: {line[:50]}...")
        else:
            # Wrap any raw print/log statements into a standardized JSON message
            message_to_publish = json.dumps({
                "level": "DEBUG",
                "event_type": "ORCHESTRATOR_LOG",
                "message": line,
                "timestamp": datetime.utcnow().isoformat(),
                "job_id": job_id
            })
            r.publish(redis_channel, message_to_publish)
            # 🔑 ADD LOGGING: Log that a debug event was published
            print(f"INFO: Job {job_id} published debug log to Redis.")


    # 3. Wait for the process to finish
    await process.wait()

    # 🔑 ADD LOGGING: Log the final process exit status
    print(f"INFO: Job {job_id} finished execution. Exit code: {process.returncode}")

    # 4. Handle non-zero exit code (job failure)
    if process.returncode != 0:
        stderr = (await process.stderr.read()).decode()
        error_msg = {"level": "ERROR", "message": f"Subprocess failed with exit code {process.returncode}. Stderr: {stderr}", "job_id": job_id}
        r.publish(redis_channel, json.dumps(error_msg))
        print(f"ERROR: Job {job_id} failed. Stderr: {stderr}")

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
    if not r:
        raise HTTPException(status_code=503, detail="Redis connection failed. Cannot execute job.")

    # Generate a unique Job ID
    job_id = f"{trigger.command}-{uuid.uuid4()}"

    # 🔑 CONFIRMED CORRECT SCRIPT PATH: Path inside the container (via volume mount)
    script_path = Path("/app/app_gateway/py_scripts/scripts/backup_and_restore/run.py")

    if not script_path.is_file():
        # This check should prevent a crash if the file is moved/deleted
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
