# fastapi_automation/app_gateway/api/routers/test_redis.py

from fastapi import APIRouter
from loguru import logger
import redis
import os
import json
import time

router = APIRouter()

# Use environment variables for connection, set in docker-compose.yml
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_CHANNEL = "automation_job_updates"

@router.post("/test/publish-job-status")
async def test_publish_status():
    """
    Temporary endpoint to simulate a job status update via Redis Pub/Sub.
    Rust backend should receive this and broadcast it to the client.
    """
    
    job_id = f"TEMP_JOB_{int(time.time())}"
    
    try:
        # 1. Connect to Redis
        r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT)
        
        # 2. Create the payload
        payload = {
            "type": "job_status",
            "job_id": job_id,
            "timestamp": time.time(),
            "status": "Running",
            "message": "Redis Pub/Sub Test: Message successfully transmitted.",
            "progress": 100
        }
        
        # 3. Publish the JSON string to the channel
        r.publish(REDIS_CHANNEL, json.dumps(payload))
        logger.info(f"Published test status for {job_id} to Redis.")

        return {
            "message": f"Test update published. Check WS client for job_id: {job_id}",
            "job_id": job_id
        }
    except Exception as e:
        logger.error(f"Redis connection/publish failed: {e}")
        return {"error": "Failed to connect to Redis", "detail": str(e)}, 500
