# =============================================================================
# FILE LOCATION: app_gateway/api/routers/operations.py
# DESCRIPTION:   FastAPI Router for Backup, Restore, and JSNAPy V2 Operations
# VERSION:       2.1.0 - Enhanced with File Size Support for Storage Validation
# AUTHOR:        nikos-geranios_vgi
# DATE:          2025-11-26
# =============================================================================
#
# OVERVIEW:
#   This FastAPI router provides HTTP endpoints for triggering asynchronous
#   automation operations on network devices.   It handles:
#     - Backup/Restore operations via Ansible
#     - JSNAPy V2 storage validation with file size comparison
#     - Job queueing to Redis for worker processing
#     - WebSocket channel coordination for real-time updates
#
# NEW IN VERSION 2.1.0:
#   - Added file_size parameter to ValidationRequest model
#   - Enhanced build_jsnapy_v2_cmd_args() to pass file_size to script
#   - Improved validation logic documentation
#   - Added detailed integration flow comments
#
# ARCHITECTURE OVERVIEW:
#
#   ┌──────────────┐     POST /operations/validation/execute-v2      ┌──────────────┐
#   │   Frontend   │ ─────────────────────────────────────────────▶  │ operations.py│
#   │ (React App)  │  Body: {hostname, username, password,           │  (This File) │
#   └──────────────┘        tests, file_size}                         └──────────────┘
#                                                                              │
#                                                                              │ queue_job_to_redis()
#                                                                              │ LPUSH to automation_jobs_queue
#                                                                              ▼
#                                                                     ┌──────────────┐
#                                                                     │    Redis     │
#                                                                     │  Job Queue   │
#                                                                     └──────────────┘
#                                                                              │
#                                                                              │ BLPOP
#                                                                              ▼
#   ┌──────────────┐                                               ┌──────────────┐
#   │  Rust Hub    │◀─ ws_channel:job:{job_id} ──────────────────│fastapi_worker│
#   │  (WebSocket) │                                               │   (Python)   │
#   └──────────────┘                                               └──────────────┘
#          │                                                                │
#          │ Relay to WebSocket client                                     │ Execute subprocess
#          ▼                                                                ▼
#   ┌──────────────┐                                               ┌──────────────┐
#   │   Frontend   │                                               │run_jsnapy_   │
#   │   Terminal   │                                               │  module.py   │
#   └──────────────┘                                               └──────────────┘
#
# INTEGRATION POINTS:
#   - Receives: HTTP POST requests from frontend
#   - Queues to: Redis List "automation_jobs_queue"
#   - Consumed by: fastapi_worker.py (BLPOP monitoring)
#   - Scripts executed: run. py, run_jsnapy_module. py
#   - WebSocket relay: Rust Hub subscribes to ws_channel:job:* pattern
#
# REDIS CHANNEL NAMING CONVENTION:
#   Backend returns to frontend: "job:jsnapy-UUID"
#   Frontend subscribes to: "job:jsnapy-UUID"
#   Rust Hub stores internally: "ws_channel:job:jsnapy-UUID" (prefix added)
#   Worker publishes to: "ws_channel:job:jsnapy-UUID"
#
#   This ensures all components reference the same channel correctly.
#
# =============================================================================

# =============================================================================
# SECTION 1: IMPORTS AND LOGGING SETUP
# =============================================================================

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List
import json
from pathlib import Path
import os
import redis
import uuid
import logging

# Configure logger for this module
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Add console handler if not already configured
# This prevents duplicate handlers if module is reloaded
if not logger.handlers:
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    formatter = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s"
    )
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

# =============================================================================
# SECTION 2: REDIS CONFIGURATION AND CONNECTION
# =============================================================================
#
# Redis serves as the message queue between the FastAPI Gateway and the
# FastAPI Worker. Jobs are pushed to a Redis List, and the worker continuously
# polls this list using BLPOP (blocking pop) for efficient job consumption.
#
# Environment variables (set in docker-compose.yml):
#   REDIS_HOST: Redis server hostname (default: redis_broker)
#   REDIS_PORT: Redis server port (default: 6379)
#
# Redis data structures used:
#   - List: "automation_jobs_queue" (FIFO job queue)
#   - Pub/Sub: "ws_channel:job:{job_id}" (real-time event streaming)
#
# =============================================================================

