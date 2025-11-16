#!/usr/bin/env python3
"""
================================================================================
FILE:               app_gateway/api/routers/code_upgrade.py
DESCRIPTION:        Enhanced FastAPI router with pre-check support
VERSION:            4.0 - Added comprehensive pre-check phase
NEW FEATURES:       ✅ Pre-check endpoint, ✅ Upgrade approval workflow
================================================================================
"""

import json
import os
import uuid
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any
from enum import Enum

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

# ================================================================================
# 🎯 LOGGING CONFIGURATION
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
# ⚙️ CONFIGURATION CONSTANTS
# ================================================================================
REDIS_HOST = os.getenv("REDIS_HOST", "redis_broker")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_JOB_QUEUE = "automation_jobs_queue"
SCRIPT_PATH = Path("/app/app_gateway/py_scripts/scripts/code_upgrade/run.py")


# ================================================================================
# 📌 REDIS CONNECTION MANAGEMENT
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
            retry_on_timeout=True,
        )
        redis_client.ping()
        logger.info(
            f"✅ Redis Connection Established - Host: {REDIS_HOST}:{REDIS_PORT}"
        )
        return redis_client

    except ImportError:
        logger.error(
            "❌ Redis Python client not installed. Install with: pip install redis"
        )
        return None
    except Exception as e:
        logger.error(
            f"❌ Redis Connection Failed - Host: {REDIS_HOST}:{REDIS_PORT} - Error: {str(e)}"
        )
        return None


redis_client = setup_redis_connection()


# ================================================================================
# 🎯 ENUMS FOR TYPE SAFETY
# ================================================================================
class PreCheckSeverity(str, Enum):
    """Severity levels for pre-check results"""

    PASS = "pass"
    WARNING = "warning"
    CRITICAL = "critical"


class UpgradePhase(str, Enum):
    """Phases of the upgrade workflow"""

    PRE_CHECK = "pre_check"
    UPGRADE = "upgrade"


# ================================================================================
# 📦 REQUEST/RESPONSE MODELS - PRE-CHECK
# ================================================================================
class PreCheckRequestModel(BaseModel):
    """
    Request model for pre-upgrade validation checks.
    """

    hostname: Optional[str] = Field(
        default=None,
        description="Single target device hostname or IP",
        examples=["172.27.200.200"],
    )
    inventory_file: Optional[str] = Field(
        default=None,
        description="Path to inventory file for multiple devices",
        examples=["/app/inventories/devices.csv"],
    )
    username: str = Field(
        ...,
        description="Device authentication username (REQUIRED)",
        min_length=1,
        examples=["admin"],
    )
    password: str = Field(
        ...,
        description="Device authentication password (REQUIRED)",
        min_length=1,
        examples=["manolis1"],
    )
    vendor: Optional[str] = Field(
        default=None,
        description="Device vendor (e.g., juniper, cisco, arista)",
        examples=["juniper"],
    )
    platform: Optional[str] = Field(
        default=None,
        description="Device platform/model (e.g., srx, mx, ex)",
        examples=["srx"],
    )
    target_version: str = Field(
        ...,
        description="Target software version for compatibility check",
        min_length=1,
        examples=["24.4R2"],
    )
    image_filename: str = Field(
        ...,
        description="Image filename to validate availability",
        min_length=1,
        examples=["junos-install-srxsme-mips-64-24.4R2-S1.7.tgz"],
    )

    # Pre-check selection field
    pre_check_selection: Optional[str] = Field(
        default=None, description="Specific pre-check tests to run"
    )

    # Advanced pre-check options
    skip_storage_check: bool = Field(
        default=False, description="Skip storage space validation"
    )
    skip_snapshot_check: bool = Field(
        default=False, description="Skip snapshot availability check"
    )
    require_snapshot: bool = Field(
        default=False, description="Make snapshot existence a critical requirement"
    )

    class Config:
        extra = "forbid"


class PreCheckResultModel(BaseModel):
    """Individual pre-check result"""

    check_name: str = Field(..., description="Name of the pre-check")
    severity: PreCheckSeverity = Field(..., description="Result severity")
    passed: bool = Field(..., description="Whether check passed")
    message: str = Field(..., description="Detailed result message")
    details: Optional[Dict[str, Any]] = Field(None, description="Additional details")
    recommendation: Optional[str] = Field(None, description="Recommended action")


class PreCheckResponseModel(BaseModel):
    """Response model for pre-check job submission"""

    job_id: str = Field(..., description="Unique pre-check job identifier")
    status: str = Field(..., description="Job status message")
    ws_channel: str = Field(..., description="WebSocket channel for real-time updates")
    message: str = Field(..., description="Human-readable message")
    timestamp: str = Field(..., description="ISO timestamp")
    phase: UpgradePhase = Field(
        default=UpgradePhase.PRE_CHECK, description="Current phase"
    )


