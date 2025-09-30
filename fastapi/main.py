# fastapi_automation/main.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import asyncio
from loguru import logger
from ws_client import simulate_juniper_execution

# --- FastAPI Setup ---
app = FastAPI(title="FastAPI Automation Gateway")

# Configure CORS (essential for local development when running on different ports/hosts)
# Allowing all origins for simple scaffolding
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- API Endpoint to Trigger Automation ---
@app.post("/api/automation/run/{device_name}")
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

@app.get("/api/health")
def health_check():
    """Simple API Health Check"""
    return {"status": "ok", "service": "FastAPI Automation Gateway"}
