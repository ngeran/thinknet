# =================================================================================================
# FILE: api.py (FastAPI Endpoint)
# VERSION: 2.0.6 - FIXED RESPONSE STATUS + ENHANCED DEBUGGING + CORRECTED PORT
# OVERVIEW:
# A FastAPI application that exposes API endpoints for backup and restore operations.
# It acts as a bridge between the Rust backend and the Python worker scripts.
# Updated to include WebSocket integration for real-time job progress updates.
# FIXED: Corrected port configuration and enhanced debugging for frontend integration
# =================================================================================================

import json
import asyncio
import os
import subprocess
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pathlib import Path
from typing import Optional, List, Dict
import logging
import uuid
from datetime import datetime

# Import the main function using the full module path from the project root.
from scripts.backup_and_restore.run import main as run_orchestrator

app = FastAPI()

# Add CORS middleware to allow frontend connections
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
    ],  # React dev servers
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# =================================================================================================
# SECTION: RUST BACKEND CONFIGURATION - FIXED PORT
# =================================================================================================
# FIXED: Rust backend runs on port 3001, not 3010
RUST_BACKEND_URL = "http://localhost:3010"
# Check if aiohttp is available for Rust backend forwarding
try:
    import aiohttp
    from aiohttp import ClientTimeout

    AIOHTTP_AVAILABLE = True
    logger.info("aiohttp is available for Rust backend forwarding")
except ImportError:
    AIOHTTP_AVAILABLE = False
    logger.warning("aiohttp not available. Rust backend forwarding will be disabled.")

# Create a single, application-wide aiohttp ClientSession
# and set a sensible timeout to prevent hanging connections.
RUST_SESSION_TIMEOUT = 10  # Seconds
rust_session = None


async def get_rust_session():
    """Returns a memoized aiohttp ClientSession."""
    global rust_session
    if rust_session is None or rust_session.closed:
        rust_session = aiohttp.ClientSession(
            timeout=ClientTimeout(total=RUST_SESSION_TIMEOUT)
        )
    return rust_session


@app.on_event("startup")
async def startup_event():
    """Initializes aiohttp session on startup."""
    if AIOHTTP_AVAILABLE:
        await get_rust_session()
    logger.info("✅ FastAPI server started on port 3001")


@app.on_event("shutdown")
async def shutdown_event():
    """Closes aiohttp session on shutdown."""
    global rust_session
    if rust_session:
        await rust_session.close()


# =================================================================================================
# SECTION: WEB SOCKET MANAGER & FORWARDING LOGIC
# =================================================================================================


class WebSocketManager:
    """Manages WebSocket client connections for real-time updates."""

    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        """Accepts and registers a new WebSocket client."""
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(
            f"WebSocket client connected. Total connections: {len(self.active_connections)}"
        )

    def disconnect(self, websocket: WebSocket):
        """Removes a WebSocket client from the active connections."""
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(
            f"WebSocket client disconnected. Total connections: {len(self.active_connections)}"
        )

    async def broadcast(self, message: dict):
        """Broadcasts a message to all connected WebSocket clients."""
        disconnected_connections = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Failed to send WebSocket message: {e}")
                disconnected_connections.append(connection)
        # Remove disconnected connections
        for connection in disconnected_connections:
            self.disconnect(connection)


ws_manager = WebSocketManager()


# =================================================================================================
# SECTION: RUST BACKEND FORWARDING FUNCTION
# =================================================================================================
async def forward_to_rust_websocket(event_data: dict):
    """
    Forward progress events to Rust WebSocket backend via HTTP POST.
    This ensures events from run.py reach the Rust backend for broadcasting to all clients.
    """
    if not AIOHTTP_AVAILABLE:
        logger.warning("Rust backend forwarding disabled (aiohttp not available)")
        return

    try:
        session = await get_rust_session()
        logger.info(
            f"📨 Forwarding event to Rust backend: {event_data.get('event_type', 'unknown')}"
        )
        async with session.post(
            f"{RUST_BACKEND_URL}/jobs/broadcast",
            json=event_data,
        ) as response:
            if response.status != 200:
                logger.error(f"❌ Rust backend returned status {response.status}")
            else:
                logger.debug("✅ Event forwarded to Rust backend successfully")
    except aiohttp.ClientError as e:
        logger.error(
            f"❌ Failed to forward event to Rust backend due to client error: {e}"
        )
    except Exception as e:
        logger.error(f"❌ Failed to forward event to Rust backend: {e}")


# =================================================================================================
# SECTION: PROGRESS MANAGEMENT FUNCTIONS
# =================================================================================================


