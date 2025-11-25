# =============================================================================
# FILE LOCATION: app_gateway/services/websocket.py
# DESCRIPTION:   Backend WebSocket Service with JSNAPy Bridge & Redis Integration
# VERSION:       2.0.0 - JSNAPy V2 Integration
# AUTHOR:        nikos
# DATE:          2025-11-25
# =============================================================================
 
import asyncio
import json
import redis.asyncio as redis
from loguru import logger
from typing import Optional, Dict, Any
from pathlib import Path
 
# Import configuration
from ..core.config import settings
 
# Import the JSNAPy Service for executing tests
from .jsnapy_service_v2 import JSNAPyServiceV2
 
# =============================================================================
# SECTION 1: CONFIGURATION CONSTANTS
# =============================================================================
 
# Redis configuration from environment variables
REDIS_HOST = settings.REDIS_HOST
REDIS_PORT = int(settings.REDIS_PORT)
 
# Redis channel prefix that MUST match fastapi_worker.py
# Format: ws_channel:job:{job_id}
REDIS_CHANNEL_PREFIX = "ws_channel:job:"
 
# =============================================================================
# SECTION 2: CORE REDIS PUBLISHING FUNCTION
# =============================================================================
 
async def publish_to_redis(channel: str, message: dict) -> bool:
    """
    Publishes a JSON message to a Redis Pub/Sub channel.
 
    ARCHITECTURE:
    - Creates temporary async Redis connection
    - Serializes message to JSON
    - Publishes to specified channel
    - Logs publication with subscriber count
    - Closes connection to prevent leaks
 
    CRITICAL: Channel name must match what subscribers expect.
    Frontend subscribes to "job:UUID" and Rust Hub converts to "ws_channel:job:UUID"
 
    Function Call Chain:
        execute_jsnapy_and_stream()
        -> process stdout from JSNAPy subprocess
        -> parse event
        -> publish_to_redis(redis_channel, event_dict)
        -> PUBLISH to Redis
        -> Rust Hub receives and relays to frontend
 
    Args:
        channel: Redis channel name (e.g., "ws_channel:job:jsnapy-UUID")
        message: Dictionary to serialize and publish
 
    Returns:
        bool: True if published successfully, False otherwise
    """
    async_r = None
    try:
        # Create temporary async Redis connection
        async_r = redis.Redis(
            host=REDIS_HOST,
            port=REDIS_PORT,
            decode_responses=True,
        )
 
        # Serialize message to JSON
        message_json = json.dumps(message)
 
        # Publish to channel and get subscriber count
        subscriber_count = await async_r.publish(channel, message_json)
 
        # Log publication result
        event_type = message.get("event_type", "UNKNOWN")
        if subscriber_count > 0:
            logger.info(
                f"✅ Published {event_type} to {channel}: "
                f"{subscriber_count} subscriber(s) received"
            )
        else:
            logger.warning(
                f"⚠️  Published {event_type} to {channel} but NO SUBSCRIBERS"
            )
 
        return True
 
    except Exception as e:
        logger.error(f"❌ Error publishing to Redis channel {channel}: {e}")
        return False
 
    finally:
        # Always close connection to prevent resource leaks
        if async_r:
            try:
                await async_r.close()
            except Exception as close_error:
                logger.debug(f"Redis close warning: {close_error}")
 
 
# =============================================================================
# SECTION 3: SIMULATION CODE (EXISTING - UNCHANGED)
# =============================================================================
 
async def simulate_juniper_execution(device_name: str):
    """
    Simulation function for Juniper device execution.
 
    EXISTING CODE: This function is kept for backward compatibility
    and can be used for testing without actual devices.
 
    Args:
        device_name: Name of the device to simulate
    """
    pass  # (Your existing simulation code here if applicable)
 
 
# =============================================================================
# SECTION 4: NEW JSNAPY V2 BRIDGE FUNCTION
# =============================================================================
 
