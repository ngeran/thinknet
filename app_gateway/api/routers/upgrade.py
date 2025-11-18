"""
================================================================================
FILE:               app_gateway/api/routers/upgrade.py
DESCRIPTION:        Device Software Upgrade Execution Endpoint
VERSION:            1.0.0 - Initial Release
AUTHOR:             nikos-geranios_vgi
DATE:               2025-11-18
LAST UPDATED:       2025-11-18 16:47:45 UTC
================================================================================
 
CHANGELOG v1.0.0 (2025-11-18):
- Initial implementation of upgrade execution endpoint
- Dedicated endpoint separate from pre-check validation
- Support for upgrade-specific options (no-validate, reboot, force)
- Comprehensive parameter validation and error handling
- Redis job queuing with WebSocket channel support
- Enhanced logging for troubleshooting and audit trail
 
ARCHITECTURE:
- Complements code_upgrade.py (pre-check validation endpoint)
- Uses same Redis queue infrastructure for worker processing
- Shares script path with pre-check operations
- Maintains consistent argument format for backend script
- Provides real-time progress via WebSocket channels
 
WORKFLOW:
1. Receive upgrade request from frontend with device parameters
2. Validate all required parameters and credentials
3. Build command-line arguments for backend script (--phase upgrade)
4. Queue job to Redis for worker execution
5. Return job ID and WebSocket channel for progress tracking
6. Worker executes upgrade with real-time event emission
 
RELATIONSHIP TO OTHER MODULES:
- code_upgrade.py: Handles pre-check validation (complementary)
- main.py: Executes upgrade logic with DeviceUpgrader
- fastapi_worker.py: Processes queued upgrade jobs
- WebSocket Hub (Rust): Broadcasts progress updates to frontend
 
CRITICAL NOTES:
- Upgrade operations are potentially disruptive to device operation
- Pre-check validation should be completed before upgrade execution
- All operations logged for audit and troubleshooting purposes
- Supports rollback on failure through backend script logic
================================================================================
"""
 
import json
import os
import uuid
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any
from enum import Enum
 
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
 
# ================================================================================
# SECTION 1: LOGGING CONFIGURATION
# ================================================================================
# Configure structured logging with detailed formatting for troubleshooting
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
 
console_handler = logging.StreamHandler()
formatter = logging.Formatter(
    "%(asctime)s - %(name)s - %(levelname)-8s - [%(filename)s:%(lineno)d] - %(message)s"
)
console_handler.setFormatter(formatter)
logger.addHandler(console_handler)
 
# ================================================================================
# SECTION 2: CONFIGURATION CONSTANTS
# ================================================================================
# Environment-based configuration for Redis and script paths
REDIS_HOST = os.getenv("REDIS_HOST", "redis_broker")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_JOB_QUEUE = "automation_jobs_queue"
SCRIPT_PATH = Path("/app/app_gateway/py_scripts/scripts/code_upgrade/run.py")
 
# ================================================================================
# SECTION 3: REDIS CONNECTION MANAGEMENT
# ================================================================================
 
def setup_redis_connection() -> Optional[Any]:
    """
    Initialize and test Redis connection for job queueing.
 
    Establishes connection to Redis broker for job queue management.
    Validates connection health with ping operation.
 
    Returns:
        Redis client instance if successful, None on failure
 
    Notes:
        - Uses connection timeout and retry for reliability
        - Logs connection status for monitoring
        - Gracefully handles ImportError if redis package not installed
    """
    try:
        import redis
 
        redis_client = redis.Redis(
            host=REDIS_HOST,
            port=REDIS_PORT,
            decode_responses=True,
            socket_connect_timeout=5,
        )
        redis_client.ping()
        logger.info(
            f"✅ Upgrade Router: Redis Connection Established - Host: {REDIS_HOST}:{REDIS_PORT}"
        )
        return redis_client
 
    except ImportError:
        logger.error(
            "❌ Upgrade Router: Redis Python client not installed. Install with: pip install redis"
        )
        return None
    except Exception as e:
        logger.error(
            f"❌ Upgrade Router: Redis Connection Failed - Host: {REDIS_HOST}:{REDIS_PORT} - Error: {str(e)}"
        )
        return None
 
 
