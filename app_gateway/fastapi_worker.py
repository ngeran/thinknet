# app_gateway/fastapi_worker.py

from pydantic import BaseModel
from typing import Optional
import asyncio
import subprocess
import json
from pathlib import Path
import os
import redis
import uuid
from datetime import datetime
import logging

# --- Logging Setup ---
# Setup logging for the worker process itself
logger = logging.getLogger("FASTAPI_WORKER")
logger.setLevel(logging.INFO)
# Configure a basic console handler for Docker logs
ch = logging.StreamHandler()
ch.setLevel(logging.INFO)
formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
ch.setFormatter(formatter)
logger.addHandler(ch)

# --- Redis Configuration and Setup ---

REDIS_HOST = os.getenv("REDIS_HOST", "redis_broker")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
# CRITICAL: This prefix must match the channel the Rust WS Hub subscribes to
REDIS_CHANNEL_PREFIX = "ws_channel:job:"
# CRITICAL: This list name must match the one used by fastapi_gateway
REDIS_JOB_QUEUE = "automation_jobs_queue"

# Confirmed absolute path to the Python interpreter inside the container
PYTHON_INTERPRETER_PATH = "/usr/local/bin/python"
# Base directory for all Python scripts (used for PYTHONPATH)
BASE_SCRIPT_ROOT = "/app/app_gateway/py_scripts"

r = None
try:
    # Initialize the Redis connection (decode_responses=True for strings)
    r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
    r.ping()  # Check connection health
    logger.info(f"✅ WORKER: Connected to Redis at {REDIS_HOST}:{REDIS_PORT}")
except Exception as e:
    logger.error(f"❌ WORKER: Failed to connect to Redis: {e}")

# --- Pydantic Model (Needed for type hinting, though not strictly used for validation here) ---


# Re-define or import JobTrigger (assuming it was defined in operations.py before)
class JobTrigger(BaseModel):
    command: str
    hostname: Optional[str] = None
    inventory_file: Optional[str] = None
    username: str
    password: str
    backup_path: str = "/var/backups"
    backup_file: Optional[str] = None
    restore_type: str = "override"


# --- Stream Processing Logic ---


async def stream_reader(
    stream,
    redis_channel: str,
    stream_name: str,
    job_id: str,
    is_json_stream: bool = False,
):
    """
    Helper function to read a subprocess stream line-by-line
    and publish the data to Redis Pub/Sub.
    """
    global r
    if not r:
        return  # Cannot publish if Redis is down

    while True:
        try:
            # Note: The stream is the PIPE from the subprocess, this is where the I/O block happens
            line = await stream.readline()
        except Exception as e:
            logger.error(
                f"Error reading from {stream_name} stream for job {job_id}: {e}"
            )
            break

        if not line:
            logger.info(f"INFO: Job {job_id} {stream_name} stream finished.")
            break

        line = line.decode().strip()
        if not line:
            continue

        message_to_publish = None

        if is_json_stream:
            # Handle the standardized JSON output from run.py (expected on stdout)
            if line.startswith("{") and line.endswith("}"):
                message_to_publish = line  # Publish raw JSON string
            else:
                # Wrap any non-JSON data on stdout as a debug log
                message_to_publish = json.dumps(
                    {
                        "level": "DEBUG",
                        "event_type": "ORCHESTRATOR_LOG",
                        "message": f"[{stream_name.upper()}_RAW] {line}",
                        "timestamp": datetime.utcnow().isoformat(),
                        "job_id": job_id,
                    }
                )
        else:
            # Handle Python orchestrator logger output (expected on stderr)
            message_to_publish = json.dumps(
                {
                    "level": "LOG",
                    "event_type": "ORCHESTRATOR_LOG",
                    "message": f"[{stream_name.upper()}] {line}",
                    "timestamp": datetime.utcnow().isoformat(),
                    "job_id": job_id,
                }
            )

        if message_to_publish:
            # CRITICAL PUBLISH STEP: Sends data to Rust WS Hub
            try:
                r.publish(redis_channel, message_to_publish)
            except Exception as e:
                logger.error(f"Failed to publish to Redis for job {job_id}: {e}")
                # We do not break here, we try to continue streaming


