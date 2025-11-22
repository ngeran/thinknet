#!/usr/bin/env python3
"""
================================================================================
FILE:               app_gateway/api/routers/code_upgrade.py
DESCRIPTION:        Enhanced FastAPI router with pre-check support
VERSION:            4.1.1 - Critical Argument Name Fix
AUTHOR:             nikos-geranios_vgi
DATE:               2025-11-05
LAST UPDATED:       2025-11-17 14:40:23 UTC
================================================================================
 
CHANGELOG v4.1.1 (2025-11-17):
- CRITICAL FIX: Corrected --pre-check-selection argument name (hyphens not underscores)
- Enhanced logging for argument building process
- Added explicit verification for CLI argument format
- Fixed compatibility between FastAPI router and argparse in run.py
- Improved error messages for argument parsing failures
 
CHANGELOG v4.1.0 (2025-11-17):
- Fixed pre-check selection parameter handling from frontend
- Enhanced build_script_arguments with robust type checking
- Added comprehensive debug logging for pre-check selection
- Improved error handling for payload validation
- Fixed snake_case/camelCase property mapping issues
 
CHANGELOG v4.0.0 (2025-11-05):
- Added comprehensive pre-check phase support
- Implemented pre-check selection functionality
- Enhanced WebSocket event handling
- Improved error reporting and validation
 
ARCHITECTURE:
- FastAPI router handles HTTP requests from frontend
- Converts API requests to backend script arguments
- Manages job queuing via Redis
- Provides health check endpoints
- Ensures proper argument format for Python argparse compatibility
 
CRITICAL NOTES:
- CLI arguments MUST use hyphens (--pre-check-selection) not underscores
- argparse converts hyphens to underscores internally for variable names
- Frontend sends comma-separated string of check IDs
- Backend forwards to script as-is with proper argument name
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
 
 
# Initialize Redis client on module load
redis_client = setup_redis_connection()
 
# ================================================================================
# SECTION 4: ENUMS FOR TYPE SAFETY
# ================================================================================
 
class PreCheckSeverity(str, Enum):
    """
    Severity levels for pre-check results.
 
    Used to categorize pre-check validation results by impact level.
    """
    PASS = "pass"
    WARNING = "warning"
    CRITICAL = "critical"
 
 
class UpgradePhase(str, Enum):
    """
    Phases of the upgrade workflow.
 
    Defines the operational phases for upgrade/downgrade operations.
    """
    PRE_CHECK = "pre_check"
    UPGRADE = "upgrade"
 
 
# ================================================================================
# SECTION 5: REQUEST/RESPONSE MODELS - PRE-CHECK
# ================================================================================
 
class PreCheckRequestModel(BaseModel):
    """
    Request model for pre-upgrade validation checks.
 
    Updated v4.1.1: Enhanced documentation for pre_check_selection format
    Updated v4.1.0: Enhanced pre_check_selection handling
 
    This model defines all parameters required for pre-check validation
    operations, including device targeting, authentication, and selective
    check execution.
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
        default=None,
        description="Device vendor identifier",
        examples=["juniper", "cisco", "arista"],
    )
    platform: Optional[str] = Field(
        default=None,
        description="Device platform/model identifier",
        examples=["srx", "mx", "ex"],
    )
 
    # ==========================================================================
    # SUBSECTION 5.4: UPGRADE PARAMETERS (REQUIRED)
    # ==========================================================================
    target_version: str = Field(
        ...,
        description="Target software version for compatibility validation",
        min_length=1,
        examples=["24.4R2", "21.4R3-S5.6"],
    )
    image_filename: str = Field(
        ...,
        description="Software image filename to validate (must exist in /var/tmp/)",
        min_length=1,
        examples=["junos-install-srxsme-mips-64-24.4R2-S1.7.tgz"],
    )
 
    # ==========================================================================
    # SUBSECTION 5.5: PRE-CHECK SELECTION (FIXED v4.1.1)
    # ==========================================================================
    pre_check_selection: Optional[str] = Field(
        default=None,
        description=(
            "Comma-separated list of specific pre-check test IDs to execute. "
            "Format: 'check_id1,check_id2,check_id3'. "
            "Examples: 'storage_space,hardware_health' or 'device_connectivity,image_availability,storage_space'. "
            "If None or 'all', executes all available pre-checks. "
            "Valid check IDs: device_connectivity, image_availability, storage_space, "
            "hardware_health, bgp_stability, snapshot_availability"
        ),
        examples=[
            "storage_space,hardware_health,bgp_stability",
            "device_connectivity,image_availability",
            "all"
        ]
    )
 
    # ==========================================================================
    # SUBSECTION 5.6: ADVANCED PRE-CHECK OPTIONS
    # ==========================================================================
    skip_storage_check: bool = Field(
        default=False,
        description="Skip storage space validation (not recommended)"
    )
    skip_snapshot_check: bool = Field(
        default=False,
        description="Skip configuration snapshot availability check"
    )
    require_snapshot: bool = Field(
        default=False,
        description="Treat missing snapshot as critical failure"
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
                "pre_check_selection": "device_connectivity,storage_space,hardware_health",
                "skip_storage_check": False,
                "skip_snapshot_check": False,
                "require_snapshot": False
            }
        }
 
 