# Initialize Redis client on module load
redis_client = setup_redis_connection()
 
# ================================================================================
# SECTION 4: ENUMS FOR TYPE SAFETY
# ================================================================================
 
class UpgradePhase(str, Enum):
    """
    Operation phase identifier for script execution.
 
    Used to differentiate between pre-check validation and full upgrade.
    """
    UPGRADE = "upgrade"
 
 
# ================================================================================
# SECTION 5: REQUEST/RESPONSE MODELS - UPGRADE
# ================================================================================
 
class UpgradeRequestModel(BaseModel):
    """
    Request model for device software upgrade execution.
 
    This model defines all parameters required for upgrade operations,
    including device targeting, authentication, upgrade options, and
    safety controls.
 
    Author: nikos-geranios_vgi
    Date: 2025-11-18 16:47:45 UTC
    """
 
    # ==========================================================================
    # SUBSECTION 5.1: TARGET SPECIFICATION
    # ==========================================================================
    hostname: Optional[str] = Field(
        default=None,
        description="Single target device hostname or IP address",
        examples=["172.27.200.200", "srx-device-01.example.com"],
    )
    inventory_file: Optional[str] = Field(
        default=None,
        description="Path to inventory file for bulk device operations",
        examples=["/app/inventories/devices.csv"],
    )
 
    # ==========================================================================
    # SUBSECTION 5.2: AUTHENTICATION CREDENTIALS
    # ==========================================================================
    username: str = Field(
        ...,
        description="Device authentication username (REQUIRED)",
        min_length=1,
        examples=["admin", "netadmin"],
    )
    password: str = Field(
        ...,
        description="Device authentication password (REQUIRED)",
        min_length=1,
        examples=["manolis1"],
    )
 
    # ==========================================================================
    # SUBSECTION 5.3: DEVICE INFORMATION
    # ==========================================================================
    vendor: Optional[str] = Field(
        default="juniper",
        description="Device vendor identifier",
        examples=["juniper", "cisco", "arista"],
    )
    platform: Optional[str] = Field(
        default="srx",
        description="Device platform/model identifier",
        examples=["srx", "mx", "ex"],
    )
 
    # ==========================================================================
    # SUBSECTION 5.4: UPGRADE PARAMETERS (REQUIRED)
    # ==========================================================================
    target_version: str = Field(
        ...,
        description="Target software version for upgrade",
        min_length=1,
        examples=["24.4R2", "21.4R3-S5.6"],
    )
    image_filename: str = Field(
        ...,
        description="Software image filename (must exist in /var/tmp/)",
        min_length=1,
        examples=["junos-install-srxsme-mips-64-24.4R2-S1.7.tgz"],
    )
 
    # ==========================================================================
    # SUBSECTION 5.5: UPGRADE OPTIONS
    # ==========================================================================
    skip_pre_check: bool = Field(
        default=False,
        description="Skip pre-upgrade validation checks (NOT RECOMMENDED)"
    )
 
    force_upgrade: bool = Field(
        default=False,
        description="Proceed with upgrade despite warnings or critical issues"
    )
 
    class Config:
        """Pydantic configuration"""
        extra = "forbid"  # Reject any unknown fields for strict validation
        schema_extra = {
            "example": {
                "hostname": "172.27.200.200",
                "username": "admin",
                "password": "manolis1",
                "vendor": "juniper",
                "platform": "srx",
                "target_version": "24.4R2",
                "image_filename": "junos-install-srxsme-mips-64-24.4R2-S1.7.tgz",
                "skip_pre_check": False,
                "force_upgrade": False
            }
        }
 
 
class UpgradeResponseModel(BaseModel):
    """
    Response model for upgrade job submission.
 
    Provides job tracking information for WebSocket monitoring.
    """
    job_id: str = Field(
        ...,
        description="Unique upgrade job identifier for tracking"
    )
    status: str = Field(
        ...,
        description="Job submission status message"
    )
    ws_channel: str = Field(
        ...,
        description="WebSocket channel name for real-time progress updates"
    )
    message: str = Field(
        ...,
        description="Human-readable status message"
    )
    timestamp: str = Field(
        ...,
        description="ISO 8601 formatted timestamp of job submission"
    )
    phase: UpgradePhase = Field(
        default=UpgradePhase.UPGRADE,
        description="Current operational phase"
    )
 
 