async def run_script_and_stream_to_redis(script_path, cmd_args, job_id: str):
    """
    Executes the PyEZ orchestrator script and concurrently streams output
    to Redis Pub/Sub. This is the heavy lifting function now run in isolation.
    """
    global r
    logger.info(f"WORKER: Job {job_id} worker STARTING execution.")

    if not r:
        logger.error(f"WORKER: Job {job_id} cannot run, Redis is not connected.")
        return

    redis_channel = f"{REDIS_CHANNEL_PREFIX}{job_id}"
    full_command = [PYTHON_INTERPRETER_PATH, "-u", str(script_path)] + cmd_args

    # --- Setup Environment for Subprocess ---
    subprocess_env = os.environ.copy()

    # Set PYTHONPATH to allow imports within the py_scripts structure
    script_parent_dir = str(script_path.parent)
    subprocess_env["PYTHONPATH"] = (
        f"{BASE_SCRIPT_ROOT}:{script_parent_dir}:"
        + subprocess_env.get("PYTHONPATH", "")
    )

    # CRITICAL FIX: Disable Paramiko/PyEZ host key verification.
    subprocess_env["PARAMIKO_HOSTKEY_VERIFY"] = "0"

    logger.debug(f"WORKER: Job {job_id} command: {' '.join(full_command)}")

    # 1. Start the subprocess
    try:
        process = await asyncio.create_subprocess_exec(
            *full_command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=subprocess_env,
        )
        logger.info(
            f"WORKER: Job {job_id} subprocess spawned successfully with PID {process.pid}."
        )

    except Exception as e:
        # Publish a CRITICAL error message if the script fails to even start
        error_payload = json.dumps(
            {
                "level": "CRITICAL",
                "event_type": "OPERATION_COMPLETE",
                "message": f"Script execution initiation failed: {e}",
                "data": {"status": "FAILED", "error": str(e)},
                "timestamp": datetime.utcnow().isoformat(),
                "job_id": job_id,
            }
        )
        r.publish(redis_channel, error_payload)
        logger.error(f"FATAL ERROR: Job {job_id} failed to spawn: {e}")
        return

    # 2. Concurrently Stream and Publish Output
    # stdout: Primary JSON stream (is_json_stream=True)
    stdout_task = stream_reader(
        process.stdout, redis_channel, "stdout", job_id, is_json_stream=True
    )
    # stderr: Standard logger messages (is_json_stream=False)
    stderr_task = stream_reader(
        process.stderr, redis_channel, "stderr", job_id, is_json_stream=False
    )

    # Wait for BOTH streams to close before proceeding
    await asyncio.gather(stdout_task, stderr_task)

    # 3. Wait for the process to finish
    await process.wait()

    # 4. Final error handling (Only publishes if the orchestrator crashes)
    logger.info(
        f"WORKER: Job {job_id} finished execution. Exit code: {process.returncode}"
    )

    if process.returncode != 0:
        # This catches orchestrator crashes before it can send OPERATION_COMPLETE
        error_msg = json.dumps(
            {
                "level": "ERROR",
                "event_type": "OPERATION_COMPLETE",
                "message": f"Job terminated unexpectedly with exit code {process.returncode}.",
                "data": {"status": "FAILED", "returncode": process.returncode},
                "timestamp": datetime.utcnow().isoformat(),
                "job_id": job_id,
            }
        )
        r.publish(redis_channel, error_msg)
        logger.error(
            f"WORKER: Job {job_id} failed with return code {process.returncode}."
        )

    logger.info(f"WORKER: Job {job_id} completed and stream tasks closed.")
    # The job is now fully done, the worker is ready for the next job


# --- Main Worker Loop (The Job Consumer) ---


async def job_consumer():
    """Continuously monitors the Redis queue and executes jobs."""
    global r
    if not r or not r.ping():
        logger.error("Worker cannot start, Redis is not connected.")
        return

    logger.info(f"Worker started, monitoring queue: {REDIS_JOB_QUEUE}")

    while True:
        try:
            # Blocking pop (BLPOP) waits indefinitely (timeout=0) until an item is found
            # Returns: (queue_name, job_data_json)
            item = r.blpop(REDIS_JOB_QUEUE, timeout=0)

            if item:
                # item[1] is the job data string
                job_data_json = item[1]
                job_payload = json.loads(job_data_json)

                job_id = job_payload.get("job_id")
                script_path = Path(job_payload.get("script_path"))
                cmd_args = job_payload.get("cmd_args")

                if not job_id or not script_path.exists() or not cmd_args:
                    logger.error(f"Skipping badly formed job payload: {job_data_json}")
                    continue

                logger.info(f"Worker picked up job: {job_id}")

                # Execute the job as a fire-and-forget task and wait for it
                await run_script_and_stream_to_redis(script_path, cmd_args, job_id)

                # The worker loops back to r.blpop() to wait for the next job.

        except Exception as e:
            logger.critical(f"Worker critical failure during queue processing: {e}")
            # Wait briefly before attempting to reconnect/retry
            await asyncio.sleep(5)


if __name__ == "__main__":
    # The entry point for the dedicated worker container
    if r:
        try:
            asyncio.run(job_consumer())
        except KeyboardInterrupt:
            logger.info("Worker shutting down...")
    else:
        logger.error("Could not start worker because Redis connection failed.")