REDIS_HOST = os.getenv("REDIS_HOST", "redis_broker")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))

# Queue name that fastapi_worker.py monitors
# Worker calls: BLPOP automation_jobs_queue 0 (blocking, infinite timeout)
REDIS_JOB_QUEUE = "automation_jobs_queue"

# Absolute paths to automation scripts
# These must match the volume mounts in docker-compose.yml
BACKUP_RESTORE_SCRIPT_PATH = Path(
    "/app/app_gateway/py_scripts/scripts/backup_and_restore/run. py"
)
JSNAPY_RUNNER_SCRIPT_PATH = Path(
    "/app/app_gateway/py_scripts/scripts/jsnapy_runner/run_jsnapy_module.py"
)

# Global Redis connection (singleton pattern)
# Initialized once on module load, reused for all requests
r = None

try:
    r = redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        decode_responses=True,  # Automatically decode bytes to strings
        socket_connect_timeout=5,
        retry_on_timeout=True,
    )
    r.ping()  # Test connectivity
    logger.info(
        f"✅ Operations Router: Connected to Redis at {REDIS_HOST}:{REDIS_PORT}"
    )
except Exception as e:
    logger.error(f"❌ Operations Router: Failed to connect to Redis: {e}")
    r = None

# =============================================================================
# SECTION 3: REQUEST/RESPONSE MODELS (PYDANTIC SCHEMAS)
# =============================================================================
#
# Pydantic models provide:
#   - Automatic request validation
#   - Type checking
#   - API documentation (OpenAPI/Swagger)
#   - Clear contract between frontend and backend
#
# =============================================================================


class OperationTrigger(BaseModel):
    """
    Request model for Backup/Restore operations.

    Used by: POST /operations/backup

    Example request:
        {
            "command": "backup",
            "hostname": "device1.example.com",
            "username": "admin",
            "password": "secretpass123"
        }

    Fields:
        command: Operation type ("backup" or "restore")
        hostname: Target device hostname or IP (optional if inventory_file provided)
        inventory_file: Ansible inventory file path (optional if hostname provided)
        username: Device authentication username
        password: Device authentication password
    """

    command: str = Field(..., description="Operation: 'backup' or 'restore'")
    hostname: Optional[str] = Field(None, description="Target device hostname or IP")
    inventory_file: Optional[str] = Field(
        None, description="Ansible inventory file path"
    )
    username: str = Field(..., description="Device authentication username")
    password: str = Field(..., description="Device authentication password")


class ValidationRequest(BaseModel):
    """
    Request model for JSNAPy V2 Storage Validation.

    Used by: POST /operations/validation/execute-v2

    NEW IN v2.1.0:
        - Added file_size field for accurate space validation
        - file_size enables comparison of available space vs required space

    Example request (WITHOUT file_size):
        {
            "hostname": "192.168.1.100",
            "username": "admin",
            "password": "password123",
            "tests": ["test_storage_check"],
            "mode": "check",
            "tag": "snap"
        }
        → Returns informational storage data only

    Example request (WITH file_size):
        {
            "hostname": "192.168.1.100",
            "username": "admin",
            "password": "password123",
            "tests": ["test_storage_check"],
            "mode": "check",
            "tag": "snap",
            "file_size": 104857600
        }
        → Returns validation_passed=true/false with space comparison

    Fields:
        hostname: Target Juniper device hostname or IP
        username: Device authentication username
        password: Device authentication password
        tests: List of JSNAPy test names (e.g., ["test_storage_check"])
        mode: JSNAPy mode ("check" for validation, "enforce" for remediation)
        tag: Snapshot identifier tag (used for JSNAPy snapshot naming)
        file_size: OPTIONAL - File size in bytes for space validation
        inventory_file: IGNORED - Kept for backward compatibility
        command: IGNORED - Kept for backward compatibility

    Integration:
        Frontend sends this model in POST body
        → operations.py validates and queues job
        → build_jsnapy_v2_cmd_args() converts to CLI arguments
        → fastapi_worker. py executes: python run_jsnapy_module.py <args>
        → run_jsnapy_module.py receives --file-size argument
        → Script validates and returns validation_passed boolean
    """

    hostname: str = Field(..., description="Target Juniper device IP or hostname")
    username: str = Field(..., description="Device authentication username")
    password: str = Field(..., description="Device authentication password")
    tests: List[str] = Field(..., description="List of JSNAPy test names")
    mode: Optional[str] = Field(
        "check", description="JSNAPy mode: 'check' or 'enforce'"
    )
    tag: Optional[str] = Field("snap", description="Snapshot tag for identification")
    file_size: Optional[int] = Field(
        None, description="File size in bytes for validation (NEW in v2.1.0)"
    )
    inventory_file: Optional[str] = Field(
        None, description="Ignored - kept for compatibility"
    )
    command: Optional[str] = Field(
        "validation", description="Ignored - kept for compatibility"
    )