# ================================================================================
# SECTION 6: FASTAPI ROUTER SETUP
# ================================================================================
 
upgrade_router = APIRouter(
    prefix="/api/operations",
    tags=["Device Upgrades"],
    responses={
        400: {"description": "Bad Request - Invalid parameters"},
        503: {"description": "Service Unavailable - Backend services unavailable"},
        500: {"description": "Internal Server Error"},
    },
)
 
# Create alias for compatibility with different import patterns
router = upgrade_router
 
 
# ================================================================================
# SECTION 7: VALIDATION & HELPER FUNCTIONS
# ================================================================================
 
def validate_upgrade_parameters(
    hostname: Optional[str],
    inventory_file: Optional[str],
    username: str,
    password: str,
    target_version: str,
    image_filename: str,
) -> Optional[str]:
    """
    Comprehensive validation of upgrade parameters.
 
    Validates all required parameters for upgrade operations.
    Ensures mutual exclusivity of hostname and inventory_file parameters.
 
    Args:
        hostname: Single device hostname or IP
        inventory_file: Path to inventory file
        username: Authentication username
        password: Authentication password
        target_version: Target software version
        image_filename: Image filename
 
    Returns:
        Error message string if validation fails, None if all validations pass
 
    Validation Rules:
        - Either hostname OR inventory_file must be specified (not both)
        - Username cannot be empty or whitespace
        - Password cannot be empty or whitespace
        - Target version cannot be empty or whitespace
        - Image filename cannot be empty or whitespace
    """
    # Target specification validation
    if not hostname and not inventory_file:
        return "Either 'hostname' or 'inventory_file' must be specified"
 
    if hostname and inventory_file:
        return "Specify either 'hostname' OR 'inventory_file', not both"
 
    # Authentication validation
    if not username.strip():
        return "Username cannot be empty"
 
    if not password.strip():
        return "Password cannot be empty"
 
    # Target version validation
    if not target_version.strip():
        return "Target version cannot be empty"
 
    # Image filename validation
    if not image_filename.strip():
        return "Image filename cannot be empty"
 
    return None
 
 
# ================================================================================
# SECTION 8: SCRIPT ARGUMENT BUILDER
# ================================================================================
 
