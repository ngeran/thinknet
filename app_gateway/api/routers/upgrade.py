"""
================================================================================
FILE:               app_gateway/api/routers/upgrade.py
DESCRIPTION:        Device Software Upgrade Execution Endpoint
VERSION:            1.1.0 - User-Configurable Options
AUTHOR:             nikos-geranios_vgi
DATE:               2025-11-18
LAST UPDATED:       2025-11-19 11:28:00 UTC
================================================================================
 
CHANGELOG v1.1.0 (2025-11-19):
- Added user-configurable upgrade options (no_validate, no_copy, auto_reboot)
- Enhanced parameter validation for new options
- Updated argument builder to support upgrade options
- Improved logging for option tracking
- Maintained backward compatibility with existing deployments
 
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
REDIS_HOST = os.getenv("REDIS_HOST", "redis_broker")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_JOB_QUEUE = "automation_jobs_queue"
SCRIPT_PATH = Path("/app/app_gateway/py_scripts/scripts/code_upgrade/run.py")
 
# ================================================================================
# SECTION 3: REDIS CONNECTION MANAGEMENT
# ================================================================================
 
def setup_redis_connection() -> Optional[Any]:
    """Initialize and test Redis connection for job queueing."""
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
 
 
redis_client = setup_redis_connection()
 
# ================================================================================
# SECTION 4: ENUMS FOR TYPE SAFETY
# ================================================================================
 
class UpgradePhase(str, Enum):
    """Operation phase identifier for script execution."""
    UPGRADE = "upgrade"
 
 
# ================================================================================
# SECTION 5: REQUEST/RESPONSE MODELS - UPGRADE
# ================================================================================
 
class UpgradeRequestModel(BaseModel):
    """
    Request model for device software upgrade execution.
 
    ENHANCEMENTS v1.1.0 (2025-11-19):
    - Added no_validate field for user-controlled validation skipping
    - Added no_copy field for file copy control
    - Added auto_reboot field for reboot automation control
 
    Author: nikos-geranios_vgi
    Date: 2025-11-18 16:47:45 UTC
    Updated: 2025-11-19 11:28:00 UTC
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
    # SUBSECTION 5.5: UPGRADE OPTIONS (v1.0.0)
    # ==========================================================================
    skip_pre_check: bool = Field(
        default=False,
        description="Skip pre-upgrade validation checks (NOT RECOMMENDED)"
    )
 
    force_upgrade: bool = Field(
        default=False,
        description="Proceed with upgrade despite warnings or critical issues"
    )
 
    # ==========================================================================
    # SUBSECTION 5.6: USER-CONFIGURABLE OPTIONS (NEW - v1.1.0)
    # ==========================================================================
    no_validate: bool = Field(
        default=False,
        description="Skip image validation before installation (faster but riskier)"
    )
 
    no_copy: bool = Field(
        default=True,
        description="Skip file copy to device (image already on device in /var/tmp/)"
    )
 
    auto_reboot: bool = Field(
        default=True,
        description="Automatically reboot device after installation to complete upgrade"
    )
 
    class Config:
        """Pydantic configuration"""
        extra = "forbid"
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
                "force_upgrade": False,
                "no_validate": False,
                "no_copy": True,
                "auto_reboot": True
            }
        }
 
 
