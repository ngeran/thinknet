import asyncio
import subprocess
import json
import logging
import os
import redis
import redis.asyncio as aioredis
from datetime import datetime
from pathlib import Path
from typing import Optional, Tuple, Any, Dict, cast, List

# --- Logging Setup (CRITICAL DEBUG FIXES) ---
logger = logging.getLogger("FASTAPI_WORKER")
# 🔑 FIX 1: Set log level to DEBUG to capture the full command and stream content.
logger.setLevel(logging.DEBUG)
ch = logging.StreamHandler()
# 🔑 FIX 1: Set stream handler level to DEBUG.
ch.setLevel(logging.DEBUG)
formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
ch.setFormatter(formatter)
logger.addHandler(ch)

# --- Configuration ---
REDIS_HOST = os.getenv("REDIS_HOST", "redis_broker")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_CHANNEL_PREFIX = "ws_channel:job:"
REDIS_JOB_QUEUE = "automation_jobs_queue"

PYTHON_INTERPRETER_PATH = "/usr/local/bin/python"
BASE_SCRIPT_ROOT = "/app/app_gateway/py_scripts"

# --- Redis Connection (Synchronous for BLPOP) ---
r: Optional[redis.Redis] = None
try:
    # Synchronous Redis client initialization for the blpop loop.
    r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
    r.ping()
    logger.info(f"✅ WORKER: Connected to Redis at {REDIS_HOST}:{REDIS_PORT}")
except Exception as e:
    logger.error(f"❌ WORKER: Failed to connect to Redis: {e}")


# --- Async Publishing Helper ---
async def async_publish_message(channel: str, message: str) -> None:
    """Publish a message to Redis Pub/Sub using the non-blocking async client."""
    try:
        async_r = aioredis.from_url(
            f"redis://{REDIS_HOST}:{REDIS_PORT}", decode_responses=True
        )
        await async_r.publish(channel, message)
    except Exception as e:
        # Log Redis connection/publishing failures as they happen.
        logger.critical(f"❌ CRITICAL: Failed to publish message to {channel}: {e}")


# --- Stream Processing Logic (CRITICAL DEBUG FIXES) ---
async def stream_reader(
    stream: asyncio.StreamReader,
    redis_channel: str,
    stream_name: str,
    job_id: str,
    is_json_stream: bool = False,
):
    """Reads a subprocess stream and publishes data to Redis."""
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
            # 🔑 ENHANCEMENT: Check for JSON-like start/end before attempting parse
            if line.startswith("{") and line.endswith("}"):
                # Check if it's a nested log (e.g., Python logging framework outputting JSON as a string)
                if line.startswith('{"level":'):
                    # The line is already the JSON payload the frontend expects.
                    message_to_publish = line
                else:
                    # If it's the raw final JSON, wrap it in a completion event
                    # This handles the final raw JSON line that might not have level/event_type fields
                    logger.debug(
                        f"WORKER DEBUG: Wrapping final raw JSON payload: {line[:50]}..."
                    )
                    message_to_publish = json.dumps(
                        {
                            "level": "SUCCESS",
                            "event_type": "OPERATION_COMPLETE",
                            "message": "Final raw results received.",
                            "data": {
                                "status": "SUCCESS",
                                "final_results": json.loads(line),
                            },
                            "timestamp": datetime.utcnow().isoformat(),
                            "job_id": job_id,
                        }
                    )
            else:
                # 🔑 ANNOTATION: Capture non-JSON data unexpectedly sent to the designated JSON stream.
                logger.warning(
                    f"WORKER WARNING: Non-JSON data on {stream_name} for job {job_id}. Data: '{line}'"
                )
                message_to_publish = json.dumps(
                    {
                        "level": "WARNING",
                        "event_type": "ORCHESTRATOR_LOG",
                        "message": f"[{stream_name.upper()}_RAW_NON_JSON] {line}",
                        "timestamp": datetime.utcnow().isoformat(),
                        "job_id": job_id,
                    }
                )
        else:
            # 🔑 ENHANCEMENT: Explicitly log raw stderr/stdout that is NOT the JSON payload.
            # This captures orchestrator logs (e.g., "Starting orchestrator...")
            if stream_name == "stderr":
                logger.error(f"WORKER RAW STDERR (JOB {job_id}): {line}")
            else:
                logger.debug(f"WORKER RAW STDOUT (JOB {job_id}): {line}")

            # Standard wrapper for non-JSON content to keep the frontend updated
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
            # Non-blocking task creation for Redis publishing
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

    logger.debug(f"WORKER: Job {job_id} FULL COMMAND: {' '.join(full_command)}")

    # --- Setup Environment ---
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
        logger.critical(f"FATAL ERROR: Job {job_id} failed to spawn: {e}")
        return

    # 2. Concurrently Stream and Publish Output
    if process.stdout is None or process.stderr is None:
        logger.error(f"WORKER: Job {job_id} subprocess failed to provide I/O streams.")
        return

    # 🔑 CRITICAL FIX: The orchestrator is sending its structured JSON progress messages
    # to STDERR (due to how Python logging is configured in run.py).
    # We map STDERR to the JSON stream handler (is_json_stream=True).
    # We map STDOUT to the non-JSON handler (is_json_stream=False).
    stdout_task = stream_reader(
        process.stdout, redis_channel, "stdout", job_id, is_json_stream=False
    )
    stderr_task = stream_reader(
        process.stderr,
        redis_channel,
        "stderr",
        job_id,
        is_json_stream=True,  # <--- THE FIX
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


# ---------------------------------------------------------------------------------------------------


# --- Main Worker Loop (The Job Consumer) ---
async def job_consumer():
    """Continuously monitors the Redis queue and executes jobs concurrently."""
    global r

    if not r or not r.ping():
        logger.error("Worker cannot start, Redis is not connected.")
        return

    logger.info(f"Worker started, monitoring queue: {REDIS_JOB_QUEUE}")

    redis_sync_client: redis.Redis = r

    while True:
        try:
            # Use asyncio.to_thread for the synchronous blpop call to prevent blocking the event loop.
            result = await asyncio.to_thread(
                lambda: redis_sync_client.blpop([REDIS_JOB_QUEUE], timeout=0)
            )

            item: Optional[Tuple[str, str]] = cast(Optional[Tuple[str, str]], result)

            if item:
                _, job_data_json = item

                job_payload: Dict[str, Any] = json.loads(job_data_json)

                job_id = job_payload.get("job_id")
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