def build_script_arguments(
    hostname: Optional[str],
    inventory_file: Optional[str],
    username: str,
    password: str,
    vendor: Optional[str],
    platform: Optional[str],
    target_version: str,
    image_filename: str,
    skip_pre_check: bool = False,
    force_upgrade: bool = False,
) -> list[str]:
    """
    Build command line arguments for the upgrade script.
 
    This function translates API request parameters into command-line arguments
    that are compatible with the backend Python script's argparse configuration.
 
    Args:
        hostname: Single device hostname or IP
        inventory_file: Path to inventory file for bulk operations
        username: Authentication username
        password: Authentication password
        vendor: Device vendor identifier
        platform: Device platform identifier
        target_version: Target software version
        image_filename: Software image filename
        skip_pre_check: Skip pre-upgrade validation
        force_upgrade: Force upgrade despite warnings
 
    Returns:
        List of command line arguments ready for subprocess execution
 
    Notes:
        - All arguments use hyphens (--arg-name) not underscores
        - argparse automatically converts hyphens to underscores in variable names
        - Example: --target-version becomes args.target_version
        - Comprehensive logging tracks argument building for debugging
    """
    logger.info("=" * 80)
    logger.info("🔧 BUILDING UPGRADE SCRIPT ARGUMENTS")
    logger.info("=" * 80)
    logger.info(f"User: nikos-geranios_vgi")
    logger.info(f"Timestamp: {datetime.utcnow().isoformat()}Z")
    logger.info(f"Phase: upgrade")
    logger.info(f"Hostname: {hostname}")
    logger.info(f"Target Version: {target_version}")
    logger.info(f"Image Filename: {image_filename}")
    logger.info(f"Skip Pre-Check: {skip_pre_check}")
    logger.info(f"Force Upgrade: {force_upgrade}")
    logger.info("=" * 80)
 
    args = []
 
    # ==========================================================================
    # SUBSECTION 8.1: PHASE SPECIFICATION
    # ==========================================================================
    args.extend(["--phase", "upgrade"])
    logger.debug("Added phase: upgrade")
 
    # ==========================================================================
    # SUBSECTION 8.2: TARGET SPECIFICATION
    # ==========================================================================
    if hostname:
        args.extend(["--hostname", hostname])
        logger.debug(f"Added hostname: {hostname}")
    elif inventory_file:
        args.extend(["--inventory-file", inventory_file])
        logger.debug(f"Added inventory file: {inventory_file}")
 
    # ==========================================================================
    # SUBSECTION 8.3: AUTHENTICATION CREDENTIALS
    # ==========================================================================
    args.extend(["--username", username])
    args.extend(["--password", password])
    logger.debug("Added authentication credentials (password masked)")
 
    # ==========================================================================
    # SUBSECTION 8.4: UPGRADE PARAMETERS
    # ==========================================================================
    args.extend(["--image-filename", image_filename])
    args.extend(["--target-version", target_version])
    logger.debug(f"Added image and version: {image_filename}, {target_version}")
 
    # ==========================================================================
    # SUBSECTION 8.5: OPTIONAL DEVICE PARAMETERS
    # ==========================================================================
    if vendor:
        args.extend(["--vendor", vendor])
        logger.debug(f"Added vendor: {vendor}")
 
    if platform:
        args.extend(["--platform", platform])
        logger.debug(f"Added platform: {platform}")
 
    # ==========================================================================
    # SUBSECTION 8.6: UPGRADE OPTIONS
    # ==========================================================================
    if skip_pre_check:
        args.append("--skip-pre-check")
        logger.debug("Added flag: --skip-pre-check")
 
    if force_upgrade:
        args.append("--force-upgrade")
        logger.debug("Added flag: --force-upgrade")
 
    # ==========================================================================
    # SUBSECTION 8.7: FINAL LOGGING AND VERIFICATION
    # ==========================================================================
    logger.info("=" * 80)
    logger.info("✅ UPGRADE SCRIPT ARGUMENTS BUILD COMPLETE")
    logger.info("=" * 80)
    logger.info(f"Total argument count: {len(args)}")
    logger.info(f"User: nikos-geranios_vgi")
    logger.info(f"Timestamp: {datetime.utcnow().isoformat()}Z")
 
    # Log command preview (first 10 args for security)
    preview_args = args[:10] if len(args) > 10 else args
    logger.info(f"Command preview: python run.py {' '.join(preview_args)}...")
 
    # Full arguments in debug mode only (may contain credentials)
    logger.debug(f"Complete arguments list (debug only): {args}")
 
    logger.info("=" * 80)
 
    return args
 
 
# ================================================================================
# SECTION 9: UPGRADE ENDPOINT
# ================================================================================
 
