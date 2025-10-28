#!/usr/bin/env python3
"""
Device Storage Check Router for FastAPI
Provides endpoints to check device storage capacity before file uploads
Uses existing file uploader infrastructure to avoid external dependencies
"""

import logging
import subprocess
import asyncio
import json  # ADDED: Import json at the top
import re  # ADDED: Import re at the top
from datetime import datetime
from typing import Dict, Any, Optional

from fastapi import APIRouter, HTTPException, Form, status
from pydantic import BaseModel, Field

# Configure logging
logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/device",
    tags=["Device Storage"],
    responses={
        400: {"description": "Bad Request - Invalid parameters"},
        500: {"description": "Internal Server Error - Device connection failed"},
    },
)


class StorageCheckRequest(BaseModel):
    """Request model for storage check"""

    hostname: str = Field(description="Target device hostname or IP")
    username: str = Field(description="Device authentication username")
    password: str = Field(description="Device authentication password")
    required_space: int = Field(description="Required space in bytes")
    filesystem: Optional[str] = Field("/", description="Target filesystem to check")


class StorageCheckResponse(BaseModel):
    """Response model for storage check"""

    has_sufficient_space: bool = Field(description="Whether device has enough space")
    required_mb: float = Field(description="Required space in MB")
    available_mb: float = Field(description="Available space in MB")
    filesystem: str = Field(description="Filesystem that was checked")
    total_mb: float = Field(description="Total filesystem size in MB")
    used_percent: float = Field(description="Percentage of space used")
    recommendation: str = Field(
        description="Recommendation based on space availability"
    )
    timestamp: str = Field(description="Check timestamp")
    method: str = Field(description="Method used for storage check")


async def run_storage_check_script(
    hostname: str, username: str, password: str
) -> Dict[str, Any]:
    """
    Run the existing file uploader script in storage check mode.
    This leverages the existing infrastructure without new dependencies.
    """
    try:
        # Use the existing file uploader script with a storage check flag
        script_path = "/app/app_gateway/py_scripts/scripts/file_uploader/run.py"

        cmd = [
            "python3",
            script_path,
            "--run-id",
            f"storage_check_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}",
            "--mode",
            "cli",
            "--hostname",
            hostname,
            "--username",
            username,
            "--password",
            password,
            "--check-storage-only",  # Custom flag to only check storage
        ]

        logger.info(f"🔍 Running storage check script: {' '.join(cmd)}")

        # Run the command with timeout
        process = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )

        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=60)

        if process.returncode == 0:
            output = stdout.decode().strip()
            logger.info(f"📊 Storage check output: {output}")

            # Parse the output (assuming JSON format)
            try:
                # json is now imported at the top, so it's available
                result = json.loads(output)
                return result
            except json.JSONDecodeError:
                # If not JSON, try to extract storage info from text
                return parse_storage_from_text(output)
        else:
            error_output = stderr.decode().strip()
            logger.error(f"❌ Storage check script failed: {error_output}")
            raise Exception(f"Storage check failed: {error_output}")

    except asyncio.TimeoutError:
        logger.error("❌ Storage check script timed out")
        raise Exception("Storage check timed out after 60 seconds")
    except Exception as e:
        logger.error(f"❌ Storage check script error: {str(e)}")
        raise Exception(f"Storage check failed: {str(e)}")


