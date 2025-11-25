# =============================================================================
# FILE LOCATION: app_gateway/api/routers/operations.py
# DESCRIPTION:   FastAPI Router for Backup, Restore, and JSNAPy V2 Operations
# VERSION:       2.0.0 - JSNAPy V2 Storage Check Integration
# AUTHOR:        nikos
# DATE:          2025-11-25
# =============================================================================
 
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import json
from pathlib import Path
import os
import redis
import uuid
import logging
 
# =============================================================================
# SECTION 1: LOGGING SETUP FOR OPERATIONS ROUTER
# =============================================================================
 
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
 
# Add console handler if not already present
if not logger.handlers:
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    formatter = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)
 
# =============================================================================
# SECTION 2: REDIS CONFIGURATION AND CONNECTION
# =============================================================================
 
# Read Redis configuration from environment variables (set in docker-compose.yml)
REDIS_HOST = os.getenv("REDIS_HOST", "redis_broker")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
 
# CRITICAL: The name of the Redis List (Queue) that fastapi_worker.py monitors via BLPOP
# Worker continuously checks this queue and processes jobs in FIFO order
REDIS_JOB_QUEUE = "automation_jobs_queue"
 
# Confirmed absolute paths to automation scripts
# These paths must match the volumes mounted in docker-compose.yml
BACKUP_RESTORE_SCRIPT_PATH = Path("/app/app_gateway/py_scripts/scripts/backup_and_restore/run.py")
JSNAPY_RUNNER_SCRIPT_PATH = Path("/app/app_gateway/py_scripts/scripts/jsnapy_runner/run_jsnapy_module.py")
 
# Redis connection object (singleton, shared by all endpoints in this router)
r = None
try:
    r = redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        decode_responses=True,
        socket_connect_timeout=5
    )
    r.ping()  # Verify connection
    logger.info(f"✅ Operations Router: Connected to Redis at {REDIS_HOST}:{REDIS_PORT}")
except Exception as e:
    logger.error(f"❌ Operations Router: Failed to connect to Redis: {e}")
    r = None
 
# =============================================================================
# SECTION 3: PYDANTIC REQUEST MODELS
# =============================================================================
 
class OperationTrigger(BaseModel):
    """
    Request model for Backup/Restore operations.
 
    Fields:
        command: str - "backup" or "restore"
        hostname: Optional[str] - Target device hostname/IP
        inventory_file: Optional[str] - Path to Ansible inventory file
        username: str - Device authentication username
        password: str - Device authentication password
    """
    command: str
    hostname: Optional[str] = None
    inventory_file: Optional[str] = None
    username: str
    password: str
 
 
class ValidationRequest(BaseModel):
    """
    Request model for JSNAPy V2 Storage Check validation.
 
    CRITICAL: This model is used for the new execute-v2 endpoint.
    It collects all necessary parameters to execute a JSNAPy V2 test
    on a target device and verify available storage before upload.
 
    Fields:
        hostname: str - Target Juniper device IP/hostname
        username: str - Device authentication username
        password: str - Device authentication password
        tests: List[str] - List of JSNAPy test names (e.g., ["test_storage_check"])
        mode: Optional[str] - JSNAPy mode ("check" or "enforce"), defaults to "check"
        tag: Optional[str] - JSNAPy tag for snapshot identification, defaults to "snap"
        inventory_file: Optional[str] - Ignored for V2 (kept for compatibility)
        command: Optional[str] - Ignored for V2 (kept for compatibility)
    """
    hostname: str
    username: str
    password: str
    tests: List[str]
    mode: Optional[str] = "check"
    tag: Optional[str] = "snap"
    inventory_file: Optional[str] = None
    command: Optional[str] = "validation"
 
 
# =============================================================================
# SECTION 4: HELPER FUNCTIONS FOR JOB PROCESSING
# =============================================================================
 
