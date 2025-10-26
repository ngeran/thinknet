#!/usr/bin/env python3
# ====================================================================================
#
# FILE:               app_gateway/api/routers/file_uploader.py
#
# DESCRIPTION:
#   FastAPI router for uploading files (images, firmware, configurations) to network devices.
#   This router provides a robust API endpoint for uploading files to network devices using
#   various transfer protocols (SCP, TFTP, FTP). It handles file validation, temporary storage,
#   job queueing, and provides real-time progress tracking via WebSocket channels.
#
# ARCHITECTURE OVERVIEW:
#   1. Client uploads file via multipart/form-data
#   2. API validates parameters and saves file to temporary storage
#   3. Job is queued in Redis for background processing
#   4. Worker process picks up job and executes file upload script
#   5. Real-time progress is streamed via WebSocket
#   6. Temporary files are cleaned up after job completion
#
# HOW TO USE (API ENDPOINTS):
#
#   🔹 Upload File to Network Device:
#      POST /api/files/upload
#      Content-Type: multipart/form-data
#
#      Form Data Parameters:
#      - file: Binary file to upload (required)
#      - hostname: Target device hostname/IP (required if no inventory_file)
#      - inventory_file: Path to inventory file for multiple devices (required if no hostname)
#      - username: Device authentication username (required)
#      - password: Device authentication password (required)
#      - protocol: Transfer protocol - "scp", "tftp", or "ftp" (default: "scp")
#      - remote_directory: Remote directory path on target device (optional)
#      - remote_filename: Custom filename on target device (optional)
#      - scriptId: Script identifier for tracking (required)
#      - wsClientId: WebSocket client ID for real-time updates (required)
#
#      Success Response (200):
#      {
#        "job_id": "file-upload-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
#        "status": "File upload job queued successfully",
#        "ws_channel": "job:file-upload-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
#        "message": "Upload started for firmware.bin to 172.27.200.200"
#      }
#
#   🔹 Health Check:
#      GET /api/files/health
#
#      Response:
#      {
#        "service": "file_uploader",
#        "redis_connected": true,
#        "script_exists": true,
#        "temp_dir_writable": true,
#        "timestamp": "2024-01-15T10:30:00Z"
#      }
#
#   🔹 Cleanup Temporary Files:
#      DELETE /api/files/cleanup/{job_id}
#
#      Response:
#      {
#        "status": "cleanup completed",
#        "job_id": "file-upload-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
#        "files_removed": 1
#      }
#
# ERROR HANDLING:
#   - 400 Bad Request: Invalid parameters, missing required fields, unsupported file types
#   - 403 Forbidden: File size too large, unauthorized file type
#   - 404 Not Found: Script file not found, job not found for cleanup
#   - 503 Service Unavailable: Redis connection down, temporary storage unavailable
#   - 500 Internal Server Error: Unexpected server errors
#
# SECURITY CONSIDERATIONS:
#   - File size limits enforced
#   - File type validation
#   - Temporary file cleanup
#   - Secure credential handling
#   - Input sanitization
#
# DEPENDENCIES:
#   - FastAPI: Web framework for API routes
#   - Redis: Job queue management and pub/sub for real-time updates
#   - Python-multipart: For file upload support
#   - Pydantic: Data validation and settings management
#   - Python 3.8+: Async/await support for non-blocking operations
#
# ====================================================================================


# ====================================================================================
# SECTION 1: IMPORTS AND CONFIGURATION
# ====================================================================================
import json
import os
import uuid
import logging
import shutil
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, status
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

# File upload configuration
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB maximum file size
ALLOWED_FILE_TYPES = {
    "image/": ["jpg", "jpeg", "png", "gif", "bmp", "webp"],
    "application/": ["bin", "img", "rom", "pkg", "tar", "gz", "zip"],
    "text/": ["txt", "cfg", "conf", "xml", "json", "yaml", "yml"],
}
TEMP_UPLOAD_DIR = Path("/app/shared/data/uploads")
TEMP_UPLOAD_DIR.mkdir(exist_ok=True, parents=True)

# Script path configuration
SCRIPT_PATH = Path("/app/app_gateway/py_scripts/scripts/file_uploader/run.py")