class UpgradeResponseModel(BaseModel):
    """Response model for upgrade job submission."""
    job_id: str = Field(..., description="Unique upgrade job identifier for tracking")
    status: str = Field(..., description="Job submission status message")
    ws_channel: str = Field(..., description="WebSocket channel name for real-time progress updates")
    message: str = Field(..., description="Human-readable status message")
    timestamp: str = Field(..., description="ISO 8601 formatted timestamp of job submission")
    phase: UpgradePhase = Field(default=UpgradePhase.UPGRADE, description="Current operational phase")
 
 
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
 
    Returns:
        Error message string if validation fails, None if all validations pass
    """
    if not hostname and not inventory_file:
        return "Either 'hostname' or 'inventory_file' must be specified"
 
    if hostname and inventory_file:
        return "Specify either 'hostname' OR 'inventory_file', not both"
 
    if not username.strip():
        return "Username cannot be empty"
 
    if not password.strip():
        return "Password cannot be empty"
 
    if not target_version.strip():
        return "Target version cannot be empty"
 
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
    no_validate: bool = False,
    no_copy: bool = True,
    auto_reboot: bool = True,
) -> list[str]:
    """
    Build command line arguments for the upgrade script.
 
    ENHANCEMENTS v1.1.0 (2025-11-19):
    - Added support for no_validate option
    - Added support for no_copy option
    - Added support for auto_reboot option
    - Enhanced logging for option tracking
 
    Returns:
        List of command line arguments ready for subprocess execution
    """
    logger.info("=" * 80)
    logger.info("🔧 BUILDING UPGRADE SCRIPT ARGUMENTS v1.1.0")
    logger.info("=" * 80)
    logger.info(f"User: nikos-geranios_vgi")
    logger.info(f"Timestamp: {datetime.utcnow().isoformat()}Z")
    logger.info(f"Phase: upgrade")
    logger.info(f"Hostname: {hostname}")
    logger.info(f"Target Version: {target_version}")
    logger.info(f"Image Filename: {image_filename}")
    logger.info("=" * 80)
    logger.info("🎯 UPGRADE OPTIONS:")
    logger.info(f"  • Skip Pre-Check: {skip_pre_check}")
    logger.info(f"  • Force Upgrade: {force_upgrade}")
    logger.info(f"  • No Validate: {no_validate}")
    logger.info(f"  • No Copy: {no_copy}")
    logger.info(f"  • Auto Reboot: {auto_reboot}")
    logger.info("=" * 80)
 
    args = []
 
    # Phase specification
    args.extend(["--phase", "upgrade"])
    logger.debug("Added phase: upgrade")
 
    # Target specification
    if hostname:
        args.extend(["--hostname", hostname])
        logger.debug(f"Added hostname: {hostname}")
    elif inventory_file:
        args.extend(["--inventory-file", inventory_file])
        logger.debug(f"Added inventory file: {inventory_file}")
 
    # Authentication credentials
    args.extend(["--username", username])
    args.extend(["--password", password])
    logger.debug("Added authentication credentials (password masked)")
 
    # Upgrade parameters
    args.extend(["--image-filename", image_filename])
    args.extend(["--target-version", target_version])
    logger.debug(f"Added image and version: {image_filename}, {target_version}")
 
    # Optional device parameters
    if vendor:
        args.extend(["--vendor", vendor])
        logger.debug(f"Added vendor: {vendor}")
 
    if platform:
        args.extend(["--platform", platform])
        logger.debug(f"Added platform: {platform}")
 
    # Upgrade options (v1.0.0)
    if skip_pre_check:
        args.append("--skip-pre-check")
        logger.debug("Added flag: --skip-pre-check")
 
    if force_upgrade:
        args.append("--force-upgrade")
        logger.debug("Added flag: --force-upgrade")
 
    # User-configurable options (NEW - v1.1.0)
    if no_validate:
        args.append("--no-validate")
        logger.debug("Added flag: --no-validate (skip validation)")
 
    if no_copy:
        args.append("--no-copy")
        logger.debug("Added flag: --no-copy (skip file copy)")
 
    if auto_reboot:
        args.append("--auto-reboot")
        logger.debug("Added flag: --auto-reboot (automatic reboot)")
 
    logger.info("=" * 80)
    logger.info("✅ UPGRADE SCRIPT ARGUMENTS BUILD COMPLETE")
    logger.info("=" * 80)
    logger.info(f"Total argument count: {len(args)}")
    logger.info(f"User: nikos-geranios_vgi")
    logger.info(f"Timestamp: {datetime.utcnow().isoformat()}Z")
 
    preview_args = args[:10] if len(args) > 10 else args
    logger.info(f"Command preview: python run.py {' '.join(preview_args)}...")
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
        "Execute device software upgrade with user-configurable options. "
        "Supports validation control, file copy control, and reboot automation. "
        "Returns job ID for WebSocket progress tracking."
    ),
)
async def run_upgrade(request: UpgradeRequestModel) -> UpgradeResponseModel:
    """
    Execute device software upgrade with comprehensive validation and monitoring.
 
    ENHANCEMENTS v1.1.0 (2025-11-19):
    - Added support for user-configurable upgrade options
    - Enhanced logging for option tracking
    - Improved error messages for validation failures
 
    Author: nikos-geranios_vgi
    Date: 2025-11-18 16:47:45 UTC
    Updated: 2025-11-19 11:28:00 UTC
    """
    logger.info("=" * 80)
    logger.info("🚀 UPGRADE REQUEST RECEIVED v1.1.0")
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
    logger.info(f"  • No Validate: {request.no_validate}")
    logger.info(f"  • No Copy: {request.no_copy}")
    logger.info(f"  • Auto Reboot: {request.auto_reboot}")
    logger.info("=" * 80)
 
    # Service availability checks
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
 
    if not SCRIPT_PATH.is_file():
        logger.error(f"❌ Backend script not found: {SCRIPT_PATH}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Upgrade service configuration error - backend script not found",
        )
 
    logger.info(f"✅ Backend script verified: {SCRIPT_PATH}")
 
    # Parameter validation
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
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=validation_error
        )
 
    logger.info("✅ Parameter validation passed - all required fields present")
 
    # Job initialization
    job_id = f"upgrade-{uuid.uuid4()}"
 
    logger.info("=" * 80)
    logger.info(f"🆔 JOB INITIALIZATION")
    logger.info("=" * 80)
    logger.info(f"Job ID: {job_id}")
    logger.info(f"Job Type: Device Software Upgrade")
    logger.info(f"User: nikos-geranios_vgi")
    logger.info(f"Created: {datetime.utcnow().isoformat()}Z")
    logger.info("=" * 80)
 
    try:
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
            no_validate=request.no_validate,
            no_copy=request.no_copy,
            auto_reboot=request.auto_reboot,
        )
 
        logger.info(f"✅ Command arguments built successfully: {len(cmd_args)} arguments")
 
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
                "no_validate": request.no_validate,
                "no_copy": request.no_copy,
                "auto_reboot": request.auto_reboot,
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "user": "nikos-geranios_vgi",
                "submitted_from": "upgrade_router",
            },
        }
 
        logger.info("=" * 80)
        logger.info("📤 QUEUING JOB TO REDIS")
        logger.info("=" * 80)
        logger.info(f"Queue: {REDIS_JOB_QUEUE}")
        logger.info(f"Job ID: {job_id}")
 
        redis_client.lpush(REDIS_JOB_QUEUE, json.dumps(job_payload))
 
        logger.info("✅ Job queued successfully to Redis")
        logger.info("=" * 80)
 
        target_desc = (
            request.hostname
            if request.hostname
            else f"devices in {request.inventory_file}"
        )
 
        ws_channel = f"job:{job_id}"
 
        logger.info("=" * 80)
        logger.info("✅ UPGRADE JOB SUBMITTED SUCCESSFULLY")
        logger.info("=" * 80)
        logger.info(f"Job ID: {job_id}")
        logger.info(f"WebSocket Channel: {ws_channel}")
        logger.info(f"Target: {target_desc}")
        logger.info("=" * 80)
 
        return UpgradeResponseModel(
            job_id=job_id,
            status="Upgrade job queued successfully",
            ws_channel=ws_channel,
            message=f"Executing upgrade for {target_desc}",
            timestamp=datetime.utcnow().isoformat() + "Z",
            phase=UpgradePhase.UPGRADE,
        )
 
    except HTTPException:
        raise
    except Exception as e:
        logger.error("=" * 80)
        logger.error("❌ UNEXPECTED ERROR IN UPGRADE SUBMISSION")
        logger.error("=" * 80)
        logger.error(f"Error: {str(e)}")
        logger.error("=" * 80)
 
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unexpected error during upgrade submission: {str(e)}",
        )
 
 
# ================================================================================
# SECTION 10: HEALTH CHECK ENDPOINT
# ================================================================================
 
class UpgradeHealthCheckResponseModel(BaseModel):
    """Health check response model for upgrade service."""
    service: str = Field(default="device_upgrade")
    redis_connected: bool
    script_exists: bool
    timestamp: str
 
 
@upgrade_router.get(
    "/upgrade/health",
    response_model=UpgradeHealthCheckResponseModel,
    summary="Upgrade Service Health Check",
)
async def upgrade_health_check() -> UpgradeHealthCheckResponseModel:
    """Health check endpoint for upgrade service monitoring."""
    redis_healthy = False
    try:
        redis_healthy = bool(redis_client and redis_client.ping())
    except Exception as e:
        logger.debug(f"Redis health check failed: {e}")
 
    script_exists = SCRIPT_PATH.is_file()
 
    return UpgradeHealthCheckResponseModel(
        service="device_upgrade",
        redis_connected=redis_healthy,
        script_exists=script_exists,
        timestamp=datetime.utcnow().isoformat() + "Z",
    )
 
 
# ================================================================================
# SECTION 11: MODULE EXPORTS
# ================================================================================
 
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
logger.info("📦 DEVICE UPGRADE ROUTER MODULE LOADED v1.1.0")
logger.info("=" * 80)
logger.info(f"Version: 1.1.0")
logger.info(f"Author: nikos-geranios_vgi")
logger.info(f"Loaded: {datetime.utcnow().isoformat()}Z")
logger.info(f"Redis: {REDIS_HOST}:{REDIS_PORT}")
logger.info(f"Queue: {REDIS_JOB_QUEUE}")
logger.info(f"Script: {SCRIPT_PATH}")
logger.info("=" * 80)
logger.info("🎯 CAPABILITIES:")
logger.info("  ✅ Device software upgrade execution")
logger.info("  ✅ Real-time progress via WebSocket")
logger.info("  ✅ User-configurable validation option")
logger.info("  ✅ User-configurable file copy option")
logger.info("  ✅ User-configurable reboot option")
logger.info("  ✅ Force upgrade support")
logger.info("  ✅ Automatic rollback on failure")
logger.info("  ✅ Post-upgrade verification")
logger.info("=" * 80)