def build_backup_restore_cmd_args(trigger: OperationTrigger) -> List[str]:
    """
    Builds command-line arguments for the backup/restore run.py script.
 
    ARCHITECTURE:
    - This function constructs CLI arguments that will be passed to the Python script
    - Arguments are built in a specific order expected by run.py
    - The resulting args list becomes part of the job_payload sent to Redis
 
    Function Call Chain:
        execute_operation()
        -> build_backup_restore_cmd_args(trigger)
        -> returns List[str] of CLI arguments
        -> used to build job_payload for Redis queue
 
    Args:
        trigger: OperationTrigger model containing command, hostname, username, password, etc.
 
    Returns:
        List[str]: Command-line arguments ready for subprocess execution
 
    Example:
        trigger = OperationTrigger(command="backup", hostname="device1", username="admin", password="pass123")
        args = build_backup_restore_cmd_args(trigger)
        # returns: ["--command", "backup", "--username", "admin", "--password", "pass123", "--hostname", "device1"]
    """
    args = [
        "--command", trigger.command,
        "--username", trigger.username,
        "--password", trigger.password
    ]
 
    # Add optional hostname if provided
    if trigger.hostname:
        args.extend(["--hostname", trigger.hostname])
 
    # Add optional inventory file if provided
    if trigger.inventory_file:
        args.extend(["--inventory-file", trigger.inventory_file])
 
    logger.debug(f"Built backup/restore args: {args}")
    return args
 
 
def build_jsnapy_v2_cmd_args(req: ValidationRequest) -> List[str]:
    """
    Builds command-line arguments for the JSNAPy V2 runner script (run_jsnapy_module.py).
 
    CRITICAL: This function creates the exact CLI arguments expected by run_jsnapy_module.py
    The arguments must match the argparse definitions in that script.
 
    ARCHITECTURE:
    - Cleans test paths (removes 'tests/' prefix for idempotency)
    - Builds arguments in the specific order expected by the runner
    - Returns a list that becomes part of job_payload
 
    Function Call Chain:
        execute_validation_v2(req)
        -> build_jsnapy_v2_cmd_args(req)
        -> returns List[str] of CLI arguments
        -> used to build job_payload for Redis queue
        -> fastapi_worker.py BLPOP job from queue
        -> fastapi_worker.py runs: python run_jsnapy_module.py <args>
 
    Args:
        req: ValidationRequest model with hostname, username, password, tests, mode, tag
 
    Returns:
        List[str]: Command-line arguments for subprocess execution
 
    Example:
        req = ValidationRequest(
            hostname="192.168.1.1",
            username="admin",
            password="password123",
            tests=["test_storage_check"],
            mode="check",
            tag="snap"
        )
        args = build_jsnapy_v2_cmd_args(req)
        # returns: ["--hostname", "192.168.1.1", "--username", "admin",
        #          "--password", "password123", "--tests", "test_storage_check",
        #          "--mode", "check", "--tag", "snap"]
    """
    # Clean test paths: remove 'tests/' prefix if present for idempotency
    # This ensures tests like "tests/storage_check" become "storage_check"
    cleaned_tests = [t.strip().replace("tests/", "") for t in req.tests]
 
    args = [
        "--hostname", req.hostname,
        "--username", req.username,
        "--password", req.password,
        "--tests", ",".join(cleaned_tests),
        "--mode", req.mode,
        "--tag", req.tag,
    ]
 
    logger.debug(f"Built JSNAPy V2 args: {args}")
    return args
 
 