class PreCheckResponseModel(BaseModel):
    """
    Response model for pre-check job submission.
 
    Provides job tracking information for WebSocket monitoring.
    """
    job_id: str = Field(
        ...,
        description="Unique pre-check job identifier for tracking"
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
        default=UpgradePhase.PRE_CHECK,
        description="Current operational phase"
    )
 
 
# ================================================================================
# SECTION 6: FASTAPI ROUTER SETUP
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
 
    Validates all required parameters for upgrade/pre-check operations.
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
# SECTION 8: SCRIPT ARGUMENT BUILDER - FIXED v4.1.1
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
    phase: UpgradePhase = UpgradePhase.UPGRADE,
    pre_check_options: Optional[Dict[str, Any]] = None,
    pre_check_selection: Optional[str] = None,
) -> List[str]:
    """
    Build command line arguments for the upgrade script.
 
    CRITICAL FIX v4.1.1 (2025-11-17 14:40:23 UTC):
    - Corrected argument name to --pre-check-selection (with HYPHENS)
    - This MUST match argparse definition in run.py
    - argparse expects hyphens in CLI but converts to underscores internally
 
    FIXED v4.1.0 (2025-11-17):
    - Enhanced pre-check selection handling with robust type checking
 
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
        phase: Operation phase (PRE_CHECK or UPGRADE)
        pre_check_options: Dictionary of pre-check configuration flags
        pre_check_selection: Comma-separated string of pre-check IDs to execute
 
    Returns:
        List of command line arguments ready for subprocess execution
 
    Notes:
        - All arguments use hyphens (--arg-name) not underscores
        - argparse automatically converts hyphens to underscores in variable names
        - Example: --pre-check-selection becomes args.pre_check_selection
        - Comprehensive logging tracks argument building for debugging
    """
    logger.info("=" * 80)
    logger.info("🔧 BUILDING SCRIPT ARGUMENTS")
    logger.info("=" * 80)
    logger.info(f"User: nikos-geranios_vgi")
    logger.info(f"Timestamp: {datetime.utcnow().isoformat()}Z")
    logger.info(f"Phase: {phase.value}")
    logger.info(f"Hostname: {hostname}")
    logger.info(f"Target Version: {target_version}")
    logger.info(f"Image Filename: {image_filename}")
    logger.info(f"Pre-check Selection (raw): {pre_check_selection}")
    logger.info(f"Pre-check Selection Type: {type(pre_check_selection)}")
    logger.info("=" * 80)
 
    args = []
 
    # ==========================================================================
    # SUBSECTION 8.1: PHASE AND TARGET SPECIFICATION
    # ==========================================================================
 
    # Phase selector - determines pre_check vs full upgrade execution
    args.extend(["--phase", phase.value])
    logger.debug(f"Added phase: {phase.value}")
 
    # Target specification - either single device or inventory file
    if hostname:
        args.extend(["--hostname", hostname])
        logger.debug(f"Added hostname: {hostname}")
    elif inventory_file:
        args.extend(["--inventory-file", inventory_file])
        logger.debug(f"Added inventory file: {inventory_file}")
 
    # ==========================================================================
    # SUBSECTION 8.2: AUTHENTICATION CREDENTIALS
    # ==========================================================================
 
    args.extend(["--username", username])
    args.extend(["--password", password])
    logger.debug("Added authentication credentials (password masked)")
 
    # ==========================================================================
    # SUBSECTION 8.3: UPGRADE PARAMETERS
    # ==========================================================================
 
    # Image and version parameters (required for all operations)
    args.extend(["--image-filename", image_filename])
    args.extend(["--target-version", target_version])
    logger.debug(f"Added image and version: {image_filename}, {target_version}")
 
    # ==========================================================================
    # SUBSECTION 8.4: OPTIONAL DEVICE PARAMETERS
    # ==========================================================================
 
    # Vendor-specific handling (optional)
    if vendor:
        args.extend(["--vendor", vendor])
        logger.debug(f"Added vendor: {vendor}")
 
    # Platform-specific handling (optional)
    if platform:
        args.extend(["--platform", platform])
        logger.debug(f"Added platform: {platform}")
 
    # ==========================================================================
    # SUBSECTION 8.5: PRE-CHECK SPECIFIC OPTIONS - CRITICAL FIX v4.1.1
    # ==========================================================================
 
    if phase == UpgradePhase.PRE_CHECK:
        logger.info("🔍 Processing PRE-CHECK phase specific options")
 
        # ----------------------------------------------------------------------
        # Pre-check configuration flags
        # ----------------------------------------------------------------------
        if pre_check_options:
            if pre_check_options.get("skip_storage_check"):
                args.append("--skip-storage-check")
                logger.debug("Added flag: --skip-storage-check")
 
            if pre_check_options.get("skip_snapshot_check"):
                args.append("--skip-snapshot-check")
                logger.debug("Added flag: --skip-snapshot-check")
 
            if pre_check_options.get("require_snapshot"):
                args.append("--require-snapshot")
                logger.debug("Added flag: --require-snapshot")
 
        # ----------------------------------------------------------------------
        # Pre-check selection - CRITICAL FIX v4.1.1
        # MUST use HYPHENS (--pre-check-selection) not UNDERSCORES
        # This matches argparse definition in run.py
        # ----------------------------------------------------------------------
        if pre_check_selection:
            logger.info("=" * 80)
            logger.info("🎯 PROCESSING PRE-CHECK SELECTION")
            logger.info("=" * 80)
            logger.info(f"Raw value: {pre_check_selection}")
            logger.info(f"Raw type: {type(pre_check_selection)}")
 
            # Initialize check_ids variable
            check_ids = None
 
            # Type handling with comprehensive logging
            if isinstance(pre_check_selection, list):
                # Handle list input (defensive - shouldn't happen from API)
                logger.info("✓ Detected LIST type")
                check_ids = ','.join(str(item) for item in pre_check_selection)
                logger.info(f"✓ Converted list to comma-separated string: {check_ids}")
 
            elif isinstance(pre_check_selection, str):
                # Handle string input (expected from API)
                logger.info("✓ Detected STRING type")
                check_ids = pre_check_selection.strip()
                logger.info(f"✓ Using string as-is: {check_ids}")
 
            else:
                # Handle unexpected types (defensive programming)
                logger.warning(f"⚠️ Unexpected type: {type(pre_check_selection)}")
                logger.warning(f"⚠️ Converting to string: {str(pre_check_selection)}")
                check_ids = str(pre_check_selection)
 
            # Validate and add to arguments
            if check_ids and check_ids.lower() != "all":
                # Validate format (should be comma-separated list)
                check_list = [c.strip() for c in check_ids.split(',') if c.strip()]
 
                if check_list:
                    final_check_string = ','.join(check_list)
 
                    # ================================================================
                    # CRITICAL FIX v4.1.1 (2025-11-17 14:40:23 UTC):
                    #
                    # Use HYPHENS (--pre-check-selection) NOT UNDERSCORES
                    #
                    # This MUST match the argparse definition in run.py:
                    #   parser.add_argument("--pre-check-selection", ...)
                    #
                    # Python argparse behavior:
                    #   - CLI argument:  --pre-check-selection (with hyphens)
                    #   - Python access: args.pre_check_selection (with underscores)
                    #
                    # The CLI invocation MUST use hyphens for argparse to recognize it.
                    # ================================================================
                    args.extend(["--pre-check-selection", final_check_string])
 
                    logger.info("=" * 80)
                    logger.info("✅ PRE-CHECK SELECTION ADDED TO ARGUMENTS")
                    logger.info("=" * 80)
                    logger.info(f"❗ CRITICAL: Using HYPHENS not underscores")
                    logger.info(f"Argument name: --pre-check-selection (CLI format)")
                    logger.info(f"Python access: args.pre_check_selection (code format)")
                    logger.info(f"Final value: {final_check_string}")
                    logger.info(f"Check count: {len(check_list)}")
                    logger.info(f"Individual checks: {', '.join(check_list)}")
                    logger.info(f"Timestamp: {datetime.utcnow().isoformat()}Z")
                    logger.info(f"User: nikos-geranios_vgi")
                    logger.info("=" * 80)
                else:
                    logger.warning("⚠️ Pre-check selection was empty after processing")
            else:
                logger.info("ℹ️ Running all pre-checks (no specific selection or 'all' specified)")
        else:
            logger.info("ℹ️ No pre-check selection provided - will run all available checks")
 
    # ==========================================================================
    # SUBSECTION 8.6: UPGRADE PHASE OPTIONS
    # ==========================================================================
 
    if phase == UpgradePhase.UPGRADE:
        # Allow downgrade operations (permits version rollback)
        args.extend(["--allow-downgrade"])
        logger.debug("Added flag: --allow-downgrade")
 
    # ==========================================================================
    # SUBSECTION 8.7: FINAL LOGGING AND VERIFICATION
    # ==========================================================================
 
    logger.info("=" * 80)
    logger.info("✅ SCRIPT ARGUMENTS BUILD COMPLETE")
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
# SECTION 9: PRE-CHECK ENDPOINT
# ================================================================================
 