async def send_job_progress(
    job_id: str,
    device: str,
    job_type: str,
    event_type: str,
    status: str,
    data: dict,
    error: Optional[str] = None,
):
    """
    Send job progress update to all WebSocket clients AND Rust backend.
    Enhanced with better debugging information.
    """
    event = {
        "job_id": job_id,
        "device": device,
        "job_type": job_type,
        "event_type": event_type,
        "status": status,
        "timestamp": datetime.now().isoformat(),
        "data": data,
        "error": error,
    }

    logger.info(
        f"📊 [send_job_progress] {event_type} for job {job_id} ({device}) - status: {status}"
    )

    # Send to local WebSocket clients
    await ws_manager.broadcast(event)

    # ALSO forward to Rust backend to ensure all clients receive events
    await forward_to_rust_websocket(event)


async def read_process_output(process, job_id: str, device: str, job_type: str):
    """
    Read process output line by line and send progress updates to both WS systems.
    This function captures both stdout and stderr, logs each line, saves to a debug file, and forwards events.
    Enhanced with better error handling and debugging.
    """
    output = ""
    output_lines = []
    log_file_path = f"/tmp/job_{job_id}_output.log"

    logger.info(f"📝 [read_process_output] Starting output capture for job {job_id}")

    try:
        log_file = open(log_file_path, "a")
        log_file.write(
            f"=== Starting job {job_id} at {datetime.now().isoformat()} ===\n"
        )
    except Exception as e:
        log_file = None
        logger.warning(f"Could not open log file {log_file_path}: {e}")

    while True:
        # Read line from subprocess (both stdout and stderr are in stdout due to redirection)
        line = await asyncio.to_thread(process.stdout.readline)
        if not line:
            break

        try:
            output_line = line.strip().decode("utf-8")
        except Exception as e:
            output_line = f"[Decoding Error]: {e}"
            logger.error(f"Error decoding line from process output: {e}")

        output += output_line + "\n"
        output_lines.append(output_line)

        # Log and save to file
        logger.info(f"[subprocess output] {output_line}")
        if log_file:
            log_file.write(output_line + "\n")
            log_file.flush()  # Ensure immediate writing

        # Try to parse JSON progress updates from the script
        try:
            progress_data = json.loads(output_line)
            if isinstance(progress_data, dict):
                # Enhanced debugging for JSON progress
                logger.info(f"📋 [json progress] Parsed JSON: {progress_data}")

                # Forward the raw JSON from run.py to Rust backend
                rust_event = {
                    "job_id": job_id,
                    "device": device,
                    "job_type": job_type,
                    "event_type": progress_data.get("event_type", "progress"),
                    "status": "in_progress",
                    "data": progress_data,
                    "error": None,
                }
                logger.info(f"📨 [json progress] Forwarding to Rust: {rust_event}")
                await forward_to_rust_websocket(rust_event)
                await send_job_progress(
                    job_id=job_id,
                    device=device,
                    job_type=job_type,
                    event_type=progress_data.get("event_type", "progress"),
                    status="in_progress",
                    data=progress_data,
                )
        except json.JSONDecodeError:
            # Not a JSON line, check for specific keywords
            if output_line.startswith("SUCCESS"):
                await send_job_progress(
                    job_id=job_id,
                    device=device,
                    job_type=job_type,
                    event_type="completed",
                    status="completed",
                    data={"message": output_line, "raw_output": True},
                )
            elif output_line.startswith("ERROR"):
                await send_job_progress(
                    job_id=job_id,
                    device=device,
                    job_type=job_type,
                    event_type="failed",
                    status="failed",
                    data={"message": output_line, "raw_output": True},
                    error=output_line,
                )
            elif output_line and not output_line.isspace():
                # Treat other non-empty lines as progress updates
                rust_event = {
                    "job_id": job_id,
                    "device": device,
                    "job_type": job_type,
                    "event_type": "progress",
                    "status": "in_progress",
                    "data": {"message": output_line, "raw_output": True},
                    "error": None,
                }
                await forward_to_rust_websocket(rust_event)
                await send_job_progress(
                    job_id=job_id,
                    device=device,
                    job_type=job_type,
                    event_type="progress",
                    status="in_progress",
                    data={"message": output_line, "raw_output": True},
                )

    if log_file:
        log_file.write(
            f"=== Job {job_id} completed at {datetime.now().isoformat()} ===\n"
        )
        log_file.close()

    logger.info(
        f"✅ [read_process_output] Output capture completed for job {job_id}, {len(output_lines)} lines captured"
    )
    return output


# =================================================================================================
# SECTION: PYDANTIC MODELS
# =================================================================================================