def queue_job_to_redis(
    job_id: str,
    script_path: Path,
    cmd_args: List[str],
    job_type: str = "unknown"
) -> bool:
    """
    Queues a job to the Redis List for the worker to process asynchronously.
 
    CRITICAL: This function is called by BOTH backup/restore AND JSNAPy V2 endpoints.
    It ensures consistent job queuing across all operation types.
    It is the connection point between the FastAPI Gateway and the FastAPI Worker.
 
    ARCHITECTURE:
    1. Validates Redis connection is active
    2. Verifies the script file exists
    3. Creates a complete job payload (JSON object)
    4. Uses LPUSH to add job to the Redis List (FIFO queue)
    5. The fastapi_worker.py container continuously BLPOP from this queue
 
    Function Call Chain:
        execute_operation(trigger)
        -> build_backup_restore_cmd_args(trigger)
        -> queue_job_to_redis(job_id, script_path, cmd_args, "backup")
        -> LPUSH to Redis List "automation_jobs_queue"
 
        OR
 
        execute_validation_v2(req)
        -> build_jsnapy_v2_cmd_args(req)
        -> queue_job_to_redis(job_id, script_path, cmd_args, "jsnapy")
        -> LPUSH to Redis List "automation_jobs_queue"
 
        Then:
        fastapi_worker.py job_consumer()
        -> BLPOP "automation_jobs_queue"
        -> Receives job_payload = {job_id, script_path, cmd_args}
        -> Spawns subprocess: python script_path cmd_args
        -> Streams output to Redis channel: ws_channel:job:{job_id}
 
    Args:
        job_id: Unique job identifier (e.g., "jsnapy-550e8400-e29b-41d4-a716-446655440000")
        script_path: Absolute Path object to the Python script to execute
        cmd_args: List of CLI arguments for the script
        job_type: String for logging ("backup", "restore", "jsnapy", etc.)
 
    Returns:
        bool: True if successfully queued, False if failed
    """
    global r
 
    # Check 1: Redis connection available
    if r is None:
        logger.error(f"❌ Cannot queue {job_type} job {job_id}: Redis connection is None")
        return False
 
    # Check 2: Script exists at specified path
    if not script_path.is_file():
        logger.error(f"❌ Cannot queue {job_type} job {job_id}: Script not found at {script_path}")
        return False
 
    # Build the complete job payload as JSON
    job_payload = {
        "job_id": job_id,
        "script_path": str(script_path),
        "cmd_args": cmd_args,
    }
 
    try:
        # LPUSH adds the job to the left of the Redis List (FIFO behavior)
        r.lpush(REDIS_JOB_QUEUE, json.dumps(job_payload))
 
        logger.info(
            f"✅ {job_type.upper()} Job {job_id} successfully queued to Redis list '{REDIS_JOB_QUEUE}'"
        )
        logger.debug(f"Job payload: {job_payload}")
        return True
 
    except Exception as e:
        logger.error(f"❌ Failed to queue {job_type} job {job_id} to Redis: {e}")
        logger.exception(e)
        return False
 
 
# =============================================================================
# SECTION 5: ROUTER INITIALIZATION
# =============================================================================
 
router = APIRouter()
 
 
# =============================================================================
# SECTION 6: EXISTING BACKUP/RESTORE ENDPOINT (UNCHANGED)
# =============================================================================
 