@code_upgrade_router.post(
    "/pre-check",
    response_model=PreCheckResponseModel,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Run Pre-Upgrade Validation Checks",
    description=(
        "Execute pre-upgrade validation checks with optional selective check execution. "
        "Supports device connectivity, storage, hardware health, protocol stability, "
        "and image availability validation. Returns job ID for WebSocket progress tracking."
    ),
    responses={
        202: {
            "description": "Pre-check job accepted and queued for execution",
            "content": {
                "application/json": {
                    "example": {
                        "job_id": "pre-check-550e8400-e29b-41d4-a716-446655440000",
                        "status": "Pre-check job queued successfully",
                        "ws_channel": "job:pre-check-550e8400-e29b-41d4-a716-446655440000",
                        "message": "Running pre-upgrade validation for 172.27.200.200",
                        "timestamp": "2025-11-17T14:40:23Z",
                        "phase": "pre_check"
                    }
                }
            }
        },
        400: {"description": "Invalid parameters - validation failed"},
        503: {"description": "Backend services unavailable"},
    },
)
async def run_pre_check(request: PreCheckRequestModel) -> PreCheckResponseModel:
    """
    Run pre-upgrade validation checks with optional check selection.
 
    FIXED v4.1.1: Enhanced argument building with correct CLI format
    FIXED v4.1.0: Enhanced pre-check selection handling
 
    Workflow:
    1. Log comprehensive request details for audit trail
    2. Validate Redis and script availability
    3. Validate request parameters (credentials, target, image)
    4. Generate unique job ID for tracking
    5. Build script arguments with proper CLI format (hyphens)
    6. Queue job to Redis for worker processing
    7. Return job information for WebSocket tracking
 
    Args:
        request: Pre-check request with device and validation parameters
 
    Returns:
        PreCheckResponseModel with job ID and WebSocket channel for progress tracking
 
    Raises:
        HTTPException 400: Invalid parameters
        HTTPException 503: Redis or backend service unavailable
        HTTPException 500: Unexpected internal error
 
    Notes:
        - Job execution is asynchronous via Redis queue
        - Progress updates available via WebSocket on returned channel
        - Pre-check results compiled after all checks complete
        - Frontend should subscribe to ws_channel for real-time updates
    """
    logger.info("=" * 80)
    logger.info("🚀 PRE-CHECK REQUEST RECEIVED")
    logger.info("=" * 80)
    logger.info(f"User: nikos-geranios_vgi")
    logger.info(f"Timestamp: {datetime.utcnow().isoformat()}Z")
    logger.info(f"Endpoint: POST /api/operations/pre-check")
    logger.info(f"Client IP: (request metadata not available)")
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
    logger.info("🎯 PRE-CHECK CONFIGURATION:")
    logger.info(f"  • Pre-check Selection: {request.pre_check_selection or '(all checks)'}")
    logger.info(f"  • Skip Storage Check: {request.skip_storage_check}")
    logger.info(f"  • Skip Snapshot Check: {request.skip_snapshot_check}")
    logger.info(f"  • Require Snapshot: {request.require_snapshot}")
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
            detail="Pre-check service configuration error - backend script not found",
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
    job_id = f"pre-check-{uuid.uuid4()}"
 
    logger.info("=" * 80)
    logger.info(f"🆔 JOB INITIALIZATION")
    logger.info("=" * 80)
    logger.info(f"Job ID: {job_id}")
    logger.info(f"Job Type: Pre-Check Validation")
    logger.info(f"User: nikos-geranios_vgi")
    logger.info(f"Created: {datetime.utcnow().isoformat()}Z")
    logger.info(f"Priority: Normal")
    logger.info("=" * 80)
 
    try:
        # ======================================================================
        # SUBSECTION 9.4: PRE-CHECK OPTIONS PREPARATION
        # ======================================================================
 
        # Package pre-check configuration flags
        pre_check_options = {
            "skip_storage_check": request.skip_storage_check,
            "skip_snapshot_check": request.skip_snapshot_check,
            "require_snapshot": request.require_snapshot,
        }
 
        logger.debug(f"Pre-check options prepared: {pre_check_options}")
 
        # ======================================================================
        # SUBSECTION 9.5: COMMAND ARGUMENTS BUILDING
        # ======================================================================
 
        logger.info("🔧 Building command arguments with proper CLI format...")
 
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
 
        logger.info(f"✅ Command arguments built successfully: {len(cmd_args)} arguments")
        logger.debug(f"Argument list: {cmd_args}")
 
        # ======================================================================
        # SUBSECTION 9.6: JOB PAYLOAD CONSTRUCTION
        # ======================================================================
 
        # Construct complete job payload for Redis queue
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
                "user": "nikos-geranios_vgi",
                "submitted_from": "code_upgrade_router",
            },
        }
 
        logger.debug("Job payload constructed with complete metadata")
 
        # ======================================================================
        # SUBSECTION 9.7: REDIS JOB QUEUING
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
        # SUBSECTION 9.8: SUCCESS RESPONSE CONSTRUCTION
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
        logger.info("✅ PRE-CHECK JOB SUBMITTED SUCCESSFULLY")
        logger.info("=" * 80)
        logger.info(f"Job ID: {job_id}")
        logger.info(f"WebSocket Channel: {ws_channel}")
        logger.info(f"Target: {target_desc}")
        logger.info(f"Status: Queued and ready for worker processing")
        logger.info(f"User: nikos-geranios_vgi")
        logger.info(f"Timestamp: {datetime.utcnow().isoformat()}Z")
        logger.info("=" * 80)
 
        # Return success response with tracking information
        return PreCheckResponseModel(
            job_id=job_id,
            status="Pre-check job queued successfully",
            ws_channel=ws_channel,
            message=f"Running pre-upgrade validation for {target_desc}",
            timestamp=datetime.utcnow().isoformat() + "Z",
            phase=UpgradePhase.PRE_CHECK,
        )
 
    except HTTPException:
        # Re-raise HTTP exceptions without modification
        raise
    except Exception as e:
        # Log and handle unexpected errors
        logger.error("=" * 80)
        logger.error("❌ UNEXPECTED ERROR IN PRE-CHECK SUBMISSION")
        logger.error("=" * 80)
        logger.error(f"Error: {str(e)}")
        logger.error(f"Error Type: {type(e).__name__}")
        logger.error(f"Job ID: {job_id}")
        logger.error(f"User: nikos-geranios_vgi")
        logger.error(f"Timestamp: {datetime.utcnow().isoformat()}Z")
        logger.error("=" * 80)
 
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unexpected error during pre-check submission: {str(e)}",
        )
 
 
