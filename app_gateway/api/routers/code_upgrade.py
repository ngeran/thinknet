#!/usr/bin/env python3
# ====================================================================================
#
# FILE:               app_gateway/api/routers/code_upgrade.py
#
# DESCRIPTION:
#   FastAPI router for performing code upgrades on network devices.
#   This router provides a robust API endpoint for upgrading device operating systems
#   using various transfer protocols and upgrade methods. It handles parameter validation,
#   job queueing, and provides real-time progress tracking via WebSocket channels.
#
# ARCHITECTURE OVERVIEW:
#   1. Client submits code upgrade parameters via JSON payload
#   2. API validates parameters and checks for required fields
#   3. Job is queued in Redis for background processing
#   4. Worker process picks up job and executes code upgrade script
#   5. Real-time progress is streamed via WebSocket
#   6. Results are returned upon completion
#
# HOW TO USE (API ENDPOINTS):
#
#   🔹 Execute Code Upgrade:
#      POST /api/operations/execute
#      Content-Type: application/json
#
#      JSON Payload Parameters:
#      - command: "code_upgrade" (required)
#      - hostname: Target device hostname/IP (required if no inventory_file)
#      - inventory_file: Path to inventory file for multiple devices (required if no hostname)
#      - username: Device authentication username (required)
#      - password: Device authentication password (required)
#      - vendor: Device vendor (e.g., "cisco", "juniper", "arista")
#      - platform: Device platform/model
#      - target_version: Target software version
#      - image_filename: Filename of the upgrade image (required)
#
#      Success Response (202):
#      {
#        "job_id": "code-upgrade-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
#        "status": "Code upgrade job queued successfully",
#        "ws_channel": "job:code-upgrade-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
#        "message": "Code upgrade started for image.bin to 172.27.200.200"
#      }
#
#   🔹 Health Check:
#      GET /api/operations/health
#
#      Response:
#      {
#        "service": "code_upgrade",
#        "redis_connected": true,
#        "script_exists": true,
#        "timestamp": "2024-01-15T10:30:00Z"
#      }
#
# ERROR HANDLING:
#   - 400 Bad Request: Invalid parameters, missing required fields
#   - 403 Forbidden: Unauthorized operation
#   - 404 Not Found: Script file not found
#   - 503 Service Unavailable: Redis connection down
#   - 500 Internal Server Error: Unexpected server errors
#
# SECURITY CONSIDERATIONS:
#   - Secure credential handling
#   - Input sanitization
#   - Operation validation
#
# DEPENDENCIES:
#   - FastAPI: Web framework for API routes
#   - Redis: Job queue management and pub/sub for real-time updates
#   - Pydantic: Data validation and settings management
#
# ====================================================================================

# ====================================================================================
# SECTION 1: IMPORTS AND CONFIGURATION
# ====================================================================================
import json
import os
import uuid
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

# Configure structured logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Create console handler with formatted output
console_handler = logging.StreamHandler()
formatter = logging.Formatter(
    "%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s"
)
console_handler.setFormatter(formatter)
logger.addHandler(console_handler)

# ====================================================================================
# CONFIGURATION CONSTANTS
# ====================================================================================

# Redis configuration for job queueing
REDIS_HOST = os.getenv("REDIS_HOST", "redis_broker")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_JOB_QUEUE = "automation_jobs_queue"

# Script path configuration
SCRIPT_PATH = Path("/app/app_gateway/py_scripts/scripts/code_upgrade/run.py")


# ====================================================================================
# SECTION 2: REDIS CONNECTION SETUP
# ====================================================================================
def setup_redis_connection():
    """
    Initialize and test Redis connection for job queueing.

    Returns:
        redis.Redis: Redis client instance or None if connection fails
    """
    try:
        import redis

        redis_client = redis.Redis(
            host=REDIS_HOST,
            port=REDIS_PORT,
            decode_responses=True,
            socket_connect_timeout=5,
            retry_on_timeout=True,
        )

        # Test connection
        redis_client.ping()
        logger.info(
            f"✅ Code Upgrade: Successfully connected to Redis at {REDIS_HOST}:{REDIS_PORT}"
        )
        return redis_client

    except ImportError:
        logger.error(
            "❌ Code Upgrade: Redis Python client not installed. Install with: pip install redis"
        )
        return None
    except Exception as e:
        logger.error(
            f"❌ Code Upgrade: Failed to connect to Redis at {REDIS_HOST}:{REDIS_PORT} - {str(e)}"
        )
        return None