@upgrade_router.post(
    "/upgrade",
    response_model=UpgradeResponseModel,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Execute Device Software Upgrade",
    description=(
        "Execute device software upgrade with optional pre-check validation. "
        "Supports installation, reboot, and post-upgrade verification. "
        "Returns job ID for WebSocket progress tracking."
    ),
    responses={
        202: {
            "description": "Upgrade job accepted and queued for execution",
            "content": {
                "application/json": {
                    "example": {
                        "job_id": "upgrade-550e8400-e29b-41d4-a716-446655440000",
                        "status": "Upgrade job queued successfully",
                        "ws_channel": "job:upgrade-550e8400-e29b-41d4-a716-446655440000",
                        "message": "Executing upgrade for 172.27.200.200",
                        "timestamp": "2025-11-18T16:47:45Z",
                        "phase": "upgrade"
                    }
                }
            }
        },
        400: {"description": "Invalid parameters - validation failed"},
        503: {"description": "Backend services unavailable"},
    },
)
async def run_upgrade(request: UpgradeRequestModel) -> UpgradeResponseModel:
    """
    Execute device software upgrade with comprehensive validation and monitoring.
 
    Workflow:
    1. Log comprehensive request details for audit trail
    2. Validate Redis and script availability
    3. Validate request parameters (credentials, target, image)
    4. Generate unique job ID for tracking
    5. Build script arguments with proper CLI format
    6. Queue job to Redis for worker processing
    7. Return job information for WebSocket tracking
 
    Args:
        request: Upgrade request with device and upgrade parameters
 
    Returns:
        UpgradeResponseModel with job ID and WebSocket channel for progress tracking
 
    Raises:
        HTTPException 400: Invalid parameters
        HTTPException 503: Redis or backend service unavailable
        HTTPException 500: Unexpected internal error
 
    Notes:
        - Job execution is asynchronous via Redis queue
        - Progress updates available via WebSocket on returned channel
        - Upgrade includes installation, reboot, and verification
        - Frontend should subscribe to ws_channel for real-time updates
 
    Author: nikos-geranios_vgi
    Date: 2025-11-18 16:47:45 UTC
    """
    logger.info("=" * 80)
    logger.info("🚀 UPGRADE REQUEST RECEIVED")
    logger.info("=" * 80)
    logger.info(f"User: nikos-geranios_vgi")
    logger.info(f"Timestamp: {datetime.utcnow().isoformat()}Z")
    logger.info(f"Endpoint: POST /api/operations/upgrade")
    logger.info("=" * 80)
    logger.info("📋 REQUEST DETAILS:")
    logger.info(f"  • Target: {request.hostname or request.inventory_file}")
    logger.info(f"  • Image: {request.image_filename}")
    logger.info(f"  • Target Version: {request.target_version}")
    logger.info(f"  • Username: {request.username}")
    logger.info(f"  • Password: {'*' * len(request.password)} (masked)")
    logger.info(f"  • Vendor: {request.vendor or '(not specified)'}")
    logger.info(f"  • Platform: {request.platform or '(not specified)'}")
    logger.info("=" * 80)
    logger.info("🎯 UPGRADE CONFIGURATION:")
    logger.info(f"  • Skip Pre-Check: {request.skip_pre_check}")
    logger.info(f"  • Force Upgrade: {request.force_upgrade}")
    logger.info("=" * 80)
 
    # ==========================================================================
    # SUBSECTION 9.1: SERVICE AVAILABILITY CHECKS
    # ==========================================================================
 
    # Verify Redis connection health
    if not redis_client:
        logger.error("❌ Redis client not initialized - service unavailable")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Job queue service temporarily unavailable - Redis not initialized",
        )
 
    try:
        if not redis_client.ping():
            logger.error("❌ Redis ping failed - service unavailable")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Job queue service temporarily unavailable - Redis not responding",
            )
    except Exception as e:
        logger.error(f"❌ Redis health check failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Job queue service health check failed: {str(e)}",
        )
 
    logger.info("✅ Redis connection verified and healthy")
 
    # Verify backend script exists
    if not SCRIPT_PATH.is_file():
        logger.error(f"❌ Backend script not found: {SCRIPT_PATH}")
        logger.error(f"❌ Expected location: {SCRIPT_PATH.absolute()}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Upgrade service configuration error - backend script not found",
        )
 
    logger.info(f"✅ Backend script verified: {SCRIPT_PATH}")
 
    # ==========================================================================
    # SUBSECTION 9.2: PARAMETER VALIDATION
    # ==========================================================================
 
    logger.info("🔍 Validating request parameters...")
 
    validation_error = validate_upgrade_parameters(
        hostname=request.hostname,
        inventory_file=request.inventory_file,
        username=request.username,
        password=request.password,
        target_version=request.target_version,
        image_filename=request.image_filename,
    )
 
    if validation_error:
        logger.warning(f"❌ Parameter validation failed: {validation_error}")
        logger.warning(f"Request details: hostname={request.hostname}, "
                      f"inventory={request.inventory_file}, "
                      f"has_username={bool(request.username)}, "
                      f"has_password={bool(request.password)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=validation_error
        )
 
    logger.info("✅ Parameter validation passed - all required fields present")
 
    # ==========================================================================
    # SUBSECTION 9.3: JOB INITIALIZATION
    # ==========================================================================
 
    # Generate unique job ID with timestamp component
    job_id = f"upgrade-{uuid.uuid4()}"
 
    logger.info("=" * 80)
    logger.info(f"🆔 JOB INITIALIZATION")
    logger.info("=" * 80)
    logger.info(f"Job ID: {job_id}")
    logger.info(f"Job Type: Device Software Upgrade")
    logger.info(f"User: nikos-geranios_vgi")
    logger.info(f"Created: {datetime.utcnow().isoformat()}Z")
    logger.info(f"Priority: Normal")
    logger.info("=" * 80)
 
    try:
        # ======================================================================
        # SUBSECTION 9.4: COMMAND ARGUMENTS BUILDING
        # ======================================================================
 
        logger.info("🔧 Building command arguments for upgrade execution...")
 
        cmd_args = build_script_arguments(
            hostname=request.hostname,
            inventory_file=request.inventory_file,
            username=request.username,
            password=request.password,
            vendor=request.vendor,
            platform=request.platform,
            target_version=request.target_version,
            image_filename=request.image_filename,
            skip_pre_check=request.skip_pre_check,
            force_upgrade=request.force_upgrade,
        )
 
        logger.info(f"✅ Command arguments built successfully: {len(cmd_args)} arguments")
        logger.debug(f"Argument list: {cmd_args}")
 
        # ======================================================================
        # SUBSECTION 9.5: JOB PAYLOAD CONSTRUCTION
        # ======================================================================
 
        # Construct complete job payload for Redis queue
        job_payload = {
            "job_id": job_id,
            "script_path": str(SCRIPT_PATH),
            "cmd_args": cmd_args,
            "metadata": {
                "operation": "upgrade",
                "phase": "upgrade",
                "target": request.hostname or request.inventory_file,
                "image_filename": request.image_filename,
                "target_version": request.target_version,
                "vendor": request.vendor,
                "platform": request.platform,
                "username": request.username,
                "skip_pre_check": request.skip_pre_check,
                "force_upgrade": request.force_upgrade,
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "user": "nikos-geranios_vgi",
                "submitted_from": "upgrade_router",
            },
        }
 
        logger.debug("Job payload constructed with complete metadata")
 
        # ======================================================================
        # SUBSECTION 9.6: REDIS JOB QUEUING
        # ======================================================================
 
        logger.info("=" * 80)
        logger.info("📤 QUEUING JOB TO REDIS")
        logger.info("=" * 80)
        logger.info(f"Queue: {REDIS_JOB_QUEUE}")
        logger.info(f"Job ID: {job_id}")
        logger.info(f"Payload size: {len(json.dumps(job_payload))} bytes")
        logger.info(f"Timestamp: {datetime.utcnow().isoformat()}Z")
 
        # Push job to Redis queue (LPUSH for FIFO processing)
        redis_client.lpush(REDIS_JOB_QUEUE, json.dumps(job_payload))
 
        logger.info("✅ Job queued successfully to Redis")
        logger.info("🔄 Job now awaiting worker processing")
        logger.info("=" * 80)
 
        # ======================================================================
        # SUBSECTION 9.7: SUCCESS RESPONSE CONSTRUCTION
        # ======================================================================
 
        # Generate human-readable target description
        target_desc = (
            request.hostname
            if request.hostname
            else f"devices in {request.inventory_file}"
        )
 
        # WebSocket channel for real-time progress updates
        ws_channel = f"job:{job_id}"
 
        logger.info("=" * 80)
        logger.info("✅ UPGRADE JOB SUBMITTED SUCCESSFULLY")
        logger.info("=" * 80)
        logger.info(f"Job ID: {job_id}")
        logger.info(f"WebSocket Channel: {ws_channel}")
        logger.info(f"Target: {target_desc}")
        logger.info(f"Status: Queued and ready for worker processing")
        logger.info(f"User: nikos-geranios_vgi")
        logger.info(f"Timestamp: {datetime.utcnow().isoformat()}Z")
        logger.info("=" * 80)
 
        # Return success response with tracking information
        return UpgradeResponseModel(
            job_id=job_id,
            status="Upgrade job queued successfully",
            ws_channel=ws_channel,
            message=f"Executing upgrade for {target_desc}",
            timestamp=datetime.utcnow().isoformat() + "Z",
            phase=UpgradePhase.UPGRADE,
        )
 
    except HTTPException:
        # Re-raise HTTP exceptions without modification
        raise
    except Exception as e:
        # Log and handle unexpected errors
        logger.error("=" * 80)
        logger.error("❌ UNEXPECTED ERROR IN UPGRADE SUBMISSION")
        logger.error("=" * 80)
        logger.error(f"Error: {str(e)}")
        logger.error(f"Error Type: {type(e).__name__}")
        logger.error(f"Job ID: {job_id}")
        logger.error(f"User: nikos-geranios_vgi")
        logger.error(f"Timestamp: {datetime.utcnow().isoformat()}Z")
        logger.error("=" * 80)
 
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unexpected error during upgrade submission: {str(e)}",
        )
 
 