# ================================================================================
# 📦 REQUEST/RESPONSE MODELS - UPGRADE
# ================================================================================
class CodeUpgradeRequestModel(BaseModel):
    """
    Enhanced request model for code upgrade operations.
    """

    command: str = Field(
        default="code_upgrade",
        description="Operation command - must be 'code_upgrade'",
        examples=["code_upgrade"],
    )
    hostname: Optional[str] = Field(
        default=None,
        description="Single target device hostname or IP",
        examples=["172.27.200.200"],
    )
    inventory_file: Optional[str] = Field(
        default=None,
        description="Path to inventory file for multiple devices",
        examples=["/app/inventories/devices.csv"],
    )
    username: str = Field(..., description="Device username (REQUIRED)", min_length=1)
    password: str = Field(..., description="Device password (REQUIRED)", min_length=1)
    vendor: Optional[str] = Field(None, description="Device vendor")
    platform: Optional[str] = Field(None, description="Device platform/model")
    target_version: str = Field(
        ..., description="Target software version (REQUIRED)", min_length=1
    )
    image_filename: str = Field(
        ..., description="Upgrade image filename (REQUIRED)", min_length=1
    )

    # Pre-check selection field
    pre_check_selection: Optional[str] = Field(
        default=None, description="Pre-check selection type from frontend"
    )

    # Pre-check integration
    pre_check_job_id: Optional[str] = Field(
        None, description="Job ID from completed pre-check"
    )
    skip_pre_check: bool = Field(default=False, description="Skip inline pre-check")
    force_upgrade: bool = Field(
        default=False,
        description="Force upgrade even with warnings",
    )

    class Config:
        extra = "forbid"


class CodeUpgradeResponseModel(BaseModel):
    """Response model for upgrade job submission"""

    job_id: str = Field(..., description="Unique upgrade job identifier")
    status: str = Field(..., description="Job status message")
    ws_channel: str = Field(..., description="WebSocket channel for progress")
    message: str = Field(..., description="Detailed message")
    timestamp: str = Field(..., description="ISO timestamp")
    phase: UpgradePhase = Field(
        default=UpgradePhase.UPGRADE, description="Current phase"
    )


# ================================================================================
# 🚀 FASTAPI ROUTER SETUP
# ================================================================================
code_upgrade_router = APIRouter(
    prefix="/api/operations",
    tags=["Code Upgrades"],
    responses={
        400: {"description": "Bad Request - Invalid parameters"},
        503: {"description": "Service Unavailable - Backend services unavailable"},
        500: {"description": "Internal Server Error"},
    },
)