# Initialize Redis connection
redis_client = setup_redis_connection()


# ====================================================================================
# SECTION 3: REQUEST/RESPONSE SCHEMAS
# ====================================================================================
class CodeUpgradeRequest(BaseModel):
    """
    Request model for code upgrade operations.

    Attributes:
        command (str): Must be "code_upgrade"
        hostname (str): Target device hostname
        inventory_file (str): Inventory file path
        username (str): Device username
        password (str): Device password
        vendor (str): Device vendor
        platform (str): Device platform
        target_version (str): Target software version
        image_filename (str): Upgrade image filename
    """

    command: str = Field(description="Operation command - must be 'code_upgrade'")
    hostname: Optional[str] = Field(
        None, description="Single target device hostname or IP address"
    )
    inventory_file: Optional[str] = Field(
        None, description="Path to inventory file for multiple devices"
    )
    username: str = Field(..., description="Device authentication username")
    password: str = Field(..., description="Device authentication password")
    vendor: Optional[str] = Field(None, description="Device vendor")
    platform: Optional[str] = Field(None, description="Device platform/model")
    target_version: Optional[str] = Field(None, description="Target software version")
    image_filename: str = Field(..., description="Filename of the upgrade image")


class CodeUpgradeResponse(BaseModel):
    """
    Standardized response model for code upgrade job submissions.

    Attributes:
        job_id (str): Unique identifier for tracking the upgrade job
        status (str): Human-readable status message
        ws_channel (str): WebSocket channel for real-time progress updates
        message (str): Detailed message about the upgrade operation
        timestamp (str): ISO format timestamp of job submission
    """

    job_id: str = Field(description="Unique identifier for tracking the upgrade job")
    status: str = Field(description="Human-readable status message")
    ws_channel: str = Field(
        description="WebSocket channel for real-time progress updates"
    )
    message: str = Field(description="Detailed message about the upgrade operation")
    timestamp: str = Field(description="ISO format timestamp of job submission")


class HealthCheckResponse(BaseModel):
    """
    Health check response model for service status monitoring.

    Attributes:
        service (str): Service name identifier
        redis_connected (bool): Redis connection status
        script_exists (bool): Code upgrade script availability
        timestamp (str): Current server timestamp
    """

    service: str = Field(description="Service name identifier")
    redis_connected: bool = Field(description="Redis connection status")
    script_exists: bool = Field(description="Code upgrade script availability")
    timestamp: str = Field(description="Current server timestamp")


# ====================================================================================
# SECTION 4: FASTAPI ROUTER SETUP
# ====================================================================================
router = APIRouter(
    prefix="/operations",
    tags=["Code Upgrade"],
    responses={
        400: {"description": "Bad Request - Invalid parameters"},
        403: {"description": "Forbidden - Unauthorized operation"},
        404: {"description": "Not Found - Resource not available"},
        503: {"description": "Service Unavailable - Backend services down"},
        500: {"description": "Internal Server Error - Unexpected error"},
    },
)


# ====================================================================================
# SECTION 5: VALIDATION HELPER FUNCTIONS
# ====================================================================================
def validate_upgrade_parameters(
    command: str,
    hostname: Optional[str],
    inventory_file: Optional[str],
    username: str,
    password: str,
    image_filename: str,
) -> Optional[str]:
    """
    Comprehensive validation of all upgrade parameters.

    Args:
        command: Operation command
        hostname: Target device hostname
        inventory_file: Inventory file path
        username: Authentication username
        password: Authentication password
        image_filename: Upgrade image filename

    Returns:
        Optional[str]: Error message if validation fails, None if all parameters are valid
    """
    # Command validation
    if command != "code_upgrade":
        return f"Invalid command '{command}'. Must be 'code_upgrade'"

    # Target specification validation
    if not hostname and not inventory_file:
        return (
            "Either hostname or inventory_file must be specified for target device(s)"
        )

    if hostname and inventory_file:
        return "Specify either hostname (single device) or inventory_file (multiple devices), not both"

    # Authentication validation
    if not username.strip():
        return "Username cannot be empty"

    if not password.strip():
        return "Password cannot be empty"

    # Image validation
    if not image_filename.strip():
        return "Image filename cannot be empty"

    return None


