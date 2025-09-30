# fastapi_automation/ws_client.py

import websockets
import asyncio
import os
import json
from loguru import logger

# --- Configuration ---
# RUST_WS_URL will be set by Docker Compose to point to the Rust service name
RUST_WS_URL = os.getenv("RUST_WS_URL", "ws://localhost:3100/ws")

# --- Core Sending Function ---
async def send_to_rust_hub(message: dict):
    """Connects to the Rust Hub, sends a single JSON message, and disconnects."""
    try:
        # Connect to the Rust server as a client
        async with websockets.connect(RUST_WS_URL) as websocket:
            await websocket.send(json.dumps(message))
            logger.info(f"Sent feedback to Rust Hub: {message.get('event', 'UNKNOWN')}")
    except ConnectionRefusedError:
        logger.error(f"Could not connect to Rust Hub at {RUST_WS_URL}. Check Docker Compose network and Rust port.")
    except Exception as e:
        logger.error(f"Error sending message to Rust Hub: {e}")

# --- Automation Simulation ---
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