# =============================================================================
# SECTION 4: HELPER FUNCTIONS FOR JOB PROCESSING
# =============================================================================


def build_backup_restore_cmd_args(trigger: OperationTrigger) -> List[str]:
    """
    Builds command-line arguments for backup/restore script (run.py).

    This function translates the HTTP request model into CLI arguments
    that the Python script can parse with argparse.

    Argument mapping:
        trigger. command   → --command backup|restore
        trigger.username  → --username <value>
        trigger.password  → --password <value>
        trigger.hostname  → --hostname <value> (optional)
        trigger.inventory_file → --inventory-file <value> (optional)

    Flow:
        execute_operation(trigger)
        → build_backup_restore_cmd_args(trigger)
        → returns ["--command", "backup", "--username", "admin", ...]
        → queue_job_to_redis(job_id, BACKUP_RESTORE_SCRIPT_PATH, args)
        → LPUSH to Redis queue
        → fastapi_worker.py BLPOP and executes subprocess

    Args:
        trigger: OperationTrigger model from HTTP request

    Returns:
        List[str]: Command-line arguments for subprocess. run()

    Example:
        trigger = OperationTrigger(
            command="backup",
            hostname="device1",
            username="admin",
            password="pass123"
        )
        args = build_backup_restore_cmd_args(trigger)
        # Returns: ["--command", "backup", "--username", "admin",
        #           "--password", "pass123", "--hostname", "device1"]
    """
    args = [
        "--command",
        trigger.command,
        "--username",
        trigger.username,
        "--password",
        trigger.password,
    ]

    if trigger.hostname:
        args.extend(["--hostname", trigger.hostname])

    if trigger.inventory_file:
        args.extend(["--inventory-file", trigger.inventory_file])

    logger.debug(f"Built backup/restore command args: {args}")
    return args


def build_jsnapy_v2_cmd_args(req: ValidationRequest) -> List[str]:
    """
    Builds command-line arguments for JSNAPy V2 runner script.

    CRITICAL: This function must build arguments that exactly match the
    argparse configuration in run_jsnapy_module.py.

    NEW IN v2.1.0:
        - Conditionally adds --file-size argument if provided
        - Enables accurate storage validation based on actual file size

    Argument mapping:
        req.hostname  → --hostname <value>
        req.username  → --username <value>
        req.password  → --password <value>
        req.tests     → --tests <comma-separated-list>
        req.mode      → --mode check|enforce
        req.tag       → --tag <value>
        req.file_size → --file-size <bytes> (NEW - optional)

    Test path handling:
        Tests can be specified with or without "tests/" prefix
        Example: "tests/test_storage_check" → "test_storage_check"
        This ensures idempotency regardless of how frontend specifies paths

    Flow:
        execute_validation_v2(req)
        → build_jsnapy_v2_cmd_args(req)
        → returns ["--hostname", "192.168.1.1", "--username", "admin", .. ., "--file-size", "104857600"]
        → queue_job_to_redis(job_id, JSNAPY_RUNNER_SCRIPT_PATH, args, "jsnapy")
        → LPUSH to Redis queue
        → fastapi_worker.py BLPOP and executes subprocess
        → python run_jsnapy_module. py --hostname 192.168.1.1 ...  --file-size 104857600

    Args:
        req: ValidationRequest model from HTTP request

    Returns:
        List[str]: Command-line arguments for subprocess.run()

    Example (without file_size):
        req = ValidationRequest(
            hostname="192.168.1.1",
            username="admin",
            password="pass",
            tests=["test_storage_check"],
            mode="check",
            tag="snap"
        )
        args = build_jsnapy_v2_cmd_args(req)
        # Returns: ["--hostname", "192.168.1.1", "--username", "admin",
        #           "--password", "pass", "--tests", "test_storage_check",
        #           "--mode", "check", "--tag", "snap"]

    Example (with file_size):
        req = ValidationRequest(
            hostname="192.168.1.1",
            username="admin",
            password="pass",
            tests=["test_storage_check"],
            file_size=104857600  # 100 MB
        )
        args = build_jsnapy_v2_cmd_args(req)
        # Returns: [... , "--file-size", "104857600"]
    """
    # Clean test paths: remove "tests/" prefix if present
    # Ensures: "tests/storage_check" → "storage_check"
    cleaned_tests = [t.strip().replace("tests/", "") for t in req.tests]

    # Build base arguments
    args = [
        "--hostname",
        req.hostname,
        "--username",
        req.username,
        "--password",
        req.password,
        "--tests",
        ",".join(cleaned_tests),
        "--mode",
        req.mode,
        "--tag",
        req.tag,
    ]

    # NEW IN v2.1.0: Add file size if provided
    # This enables accurate storage validation in run_jsnapy_module.py
    logger.info(
        f"DEBUG: Request file_size: {req.file_size}, type: {type(req.file_size)}"
    )
    if req.file_size is not None:
        args.extend(["--file-size", str(req.file_size)])
        logger.info(
            f"Including file size in validation: {req.file_size} bytes ({req.file_size / (1024 * 1024):.2f} MB)"
        )
    else:
        logger.warning("DEBUG: file_size is None!")

    logger.debug(f"Built JSNAPy V2 command args: {args}")
    return args