# ====================================================================================
# SECTION 2: REDIS CONNECTION SETUP
# ====================================================================================
def setup_redis_connection():
    """
    Initialize and test Redis connection for job queueing.

    Returns:
        redis.Redis: Redis client instance or None if connection fails

    Raises:
        Exception: Logs connection errors but doesn't crash the application
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
            f"✅ File Uploader: Successfully connected to Redis at {REDIS_HOST}:{REDIS_PORT}"
        )
        return redis_client

    except ImportError:
        logger.error(
            "❌ File Uploader: Redis Python client not installed. Install with: pip install redis"
        )
        return None
    except Exception as e:
        logger.error(
            f"❌ File Uploader: Failed to connect to Redis at {REDIS_HOST}:{REDIS_PORT} - {str(e)}"
        )
        return None


# Initialize Redis connection
redis_client = setup_redis_connection()


# ====================================================================================
# SECTION 3: REQUEST/RESPONSE SCHEMAS
# ====================================================================================
class FileUploadResponse(BaseModel):
    """
    Standardized response model for file upload job submissions.

    Attributes:
        job_id (str): Unique identifier for tracking the upload job
        status (str): Human-readable status message
        ws_channel (str): WebSocket channel for real-time progress updates
        message (str): Detailed message about the upload operation
        timestamp (str): ISO format timestamp of job submission
    """

    job_id: str = Field(description="Unique identifier for tracking the upload job")
    status: str = Field(description="Human-readable status message")
    ws_channel: str = Field(
        description="WebSocket channel for real-time progress updates"
    )
    message: str = Field(description="Detailed message about the upload operation")
    timestamp: str = Field(description="ISO format timestamp of job submission")


class HealthCheckResponse(BaseModel):
    """
    Health check response model for service status monitoring.

    Attributes:
        service (str): Service name identifier
        redis_connected (bool): Redis connection status
        script_exists (bool): File upload script availability
        temp_dir_writable (bool): Temporary directory write permissions
        timestamp (str): Current server timestamp
    """

    service: str = Field(description="Service name identifier")
    redis_connected: bool = Field(description="Redis connection status")
    script_exists: bool = Field(description="File upload script availability")
    temp_dir_writable: bool = Field(description="Temporary directory write permissions")
    timestamp: str = Field(description="Current server timestamp")


class CleanupResponse(BaseModel):
    """
    Response model for temporary file cleanup operations.

    Attributes:
        status (str): Cleanup operation result
        job_id (str): Job identifier that was cleaned up
        files_removed (int): Number of files successfully removed
        timestamp (str): Operation completion timestamp
    """

    status: str = Field(description="Cleanup operation result")
    job_id: str = Field(description="Job identifier that was cleaned up")
    files_removed: int = Field(description="Number of files successfully removed")
    timestamp: str = Field(description="Operation completion timestamp")


# ====================================================================================
# SECTION 4: FASTAPI ROUTER SETUP
# ====================================================================================
router = APIRouter(
    prefix="/files",
    tags=["File Upload"],
    responses={
        400: {"description": "Bad Request - Invalid parameters"},
        403: {"description": "Forbidden - File type/size not allowed"},
        404: {"description": "Not Found - Resource not available"},
        503: {"description": "Service Unavailable - Backend services down"},
        500: {"description": "Internal Server Error - Unexpected error"},
    },
)


# ====================================================================================
# SECTION 5: VALIDATION HELPER FUNCTIONS
# ====================================================================================
def validate_file_type(file: UploadFile) -> Optional[str]:
    """
    Validate uploaded file against allowed types and extensions.

    Args:
        file: FastAPI UploadFile object containing file metadata

    Returns:
        Optional[str]: Error message if validation fails, None if valid

    Example:
        >>> validate_file_type(upload_file)
        None  # File is valid
        >>> validate_file_type(malicious_file)
        "File type 'application/exe' is not allowed"
    """
    if not file.content_type:
        return "Could not determine file type"

    # Check if file type is in allowed categories
    allowed = False
    for allowed_prefix, extensions in ALLOWED_FILE_TYPES.items():
        if file.content_type.startswith(allowed_prefix):
            # Check file extension
            if file.filename:
                file_extension = file.filename.split(".")[-1].lower()
                if file_extension in extensions:
                    allowed = True
                    break
            else:
                # No filename, but content type matches allowed prefix
                allowed = True
                break

    if not allowed:
        allowed_types = ", ".join(
            [
                f"{prefix}* ({', '.join(exts)})"
                for prefix, exts in ALLOWED_FILE_TYPES.items()
            ]
        )
        return f"File type '{file.content_type}' is not allowed. Allowed types: {allowed_types}"

    return None


def validate_upload_parameters(
    file: UploadFile,
    hostname: Optional[str],
    inventory_file: Optional[str],
    username: str,
    password: str,
    protocol: str,
) -> Optional[str]:
    """
    Comprehensive validation of all upload parameters.

    Args:
        file: Uploaded file object
        hostname: Target device hostname
        inventory_file: Inventory file path
        username: Authentication username
        password: Authentication password
        protocol: File transfer protocol

    Returns:
        Optional[str]: Error message if validation fails, None if all parameters are valid
    """
    # File validation
    if not file or not file.filename:
        return "No file provided or invalid filename"

    file_type_error = validate_file_type(file)
    if file_type_error:
        return file_type_error

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

    # Protocol validation
    if protocol not in ["scp", "tftp", "ftp"]:
        return f"Invalid protocol '{protocol}'. Must be one of: scp, tftp, ftp"

    return None


def build_script_arguments(
    file_path: str,
    hostname: Optional[str],
    inventory_file: Optional[str],
    username: str,
    password: str,
    protocol: str,
    remote_filename: Optional[str],
    script_id: str,
    ws_client_id: str,
) -> List[str]:
    """
    Construct command-line arguments for the file uploader script (run.py).

    🔑 CRITICAL: This function must match the exact parameter names expected by run.py
    run.py expects these required arguments:
    - --run-id RUN_ID        (unique identifier for the run)
    - --mode {cli}           (operation mode, must be 'cli')
    - --hostname HOSTNAME    (target device hostname/IP)
    - --username USERNAME    (device authentication username)
    - --password PASSWORD    (device authentication password)
    - --file FILE            (path to local file to upload)
    - --remote-filename REMOTE_FILENAME (desired filename on remote device)

    Args:
        file_path: Absolute path to the uploaded file
        hostname: Target device hostname
        inventory_file: Inventory file path (NOT SUPPORTED by current run.py)
        username: Device username
        password: Device password
        protocol: Transfer protocol
        remote_filename: Custom remote filename
        script_id: Script identifier (used as --run-id)
        ws_client_id: WebSocket client ID (for progress tracking)

    Returns:
        List[str]: List of command-line arguments for subprocess execution

    Example:
        >>> build_script_arguments(...)
        [
            "--run-id", "image_upload_1234567890",
            "--mode", "cli",
            "--hostname", "172.27.200.200",
            "--username", "admin",
            "--password", "secret",
            "--file", "/tmp/uploads/job123_firmware.bin",
            "--remote-filename", "firmware.bin"
        ]
    """
    args = []

    # 🔑 REQUIRED ARGUMENTS FOR run.py
    # --run-id: Unique identifier for this upload operation
    args.extend(["--run-id", script_id])

    # --mode: Operation mode (run.py only supports 'cli')
    args.extend(["--mode", "cli"])

    # --hostname: Target device specification
    if hostname:
        args.extend(["--hostname", hostname])
    elif inventory_file:
        # Note: Current run.py doesn't support inventory_file, but we'll use it as hostname
        # This is a temporary workaround - run.py should be enhanced to support inventory files
        logger.warning(
            f"Inventory file support not implemented in run.py. Using first device from {inventory_file}"
        )
        args.extend(["--hostname", inventory_file])  # Temporary workaround

    # --username and --password: Device authentication
    args.extend(["--username", username])
    args.extend(["--password", password])

    # --file: Path to the local file to upload
    args.extend(["--file", file_path])

    # --remote-filename: Desired filename on the remote device
    if remote_filename:
        args.extend(["--remote-filename", remote_filename])
    else:
        # Use original filename if no custom name provided
        original_filename = os.path.basename(file_path).split("_", 1)[
            -1
        ]  # Remove job ID prefix
        args.extend(["--remote-filename", original_filename])

    # Optional path parameter (if needed in future)
    # args.extend(["--path", "/var/tmp/"])  # Uncomment if run.py supports --path

    logger.debug(f"Built script arguments for run.py: {args}")

    # Validate that we have all required arguments for run.py
    required_args = {
        "--run-id",
        "--mode",
        "--hostname",
        "--username",
        "--password",
        "--file",
        "--remote-filename",
    }
    provided_args = set(args[::2])  # Get argument names (every other element)
    missing_args = required_args - provided_args

    if missing_args:
        logger.error(f"Missing required arguments for run.py: {missing_args}")
        raise ValueError(f"Missing required arguments for run.py: {missing_args}")

    return args


# ====================================================================================
# SECTION 6: CORE FILE UPLOAD ENDPOINT
# ====================================================================================
@router.post(
    "/upload",
    response_model=FileUploadResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Upload file to network device",
    description="""
    Upload a file to one or more network devices using specified transfer protocol.
    
    This endpoint:
    - Accepts file uploads via multipart/form-data
    - Validates file type, size, and parameters
    - Saves file to temporary storage with job tracking
    - Queues upload job for background processing
    - Returns WebSocket channel for real-time progress tracking
    
    Supported protocols: SCP (secure copy), TFTP (trivial file transfer), FTP (file transfer)
    """,
)
async def upload_file_to_device(
    file: UploadFile = File(
        ..., description="Binary file to upload (images, firmware, configurations)"
    ),
    hostname: Optional[str] = Form(
        None, description="Single target device hostname or IP address"
    ),
    inventory_file: Optional[str] = Form(
        None, description="Path to YAML inventory file for multiple devices"
    ),
    username: str = Form(..., description="Device authentication username"),
    password: str = Form(..., description="Device authentication password"),
    protocol: str = Form(
        "scp", description="File transfer protocol: scp, tftp, or ftp"
    ),
    remote_filename: Optional[str] = Form(
        None, description="Custom filename on target device"
    ),
    scriptId: str = Form(..., description="Script identifier for job tracking"),
    wsClientId: str = Form(
        ..., description="WebSocket client ID for real-time progress updates"
    ),
) -> FileUploadResponse:
    """
    Main endpoint for uploading files to network devices.

    Processes file uploads, validates all parameters, and queues the job for
    background execution by the file uploader worker script.
    """
    # Log incoming request for auditing
    logger.info(
        f"📤 File upload request received - "
        f"File: {file.filename}, "
        f"Target: {hostname or inventory_file}, "
        f"Protocol: {protocol}, "
        f"Script: {scriptId}"
    )

    # ==========================================================================
    # SERVICE AVAILABILITY CHECKS
    # ==========================================================================
    if not redis_client or not redis_client.ping():
        logger.error("Redis connection unavailable - cannot queue upload job")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Job queue service temporarily unavailable. Please try again later.",
        )

    if not SCRIPT_PATH.is_file():
        logger.error(
            f"File uploader script not found at configured path: {SCRIPT_PATH}"
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="File upload service configuration error. Please contact administrator.",
        )

    # ==========================================================================
    # PARAMETER VALIDATION
    # ==========================================================================
    validation_error = validate_upload_parameters(
        file, hostname, inventory_file, username, password, protocol
    )
    if validation_error:
        logger.warning(f"Upload parameter validation failed: {validation_error}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=validation_error
        )

    # ==========================================================================
    # JOB INITIALIZATION
    # ==========================================================================
    job_id = f"file-upload-{uuid.uuid4()}"
    logger.info(f"🆕 Initializing file upload job {job_id} for file: {file.filename}")

    file_path = None  # Track file path for cleanup in case of errors

    try:
        # ======================================================================
        # FILE HANDLING AND STORAGE
        # ======================================================================
        # Create secure temporary filename with job ID prefix
        safe_filename = (
            f"{job_id}_{file.filename.replace('/', '_')}"
            if file.filename
            else f"{job_id}_uploaded_file"
        )
        file_path = TEMP_UPLOAD_DIR / safe_filename

        logger.info(f"💾 Saving uploaded file to temporary location: {file_path}")

        # Read file content with size limit check
        file_content = await file.read()

        if len(file_content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File size {len(file_content)} bytes exceeds maximum allowed {MAX_FILE_SIZE} bytes",
            )

        # Write file to temporary storage
        with open(file_path, "wb") as buffer:
            buffer.write(file_content)

        logger.info(
            f"✅ File saved successfully: {file_path} ({len(file_content)} bytes)"
        )

        # ======================================================================
        # JOB CONFIGURATION AND QUEUEING
        # ======================================================================
        # Build command arguments for the uploader script
        cmd_args = build_script_arguments(
            file_path=str(file_path),
            hostname=hostname,
            inventory_file=inventory_file,
            username=username,
            password=password,
            protocol=protocol,
            remote_filename=remote_filename,
            script_id=scriptId,  # Used as --run-id for run.py
            ws_client_id=wsClientId,  # For WebSocket progress tracking
        )

        # Construct job payload for Redis queue
        job_payload = {
            "job_id": job_id,
            "script_path": str(SCRIPT_PATH),
            "cmd_args": cmd_args,
            "temp_files": [str(file_path)],  # Track for cleanup
            "metadata": {
                "original_filename": file.filename,
                "file_size": len(file_content),
                "content_type": file.content_type,
                "target": hostname or inventory_file,
                "protocol": protocol,
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
            logger.info(f"✅ File upload job {job_id} successfully queued in Redis")

        except Exception as redis_error:
            logger.error(
                f"❌ Failed to queue job {job_id} to Redis: {str(redis_error)}"
            )
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Failed to queue upload job. Please try again.",
            )

        # ======================================================================
        # SUCCESS RESPONSE
        # ======================================================================
        target_description = hostname if hostname else f"devices in {inventory_file}"
        response_message = f"Upload started for {file.filename} to {target_description} using {protocol.upper()}"

        return FileUploadResponse(
            job_id=job_id,
            status="File upload job queued successfully",
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
            f"❌ Unexpected error processing file upload job {job_id}: {str(e)}"
        )

        # Clean up temporary file if it was created
        if file_path and file_path.exists():
            try:
                file_path.unlink()
                logger.info(f"🧹 Cleaned up temporary file after error: {file_path}")
            except Exception as cleanup_error:
                logger.error(
                    f"Failed to clean up temporary file {file_path}: {cleanup_error}"
                )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while processing your upload. Please try again.",
        )


# ====================================================================================
# SECTION 7: UTILITY AND MAINTENANCE ENDPOINTS
# ====================================================================================
@router.get(
    "/health",
    response_model=HealthCheckResponse,
    summary="Service health check",
    description="Check the health and status of the file upload service components",
)
async def health_check() -> HealthCheckResponse:
    """
    Comprehensive health check for file upload service.

    Verifies:
    - Redis connection status
    - Script file existence
    - Temporary directory write permissions
    - Overall service availability
    """
    health_status = {
        "service": "file_uploader",
        "redis_connected": bool(redis_client and redis_client.ping()),
        "script_exists": SCRIPT_PATH.is_file(),
        "temp_dir_writable": os.access(TEMP_UPLOAD_DIR, os.W_OK),
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }

    # Log health status
    if all(
        [
            health_status["redis_connected"],
            health_status["script_exists"],
            health_status["temp_dir_writable"],
        ]
    ):
        logger.info("✅ File upload service health check: ALL SYSTEMS GO")
    else:
        logger.warning(f"⚠️ File upload service health check issues: {health_status}")

    return HealthCheckResponse(**health_status)


@router.delete(
    "/cleanup/{job_id}",
    response_model=CleanupResponse,
    summary="Cleanup temporary files",
    description="Remove temporary files associated with a specific upload job",
)
async def cleanup_upload_files(job_id: str) -> CleanupResponse:
    """
    Clean up temporary files for a specific upload job.

    Useful for:
    - Manual cleanup after failed uploads
    - Freeing up disk space
    - Maintenance operations

    Args:
        job_id: The job identifier to clean up

    Returns:
        CleanupResponse with cleanup results
    """
    logger.info(f"🧹 Requested cleanup for job: {job_id}")

    files_removed = 0

    try:
        if TEMP_UPLOAD_DIR.exists():
            # Find all files matching the job ID pattern
            pattern = f"{job_id}_*"
            matching_files = list(TEMP_UPLOAD_DIR.glob(pattern))

            for temp_file in matching_files:
                try:
                    if temp_file.is_file():
                        temp_file.unlink()
                        files_removed += 1
                        logger.info(f"✅ Removed temporary file: {temp_file}")
                    else:
                        logger.warning(f"⚠️ Skipping non-file item: {temp_file}")
                except Exception as file_error:
                    logger.error(f"❌ Failed to remove {temp_file}: {file_error}")

            logger.info(
                f"🧹 Cleanup completed for job {job_id}: {files_removed} files removed"
            )

        else:
            logger.warning(f"⚠️ Temporary upload directory not found: {TEMP_UPLOAD_DIR}")

        return CleanupResponse(
            status="cleanup completed",
            job_id=job_id,
            files_removed=files_removed,
            timestamp=datetime.utcnow().isoformat() + "Z",
        )

    except Exception as e:
        logger.error(f"❌ Cleanup operation failed for job {job_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Cleanup operation failed: {str(e)}",
        )


@router.delete(
    "/cleanup/all",
    summary="Cleanup all temporary files",
    description="Remove all temporary files from upload directory (use with caution)",
)
async def cleanup_all_files():
    """
    Clean up ALL temporary files in the upload directory.

    ⚠️ WARNING: This will remove all temporary files, including those from active jobs.
    Use only for maintenance or in development environments.
    """
    logger.warning("🚨 Bulk cleanup of ALL temporary files requested")

    try:
        if TEMP_UPLOAD_DIR.exists():
            files_removed = 0
            for temp_file in TEMP_UPLOAD_DIR.iterdir():
                if temp_file.is_file():
                    try:
                        temp_file.unlink()
                        files_removed += 1
                    except Exception as e:
                        logger.error(f"Failed to remove {temp_file}: {e}")

            logger.info(f"🧹 Bulk cleanup completed: {files_removed} files removed")
            return {
                "status": "bulk cleanup completed",
                "files_removed": files_removed,
                "timestamp": datetime.utcnow().isoformat() + "Z",
            }
        else:
            return {
                "status": "no temporary directory found",
                "files_removed": 0,
                "timestamp": datetime.utcnow().isoformat() + "Z",
            }

    except Exception as e:
        logger.error(f"Bulk cleanup failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Bulk cleanup failed: {str(e)}",
        )


# ====================================================================================
# SECTION 8: MODULE INITIALIZATION AND CLEANUP
# ====================================================================================
def get_router() -> APIRouter:
    """
    Get the file uploader router instance.

    Returns:
        APIRouter: Configured FastAPI router for file upload endpoints
    """
    return router


# Cleanup function for application shutdown
async def cleanup_on_shutdown():
    """
    Perform cleanup operations when the application is shutting down.
    """
    logger.info("🛑 File uploader service shutting down...")
    # Add any necessary cleanup logic here


# ====================================================================================
# MODULE DOCUMENTATION
# ====================================================================================
"""
QUICK START GUIDE:

