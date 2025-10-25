#!/usr/bin/env python3
# ====================================================================================
#
# FILE:               app_gateway/api/routers/jsnapy_runner.py
#
# DESCRIPTION:
#   FastAPI router for executing JSNAPy validation tests against network devices.
#   This router provides endpoints for running validation tests and discovering
#   available tests. It queues validation jobs that run the JSNAPy test runner script
#   and provides real-time progress tracking via WebSocket channels.
#
# HOW TO USE (API ENDPOINTS):
#
#   1. Execute Validation Tests:
#      POST /api/operations/execute
#      Content-Type: application/json
#
#      Request Body:
#      {
#        "command": "validation",
#        "hostname": "172.27.200.200",           # Optional: Single target device
#        "inventory_file": "/path/to/inventory.yml", # Optional: Multiple devices
#        "username": "admin",
#        "password": "your_password",
#        "tests": ["test_bgp_summary", "test_interface_status"]  # Array of test names
#      }
#
#      Response:
#      {
#        "job_id": "validation-uuid-1234",
#        "status": "Validation job queued successfully",
#        "ws_channel": "job:validation-uuid-1234"
#      }
#
#   2. Discover Available Tests:
#      GET /api/operations/discover-tests
#
#      Response:
#      {
#        "success": true,
#        "discovered_tests": {
#          "BGP": [
#            {"id": "test_bgp_summary", "description": "Verify BGP neighbor summary"},
#            {"id": "test_bgp_neighbors", "description": "Check BGP neighbor states"}
#          ],
#          "Interfaces": [
#            {"id": "test_interface_status", "description": "Verify interface operational status"}
#          ]
#        }
#      }
#
# DEPENDENCIES:
#   - FastAPI: For API route handling
#   - Redis: For job queue management
#   - Python: 3.8+ with asyncio support
#
# ====================================================================================


# ====================================================================================
# SECTION 1: IMPORTS AND CONFIGURATION
# ====================================================================================
import json
import os
import uuid
import logging
from pathlib import Path
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

# Configure logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Redis configuration
REDIS_HOST = os.getenv("REDIS_HOST", "redis_broker")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_JOB_QUEUE = "automation_jobs_queue"

# Critical script path - JSNAPy runner script
# CORRECT PATH: The JSNAPy script exists at this location
SCRIPT_PATH = Path("/app/app_gateway/py_scripts/scripts/jsnapy_runner/run.py")


# ====================================================================================
# SECTION 2: REDIS CONNECTION SETUP
# ====================================================================================
try:
    import redis

    redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
    redis_client.ping()
    logger.info(f"✅ JSNAPy Runner: Connected to Redis at {REDIS_HOST}:{REDIS_PORT}")
except Exception as e:
    logger.error(f"❌ JSNAPy Runner: Failed to connect to Redis: {e}")
    redis_client = None


# ====================================================================================
# SECTION 3: REQUEST/RESPONSE SCHEMAS
# ====================================================================================
class ValidationRequest(BaseModel):
    """
    Defines the payload structure for validation execution requests.
    Matches the parameters expected by the JSNAPy runner script.
    """

    command: str = Field(..., description="Must be 'validation' for this endpoint")
    hostname: Optional[str] = Field(
        None, description="Single target device hostname or IP address"
    )
    inventory_file: Optional[str] = Field(
        None, description="Path to YAML inventory file for multiple devices"
    )
    username: str = Field(..., description="Device authentication username")
    password: str = Field(..., description="Device authentication password")
    tests: List[str] = Field(..., description="List of test names to execute")


class ValidationResponse(BaseModel):
    """
    Standard response format for validation job submission.
    Provides WebSocket channel for real-time progress tracking.
    """

    job_id: str
    status: str
    ws_channel: str
    message: str


class TestDiscoveryResponse(BaseModel):
    """
    Response format for test discovery endpoint.
    """

    success: bool
    discovered_tests: Dict[str, List[Dict[str, str]]]


# ====================================================================================
# SECTION 4: FASTAPI ROUTER SETUP
# ====================================================================================
router = APIRouter(prefix="/operations", tags=["JSNAPy Validation"])