async def execute_jsnapy_and_stream(
    job_id: str,
    hostname: str,
    username: str,
    password: str,
    tests: list,
    mode: str = "check",
    tag: str = "snap",
) -> None:
    """
    🔑 NEW FUNCTION: Executes a real JSNAPy V2 job and streams events via Redis.
 
    CRITICAL: This is the bridge function that connects the backend JSNAPy
    execution to the Redis/WebSocket streaming pipeline. It is called
    asynchronously by the FastAPI endpoint or worker processes.
 
    ARCHITECTURE:
    1. Publish job START event to notify frontend
    2. Create subprocess for JSNAPy execution via JSNAPyServiceV2
    3. Stream output events line-by-line
    4. Publish each event to Redis for relay to frontend
    5. Handle errors and publish COMPLETION event
 
    CRITICAL CHANNEL NAMING:
    - This function publishes to: "ws_channel:job:{job_id}"
    - Frontend subscribes to: "job:{job_id}"
    - Rust Hub converts subscription to: "ws_channel:job:{job_id}"
    - Messages are relayed back to frontend
 
    Function Call Chain:
        operations.py execute_validation_v2()
        -> queue_job_to_redis(job_id, script_path, cmd_args, "jsnapy")
 
        OR
 
        Direct call from background task
        -> execute_jsnapy_and_stream(job_id, hostname, username, password, tests)
        -> JSNAPyServiceV2.run_job()
        -> JSNAPyServiceV2.stream_events()
        -> publish_to_redis() for each event
        -> Rust Hub relays to frontend
        -> Frontend displays in terminal
 
    Args:
        job_id: Unique job identifier (e.g., "jsnapy-550e8400-e29b-41d4-a716-446655440000")
        hostname: Target Juniper device IP or hostname
        username: Device authentication username
        password: Device authentication password
        tests: List of JSNAPy test names (e.g., ["test_storage_check"])
        mode: JSNAPy mode ("check" or "enforce"), defaults to "check"
        tag: JSNAPy tag for snapshot identification, defaults to "snap"
    """
    logger.info(f"Starting JSNAPy Job {job_id} for {hostname}")
 
    # Build Redis channel for this job
    redis_channel = f"{REDIS_CHANNEL_PREFIX}{job_id}"
 
    logger.info(f"Redis channel: {redis_channel}")
    logger.info(f"Hostname: {hostname}, Tests: {tests}, Mode: {mode}")
 
    # =========================================================================
    # STEP 1: Notify START - Publish job started event
    # =========================================================================
    start_event = {
        "type": "job_status",
        "job_id": job_id,
        "status": "started",
        "hostname": hostname,
        "message": f"JSNAPy {mode} started",
        "timestamp": asyncio.get_event_loop().time(),
    }
 
    await publish_to_redis(redis_channel, start_event)
 
    try:
        # =====================================================================
        # STEP 2: Start the JSNAPy Service Process
        # =====================================================================
        logger.info(f"Starting JSNAPy service process...")
 
        process = await JSNAPyServiceV2.run_job(
            hosts=[hostname],
            username=username,
            password=password,
            tests=tests,
            mode=mode,
            tag=tag,
        )
 
        # =====================================================================
        # STEP 3: Stream Output Line-by-Line and Publish Events
        # =====================================================================
        logger.info(f"Streaming JSNAPy output...")
 
        event_count = 0
        async for event in JSNAPyServiceV2.stream_events(process):
            event_count += 1
 
            # Inject the job_id into the event so frontend knows where to render it
            if "job_id" not in event:
                event["job_id"] = job_id
 
            logger.debug(f"Event #{event_count}: {event.get('event_type', 'UNKNOWN')}")
 
            # Publish to Redis channel for relay to frontend
            await publish_to_redis(redis_channel, event)
 
        # =====================================================================
        # STEP 4: Notify COMPLETION - All events published successfully
        # =====================================================================
        logger.info(f"JSNAPy job {job_id} completed successfully")
 
        completion_event = {
            "type": "job_status",
            "job_id": job_id,
            "status": "finished",
            "message": "Process execution completed",
            "event_count": event_count,
        }
 
        await publish_to_redis(redis_channel, completion_event)
 
    except Exception as e:
        logger.error(f"JSNAPy Job {job_id} failed: {e}")
        logger.exception(e)
 
        # =====================================================================
        # STEP 5: ERROR HANDLING - Publish error event
        # =====================================================================
        error_event = {
            "type": "error",
            "job_id": job_id,
            "event_type": "OPERATION_COMPLETE",
            "level": "ERROR",
            "message": f"JSNAPy execution failed: {str(e)}",
            "data": {
                "status": "FAILED",
                "success": False,
                "error": str(e),
            },
        }
 
        await publish_to_redis(redis_channel, error_event)
 
 
# =============================================================================
# SECTION 5: ADDITIONAL HELPER FUNCTIONS
# =============================================================================
 
async def get_redis_channel_for_job(job_id: str) -> str:
    """
    Constructs the Redis channel name for a given job.
 
    ARCHITECTURE:
    - All job channels follow the format: ws_channel:job:{job_id}
    - This ensures consistency across all components
    - Frontend knows to subscribe to "job:{job_id}"
    - Rust Hub adds "ws_channel:" prefix internally
 
    Args:
        job_id: The job identifier
 
    Returns:
        str: The full Redis channel name
    """
    return f"{REDIS_CHANNEL_PREFIX}{job_id}"
 
 
async def verify_redis_connection() -> bool:
    """
    Verifies that the Redis connection is available.
 
    ARCHITECTURE:
    - Tests connectivity to Redis before executing jobs
    - Prevents job queuing if Redis is unavailable
    - Helps with early error detection
 
    Returns:
        bool: True if Redis is accessible, False otherwise
    """
    try:
        redis_client = redis.Redis(
            host=REDIS_HOST,
            port=REDIS_PORT,
            decode_responses=True,
            socket_connect_timeout=5,
        )
 
        await redis_client.ping()
        await redis_client.close()
 
        logger.info(f"✅ Redis connection verified at {REDIS_HOST}:{REDIS_PORT}")
        return True
 
    except Exception as e:
        logger.error
