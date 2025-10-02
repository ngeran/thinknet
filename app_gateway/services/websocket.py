# File Path: fastapi_automation/services/websocket.py
"""
WebSocket Service Client
Handles connections and message passing to the Rust WebSocket Hub.
"""

import websockets
import asyncio
import json
from loguru import logger
from ..core.config import settings

# --- Core Sending Function ---
# Description: Connects, sends a message, and disconnects gracefully.
async def send_to_rust_hub(message: dict):
    """Connects to the Rust Hub, sends a single JSON message, and disconnects."""
    try:
        # Get the URL from centralized configuration
        async with websockets.connect(settings.RUST_WS_URL) as websocket:
            await websocket.send(json.dumps(message))
            logger.info(f"Sent feedback to Rust Hub: {message.get('event', 'UNKNOWN')}")
    except ConnectionRefusedError:
        logger.error(f"Could not connect to Rust Hub at {settings.RUST_WS_URL}. Check Docker Compose network and Rust port.")
    except Exception as e:
        logger.error(f"Error sending message to Rust Hub: {e}")

# --- Automation Simulation Service ---
# Description: Simulates the steps of a background job (like a PyEZ script).
async def simulate_juniper_execution(device_name: str):
    """Simulates a real-time execution feed transmitted via WebSocket."""
    logger.info(f"Starting simulation for device: {device_name}")
    
    # 1. Start message
    await send_to_rust_hub({
        "event": "EXECUTION_START",
        "device": device_name,
        "timestamp": asyncio.get_event_loop().time(),
        "step": "Automation initiated."
    })

    # 2. Simulate steps with delay (mimicking PyEZ running commands)
    for step in ["Connecting to device...", "Running 'show version'...", "Parsing results..."]:
        await asyncio.sleep(1) # Pause for 1 second to simulate work
        await send_to_rust_hub({
            "event": "EXECUTION_PROGRESS",
            "device": device_name,
            "step": step
        })

    # 3. Final success message
    await send_to_rust_hub({
        "event": "EXECUTION_COMPLETE",
        "device": device_name,
        "status": "SUCCESS",
        "step": "Execution finished. Output ready."
    })