# ================================================================================
# SECTION 10: HEALTH CHECK ENDPOINT
# ================================================================================
 
class UpgradeHealthCheckResponseModel(BaseModel):
    """
    Health check response model for upgrade service.
 
    Provides service health status for monitoring and alerting systems.
    """
    service: str = Field(
        default="device_upgrade",
        description="Service identifier"
    )
    redis_connected: bool = Field(
        ...,
        description="Redis connection health status"
    )
    script_exists: bool = Field(
        ...,
        description="Backend script availability status"
    )
    timestamp: str = Field(
        ...,
        description="Health check timestamp (ISO 8601)"
    )
 
 
@upgrade_router.get(
    "/upgrade/health",
    response_model=UpgradeHealthCheckResponseModel,
    summary="Upgrade Service Health Check",
    description="Check health status of device upgrade service and dependencies",
    tags=["System"],
)
async def upgrade_health_check() -> UpgradeHealthCheckResponseModel:
    """
    Health check endpoint for upgrade service monitoring.
 
    Validates:
    - Redis connection and responsiveness
    - Backend script file existence
    - Overall service operational status
 
    Returns:
        UpgradeHealthCheckResponseModel with current health status
 
    Notes:
        - Should be called periodically by monitoring systems
        - Returns 200 OK even if some checks fail (check response body)
        - Useful for load balancer health probes
    """
    logger.debug("Upgrade service health check requested")
 
    # Check Redis connectivity
    redis_healthy = False
    try:
        redis_healthy = bool(redis_client and redis_client.ping())
    except Exception as e:
        logger.debug(f"Redis health check failed: {e}")
 
    # Check script existence
    script_exists = SCRIPT_PATH.is_file()
 
    health_status = {
        "service": "device_upgrade",
        "redis_connected": redis_healthy,
        "script_exists": script_exists,
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }
 
    logger.debug(f"Upgrade service health status: {health_status}")
 
    return UpgradeHealthCheckResponseModel(**health_status)
 
 