def queue_job_to_redis(
    job_id: str, script_path: Path, cmd_args: List[str], job_type: str = "unknown"
) -> bool:
    """
    Queues a job to Redis for asynchronous processing by fastapi_worker.py.

    CRITICAL: This is the bridge between FastAPI Gateway and FastAPI Worker.
    All automation jobs (backup, restore, validation) are queued through this function.

    Job lifecycle:
        1. Frontend sends HTTP POST → operations.py endpoint
        2. operations.py validates request and builds command arguments
        3. queue_job_to_redis() creates job payload and pushes to Redis List
        4. fastapi_worker.py BLPOP from Redis List (blocking wait)
        5. Worker receives job payload and spawns subprocess
        6. Worker streams subprocess output to Redis Pub/Sub
        7.  Rust Hub relays Pub/Sub messages to WebSocket clients
        8. Frontend displays real-time progress in terminal

    Redis operations:
        - Command: LPUSH automation_jobs_queue <job_payload_json>
        - LPUSH adds to LEFT of list (FIFO with BLPOP from RIGHT)
        - Job payload is JSON-serialized for safe transport

    Job payload structure:
        {
            "job_id": "jsnapy-550e8400-e29b-41d4-a716-446655440000",
            "script_path": "/app/app_gateway/py_scripts/scripts/jsnapy_runner/run_jsnapy_module.py",
            "cmd_args": ["--hostname", "192.168. 1.1", "--username", "admin", ...]
        }

    Worker processing (fastapi_worker.py):
        while True:
            job = BLPOP automation_jobs_queue
            job_data = json.loads(job)
            job_id = job_data["job_id"]
            script = job_data["script_path"]
            args = job_data["cmd_args"]

            # Build full command
            cmd = [python, "-u", script] + args

            # Execute and stream output
            process = subprocess.Popen(cmd, stdout=PIPE, stderr=PIPE)
            for line in process.stdout:
                event = parse_json_event(line)
                redis. publish(f"ws_channel:job:{job_id}", event)

    Args:
        job_id: Unique identifier (e.g., "jsnapy-UUID", "backup-UUID")
        script_path: Absolute path to Python script to execute
        cmd_args: List of command-line arguments for the script
        job_type: Job category for logging ("backup", "restore", "jsnapy")

    Returns:
        bool: True if successfully queued, False otherwise

    Raises:
        No exceptions raised - errors are logged and False is returned

    Related files:
        - fastapi_worker.py: job_consumer() function (BLPOP loop)
        - fastapi_worker.py: run_script_and_stream_to_redis() function
        - Redis channels: ws_channel:job:{job_id}
    """
    global r

    # Validation 1: Redis connection must be active
    if r is None:
        logger.error(
            f"❌ Cannot queue {job_type} job {job_id}: Redis connection unavailable"
        )
        return False

    # Validation 2: Script file must exist
    if not script_path.is_file():
        logger.error(
            f"❌ Cannot queue {job_type} job {job_id}: Script not found at {script_path}"
        )
        return False

    # Build job payload
    job_payload = {
        "job_id": job_id,
        "script_path": str(script_path),
        "cmd_args": cmd_args,
    }

    try:
        # Push job to Redis List (FIFO queue)
        r.lpush(REDIS_JOB_QUEUE, json.dumps(job_payload))

        logger.info(
            f"✅ {job_type.upper()} Job {job_id} queued successfully to '{REDIS_JOB_QUEUE}'"
        )
        logger.debug(f"   Job payload: {job_payload}")
        return True

    except Exception as e:
        logger.error(f"❌ Failed to queue {job_type} job {job_id}: {e}")
        logger.exception(e)
        return False