# ================================================================================
# SECTION 10: HEALTH CHECK ENDPOINT
# ================================================================================
 
class HealthCheckResponseModel(BaseModel):
    """
    Health check response model.
 
    Provides service health status for monitoring and alerting systems.
    """
    service: str = Field(
        default="code_upgrade",
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
 
 
@code_upgrade_router.get(
    "/health",
    response_model=HealthCheckResponseModel,
    summary="Service Health Check",
    description="Check health status of code upgrade service and dependencies",
    tags=["System"],
)
async def health_check() -> HealthCheckResponseModel:
    """
    Health check endpoint for service monitoring.
 
    Validates:
    - Redis connection and responsiveness
    - Backend script file existence
    - Overall service operational status
 
    Returns:
        HealthCheckResponseModel with current health status
 
    Notes:
        - Should be called periodically by monitoring systems
        - Returns 200 OK even if some checks fail (check response body)
        - Useful for load balancer health probes
    """
    logger.debug("Health check requested")
 
    # Check Redis connectivity
    redis_healthy = False
    try:
        redis_healthy = bool(redis_client and redis_client.ping())
    except Exception as e:
        logger.debug(f"Redis health check failed: {e}")
 
    # Check script existence
    script_exists = SCRIPT_PATH.is_file()
 
    health_status = {
        "service": "code_upgrade",
        "redis_connected": redis_healthy,
        "script_exists": script_exists,
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }
 
    logger.debug(f"Health status: {health_status}")
 
    return HealthCheckResponseModel(**health_status)
 
 
# ================================================================================
# SECTION 11: DEBUG ENDPOINT (Development/Testing Only)
# ================================================================================
 
@code_upgrade_router.get(
    "/debug/config",
    summary="Debug Configuration",
    description="Inspect current service configuration (non-production only)",
    tags=["Debug"],
    include_in_schema=os.getenv("ENVIRONMENT", "production") != "production",
)
async def debug_config():
    """
    Debug endpoint to inspect current configuration.
 
    Only available in non-production environments for security.
    Useful for troubleshooting configuration issues.
 
    Returns:
        Configuration details including paths, connection status, and environment
 
    Security:
        - Only exposed in non-production environments
        - Does not include sensitive credentials
        - Hidden from OpenAPI schema in production
    """
    return {
        "service": "code_upgrade",
        "version": "4.1.1",
        "redis_host": REDIS_HOST,
        "redis_port": REDIS_PORT,
        "redis_queue": REDIS_JOB_QUEUE,
        "script_path": str(SCRIPT_PATH),
        "script_path_absolute": str(SCRIPT_PATH.absolute()),
        "script_exists": SCRIPT_PATH.is_file(),
        "redis_connected": bool(redis_client and redis_client.ping()) if redis_client else False,
        "environment": os.getenv("ENVIRONMENT", "production"),
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "user": "nikos-geranios_vgi",
        "python_version": os.sys.version,
        "last_updated": "2025-11-17 14:40:23 UTC",
    }
 
 
# ================================================================================
# SECTION 12: MODULE EXPORTS
# ================================================================================
 
# Primary router export
router = code_upgrade_router
 
 
def get_router() -> APIRouter:
    """
    Get the code upgrade router instance.
 
    Factory function for router registration in main FastAPI app.
 
    Returns:
        Configured APIRouter instance ready for inclusion
    """
    return code_upgrade_router
 
 
async def cleanup_on_shutdown():
    """
    Cleanup operations during application shutdown.
 
    Performs graceful shutdown of connections and resources:
    - Closes Redis connections
    - Logs shutdown completion
    - Releases any held resources
 
    Should be registered as FastAPI shutdown event handler.
    """
    logger.info("=" * 80)
    logger.info("🔌 Code Upgrade Service: Shutting down...")
    logger.info("=" * 80)
    logger.info(f"User: nikos-geranios_vgi")
    logger.info(f"Timestamp: {datetime.utcnow().isoformat()}Z")
 
    if redis_client:
        try:
            redis_client.close()
            logger.info("✅ Redis connection closed successfully")
        except Exception as e:
            logger.error(f"❌ Error closing Redis connection: {e}")
 
    logger.info("=" * 80)
    logger.info("✅ Shutdown complete - all resources released")
    logger.info("=" * 80)
 
 
# Export public interface for module imports
__all__ = [
    "router",
    "get_router",
    "cleanup_on_shutdown",
    "code_upgrade_router",
    "PreCheckRequestModel",
    "PreCheckResponseModel",
    "HealthCheckResponseModel",
]
 
# ================================================================================
# SECTION 13: MODULE INITIALIZATION LOG
# ================================================================================
 
logger.info("=" * 80)
logger.info("📦 CODE UPGRADE ROUTER MODULE LOADED")
logger.info("=" * 80)
logger.info(f"Version: 4.1.1")
logger.info(f"Author: nikos-geranios_vgi")
logger.info(f"Loaded: {datetime.utcnow().isoformat()}Z")
logger.info(f"Last Updated: 2025-11-17 14:40:23 UTC")
logger.info(f"Redis: {REDIS_HOST}:{REDIS_PORT}")
logger.info(f"Queue: {REDIS_JOB_QUEUE}")
logger.info(f"Script: {SCRIPT_PATH}")
logger.info(f"Script Exists: {SCRIPT_PATH.is_file()}")
logger.info(f"Redis Connected: {bool(redis_client and redis_client.ping()) if redis_client else False}")
logger.info("=" * 80)
logger.info("🔧 CRITICAL FIX v4.1.1:")
logger.info("  ✅ Corrected --pre-check-selection argument (uses hyphens)")
logger.info("  ✅ Enhanced logging for argument building process")
logger.info("  ✅ Added explicit CLI format verification")
logger.info("  ✅ Improved compatibility with argparse in run.py")
logger.info("=" * 80)