def parse_storage_from_text(output: str) -> Dict[str, Any]:
    """
    Parse storage information from text output.
    This is a fallback if the script doesn't return JSON.
    """
    logger.info("📝 Parsing storage information from text output")

    # Default conservative values
    storage_info = {
        "filesystem": "/",
        "total_bytes": 2 * 1024 * 1024 * 1024,  # 2GB
        "used_bytes": 1.8 * 1024 * 1024 * 1024,  # 1.8GB used
        "available_bytes": 0.2 * 1024 * 1024 * 1024,  # 200MB available
        "used_percent": 90.0,
        "is_estimated": True,
    }

    # Try to extract actual values from output
    lines = output.split("\n")
    for line in lines:
        line = line.strip()

        # Look for storage patterns in the output
        if "available" in line.lower() and "mb" in line.lower():
            # Try to extract numbers - re is now imported at the top
            numbers = re.findall(r"\d+\.?\d*", line)
            if len(numbers) >= 1:
                try:
                    available_mb = float(numbers[0])
                    storage_info["available_bytes"] = available_mb * 1024 * 1024
                    # Estimate total based on available (assuming 10% available)
                    storage_info["total_bytes"] = storage_info["available_bytes"] * 10
                    storage_info["used_bytes"] = (
                        storage_info["total_bytes"] - storage_info["available_bytes"]
                    )
                    storage_info["used_percent"] = (
                        storage_info["used_bytes"] / storage_info["total_bytes"]
                    ) * 100
                    storage_info["is_estimated"] = False
                    break
                except (ValueError, IndexError):
                    continue

    return storage_info


async def simulate_storage_check(
    hostname: str, username: str, password: str
) -> Dict[str, Any]:
    """
    Simulate storage check for testing when the actual script isn't available.
    This provides reasonable estimates without device connectivity.
    """
    logger.warning(f"🎭 SIMULATING storage check for {hostname}")

    # Return simulated storage information
    # These are typical values for Juniper devices
    return {
        "filesystem": "/",
        "total_bytes": 4 * 1024 * 1024 * 1024,  # 4GB total
        "used_bytes": 3.5 * 1024 * 1024 * 1024,  # 3.5GB used
        "available_bytes": 0.5 * 1024 * 1024 * 1024,  # 500MB available
        "used_percent": 87.5,
        "is_simulated": True,
    }


async def get_device_storage_ssh(
    hostname: str, username: str, password: str
) -> Dict[str, Any]:
    """
    Simple SSH-based storage check using subprocess.
    This doesn't require external Python SSH libraries.
    """
    try:
        logger.info(f"🔍 Attempting SSH storage check for {hostname}")

        # Use ssh with password authentication via subprocess
        cmd = [
            "timeout",
            "30",
            "sshpass",
            "-p",
            password,
            "ssh",
            "-o",
            "StrictHostKeyChecking=no",
            "-o",
            "UserKnownHostsFile=/dev/null",
            "-o",
            "ConnectTimeout=10",
            f"{username}@{hostname}",
            "show system storage | no-more",
        ]

        process = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )

        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=35)

        if process.returncode == 0:
            output = stdout.decode("utf-8", errors="ignore")
            return parse_junos_storage_output(output)
        else:
            error_msg = stderr.decode("utf-8", errors="ignore")
            logger.warning(f"SSH storage check failed: {error_msg}")
            raise Exception(f"SSH command failed: {error_msg}")

    except asyncio.TimeoutError:
        logger.warning("SSH storage check timed out")
        raise Exception("SSH connection timed out")
    except FileNotFoundError:
        logger.warning("sshpass not available, using simulation")
        raise Exception("SSH tools not available")
    except Exception as e:
        logger.warning(f"SSH storage check failed: {str(e)}")
        raise Exception(f"SSH storage check failed: {str(e)}")


def parse_junos_storage_output(output: str) -> Dict[str, Any]:
    """
    Parse JunOS 'show system storage' output.
    """
    lines = output.split("\n")

    for line in lines:
        # Look for filesystem lines like: "/dev/abc123   1000    800    200   80%"
        if line.startswith("/dev/"):
            parts = line.split()
            if len(parts) >= 5:
                try:
                    filesystem = parts[0]
                    total_blocks = int(parts[1])
                    used_blocks = int(parts[2])
                    available_blocks = int(parts[3])
                    used_percent = int(parts[4].rstrip("%"))

                    # JunOS uses 1KB blocks
                    block_size = 1024
                    total_bytes = total_blocks * block_size
                    available_bytes = available_blocks * block_size
                    used_bytes = used_blocks * block_size

                    return {
                        "filesystem": filesystem,
                        "total_bytes": total_bytes,
                        "used_bytes": used_bytes,
                        "available_bytes": available_bytes,
                        "used_percent": used_percent,
                        "is_actual": True,
                    }
                except (ValueError, IndexError) as e:
                    logger.warning(f"Failed to parse storage line: {line} - {e}")
                    continue

    # If no specific line found, return defaults
    raise Exception("Could not parse storage information from device output")