# =============================================================================
# SECTION 5: FASTAPI ROUTER INITIALIZATION
# =============================================================================

router = APIRouter()

# =============================================================================
# SECTION 6: BACKUP/RESTORE ENDPOINT (UNCHANGED)
# =============================================================================


@router.post("/operations/backup")
async def execute_operation(trigger: OperationTrigger):
    """
    Triggers an asynchronous backup or restore operation.

    ENDPOINT: POST /operations/backup

    This endpoint has not changed - included for completeness.

    Request body:
        {
            "command": "backup",
            "hostname": "device1. example.com",
            "username": "admin",
            "password": "password123"
        }

    Response (200 OK):
        {
            "job_id": "backup-550e8400-e29b-41d4-a716-446655440000",
            "status": "Job backup queued successfully.",
            "ws_channel": "job:backup-550e8400-e29b-41d4-a716-446655440000"
        }

    Response (400 Bad Request):
        {
            "detail": "Invalid command: test.  Supported commands are 'backup' or 'restore'."
        }

    Response (503 Service Unavailable):
        {
            "detail": "Automation service unavailable: Cannot connect to Redis queue."
        }

    Flow:
        1.  Validate Redis connection
        2. Validate command is "backup" or "restore"
        3.  Verify script file exists
        4. Generate unique job_id
        5. Build command arguments
        6. Queue job to Redis
        7. Return job_id and ws_channel to frontend
    """
    logger.info(f"Backup/Restore operation requested: {trigger.command}")

    # Health check: Redis available
    if r is None:
        logger.error("Redis unavailable for backup/restore operation")
        raise HTTPException(
            status_code=503,
            detail="Automation service unavailable: Cannot connect to Redis queue.",
        )

    # Validate command
    if trigger.command not in ["backup", "restore"]:
        logger.warning(f"Invalid command: {trigger.command}")
        raise HTTPException(
            status_code=400,
            detail=f"Invalid command: {trigger.command}. Supported commands are 'backup' or 'restore'.",
        )

    # Validate script exists
    if not BACKUP_RESTORE_SCRIPT_PATH.is_file():
        logger.error(f"Script not found: {BACKUP_RESTORE_SCRIPT_PATH}")
        raise HTTPException(
            status_code=500,
            detail=f"Script not found at {BACKUP_RESTORE_SCRIPT_PATH}.  Check container mounts.",
        )

    # Create job
    job_id = f"{trigger.command}-{uuid.uuid4()}"
    cmd_args = build_backup_restore_cmd_args(trigger)

    logger.info(f"Queueing {trigger.command} job: {job_id}")

    # Queue to Redis
    success = queue_job_to_redis(
        job_id=job_id,
        script_path=BACKUP_RESTORE_SCRIPT_PATH,
        cmd_args=cmd_args,
        job_type=trigger.command,
    )

    if not success:
        logger.error(f"Failed to queue {trigger.command} job: {job_id}")
        raise HTTPException(
            status_code=500, detail="Failed to queue job due to Redis error."
        )

    # Return success response
    return {
        "job_id": job_id,
        "status": f"Job {trigger.command} queued successfully.",
        "ws_channel": f"job:{job_id}",
    }


# =============================================================================
# SECTION 7: JSNAPY V2 STORAGE VALIDATION ENDPOINT (ENHANCED)
# =============================================================================