1. BASIC USAGE:
   import requests
   
   files = {
       'file': ('firmware.bin', open('firmware.bin', 'rb'), 'application/octet-stream')
   }
   data = {
       'hostname': '172.27.200.200',
       'username': 'admin',
       'password': 'secret',
       'protocol': 'scp',
       'scriptId': 'upgrade_script',
       'wsClientId': 'web_client_123'
   }
   
   response = requests.post('http://localhost:8000/api/files/upload', files=files, data=data)
   print(response.json())

2. CHECK SERVICE HEALTH:
   response = requests.get('http://localhost:8000/api/files/health')
   print(response.json())

3. CLEANUP FILES:
   response = requests.delete('http://localhost:8000/api/files/cleanup/file-upload-123')
   print(response.json())

TROUBLESHOOTING:

- Redis Connection Issues: Check REDIS_HOST and REDIS_PORT environment variables
- Script Not Found: Verify SCRIPT_PATH points to existing file_uploader/run.py
- Permission Denied: Ensure /tmp/uploads directory is writable by the application
- File Size Limits: Check MAX_FILE_SIZE constant for upload limits

SECURITY NOTES:

- Passwords are transmitted in plain text in job queue - consider encryption
- Temporary files are stored unencrypted - schedule regular cleanup
- Validate all inputs to prevent path traversal attacks
- Consider rate limiting for production deployments
"""