# ====================================================================================
# SECTION 5: VALIDATION EXECUTION ENDPOINT
# ====================================================================================
@router.post("/execute", response_model=ValidationResponse)
async def execute_validation(validation_request: ValidationRequest):
    """
    Execute JSNAPy validation tests against target network devices.

    This endpoint accepts validation parameters, validates them, and queues
    the job for execution by the JSNAPy runner script. Real-time progress
    is available via the returned WebSocket channel.

    Args:
        validation_request: Validation parameters including target devices,
                          credentials, and test selection

    Returns:
        ValidationResponse: Job ID and WebSocket channel for tracking

    Raises:
        HTTPException: 400 for invalid parameters, 503 for service unavailable
    """

    # Validate Redis connection
    if not redis_client or not redis_client.ping():
        logger.error("Redis connection unavailable for validation request")
        raise HTTPException(
            status_code=503,
            detail="Job queue service unavailable. Cannot process validation request.",
        )

    # Validate script existence - CRITICAL: Use the exact path we found
    if not SCRIPT_PATH.is_file():
        logger.error(f"JSNAPy runner script not found at {SCRIPT_PATH}")
        raise HTTPException(
            status_code=500,
            detail="Validation service configuration error. JSNAPy script not found.",
        )

    # Validate request parameters
    validation_errors = _validate_validation_request(validation_request)
    if validation_errors:
        logger.warning(f"Validation request failed: {validation_errors}")
        raise HTTPException(status_code=400, detail=validation_errors)

    # Generate unique job ID
    job_id = f"validation-{uuid.uuid4()}"
    logger.info(
        f"Processing validation job {job_id} for tests: {validation_request.tests}"
    )

    try:
        # Construct command arguments for the JSNAPy runner script
        cmd_args = _build_script_arguments(validation_request)

        # CRITICAL FIX: Create job payload exactly as worker expects
        # The worker uses: script_path, cmd_args, job_id
        job_payload = {
            "job_id": job_id,
            "script_path": str(SCRIPT_PATH),  # Must be string, not Path object
            "cmd_args": cmd_args,  # List of command arguments
        }

        # Log the exact command that will be executed
        full_command = f"python3 -u {SCRIPT_PATH} {' '.join(cmd_args)}"
        logger.info(f"Validation job {job_id} will execute: {full_command}")

        # DEBUG: Log the exact payload being sent to Redis
        logger.info(f"Job payload for Redis: {json.dumps(job_payload, indent=2)}")

        # Queue the job in Redis
        redis_client.lpush(REDIS_JOB_QUEUE, json.dumps(job_payload))
        logger.info(f"Validation job {job_id} queued successfully")

        return ValidationResponse(
            job_id=job_id,
            status="Validation job queued successfully",
            ws_channel=f"job:{job_id}",
            message=f"Validation started for {len(validation_request.tests)} test(s)",
        )

    except Exception as e:
        logger.error(f"Failed to queue validation job {job_id}: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to queue validation job: {str(e)}"
        )


# ====================================================================================
# SECTION 6: TEST DISCOVERY ENDPOINT
# ====================================================================================
@router.get("/discover-tests", response_model=TestDiscoveryResponse)
async def discover_available_tests():
    """
    Discover all available JSNAPy tests by executing the runner with --list_tests flag.

    This endpoint returns a categorized list of all available validation tests
    that can be selected in the frontend interface.

    Returns:
        Dictionary of categorized tests or error message

    Raises:
        HTTPException: 500 if test discovery fails, 503 if service unavailable
    """
    if not redis_client or not redis_client.ping():
        raise HTTPException(status_code=503, detail="Service unavailable")

    # Use the exact script path we found
    if not SCRIPT_PATH.is_file():
        raise HTTPException(
            status_code=500, detail="JSNAPy validation script not found"
        )

    try:
        import subprocess
        import asyncio

        # Execute the script with --list_tests flag
        process = await asyncio.create_subprocess_exec(
            "python3",
            str(SCRIPT_PATH),
            "--list_tests",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout, stderr = await process.communicate()

        if process.returncode == 0:
            test_data = json.loads(stdout.decode())
            return TestDiscoveryResponse(
                success=True, discovered_tests=test_data.get("discovered_tests", {})
            )
        else:
            error_msg = stderr.decode() if stderr else "Unknown error"
            logger.error(f"Test discovery failed: {error_msg}")
            raise HTTPException(
                status_code=500, detail=f"Test discovery failed: {error_msg}"
            )

    except Exception as e:
        logger.error(f"Test discovery endpoint error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Test discovery error: {str(e)}")


# ====================================================================================
# SECTION 7: VALIDATION HELPER FUNCTIONS
# ====================================================================================
def _validate_validation_request(request: ValidationRequest) -> Optional[str]:
    """
    Validate the validation request parameters for completeness and logic.

    Args:
        request: The validation request to validate

    Returns:
        Optional error message string, or None if validation passes
    """
    # Check command type
    if request.command != "validation":
        return f"Invalid command '{request.command}'. Must be 'validation' for this endpoint."

    # Check target specification
    if not request.hostname and not request.inventory_file:
        return "Either hostname or inventory_file must be specified"

    # Check authentication
    if not request.username or not request.password:
        return "Username and password are required"

    # Check test selection
    if not request.tests:
        return "At least one test must be specified"

    if not isinstance(request.tests, list) or len(request.tests) == 0:
        return "Tests must be a non-empty array of test names"

    return None


def _build_script_arguments(request: ValidationRequest) -> List[str]:
    """
    Build command-line arguments for the JSNAPy runner script based on request.

    Args:
        request: Validation request parameters

    Returns:
        List of command-line argument strings
    """
    args = []

    # Add hostname or inventory file
    if request.hostname:
        args.extend(["--hostname", request.hostname])
    elif request.inventory_file:
        args.extend(["--inventory_file", request.inventory_file])

    # Add credentials
    args.extend(["--username", request.username])
    args.extend(["--password", request.password])

    # Add tests (comma-separated string)
    if request.tests:
        tests_string = ",".join(request.tests)
        args.extend(["--tests", tests_string])

    return args
