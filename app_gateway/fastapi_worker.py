# app_gateway/fastapi_worker.py

from pydantic import BaseModel

# 🔑 ENHANCED FIX: Added List for run_script_and_stream_to_redis type hint
from typing import Optional, Tuple, Any, Dict, cast, List
import asyncio
import subprocess
import json
from pathlib import Path
import os
import redis
import redis.asyncio as aioredis
from datetime import datetime
import logging

# --- Logging Setup ---
logger = logging.getLogger("FASTAPI_WORKER")
logger.setLevel(logging.INFO)
ch = logging.StreamHandler()
ch.setLevel(logging.INFO)
formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
ch.setFormatter(formatter)
logger.addHandler(ch)

# --- Redis Configuration and Setup ---

REDIS_HOST = os.getenv("REDIS_HOST", "redis_broker")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_CHANNEL_PREFIX = "ws_channel:job:"
REDIS_JOB_QUEUE = "automation_jobs_queue"

# Paths
PYTHON_INTERPRETER_PATH = "/usr/local/bin/python"
BASE_SCRIPT_ROOT = "/app/app_gateway/py_scripts"

# Synchronous Redis client for blocking list operations (BLPOP) and ping
r: Optional[redis.Redis] = None
try:
    # Use decode_responses=True so BLPOP returns strings, not bytes
    r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
    r.ping()
    logger.info(f"✅ WORKER: Connected to Redis at {REDIS_HOST}:{REDIS_PORT}")
except Exception as e:
    logger.error(f"❌ WORKER: Failed to connect to Redis: {e}")

# --- Pydantic Model (Dummy for type hinting) ---


class JobTrigger(BaseModel):
    command: str
    hostname: Optional[str] = None
    # ... other fields ...


# --- Async Publishing Helper ---


async def async_publish_message(channel: str, message: str) -> None:
    """Publish a message to Redis Pub/Sub using the non-blocking async client."""
    try:
        # Uses the aioredis client for non-blocking network I/O
        async_r = aioredis.from_url(
            f"redis://{REDIS_HOST}:{REDIS_PORT}", decode_responses=True
        )
        await async_r.publish(channel, message)
    except Exception as e:
        logger.error(f"Failed to publish message to {channel}: {e}")


# --- Stream Processing Logic ---


async def stream_reader(
    # 🔑 FIX: Explicitly typed as StreamReader. Subprocess.PIPE guarantees non-None upon success.
    stream: asyncio.StreamReader,
    redis_channel: str,
    stream_name: str,
    job_id: str,
    is_json_stream: bool = False,
):
    """
    Helper function to read a subprocess stream line-by-line
    and publish the data to Redis Pub/Sub (non-blocking).
    """
    while True:
        try:
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

        message_to_publish: Optional[str] = None

        if is_json_stream:
            if line.startswith("{") and line.endswith("}"):
                message_to_publish = line
            else:
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
            asyncio.create_task(
                async_publish_message(redis_channel, message_to_publish)
            )


async def run_script_and_stream_to_redis(
    script_path: Path, cmd_args: List[str], job_id: str
):
    """Executes the orchestrator script and concurrently streams output."""
    global r
    logger.info(f"WORKER: Job {job_id} worker STARTING execution.")

    if not r:
        logger.error(f"WORKER: Job {job_id} cannot run, Redis is not connected.")
        return

    redis_channel = f"{REDIS_CHANNEL_PREFIX}{job_id}"
    full_command = [PYTHON_INTERPRETER_PATH, "-u", str(script_path)] + cmd_args

    # --- Setup Environment for Subprocess ---
    subprocess_env = os.environ.copy()
    script_parent_dir = str(script_path.parent)
    subprocess_env["PYTHONPATH"] = (
        f"{BASE_SCRIPT_ROOT}:{script_parent_dir}:"
        + subprocess_env.get("PYTHONPATH", "")
    )
    subprocess_env["PARAMIKO_HOSTKEY_VERIFY"] = "0"

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
        asyncio.create_task(async_publish_message(redis_channel, error_payload))
        logger.error(f"FATAL ERROR: Job {job_id} failed to spawn: {e}")
        return

    # 🔑 FIX: This explicit check ensures process.stdout and process.stderr are treated
    # as non-Optional asyncio.StreamReader objects by the type checker for the next block.
    if process.stdout is None or process.stderr is None:
        logger.error(f"WORKER: Job {job_id} subprocess failed to provide I/O streams.")
        return

    # 2. Concurrently Stream and Publish Output
    stdout_task = stream_reader(
        process.stdout, redis_channel, "stdout", job_id, is_json_stream=True
    )
    stderr_task = stream_reader(
        process.stderr, redis_channel, "stderr", job_id, is_json_stream=False
    )

    await asyncio.gather(stdout_task, stderr_task)

    # 3. Wait for the process to finish
    await process.wait()

    # 4. Final error handling/cleanup
    logger.info(
        f"WORKER: Job {job_id} finished execution. Exit code: {process.returncode}"
    )

    if process.returncode != 0:
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
        asyncio.create_task(async_publish_message(redis_channel, error_msg))
        logger.error(
            f"WORKER: Job {job_id} failed with return code {process.returncode}."
        )

    logger.info(f"WORKER: Job {job_id} completed and stream tasks closed.")


# --- Main Worker Loop (The Job Consumer) ---


async def job_consumer():
    """Continuously monitors the Redis queue and executes jobs concurrently."""
    global r

    if not r or not r.ping():
        logger.error("Worker cannot start, Redis is not connected.")
        return

    logger.info(f"Worker started, monitoring queue: {REDIS_JOB_QUEUE}")

    # 🔑 FIX: Assign r to a local, non-Optional variable. This eliminates the "blpop is not a known attribute of 'None'" error.
    # The initial `if not r or not r.ping()` guarantees 'r' is a valid 'redis.Redis' object here.
    redis_sync_client: redis.Redis = r

    while True:
        try:
            # 🔑 FIX: Use asyncio.to_thread for the synchronous blpop call to prevent blocking the event loop.
            # 🔑 FIX: Pass REDIS_JOB_QUEUE as a List to satisfy strict Redis type hints.
            result = await asyncio.to_thread(
                lambda: redis_sync_client.blpop([REDIS_JOB_QUEUE], timeout=0)
            )

            # 🔑 FIX: Use cast to confirm the type checker that the result is an Optional tuple (resolving Awaitable errors).
            item: Optional[Tuple[str, str]] = cast(Optional[Tuple[str, str]], result)

            if item:
                # Item is guaranteed non-None here and can be unpacked.
                _, job_data_json = item

                job_payload: Dict[str, Any] = json.loads(job_data_json)

                job_id = job_payload.get("job_id")
                # Using Path() on the script path
                script_path = Path(job_payload.get("script_path", ""))
                cmd_args = job_payload.get("cmd_args")

                if (
                    not job_id
                    or not script_path.exists()
                    or not isinstance(cmd_args, list)
                ):
                    logger.error(f"Skipping badly formed job payload: {job_data_json}")
                    continue

                logger.info(f"Worker picked up job: {job_id}")

                # Run job execution concurrently as a background task
                asyncio.create_task(
                    run_script_and_stream_to_redis(script_path, cmd_args, job_id)
                )

        except Exception as e:
            logger.critical(f"Worker critical failure during queue processing: {e}")
            await asyncio.sleep(5)


if __name__ == "__main__":
    if r and r.ping():
        try:
            asyncio.run(job_consumer())
        except KeyboardInterrupt:
            logger.info("Worker shutting down...")
    else:
        logger.error(
            "Could not start worker because Redis connection failed at startup."
        )