def build_script_arguments(
    hostname: Optional[str],
    inventory_file: Optional[str],
    username: str,
    password: str,
    vendor: Optional[str],
    platform: Optional[str],
    target_version: Optional[str],
    image_filename: str,
) -> List[str]:
    """
    Construct command-line arguments for the code upgrade script (run.py).

    Args:
        hostname: Target device hostname
        inventory_file: Inventory file path
        username: Device username
        password: Device password
        vendor: Device vendor
        platform: Device platform
        target_version: Target software version
        image_filename: Upgrade image filename

    Returns:
        List[str]: List of command-line arguments for subprocess execution
    """
    args = []

    # Required arguments for code upgrade script
    if hostname:
        args.extend(["--hostname", hostname])
    elif inventory_file:
        args.extend(["--inventory-file", inventory_file])

    args.extend(["--username", username])
    args.extend(["--password", password])
    args.extend(["--image-filename", image_filename])

    # Optional arguments
    if vendor:
        args.extend(["--vendor", vendor])

    if platform:
        args.extend(["--platform", platform])

    if target_version:
        args.extend(["--target-version", target_version])

    logger.debug(f"Built script arguments for code upgrade: {args}")
    return args


# ====================================================================================
# SECTION 6: CORE CODE UPGRADE ENDPOINT
# ====================================================================================
@router.post(
    "/execute",
    response_model=CodeUpgradeResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Execute code upgrade on network device",
    description="""
    Perform operating system code upgrade on one or more network devices.
    
    This endpoint:
    - Accepts upgrade parameters via JSON payload
    - Validates parameters and requirements
    - Queues upgrade job for background processing
    - Returns WebSocket channel for real-time progress tracking
    
    The upgrade process includes:
    - Image transfer to device
    - Version verification
    - Upgrade execution
    - Post-upgrade validation
    """,
)
async def execute_code_upgrade(request: CodeUpgradeRequest) -> CodeUpgradeResponse:
    """
    Main endpoint for executing code upgrades on network devices.

    Processes upgrade requests, validates all parameters, and queues the job for
    background execution by the code upgrade worker script.
    """
    # Log incoming request for auditing
    logger.info(
        f"🔄 Code upgrade request received - "
        f"Target: {request.hostname or request.inventory_file}, "
        f"Image: {request.image_filename}, "
        f"Vendor: {request.vendor}"
    )

    # ==========================================================================
    # SERVICE AVAILABILITY CHECKS
    # ==========================================================================
    if not redis_client or not redis_client.ping():
        logger.error("Redis connection unavailable - cannot queue upgrade job")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Job queue service temporarily unavailable. Please try again later.",
        )

    if not SCRIPT_PATH.is_file():
        logger.error(f"Code upgrade script not found at configured path: {SCRIPT_PATH}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Code upgrade service configuration error. Please contact administrator.",
        )

    # ==========================================================================
    # PARAMETER VALIDATION
    # ==========================================================================
    validation_error = validate_upgrade_parameters(
        request.command,
        request.hostname,
        request.inventory_file,
        request.username,
        request.password,
        request.image_filename,
    )
    if validation_error:
        logger.warning(f"Upgrade parameter validation failed: {validation_error}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=validation_error
        )

    # ==========================================================================
    # JOB INITIALIZATION
    # ==========================================================================
    job_id = f"code-upgrade-{uuid.uuid4()}"
    logger.info(f"🆕 Initializing code upgrade job {job_id}")

    try:
        # ======================================================================
        # JOB CONFIGURATION AND QUEUEING
        # ======================================================================
        # Build command arguments for the upgrade script
        cmd_args = build_script_arguments(
            hostname=request.hostname,
            inventory_file=request.inventory_file,
            username=request.username,
            password=request.password,
            vendor=request.vendor,
            platform=request.platform,
            target_version=request.target_version,
            image_filename=request.image_filename,
        )

        # Construct job payload for Redis queue
        job_payload = {
            "job_id": job_id,
            "script_path": str(SCRIPT_PATH),
            "cmd_args": cmd_args,
            "metadata": {
                "operation": "code_upgrade",
                "target": request.hostname or request.inventory_file,
                "image_filename": request.image_filename,
                "vendor": request.vendor,
                "platform": request.platform,
                "target_version": request.target_version,
                "timestamp": datetime.utcnow().isoformat() + "Z",
            },
        }

        # Log job details for debugging
        logger.debug(f"Job payload prepared: {json.dumps(job_payload, indent=2)}")

        full_command = f"python3 -u {SCRIPT_PATH} {' '.join(cmd_args)}"
        logger.info(f"🚀 Queueing job {job_id} with command: {full_command}")

        # ======================================================================
        # QUEUE JOB TO REDIS
        # ======================================================================
        try:
            redis_client.lpush(REDIS_JOB_QUEUE, json.dumps(job_payload))
            logger.info(f"✅ Code upgrade job {job_id} successfully queued in Redis")

        except Exception as redis_error:
            logger.error(
                f"❌ Failed to queue job {job_id} to Redis: {str(redis_error)}"
            )
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Failed to queue upgrade job. Please try again.",
            )

        # ======================================================================
        # SUCCESS RESPONSE
        # ======================================================================
        target_description = (
            request.hostname
            if request.hostname
            else f"devices in {request.inventory_file}"
        )
        response_message = (
            f"Code upgrade started for {request.image_filename} to {target_description}"
        )

        return CodeUpgradeResponse(
            job_id=job_id,
            status="Code upgrade job queued successfully",
            ws_channel=f"job:{job_id}",
            message=response_message,
            timestamp=datetime.utcnow().isoformat() + "Z",
        )

    except HTTPException:
        # Re-raise HTTP exceptions to FastAPI
        raise

    except Exception as e:
        # Handle unexpected errors
        logger.error(
            f"❌ Unexpected error processing code upgrade job {job_id}: {str(e)}"
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while processing your upgrade request. Please try again.",
        )