# ================================================================================
# 🛡️ VALIDATION & HELPER FUNCTIONS
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
    """
    # Target specification
    if not hostname and not inventory_file:
        return "Either 'hostname' or 'inventory_file' must be specified"

    if hostname and inventory_file:
        return "Specify either 'hostname' OR 'inventory_file', not both"

    # Authentication
    if not username.strip():
        return "Username cannot be empty"

    if not password.strip():
        return "Password cannot be empty"

    # Target version
    if not target_version.strip():
        return "Target version cannot be empty"

    # Image
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
    target_version: str,
    image_filename: str,
    phase: UpgradePhase = UpgradePhase.UPGRADE,
    pre_check_options: Optional[Dict[str, Any]] = None,
    pre_check_selection: Optional[str] = None,
) -> List[str]:
    """
    Build command line arguments for the upgrade script.
    """
    args = []

    # Phase selector
    args.extend(["--phase", phase.value])

    # Target specification
    if hostname:
        args.extend(["--hostname", hostname])
    elif inventory_file:
        args.extend(["--inventory-file", inventory_file])

    # Authentication
    args.extend(["--username", username])
    args.extend(["--password", password])

    # Upgrade parameters
    args.extend(["--image-filename", image_filename])
    args.extend(["--target-version", target_version])

    # Optional parameters
    if vendor:
        args.extend(["--vendor", vendor])

    if platform:
        args.extend(["--platform", platform])

    # Pre-check specific options
    if phase == UpgradePhase.PRE_CHECK and pre_check_options:
        if pre_check_options.get("skip_storage_check"):
            args.append("--skip-storage-check")

        if pre_check_options.get("skip_snapshot_check"):
            args.append("--skip-snapshot-check")

        if pre_check_options.get("require_snapshot"):
            args.append("--require-snapshot")

    # Pre-check test selection
    if phase == UpgradePhase.PRE_CHECK and pre_check_selection:
        # Map frontend selection to backend test names
        selection_mapping = {
            "health": "health",
            "bgp": "bgp",
            "storage": "storage",
            "compatibility": "compatibility",
            "snapshot": "snapshot",
            "all": "all",
        }

        selected_test = selection_mapping.get(pre_check_selection.lower())
        if selected_test and selected_test != "all":
            args.extend(["--tests", selected_test])
            logger.info(f"Running specific pre-check test: {selected_test}")

    # Upgrade phase options
    if phase == UpgradePhase.UPGRADE:
        args.extend(["--allow-downgrade"])

    logger.debug(f"Built {phase.value} arguments: {args}")
    return args


# ================================================================================
# 🎯 PRE-CHECK ENDPOINT
# ================================================================================
@code_upgrade_router.post(
    "/pre-check",
    response_model=PreCheckResponseModel,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Run Pre-Upgrade Validation Checks",
    responses={
        202: {"description": "Pre-check job accepted and queued"},
        400: {"description": "Invalid parameters"},
        503: {"description": "Backend services unavailable"},
    },
)
async def run_pre_check(request: PreCheckRequestModel) -> PreCheckResponseModel:
    """
    Run pre-upgrade validation checks.
    """
    logger.info(
        f"Pre-Check Request Received - "
        f"Target: {request.hostname or request.inventory_file}, "
        f"Image: {request.image_filename}, "
        f"Target Version: {request.target_version}, "
        f"Pre-check Selection: {request.pre_check_selection}"
    )

    # Service availability checks
    if not redis_client or not redis_client.ping():
        logger.error("Redis unavailable - cannot queue pre-check")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Job queue service temporarily unavailable",
        )

    if not SCRIPT_PATH.is_file():
        logger.error(f"Script not found: {SCRIPT_PATH}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Pre-check service configuration error",
        )

    # Parameter validation
    validation_error = validate_upgrade_parameters(
        hostname=request.hostname,
        inventory_file=request.inventory_file,
        username=request.username,
        password=request.password,
        target_version=request.target_version,
        image_filename=request.image_filename,
    )

    if validation_error:
        logger.warning(f"Validation failed: {validation_error}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=validation_error
        )

    # Job initialization
    job_id = f"pre-check-{uuid.uuid4()}"
    logger.info(f"Initializing pre-check job: {job_id}")

    try:
        # Build pre-check options
        pre_check_options = {
            "skip_storage_check": request.skip_storage_check,
            "skip_snapshot_check": request.skip_snapshot_check,
            "require_snapshot": request.require_snapshot,
        }

        # Build command arguments
        cmd_args = build_script_arguments(
            hostname=request.hostname,
            inventory_file=request.inventory_file,
            username=request.username,
            password=request.password,
            vendor=request.vendor,
            platform=request.platform,
            target_version=request.target_version,
            image_filename=request.image_filename,
            phase=UpgradePhase.PRE_CHECK,
            pre_check_options=pre_check_options,
            pre_check_selection=request.pre_check_selection,
        )

        # Construct job payload
        job_payload = {
            "job_id": job_id,
            "script_path": str(SCRIPT_PATH),
            "cmd_args": cmd_args,
            "metadata": {
                "operation": "pre_check",
                "phase": "pre_check",
                "target": request.hostname or request.inventory_file,
                "image_filename": request.image_filename,
                "target_version": request.target_version,
                "vendor": request.vendor,
                "platform": request.platform,
                "username": request.username,
                "pre_check_selection": request.pre_check_selection,
                "pre_check_options": pre_check_options,
                "timestamp": datetime.utcnow().isoformat() + "Z",
            },
        }

        # Queue job
        redis_client.lpush(REDIS_JOB_QUEUE, json.dumps(job_payload))
        logger.info(f"Pre-check job {job_id} queued successfully")

        # Success response
        target_desc = (
            request.hostname
            if request.hostname
            else f"devices in {request.inventory_file}"
        )

        return PreCheckResponseModel(
            job_id=job_id,
            status="Pre-check job queued successfully",
            ws_channel=f"job:{job_id}",
            message=f"Running pre-upgrade validation for {target_desc}",
            timestamp=datetime.utcnow().isoformat() + "Z",
            phase=UpgradePhase.PRE_CHECK,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in pre-check: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unexpected error during pre-check submission",
        )


# ================================================================================
# 🎯 UPGRADE ENDPOINT
# ================================================================================
@code_upgrade_router.post(
    "/execute",
    response_model=CodeUpgradeResponseModel,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Execute Code Upgrade on Network Device",
    responses={
        202: {"description": "Upgrade job accepted and queued"},
        400: {"description": "Invalid parameters or failed pre-checks"},
        503: {"description": "Backend services unavailable"},
    },
)
async def execute_code_upgrade(
    request: CodeUpgradeRequestModel,
) -> CodeUpgradeResponseModel:
    """
    Execute code upgrade with enhanced pre-check integration.
    """
    logger.info(
        f"Upgrade Request Received - "
        f"Target: {request.hostname or request.inventory_file}, "
        f"Image: {request.image_filename}, "
        f"Pre-Check ID: {request.pre_check_job_id or 'None'}, "
        f"Skip Pre-Check: {request.skip_pre_check}"
    )

    # Service availability
    if not redis_client or not redis_client.ping():
        logger.error("Redis unavailable")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Job queue service unavailable",
        )

    if not SCRIPT_PATH.is_file():
        logger.error(f"Script not found: {SCRIPT_PATH}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Upgrade service configuration error",
        )

    # Parameter validation
    validation_error = validate_upgrade_parameters(
        hostname=request.hostname,
        inventory_file=request.inventory_file,
        username=request.username,
        password=request.password,
        target_version=request.target_version,
        image_filename=request.image_filename,
    )

    if validation_error:
        logger.warning(f"Validation failed: {validation_error}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=validation_error
        )

    # Job initialization
    job_id = f"code-upgrade-{uuid.uuid4()}"
    logger.info(f"Initializing upgrade job: {job_id}")

    try:
        # Build command arguments
        cmd_args = build_script_arguments(
            hostname=request.hostname,
            inventory_file=request.inventory_file,
            username=request.username,
            password=request.password,
            vendor=request.vendor,
            platform=request.platform,
            target_version=request.target_version,
            image_filename=request.image_filename,
            phase=UpgradePhase.UPGRADE,
        )

        # Add skip-pre-check flag if requested
        if request.skip_pre_check:
            cmd_args.append("--skip-pre-check")
            logger.warning(f"Pre-check will be SKIPPED for job {job_id}")

        # Add force flag if requested
        if request.force_upgrade:
            cmd_args.append("--force")
            logger.warning(f"Force upgrade enabled for job {job_id}")

        # Construct job payload
        job_payload = {
            "job_id": job_id,
            "script_path": str(SCRIPT_PATH),
            "cmd_args": cmd_args,
            "metadata": {
                "operation": "code_upgrade",
                "phase": "upgrade",
                "target": request.hostname or request.inventory_file,
                "image_filename": request.image_filename,
                "target_version": request.target_version,
                "vendor": request.vendor,
                "platform": request.platform,
                "username": request.username,
                "pre_check_job_id": request.pre_check_job_id,
                "skip_pre_check": request.skip_pre_check,
                "force_upgrade": request.force_upgrade,
                "timestamp": datetime.utcnow().isoformat() + "Z",
            },
        }

        # Queue job
        redis_client.lpush(REDIS_JOB_QUEUE, json.dumps(job_payload))
        logger.info(f"Upgrade job {job_id} queued successfully")

        # Success response
        target_desc = (
            request.hostname
            if request.hostname
            else f"devices in {request.inventory_file}"
        )

        return CodeUpgradeResponseModel(
            job_id=job_id,
            status="Code upgrade job queued successfully",
            ws_channel=f"job:{job_id}",
            message=f"Code upgrade started for {request.image_filename} to {target_desc}",
            timestamp=datetime.utcnow().isoformat() + "Z",
            phase=UpgradePhase.UPGRADE,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unexpected error during upgrade submission",
        )


# ================================================================================
# 🩺 HEALTH CHECK ENDPOINT
# ================================================================================
class HealthCheckResponseModel(BaseModel):
    """Health check response"""

    service: str = Field(default="code_upgrade")
    redis_connected: bool
    script_exists: bool
    timestamp: str


@code_upgrade_router.get(
    "/health",
    response_model=HealthCheckResponseModel,
    summary="Service Health Check",
)
async def health_check() -> HealthCheckResponseModel:
    """Health check endpoint for service monitoring."""
    health_status = {
        "service": "code_upgrade",
        "redis_connected": bool(redis_client and redis_client.ping()),
        "script_exists": SCRIPT_PATH.is_file(),
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }

    return HealthCheckResponseModel(**health_status)


# ================================================================================
# 📦 MODULE EXPORTS
# ================================================================================
router = code_upgrade_router


def get_router() -> APIRouter:
    """Get the code upgrade router instance."""
    return code_upgrade_router


async def cleanup_on_shutdown():
    """Cleanup operations during application shutdown."""
    logger.info("Code Upgrade Service: Shutting down...")

    if redis_client:
        try:
            redis_client.close()
            logger.info("Redis connection closed")
        except Exception as e:
            logger.error(f"Error closing Redis: {e}")


# Export public interface
__all__ = ["router", "get_router", "cleanup_on_shutdown"]