@router.post("/operations/backup")
async def execute_operation(trigger: OperationTrigger):
    """
    Triggers an asynchronous backup or restore operation.
 
    EXISTING ENDPOINT: This endpoint is unchanged from the original operations.py
 
    ENDPOINT: POST /operations/backup
 
    Request Body:
        {
            "command": "backup" or "restore",
            "hostname": "device-hostname",
            "username": "admin",
            "password": "password123",
            "inventory_file": "optional-inventory.yml"  (optional)
        }
 
    Response (Success - 200):
        {
            "job_id": "backup-550e8400-e29b-41d4-a716-446655440000",
            "status": "Job backup queued successfully.",
            "ws_channel": "job:backup-550e8400-e29b-41d4-a716-446655440000"
        }
 
    Response (Error - 503):
        {
            "detail": "Automation service unavailable: Cannot connect to Redis queue."
        }
 
    Function Call Chain:
        POST /operations/backup
        -> execute_operation(trigger)
        -> Validate command is "backup" or "restore"
        -> Validate script exists at BACKUP_RESTORE_SCRIPT_PATH
        -> build_backup_restore_cmd_args(trigger)
        -> queue_job_to_redis(job_id, BACKUP_RESTORE_SCRIPT_PATH, cmd_args, "backup")
        -> LPUSH to automation_jobs_queue
        -> Returns job_id and ws_channel to frontend
 
    Frontend Flow:
        1. Frontend receives job_id and ws_channel
        2. Frontend subscribes to WebSocket channel using job_id
        3. Rust Hub adds "ws_channel:" prefix internally
        4. fastapi_worker.py processes job from Redis queue
        5. run.py executes and streams results to Redis channel
        6. Messages are published to "ws_channel:job:{job_id}"
        7. Rust Hub matches subscription and relays to frontend
        8. Frontend receives events in terminal/log viewer
    """
    logger.info(f"Execute operation called with command: {trigger.command}")
 
    # 1. Health Check: Redis connection available
    if r is None:
        logger.error("❌ Redis connection failed in execute_operation")
        raise HTTPException(
            status_code=503,
            detail="Automation service unavailable: Cannot connect to Redis queue.",
        )
 
    # 2. Validation: Command must be "backup" or "restore"
    if trigger.command not in ["backup", "restore"]:
        logger.warning(f"Invalid command requested: {trigger.command}")
        raise HTTPException(
            status_code=400,
            detail=f"Invalid command: {trigger.command}. Supported commands are 'backup' or 'restore'.",
        )
 
    # 3. Validation: Script file exists
    if not BACKUP_RESTORE_SCRIPT_PATH.is_file():
        logger.error(f"Script not found at {BACKUP_RESTORE_SCRIPT_PATH}")
        raise HTTPException(
            status_code=500,
            detail=f"Script not found at {BACKUP_RESTORE_SCRIPT_PATH}. Check container mounts.",
        )
 
    # 4. Create unique job ID and build command arguments
    job_id = f"{trigger.command}-{uuid.uuid4()}"
    cmd_args = build_backup_restore_cmd_args(trigger)
 
    logger.info(f"Creating {trigger.command} job: {job_id}")
    logger.debug(f"Command arguments: {cmd_args}")
 
    # 5. Queue the job to Redis
    success = queue_job_to_redis(
        job_id=job_id,
        script_path=BACKUP_RESTORE_SCRIPT_PATH,
        cmd_args=cmd_args,
        job_type=trigger.command
    )
 
    if not success:
        logger.error(f"Failed to queue {trigger.command} job {job_id}")
        raise HTTPException(
            status_code=500,
            detail="Failed to queue job due to Redis error."
        )
 
    # 6. Return success response with job tracking information
    logger.info(f"✅ Job {job_id} queued successfully")
 
    return {
        "job_id": job_id,
        "status": f"Job {trigger.command} queued successfully.",
        "ws_channel": f"job:{job_id}",
    }
 
 
# =============================================================================
# SECTION 7: NEW JSNAPY V2 STORAGE CHECK ENDPOINT
# =============================================================================
 