@router.post("/operations/validation/execute-v2")
async def execute_validation_v2(req: ValidationRequest):
    """
    Triggers JSNAPy V2 storage validation with optional file size comparison.

    ENDPOINT: POST /operations/validation/execute-v2

    ENHANCED IN v2.1.0:
        - Now accepts file_size parameter for accurate validation
        - Passes file_size to run_jsnapy_module.py for comparison
        - Returns explicit validation_passed boolean in results

    HOW IT WORKS:

        WITHOUT file_size:
            - Runs JSNAPy snapcheck on device
            - Retrieves filesystem storage data
            - Checks for critically low space (< 500K blocks)
            - Returns informational data only
            - Frontend receives storage statistics

        WITH file_size:
            - Runs JSNAPy snapcheck on device
            - Retrieves filesystem storage data
            - Calculates required space: file_size * 1.2 (20% margin)
            - Compares: available_blocks >= required_blocks
            - Returns validation_passed: true/false
            - Frontend enables/disables upload button based on result

    Request body (WITHOUT file_size):
        {
            "hostname": "192.168.1.100",
            "username": "admin",
            "password": "password123",
            "tests": ["test_storage_check"],
            "mode": "check",
            "tag": "snap"
        }

    Request body (WITH file_size):
        {
            "hostname": "192. 168.1.100",
            "username": "admin",
            "password": "password123",
            "tests": ["test_storage_check"],
            "mode": "check",
            "tag": "snap",
            "file_size": 104857600
        }

    Response (200 OK):
        {
            "job_id": "jsnapy-550e8400-e29b-41d4-a716-446655440000",
            "ws_channel": "job:jsnapy-550e8400-e29b-41d4-a716-446655440000",
            "status": "queued",
            "message": "JSNAPy V2 Storage Check Started",
            "file_size_provided": true,
            "file_size_mb": 100.0
        }

    Response (400 Bad Request):
        {
            "detail": "Missing required fields: hostname, username, password"
        }

    Response (503 Service Unavailable):
        {
            "detail": "Validation service unavailable: Cannot connect to Redis queue."
        }

    INTEGRATION FLOW:

        1. Frontend Component (ImageUploads. jsx):
           - User selects file and enters credentials
           - Frontend calls: fetch("/api/operations/validation/execute-v2", {
                 body: JSON.stringify({
                     hostname, username, password,
                     tests: ["test_storage_check"],
                     file_size: selectedFile.size  // KEY: Include file size
                 })
             })

        2. This Endpoint (execute_validation_v2):
           - Validates request parameters
           - Builds command args including --file-size
           - Queues job to Redis: LPUSH automation_jobs_queue
           - Returns job_id and ws_channel to frontend

        3. FastAPI Worker (fastapi_worker.py):
           - BLPOP from automation_jobs_queue
           - Receives job payload with cmd_args
           - Spawns subprocess: python run_jsnapy_module.py --hostname X --file-size Y
           - Reads stdout/stderr line-by-line
           - Publishes events to: ws_channel:job:{job_id}

        4. Enhanced Script (run_jsnapy_module.py):
           - Receives --file-size argument
           - Runs JSNAPy snapcheck (collects storage data)
           - Parses XML snapshots
           - Calculates: required_blocks = (file_size * 1.2) / 1024
           - Compares: available_blocks >= required_blocks
           - Emits PRE_CHECK_COMPLETE event with validation_passed

        5.  Rust Hub (redis_service.rs + websocket. rs):
           - Subscribed to pattern: ws_channel:job:*
           - Receives message from Redis Pub/Sub
           - Checks subscriptions: client subscribed to ws_channel:job:{job_id}?
           - If yes: Relays message to WebSocket client

        6. Frontend WebSocket Handler (ImageUploads.jsx):
           - Receives WebSocket message
           - Parses JSON: { event_type: "PRE_CHECK_COMPLETE", data: { validation_passed: true } }
           - Updates state: setStorageCheck({ has_sufficient_space: validation_passed })
           - Updates UI: Enable/disable upload button
           - Shows message: "✅ Storage check passed" or "❌ Insufficient space"

    Args:
        req: ValidationRequest model with hostname, credentials, tests, and optional file_size

    Returns:
        dict: Response with job_id, ws_channel, status, and metadata

    Raises:
        HTTPException (400): Missing required fields or invalid parameters
        HTTPException (500): Script not found or internal error
        HTTPException (503): Redis connection unavailable

    Related files:
        - run_jsnapy_module.py: Enhanced script that performs validation
        - fastapi_worker.py: Executes queued jobs as subprocesses
        - ImageUploads.jsx: Frontend component that calls this endpoint
        - logProcessor.js: Processes PRE_CHECK_COMPLETE events
    """
    logger.info(f"JSNAPy V2 validation requested for {req.hostname}")

    # Log file size if provided (NEW in v2.1.0)
    if req.file_size:
        file_size_mb = req.file_size / (1024 * 1024)
        logger.info(
            f"   File size provided: {req.file_size} bytes ({file_size_mb:.2f} MB)"
        )
        logger.info(
            f"   Will validate if device has sufficient space for {file_size_mb:.2f} MB file"
        )
    else:
        logger.info(
            "   No file size provided - will perform informational storage check only"
        )

    # =========================================================================
    # VALIDATION CHECKS
    # =========================================================================

    # 1. Health Check: Redis connection available
    if r is None:
        logger.error("❌ Redis connection failed in execute_validation_v2")
        raise HTTPException(
            status_code=503,
            detail="Validation service unavailable: Cannot connect to Redis queue.",
        )

    # 2. Validation: Required fields present
    if not req.hostname or not req.username or not req.password:
        logger.warning("Missing required fields in validation request")
        raise HTTPException(
            status_code=400,
            detail="Missing required fields: hostname, username, password",
        )

    # 3. Validation: At least one test specified
    if not req.tests or len(req.tests) == 0:
        logger.warning("No tests specified in validation request")
        raise HTTPException(
            status_code=400,
            detail="At least one test must be specified",
        )

    # 4.  Validation: Script file exists
    if not JSNAPY_RUNNER_SCRIPT_PATH.is_file():
        logger.error(f"JSNAPy runner script not found at {JSNAPY_RUNNER_SCRIPT_PATH}")
        raise HTTPException(
            status_code=500,
            detail=f"JSNAPy runner script not found.  Check container mounts.",
        )

    # =========================================================================
    # JOB CREATION AND QUEUEING
    # =========================================================================

    # 5. Create job ID and build command arguments
    job_id = f"jsnapy-{uuid.uuid4()}"
    cmd_args = build_jsnapy_v2_cmd_args(req)

    logger.info(f"Creating JSNAPy V2 job: {job_id}")
    logger.info(f"  Hostname: {req.hostname}")
    logger.info(f"  Tests: {req.tests}")
    logger.info(f"  Mode: {req.mode}, Tag: {req.tag}")
    if req.file_size:
        logger.info(
            f"  File size: {req.file_size} bytes ({req.file_size / (1024 * 1024):.2f} MB)"
        )
    logger.debug(f"  Command arguments: {cmd_args}")

    # 6. Queue job to Redis
    success = queue_job_to_redis(
        job_id=job_id,
        script_path=JSNAPY_RUNNER_SCRIPT_PATH,
        cmd_args=cmd_args,
        job_type="jsnapy",
    )

    if not success:
        logger.error(f"Failed to queue JSNAPy job {job_id}")
        raise HTTPException(
            status_code=500,
            detail="Failed to queue validation job.  Please check server logs.",
        )

    # =========================================================================
    # SUCCESS RESPONSE
    # =========================================================================

    # 7. Build response with correct channel naming
    ws_channel = f"job:{job_id}"

    logger.info(f"✅ JSNAPy V2 job {job_id} queued successfully")
    logger.info(f"   WebSocket channel (returned to frontend): {ws_channel}")
    logger.info(f"   Rust Hub will store subscription as: ws_channel:{ws_channel}")
    logger.info(f"   Worker will publish to: ws_channel:{ws_channel}")

    # Build response with metadata
    response = {
        "job_id": job_id,
        "ws_channel": ws_channel,
        "status": "queued",
        "message": "JSNAPy V2 Storage Check Started",
    }

    # Add file size metadata if provided (NEW in v2.1.0)
    if req.file_size:
        response["file_size_provided"] = True
        response["file_size_mb"] = round(req.file_size / (1024 * 1024), 2)
    else:
        response["file_size_provided"] = False

    return response


# =============================================================================
# SECTION 8: ROUTER EXPORT
# =============================================================================

# This router is imported and included in the main FastAPI application via:
# app.include_router(operations. router, prefix="")
#
# This makes all endpoints available as:
# - POST /operations/backup
# - POST /operations/validation/execute-v2
#
# =============================================================================
# END OF FILE
# =============================================================================
