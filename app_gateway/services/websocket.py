# File Path: app_gateway/services/websocket.py
import asyncio
import json
import redis.asyncio as redis
from loguru import logger
from ..core.config import settings

# Import the new Service Layer
from .jsnapy_service import JSNAPyService


# --- Core Redis Publishing Function ---
async def publish_to_redis(channel: str, message: dict):
    """Publishes a JSON message to Redis channel."""
    try:
        redis_client = redis.Redis(
            host=settings.REDIS_HOST,
            port=int(settings.REDIS_PORT),
            decode_responses=True,
        )
        await redis_client.publish(channel, json.dumps(message))
        logger.debug(f"Published to Redis channel {channel}: {message}")
    except Exception as e:
        logger.error(f"Error publishing to Redis: {e}")


# --- Existing Simulation Code (Keep unchanged) ---
async def simulate_juniper_execution(device_name: str):
    pass  # (Your existing code here)


# --- NEW: JSNAPy Bridge Function ---
async def execute_jsnapy_and_stream(
    job_id: str,
    hostname: str,
    username: str,
    password: str,
    tests: list[str],
    mode: str = "check",
    tag: str = "snap",
):
    """
    Executes a real JSNAPy job and streams the events via Redis.
    """
    logger.info(f"Starting JSNAPy Job {job_id} for {hostname}")

    redis_channel = f"ws_channel:job:{job_id}"

    # 1. Notify Start
    await publish_to_redis(
        redis_channel,
        {
            "type": "job_status",
            "job_id": job_id,
            "status": "started",
            "hostname": hostname,
            "message": f"JSNAPy {mode} started",
        },
    )

    try:
        # 2. Start the Service Process
        process = await JSNAPyService.run_job(
            hosts=[hostname],
            username=username,
            password=password,
            tests=tests,
            mode=mode,
            tag=tag,
        )

        # 3. Stream Output Line-by-Line
        async for event in JSNAPyService.stream_events(process):
            # Inject the job_id into the event so Frontend knows where to render it
            event["job_id"] = job_id

            # Publish to Redis
            await publish_to_redis(redis_channel, event)

        # 4. Notify Completion
        await publish_to_redis(
            redis_channel,
            {
                "type": "job_status",
                "job_id": job_id,
                "status": "finished",
                "message": "Process execution completed",
            },
        )

    except Exception as e:
        logger.error(f"JSNAPy Job {job_id} failed: {e}")
        await publish_to_redis(
            redis_channel, {"type": "error", "job_id": job_id, "message": str(e)}
        )