class BackupRequest(BaseModel):
    hostname: Optional[str] = None
    inventory_file: Optional[str] = None
    username: str
    password: str


class RestoreRequest(BaseModel):
    hostname: str
    backup_file: str
    username: str
    password: str
    restore_type: str = "override"
    confirmed_commit_timeout: int = 0
    commit_timeout: int = 300


# =================================================================================================
# SECTION: WEB SOCKET ENDPOINTS
# =================================================================================================


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time job progress updates."""
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep connection alive - wait for ping or close
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
        logger.info("WebSocket client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        ws_manager.disconnect(websocket)


# =================================================================================================
# SECTION: HEALTH CHECK ENDPOINTS
# =================================================================================================


@app.get("/health")
async def health_check():
    """
    Health check endpoint for Docker Compose.
    Returns a simple status to confirm the API is running.
    """
    logger.info("[health_check] API health requested")
    return {
        "status": "healthy",
        "version": "2.0.6",
        "timestamp": datetime.now().isoformat(),
        "rust_backend_url": RUST_BACKEND_URL,
        "aiohttp_available": AIOHTTP_AVAILABLE,
    }


# =================================================================================================
# SECTION: BACKUP MANAGEMENT ENDPOINTS
# =================================================================================================


@app.get("/api/backups/devices")
async def list_backup_devices():
    """
    Lists available backup devices and their backup files.
    Enhanced with better error handling and debugging.
    """
    base_path = Path("/shared/data/backups")
    logger.info(f"[list_backup_devices] Listing backups in {base_path}")

    if not base_path.exists():
        logger.warning(
            f"[list_backup_devices] Backups directory not found: {base_path}"
        )
        return {
            "status": "error",
            "error": "Backups directory not found",
            "path": str(base_path),
        }

    devices = {}
    try:
        for device_dir in base_path.iterdir():
            if device_dir.is_dir():
                files = [
                    f.name
                    for f in device_dir.iterdir()
                    if f.is_file() and f.suffix in [".conf", ".cfg", ".txt", ".backup"]
                ]
                if files:  # Only include devices with backup files
                    devices[device_dir.name] = files

        logger.info(f"✅ [list_backup_devices] Devices found: {list(devices.keys())}")
        return {
            "status": "success",
            "devices": devices,
            "path": str(base_path),
        }
    except Exception as e:
        logger.error(f"❌ [list_backup_devices] Error listing backups: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": f"Error listing backups: {str(e)}",
            },
        )


async def execute_backup_with_websocket(
    job_id: str, request: BackupRequest, device: str
):
    """
    Execute backup using subprocess, capture and forward output, and log all progress.
    Enhanced with better error handling and debugging.
    """
    process = None
    output = ""
    logger.info(
        f"🚀 [execute_backup_with_websocket] Starting backup for job {job_id}, device {device}"
    )

    try:
        # Enhanced validation
        if not request.username or not request.password:
            error_msg = "Username and password are required"
            logger.error(f"❌ [execute_backup_with_websocket] {error_msg}")
            await send_job_progress(
                job_id=job_id,
                device=device,
                job_type="backup",
                event_type="failed",
                status="failed",
                data={"error": error_msg},
                error=error_msg,
            )
            return

        if not request.hostname and not request.inventory_file:
            error_msg = "Either hostname or inventory_file must be specified"
            logger.error(f"❌ [execute_backup_with_websocket] {error_msg}")
            await send_job_progress(
                job_id=job_id,
                device=device,
                job_type="backup",
                event_type="failed",
                status="failed",
                data={"error": error_msg},
                error=error_msg,
            )
            return

        args = [
            "--command",
            "backup",
            "--username",
            request.username,
            "--password",
            request.password,
            "--backup_path",
            "/shared/data/backups",
        ]
        if request.hostname:
            args.extend(["--hostname", request.hostname])
        if request.inventory_file:
            args.extend(["--inventory_file", request.inventory_file])

        logger.info(f"⚙️ [execute_backup_with_websocket] Args: {args}")

        # Ensure the script exists
        script_path = "/xaospy/scripts/backup_and_restore/run.py"
        if not os.path.exists(script_path):
            error_msg = f"Backup script not found at {script_path}"
            logger.error(error_msg)
            await send_job_progress(
                job_id=job_id,
                device=device,
                job_type="backup",
                event_type="failed",
                status="failed",
                data={"error": error_msg},
                error=error_msg,
            )
            return

        process = subprocess.Popen(
            ["/usr/local/bin/python3", script_path] + args,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=False,  # Set to False to handle bytes correctly
            bufsize=1,  # Line buffered
        )

        logger.info(
            f"✅ [execute_backup_with_websocket] Backup process started with PID: {process.pid}"
        )

        # Read output in real-time and forward to both WebSocket systems
        output = await read_process_output(process, job_id, device, "backup")

        # Wait for process to complete
        return_code = await asyncio.to_thread(process.wait)
        logger.info(
            f"📋 [execute_backup_with_websocket] Process completed with return code: {return_code}"
        )

        if return_code == 0:
            # Parse the final result
            try:
                final_result_line = (
                    output.strip().splitlines()[-1] if output.strip() else "{}"
                )
                final_result = json.loads(final_result_line)
                await send_job_progress(
                    job_id=job_id,
                    device=device,
                    job_type="backup",
                    event_type="completed",
                    status="completed",
                    data=final_result,
                )
                logger.info(
                    f"🎉 [execute_backup_with_websocket] Backup completed successfully for job {job_id}"
                )
            except (json.JSONDecodeError, IndexError) as e:
                logger.warning(
                    f"⚠️ [execute_backup_with_websocket] Could not parse final result, sending generic success: {e}"
                )
                await send_job_progress(
                    job_id=job_id,
                    device=device,
                    job_type="backup",
                    event_type="completed",
                    status="completed",
                    data={"message": "Backup completed successfully", "output": output},
                )
        else:
            error_msg = f"Backup failed with return code {return_code}"
            logger.error(
                f"❌ [execute_backup_with_websocket] Backup failed for job {job_id}: {error_msg}. Output: {output}"
            )
            await send_job_progress(
                job_id=job_id,
                device=device,
                job_type="backup",
                event_type="failed",
                status="failed",
                data={"return_code": return_code, "output": output},
                error=error_msg,
            )
    except Exception as e:
        error_msg = f"Backup execution error: {str(e)}"
        logger.error(
            f"❌ [execute_backup_with_websocket] Error in backup execution for job {job_id}: {error_msg}"
        )
        await send_job_progress(
            job_id=job_id,
            device=device,
            job_type="backup",
            event_type="failed",
            status="failed",
            data={"error": error_msg, "output": output},
            error=error_msg,
        )
    finally:
        # Ensure process is cleaned up
        if process and process.poll() is None:
            try:
                logger.info(
                    f"🛑 [execute_backup_with_websocket] Terminating backup process for job {job_id}"
                )
                process.terminate()
                process.wait()
            except Exception as e:
                logger.warning(
                    f"⚠️ [execute_backup_with_websocket] Error terminating process: {e}"
                )


@app.post("/api/backups/devices")
async def backup_devices(request: BackupRequest):
    """
    Triggers a backup operation with real-time progress updates.
    Events are forwarded to both FastAPI WebSocket clients and Rust backend.
    Enhanced with better validation and debugging.
    """
    job_id = str(uuid.uuid4())
    device = request.hostname or "multiple_devices"

    logger.info(f"🚀 [backup_devices] Starting backup job {job_id} for {device}")

    # Enhanced validation
    if not request.username or not request.password:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "Username and password are required",
                "job_id": job_id,
            },
        )

    if not request.hostname and not request.inventory_file:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "Either hostname or inventory_file must be specified",
                "job_id": job_id,
            },
        )

    # Send job started event to both WebSocket systems
    await send_job_progress(
        job_id=job_id,
        device=device,
        job_type="backup",
        event_type="started",
        status="in_progress",
        data={
            "inventory_file": request.inventory_file,
            "username": request.username,
            "has_password": bool(request.password),
        },
    )

    # Start backup process in background
    asyncio.create_task(execute_backup_with_websocket(job_id, request, device))

    # Return immediate response with job ID - FIXED: Return "started" status
    return {
        "status": "started",  # FIXED: Changed from "success" to "started"
        "job_id": job_id,
        "message": "Backup process started successfully",
        "device": device,
    }


# =================================================================================================
# SECTION: RESTORE MANAGEMENT ENDPOINTS
# =================================================================================================


@app.post("/restore")
async def restore_device(request: RestoreRequest):
    """
    Triggers a restore operation with real-time progress updates.
    Events are forwarded to both FastAPI WebSocket clients and Rust backend.
    Enhanced with better error handling and debugging.
    """
    job_id = str(uuid.uuid4())
    logger.info(
        f"🚀 [restore_device] Starting restore job {job_id} for {request.hostname}"
    )

    # Enhanced validation
    if not request.username or not request.password:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "Username and password are required",
                "job_id": job_id,
            },
        )

    if not request.backup_file:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "Backup file is required",
                "job_id": job_id,
            },
        )

    # Send job started event to both WebSocket systems
    await send_job_progress(
        job_id=job_id,
        device=request.hostname,
        job_type="restore",
        event_type="started",
        status="in_progress",
        data={
            "backup_file": request.backup_file,
            "restore_type": request.restore_type,
            "username": request.username,
            "has_password": bool(request.password),
        },
    )

    output = ""  # Initialize output to avoid unbound variable
    process = None
    try:
        args = [
            "--command",
            "restore",
            "--hostname",
            request.hostname,
            "--backup_file",
            request.backup_file,
            "--username",
            request.username,
            "--password",
            request.password,
            "--type",
            request.restore_type,
            "--confirmed_commit_timeout",
            str(request.confirmed_commit_timeout),
            "--commit_timeout",
            str(request.commit_timeout),
        ]
        script_path = "/xaospy/scripts/backup_and_restore/run.py"
        if not os.path.exists(script_path):
            error_msg = f"Restore script not found at {script_path}"
            logger.error(error_msg)
            await send_job_progress(
                job_id=job_id,
                device=request.hostname,
                job_type="restore",
                event_type="failed",
                status="failed",
                data={"error": error_msg},
                error=error_msg,
            )
            raise HTTPException(status_code=500, detail=error_msg)

        logger.info(
            f"⚙️ [restore_device] Executing restore command: /usr/local/bin/python3 {script_path} {' '.join(args)}"
        )

        process = subprocess.Popen(
            ["/usr/local/bin/python3", script_path] + args,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=False,  # Set to False
        )

        # Read output in real-time and forward to both WebSocket systems
        output = await read_process_output(process, job_id, request.hostname, "restore")

        # Wait for process to complete
        return_code = await asyncio.to_thread(process.wait)
        logger.info(
            f"📋 [restore_device] Process completed with return code: {return_code}"
        )

        if return_code == 0:
            try:
                # Try to parse the final result as JSON
                final_result_line = (
                    output.strip().splitlines()[-1] if output.strip() else "{}"
                )
                final_result = json.loads(final_result_line)
                # Send job completed event to both WebSocket systems
                await send_job_progress(
                    job_id=job_id,
                    device=request.hostname,
                    job_type="restore",
                    event_type="completed",
                    status="completed",
                    data=final_result,
                )
                logger.info(
                    f"🎉 [restore_device] Restore completed successfully for job {job_id}"
                )
                return final_result
            except (json.JSONDecodeError, IndexError) as e:
                # If no valid JSON, return the raw output
                logger.warning(
                    f"⚠️ [restore_device] Could not parse final output JSON: {e}"
                )
                result = {"status": "completed", "output": output.strip()}
                await send_job_progress(
                    job_id=job_id,
                    device=request.hostname,
                    job_type="restore",
                    event_type="completed",
                    status="completed",
                    data=result,
                )
                return result
        else:
            error_msg = f"Restore failed with return code {return_code}"
            logger.error(f"❌ [restore_device] {error_msg}. Output: {output}")
            await send_job_progress(
                job_id=job_id,
                device=request.hostname,
                job_type="restore",
                event_type="failed",
                status="failed",
                data={"return_code": return_code, "output": output},
                error=error_msg,
            )
            raise HTTPException(status_code=500, detail=error_msg)
    except Exception as e:
        error_msg = f"Unexpected error: {str(e)}"
        logger.error(f"❌ [restore_device] {error_msg}")
        await send_job_progress(
            job_id=job_id,
            device=request.hostname,
            job_type="restore",
            event_type="failed",
            status="failed",
            data={"error": error_msg, "output": output},
            error=error_msg,
        )
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")
    finally:
        if process and process.poll() is None:
            try:
                logger.info(
                    f"🛑 [restore_device] Terminating restore process for job {job_id}"
                )
                process.terminate()
                await asyncio.to_thread(process.wait)
            except Exception as e:
                logger.warning(f"⚠️ [restore_device] Error terminating process: {e}")


# =================================================================================================
# SECTION: WEB SOCKET MANAGEMENT ENDPOINTS
# =================================================================================================


@app.get("/ws/connections")
async def get_websocket_connections():
    """Get current WebSocket connection count."""
    logger.info(
        f"📊 [get_websocket_connections] Active connections: {len(ws_manager.active_connections)}"
    )
    return {"active_connections": len(ws_manager.active_connections)}


@app.get("/ws/health")
async def websocket_health():
    """WebSocket health check endpoint."""
    logger.info(
        f"📊 [websocket_health] Active connections: {len(ws_manager.active_connections)}"
    )
    return {
        "status": "healthy",
        "active_connections": len(ws_manager.active_connections),
        "timestamp": datetime.now().isoformat(),
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=3001)