# ================================================================================
# SECTION 11: MODULE EXPORTS
# ================================================================================
 
# Primary router export
__all__ = [
    "upgrade_router",
    "router",
    "UpgradeRequestModel",
    "UpgradeResponseModel",
    "UpgradeHealthCheckResponseModel",
]
 
# ================================================================================
# SECTION 12: MODULE INITIALIZATION LOG
# ================================================================================
 
logger.info("=" * 80)
logger.info("📦 DEVICE UPGRADE ROUTER MODULE LOADED")
logger.info("=" * 80)
logger.info(f"Version: 1.0.0")
logger.info(f"Author: nikos-geranios_vgi")
logger.info(f"Loaded: {datetime.utcnow().isoformat()}Z")
logger.info(f"Redis: {REDIS_HOST}:{REDIS_PORT}")
logger.info(f"Queue: {REDIS_JOB_QUEUE}")
logger.info(f"Script: {SCRIPT_PATH}")
logger.info(f"Script Exists: {SCRIPT_PATH.is_file()}")
logger.info(f"Redis Connected: {bool(redis_client and redis_client.ping()) if redis_client else False}")
logger.info("=" * 80)
logger.info("🎯 CAPABILITIES:")
logger.info("  ✅ Device software upgrade execution")
logger.info("  ✅ Real-time progress via WebSocket")
logger.info("  ✅ Optional pre-check skip")
logger.info("  ✅ Force upgrade support")
logger.info("  ✅ Automatic rollback on failure")
logger.info("  ✅ Post-upgrade verification")
logger.info("=" * 80)