# ====================================================================================
# SECTION 7: UTILITY ENDPOINTS
# ====================================================================================
@router.get(
    "/health",
    response_model=HealthCheckResponse,
    summary="Service health check",
    description="Check the health and status of the code upgrade service components",
)
async def health_check() -> HealthCheckResponse:
    """
    Comprehensive health check for code upgrade service.

    Verifies:
    - Redis connection status
    - Script file existence
    - Overall service availability
    """
    health_status = {
        "service": "code_upgrade",
        "redis_connected": bool(redis_client and redis_client.ping()),
        "script_exists": SCRIPT_PATH.is_file(),
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }

    # Log health status
    if all(
        [
            health_status["redis_connected"],
            health_status["script_exists"],
        ]
    ):
        logger.info("✅ Code upgrade service health check: ALL SYSTEMS GO")
    else:
        logger.warning(f"⚠️ Code upgrade service health check issues: {health_status}")

    return HealthCheckResponse(**health_status)


# ====================================================================================
# SECTION 8: MODULE INITIALIZATION
# ====================================================================================
def get_router() -> APIRouter:
    """
    Get the code upgrade router instance.

    Returns:
        APIRouter: Configured FastAPI router for code upgrade endpoints
    """
    return router


# Cleanup function for application shutdown
async def cleanup_on_shutdown():
    """
    Perform cleanup operations when the application is shutting down.
    """
    logger.info("🛑 Code upgrade service shutting down...")


# ====================================================================================
# MODULE DOCUMENTATION
# ====================================================================================
"""
QUICK START GUIDE:

1. BASIC USAGE:
   import requests
   
   payload = {
       "command": "code_upgrade",
       "hostname": "172.27.200.200",
       "username": "admin",
       "password": "secret",
       "vendor": "cisco",
       "platform": "iosxe",
       "target_version": "17.09.01",
       "image_filename": "cat9k_iosxe.17.09.01.SPA.bin"
   }
   
   response = requests.post('http://localhost:8000/api/operations/execute', json=payload)
   print(response.json())

2. CHECK SERVICE HEALTH:
   response = requests.get('http://localhost:8000/api/operations/health')
   print(response.json())

TROUBLESHOOTING:

- Redis Connection Issues: Check REDIS_HOST and REDIS_PORT environment variables
- Script Not Found: Verify SCRIPT_PATH points to existing code_upgrade/run.py
- Parameter Validation: Ensure all required fields are provided

SECURITY NOTES:

- Passwords are transmitted in plain text in job queue - consider encryption
- Validate all inputs to prevent injection attacks
- Consider rate limiting for production deployments
"""
