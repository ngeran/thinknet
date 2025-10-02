# File Path: fastapi_automation/api/routers/automation.py
"""
Automation Router
Defines all HTTP endpoints related to triggering automation scripts.
"""

from fastapi import APIRouter
import asyncio
from loguru import logger
from ...services.websocket import simulate_juniper_execution

# --- Router Setup ---
# All routes defined here will be prefixed when included in main.py
router = APIRouter()

# --- Endpoint to Trigger Automation ---
# Description: Receives an HTTP request and launches a non-blocking background task.
@router.post("/automation/run/{device_name}")
async def run_juniper_script(device_name: str):
    """
    Receives an HTTP request and launches a non-blocking task 
    to simulate the PyEZ execution and send real-time feedback via WebSocket.
    """
    logger.info(f"Received HTTP request to run script on {device_name}")
    
    # Launch the simulation function as a background task
    asyncio.create_task(simulate_juniper_execution(device_name))
    
    return {
        "message": f"Juniper script execution started for {device_name}.",
        "status": "started",
        "feed": "Check WebSocket on 3100 for real-time updates."
    }

# --- Health Check Endpoint ---
# Description: Simple health check for this specific router/service.
@router.get("/health")
def health_check():
    """Simple API Health Check for the Automation Router"""
    return {"status": "ok", "service": "FastAPI Automation Router"}