@router.post("/operations/validation/execute-v2")
async def execute_validation_v2(req: ValidationRequest):
    """
    🔑 NEW ENDPOINT: Triggers JSNAPy V2 Storage Check validation asynchronously.
 
    CRITICAL FIX v2.0.0 (Channel Naming):
    This endpoint returns the CORRECT ws_channel format that matches what
    fastapi_worker.py publishes to. The channel name is consistent across:
    - Backend returns: "job:jsnapy-UUID"
    - Frontend subscribes: "job:jsnapy-UUID"
    - Rust Hub storage: "ws_channel:job:jsnapy-UUID" (prefix added by Hub)
    - Worker publishes: "ws_channel:job:jsnapy-UUID"
 
    ENDPOINT: POST /operations/validation/execute-v2
 
    Request Body:
        {
            "hostname": "192.168.1.1",
            "username": "admin",
            "password": "password123",
            "tests": ["test_storage_check"],
            "mode": "check",
            "tag": "snap"
        }
 
    Response (Success - 200):
        {
            "job_id": "jsnapy-550e8400-e29b-41d4-a716-446655440000",
            "ws_channel": "job:jsnapy-550e8400-e29b-41d4-a716-446655440000",
            "status": "queued",
            "message": "JSNAPy V2 Storage Check Started"
        }
 
    Response (Error - 400):
        {
            "detail": "Missing required fields: hostname, username, password"
        }
 
    Response (Error - 500):
        {
            "detail": "JSNAPy runner script not found. Check container mounts."
        }
 
    Function Call Chain:
        POST /operations/validation/execute-v2
        -> execute_validation_v2(req: ValidationRequest)
        -> Validate req.hostname, req.username, req.password not empty
        -> Validate req.tests is not empty
        -> Validate JSNAPY_RUNNER_SCRIPT_PATH exists
        -> build_jsnapy_v2_cmd_args(req)
        -> queue_job_to_redis(job_id, JSNAPY_RUNNER_SCRIPT_PATH, cmd_args, "jsnapy")
        -> LPUSH to automation_jobs_queue
        -> Returns job_id and ws_channel to frontend
 
    Frontend Flow (ImageUploads.jsx startStorageCheck()):
        1. fetch POST /operations/validation/execute-v2
        2. receive job_id = "jsnapy-UUID" and ws_channel = "job:jsnapy-UUID"
        3. setCheckJobId(data.job_id)
        4. sendMessage({type: 'SUBSCRIBE', channel: data.ws_channel})
 
        Rust Hub (websocket.rs handle_socket()):
        5. Receive SUBSCRIBE command with channel = "job:jsnapy-UUID"
        6. PREPEND "ws_channel:" prefix
        7. Store subscription as "ws_channel:job:jsnapy-UUID"
 
        FastAPI Worker (fastapi_worker.py job_consumer()):
        8. BLPOP automation_jobs_queue
        9. Receive job_payload with job_id and cmd_args
        10. Execute subprocess: python run_jsnapy_module.py <cmd_args>
        11. Capture stdout/stderr from subprocess
        12. Parse and format events
        13. PUBLISH events to channel "ws_channel:job:jsnapy-UUID"
 
        Rust Hub (websocket.rs sender task):
        14. Receive Redis message from broadcast
        15. Check if subscribed to that channel
        16. Match: client subscribed to "ws_channel:job:jsnapy-UUID"
        17. Send message to WebSocket client
 
        Frontend (ImageUploads.jsx useJobWebSocket):
        18. Receive message via WebSocket
        19. setLastMessage(data)
        20. processLogMessage() formats for UI
        21. Terminal displays events
    """
    logger.info(f"Execute validation V2 called for hostname: {req.hostname}")
 
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
 
    # 4. Validation: Script file exists
    if not JSNAPY_RUNNER_SCRIPT_PATH.is_file():
        logger.error(f"JSNAPy runner script not found at {JSNAPY_RUNNER_SCRIPT_PATH}")
        raise HTTPException(
            status_code=500,
            detail=f"JSNAPy runner script not found. Check container mounts.",
        )
 
    # 5. Create job ID and build command arguments
    job_id = f"jsnapy-{uuid.uuid4()}"
    cmd_args = build_jsnapy_v2_cmd_args(req)
 
    logger.info(f"Creating JSNAPy V2 job: {job_id}")
    logger.info(f"  Hostname: {req.hostname}")
    logger.info(f"  Tests: {req.tests}")
    logger.info(f"  Mode: {req.mode}, Tag: {req.tag}")
    logger.debug(f"  Command arguments: {cmd_args}")
 
    # 6. Queue job to Redis
    success = queue_job_to_redis(
        job_id=job_id,
        script_path=JSNAPY_RUNNER_SCRIPT_PATH,
        cmd_args=cmd_args,
        job_type="jsnapy"
    )
 
    if not success:
        logger.error(f"Failed to queue JSNAPy job {job_id}")
        raise HTTPException(
            status_code=500,
            detail="Failed to queue validation job. Please check server logs.",
        )
 
    # 7. Build response with correct channel naming
    ws_channel = f"job:{job_id}"
 
    logger.info(f"✅ JSNAPy V2 job {job_id} queued successfully")
    logger.info(f"   WebSocket channel (returned to frontend): {ws_channel}")
    logger.info(f"   Rust Hub will store subscription as: ws_channel:{ws_channel}")
    logger.info(f"   Worker will publish to: ws_channel:{ws_channel}")
 
    return {
        "job_id": job_id,
        "ws_channel": ws_channel,
        "status": "queued",
        "message": "JSNAPy V2 Storage Check Started",
    }
 
 
# =============================================================================
# SECTION 8: ROUTER EXPORT
# =============================================================================
 
# This router is imported and included in the main FastAPI application via:
# app.include_router(operations.router, prefix="")
#
# This makes all endpoints available as:
# - POST /operations/backup
# - POST /operations/validation/execute-v2