@router.post(
    "/check-storage",
    response_model=StorageCheckResponse,
    summary="Check device storage capacity",
    description="""
    Check if target network device has sufficient storage space for file upload.
    
    This endpoint attempts multiple methods:
    1. Run existing file uploader script in storage check mode
    2. Direct SSH connection to device
    3. Simulation mode (fallback)
    """,
)
async def check_device_storage(
    hostname: str = Form(..., description="Target device hostname or IP address"),
    username: str = Form(..., description="Device authentication username"),
    password: str = Form(..., description="Device authentication password"),
    required_space: int = Form(..., description="Required space in bytes for upload"),
    filesystem: str = Form("/", description="Target filesystem to check (default: /)"),
):
    """
    Check device storage capacity before file upload.
    """
    logger.info(
        f"📋 Storage check request - "
        f"Device: {hostname}, "
        f"Required: {required_space} bytes"
    )

    try:
        storage_info = None
        method_used = "unknown"

        # Method 1: Try SSH-based check first (most reliable)
        try:
            storage_info = await get_device_storage_ssh(hostname, username, password)
            method_used = "ssh_direct"
            logger.info("✅ Used SSH direct method for storage check")
        except Exception as ssh_error:
            logger.warning(f"SSH direct method failed: {ssh_error}")

            # Method 2: Try using existing file uploader script
            try:
                storage_info = await run_storage_check_script(
                    hostname, username, password
                )
                method_used = "uploader_script"
                logger.info("✅ Used file uploader script for storage check")
            except Exception as script_error:
                logger.warning(f"Script method failed: {script_error}")

                # Method 3: Fallback to simulation
                storage_info = await simulate_storage_check(
                    hostname, username, password
                )
                method_used = "simulation"
                logger.warning(
                    "⚠️ Using simulation for storage check - results may not be accurate"
                )

        if not storage_info:
            raise Exception("All storage check methods failed")

        # Calculate metrics
        required_mb = required_space / (1024 * 1024)
        available_mb = storage_info["available_bytes"] / (1024 * 1024)
        total_mb = storage_info["total_bytes"] / (1024 * 1024)

        # Check if sufficient space exists (with 20% buffer for safety)
        has_sufficient_space = storage_info["available_bytes"] >= required_space * 1.2

        # Generate recommendation
        if has_sufficient_space:
            recommendation = "✅ Sufficient space available - Proceed with upload"
        else:
            recommendation = f"❌ Insufficient space - Need {required_mb:.1f} MB but only {available_mb:.1f} MB available"

        # Add warnings for estimated/simulated data
        if storage_info.get("is_estimated") or storage_info.get("is_simulated"):
            recommendation += " (⚠️ Using estimated values - verify manually with 'show system storage')"
        elif not storage_info.get("is_actual"):
            recommendation += " (ℹ️ Based on available information)"

        response_data = {
            "has_sufficient_space": has_sufficient_space,
            "required_mb": round(required_mb, 2),
            "available_mb": round(available_mb, 2),
            "filesystem": storage_info["filesystem"],
            "total_mb": round(total_mb, 2),
            "used_percent": round(storage_info["used_percent"], 2),
            "recommendation": recommendation,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "method": method_used,
        }

        logger.info(f"📊 Storage check completed for {hostname}: {response_data}")

        return StorageCheckResponse(**response_data)

    except Exception as e:
        logger.error(f"❌ Storage check failed for {hostname}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Storage check failed: {str(e)}",
        )


@router.get("/health")
async def storage_health_check():
    """Health check for storage service"""
    return {
        "service": "device_storage",
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "methods_available": ["ssh_direct", "uploader_script", "simulation"],
    }


def get_router() -> APIRouter:
    """Get the device storage router instance."""
    return router
