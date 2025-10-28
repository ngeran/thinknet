#!/usr/bin/env python2
# =================================================================================================
#
# FILE:               run.py
#
# OVERVIEW:
#   Enhanced version with comprehensive storage checking, better user feedback, and
#   improved error handling. Provides detailed, actionable feedback for users.
#
# NEW FEATATURES:
#   - Enhanced storage analysis with multiple filesystem checks
#   - Detailed storage recommendations and cleanup suggestions
#   - Progress tracking for storage analysis
#   - Better error messages with actionable advice
#   - Support for storage-only check mode
#   - Filesystem-specific space analysis
#
# =================================================================================================

import os
import sys
import logging
import argparse
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, Tuple, List, Optional

try:
    from jnpr.junos import Device
    from jnpr.junos.utils.scp import SCP
    from jnpr.junos.exception import RpcError
except ImportError as e:
    # If a critical dependency is missing, exit immediately with a structured error.
    print(
        json.dumps(
            {
                "success": False,
                "error": {"type": "ImportError", "message": f"Missing dependency: {e}"},
            }
        ),
        file=sys.stderr,
    )
    sys.exit(1)


# =================================================================================================
# SECTION 2: CONFIGURATION
# =================================================================================================
DEFAULT_UPLOAD_PATH = "/var/tmp/"
CONNECTION_TIMEOUT = 60
SCP_TIMEOUT = 3600
SPACE_CHECK_SAFETY_MARGIN = 1.20  # Increased to 20% buffer for safety
ALLOWED_EXTENSIONS = {
    ".tgz",
    ".txt",
    ".cfg",
    ".py",
    ".xml",
    ".json",
    ".yaml",
    ".yml",
    ".sh",
    ".conf",
    ".img",
    ".bin",
    ".pkg",
    ".tar",
    ".gz",
    ".zip",
}

# Filesystem priority for uploads (most preferred first)
PREFERRED_FILESYSTEMS = ["/var/tmp", "/var", "/tmp", "/"]

# Minimum required space for different file types (in MB)
MINIMUM_SPACE_REQUIREMENTS = {
    ".tgz": 100,
    ".img": 50,
    ".bin": 50,
    ".pkg": 100,
    ".tar": 50,
    ".gz": 50,
}


# =================================================================================================
# SECTION 3: LOGGING AND EVENT EMISSION
# =================================================================================================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - [PY-DEBUG] - %(levelname)s - %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger("juniper_uploader")


def send_event(
    event_type: str,
    message: str,
    data: Dict = None,
    stream=sys.stdout,
    run_id: str = None,
):
    """Constructs and prints a structured JSON event to the specified stream."""
    event = {
        "event_type": event_type,
        "message": message,
        "timestamp": datetime.now().isoformat(),
        "data": data or {},
    }
    if run_id:
        event["runId"] = run_id
    print(json.dumps(event), flush=True, file=stream)


# =================================================================================================
# SECTION 4: UTILITY FUNCTIONS
# =================================================================================================
def validate_file(filename: str) -> Tuple[bool, str]:
    """Enhanced file validation with size recommendations."""
    file_ext = Path(filename).suffix.lower()
    if ALLOWED_EXTENSIONS and file_ext not in ALLOWED_EXTENSIONS:
        allowed_list = ", ".join(sorted(ALLOWED_EXTENSIONS))
        return (
            False,
            f"File extension '{file_ext}' is not allowed. Allowed extensions: {allowed_list}",
        )

    # Check if this is a large file type and warn about space requirements
    min_space = MINIMUM_SPACE_REQUIREMENTS.get(file_ext, 10)
    return True, f"File validated. Minimum recommended space: {min_space} MB"


def sanitize_path(path: str) -> str:
    """Enhanced path sanitization with validation."""
    if not path or not path.strip():
        return DEFAULT_UPLOAD_PATH
    path = path.strip()
    if not path.startswith("/"):
        path = f"/{path}"
    if not path.endswith("/"):
        path = f"{path}/"

    # More comprehensive security checks
    dangerous_patterns = ["..", ";", "&", "|", "`", "$", "(", ")", "<", ">"]
    for pattern in dangerous_patterns:
        if pattern in path:
            raise ValueError(f"Invalid characters in path: {pattern}")

    return path


def format_bytes_to_mb(byte_count: int) -> str:
    """Enhanced formatting with better precision."""
    if byte_count is None:
        return "0.00"
    mb = byte_count / (1024 * 1024)
    return f"{mb:.2f}" if mb < 1000 else f"{mb:.1f}"


def format_bytes_to_gb(byte_count: int) -> str:
    """Format bytes to GB for larger numbers."""
    if byte_count is None:
        return "0.00"
    gb = byte_count / (1024 * 1024 * 1024)
    return f"{gb:.2f}"


def get_storage_cleanup_recommendations(
    used_percent: float, available_mb: float
) -> List[str]:
    """Provide actionable cleanup recommendations based on storage usage."""
    recommendations = []

    if used_percent > 90:
        recommendations.extend(
            [
                "⚠️ CRITICAL: Device storage is over 90% full",
                "• Run 'request system storage cleanup' to remove temporary files",
                "• Delete old log files: 'delete log files'",
                "• Remove unused core files from /var/tmp/",
                "• Consider archiving old configurations",
            ]
        )
    elif used_percent > 80:
        recommendations.extend(
            [
                "⚠️ WARNING: Device storage is over 80% full",
                "• Run 'request system storage cleanup'",
                "• Check for large files: 'file list /var/tmp detail'",
                "• Remove unnecessary package files",
            ]
        )
    elif used_percent > 70:
        recommendations.extend(
            [
                "ℹ️ Device storage is over 70% full",
                "• Consider running 'request system storage cleanup'",
                "• Monitor storage usage regularly",
            ]
        )

    if available_mb < 100:
        recommendations.append(
            "⚠️ Very limited space available - consider major cleanup"
        )

    return recommendations


# =================================================================================================
# SECTION 5: ENHANCED JUNIPER DEVICE MANAGER
# =================================================================================================
class JuniperDeviceManager:
    """Enhanced device manager with comprehensive storage analysis."""

    def __init__(self, hostname: str, username: str, password: str, run_id: str):
        self.hostname = hostname
        self.username = username
        self.password = password
        self.run_id = run_id
        self.device = None
        self._last_reported_progress = -1
        self._is_connected = False  # Track connection state explicitly
        logger.info(f"JuniperDeviceManager initialized for {hostname}")

    def connect(self) -> Tuple[bool, str]:
        """Enhanced connection with better error reporting."""
        logger.info("Attempting to connect to device...")
        try:
            self.device = Device(
                host=self.hostname,
                user=self.username,
                password=self.password,
                timeout=CONNECTION_TIMEOUT,
                gather_facts=False,
            )
            self.device.open()

            # Verify connection is actually working
            if not self.device.connected:
                self._is_connected = False
                return False, "Connection established but device is not responsive"

            self._is_connected = True
            logger.info(f"Successfully connected to {self.hostname}")
            return True, f"Connected to {self.hostname}"

        except Exception as e:
            self._is_connected = False
            error_msg = str(e).lower()
            if "authentication" in error_msg:
                return False, "Authentication failed - check username/password"
            elif "timeout" in error_msg:
                return (
                    False,
                    f"Connection timeout - device {self.hostname} not reachable",
                )
            elif "refused" in error_msg:
                return (
                    False,
                    f"Connection refused - check if NETCONF is enabled on {self.hostname}",
                )
            else:
                return False, f"Connection failed: {str(e)}"

    def _ensure_connected(self) -> bool:
        """Ensure device is connected before performing operations."""
        if not self._is_connected or not self.device or not self.device.connected:
            logger.error("Device not connected - attempting to reconnect")
            success, message = self.connect()
            if not success:
                logger.error(f"Reconnection failed: {message}")
                return False
        return True

    def get_comprehensive_storage_info(self) -> Dict:
        """
        Get comprehensive storage information from all filesystems.
        Returns detailed analysis for better user feedback.
        """
        logger.info("Retrieving comprehensive storage information...")

        # Ensure device is connected before making RPC calls
        if not self._ensure_connected():
            return {
                "success": False,
                "error": "Device not connected - cannot retrieve storage information",
            }

        try:
            # FIXED: Added proper device connection check before RPC call
            if not self.device:
                return {"success": False, "error": "Device object not initialized"}

            storage_info = self.device.rpc.get_system_storage()
            filesystems = []

            for fs in storage_info.findall("filesystem"):
                try:
                    filesystem_name = fs.findtext("filesystem-name", "").strip()
                    mounted_on = fs.findtext("mounted-on", "").strip()
                    total_blocks = int(fs.findtext("total-blocks", "0"))
                    used_blocks = int(fs.findtext("used-blocks", "0"))
                    available_blocks = int(fs.findtext("available-blocks", "0"))

                    block_size = 1024  # JunOS uses 1KB blocks
                    total_bytes = total_blocks * block_size
                    used_bytes = used_blocks * block_size
                    available_bytes = available_blocks * block_size

                    used_percent = (
                        (used_bytes / total_bytes) * 100 if total_bytes > 0 else 0
                    )

                    filesystem_data = {
                        "filesystem_name": filesystem_name,
                        "mounted_on": mounted_on,
                        "total_bytes": total_bytes,
                        "used_bytes": used_bytes,
                        "available_bytes": available_bytes,
                        "used_percent": round(used_percent, 1),
                        "total_mb": format_bytes_to_mb(total_bytes),
                        "available_mb": format_bytes_to_mb(available_bytes),
                        "used_mb": format_bytes_to_mb(used_bytes),
                        "priority": PREFERRED_FILESYSTEMS.index(mounted_on)
                        if mounted_on in PREFERRED_FILESYSTEMS
                        else 999,
                    }
                    filesystems.append(filesystem_data)

                except (ValueError, AttributeError) as e:
                    logger.warning(f"Error parsing filesystem data: {e}")
                    continue

            # Sort by priority (preferred filesystems first)
            filesystems.sort(key=lambda x: x["priority"])

            return {
                "success": True,
                "filesystems": filesystems,
                "timestamp": datetime.now().isoformat(),
            }

        except RpcError as e:
            logger.error(f"RPC error getting storage info: {e}")
            return {
                "success": False,
                "error": f"Could not retrieve storage information: {str(e)}",
            }
        except Exception as e:
            logger.error(f"Unexpected error getting storage info: {e}")
            return {
                "success": False,
                "error": f"Unexpected error retrieving storage: {str(e)}",
            }

    def find_best_upload_filesystem(
        self, required_space_bytes: int
    ) -> Tuple[Optional[Dict], List[Dict]]:
        """
        Find the best filesystem for upload based on space and priority.
        Returns (best_filesystem, all_suitable_filesystems)
        """
        storage_info = self.get_comprehensive_storage_info()
        if not storage_info["success"]:
            return None, []

        suitable_filesystems = []

        for fs in storage_info["filesystems"]:
            # Check if this filesystem has enough space
            if fs["available_bytes"] >= required_space_bytes:
                suitable_filesystems.append(fs)

        if not suitable_filesystems:
            return None, []

        # Sort by priority (preferred first), then by available space (most available first)
        suitable_filesystems.sort(key=lambda x: (x["priority"], -x["available_bytes"]))

        return suitable_filesystems[0], suitable_filesystems

    def perform_enhanced_pre_flight_checks(
        self, local_file_path: str, remote_dest_path: str
    ) -> Tuple[bool, str, Dict]:
        """
        Enhanced pre-flight checks with comprehensive storage analysis.
        Returns (success, message, detailed_analysis)
        """
        logger.info("Performing enhanced pre-flight checks...")

        analysis = {
            "file_size_bytes": 0,
            "required_space_bytes": 0,
            "best_filesystem": None,
            "suitable_filesystems": [],
            "storage_analysis": {},
            "recommendations": [],
        }

        try:
            # 1. Get file size and required space
            file_size_bytes = os.path.getsize(local_file_path)
            required_space_bytes = int(file_size_bytes * SPACE_CHECK_SAFETY_MARGIN)

            analysis["file_size_bytes"] = file_size_bytes
            analysis["required_space_bytes"] = required_space_bytes

            send_event(
                "PROGRESS_UPDATE",
                f"Analyzing storage requirements: {format_bytes_to_mb(required_space_bytes)} MB needed",
                {"progress": 25, "step": "storage_analysis"},
                run_id=self.run_id,
            )

            # 2. Find the best filesystem for upload
            best_fs, suitable_fs = self.find_best_upload_filesystem(
                required_space_bytes
            )
            analysis["best_filesystem"] = best_fs
            analysis["suitable_filesystems"] = suitable_fs

            send_event(
                "PROGRESS_UPDATE",
                f"Found {len(suitable_fs)} suitable filesystem(s)",
                {"progress": 50, "step": "filesystem_selection"},
                run_id=self.run_id,
            )

            if not best_fs:
                # No suitable filesystem found
                storage_info = self.get_comprehensive_storage_info()
                if storage_info["success"]:
                    analysis["storage_analysis"] = storage_info

                # Generate detailed error message with recommendations
                largest_available = (
                    max(
                        [
                            fs["available_bytes"]
                            for fs in storage_info.get("filesystems", [])
                        ]
                    )
                    if storage_info.get("filesystems")
                    else 0
                )

                error_msg = (
                    f"Insufficient disk space. Required: {format_bytes_to_mb(required_space_bytes)} MB, "
                    f"Largest available: {format_bytes_to_mb(largest_available)} MB.\n\n"
                )

                # Add filesystem details
                error_msg += "Filesystem analysis:\n"
                for fs in storage_info.get("filesystems", [])[
                    :3
                ]:  # Show top 3 filesystems
                    error_msg += f"• {fs['mounted_on']}: {fs['available_mb']} MB available ({fs['used_percent']}% used)\n"

                # Add cleanup recommendations
                if storage_info.get("filesystems"):
                    busiest_fs = max(
                        storage_info["filesystems"], key=lambda x: x["used_percent"]
                    )
                    recommendations = get_storage_cleanup_recommendations(
                        busiest_fs["used_percent"], float(busiest_fs["available_mb"])
                    )
                    analysis["recommendations"] = recommendations
                    error_msg += "\n" + "\n".join(recommendations)

                return False, error_msg, analysis

            # 3. We have a suitable filesystem
            analysis["recommendations"] = get_storage_cleanup_recommendations(
                best_fs["used_percent"], float(best_fs["available_mb"])
            )

            success_msg = (
                f"✅ Storage check passed!\n"
                f"• Required: {format_bytes_to_mb(required_space_bytes)} MB\n"
                f"• Available on {best_fs['mounted_on']}: {best_fs['available_mb']} MB\n"
                f"• Filesystem usage: {best_fs['used_percent']}%\n"
                f"• Safety margin: {int((SPACE_CHECK_SAFETY_MARGIN - 1) * 100)}%"
            )

            send_event(
                "PROGRESS_UPDATE",
                "Storage analysis complete - sufficient space available",
                {"progress": 100, "step": "storage_complete"},
                run_id=self.run_id,
            )

            return True, success_msg, analysis

        except Exception as e:
            logger.error(f"Error in enhanced pre-flight checks: {e}", exc_info=True)
            return False, f"Storage analysis failed: {str(e)}", analysis

    def _upload_progress_callback(self, filename: str, size: int, sent: int):
        """Enhanced progress callback with better reporting."""
        try:
            if size > 0:
                percent = (sent / size) * 100
                current_percent_int = int(percent)

                # Report on 5% increments or significant milestones
                report_milestones = [0, 25, 50, 75, 90, 95, 99, 100]
                should_report = (
                    current_percent_int in report_milestones
                    or current_percent_int >= self._last_reported_progress + 5
                    or sent == size
                )

                if should_report:
                    # Calculate transfer rate if possible
                    data = {
                        "progress": round(percent, 1),
                        "sent_bytes": sent,
                        "total_bytes": size,
                        "sent_mb": format_bytes_to_mb(sent),
                        "total_mb": format_bytes_to_mb(size),
                    }

                    message = f"Uploading: {percent:.1f}% ({format_bytes_to_mb(sent)}/{format_bytes_to_mb(size)} MB)"

                    send_event(
                        "PROGRESS_UPDATE",
                        message,
                        data,
                        stream=sys.stdout,
                        run_id=self.run_id,
                    )
                    self._last_reported_progress = current_percent_int

        except Exception as e:
            logger.error(f"Error in progress callback: {e}")

    def upload_file(self, local_file_path: str, remote_path: str) -> Tuple[bool, str]:
        """Enhanced upload with better progress tracking."""
        if not self._ensure_connected():
            return False, "Device is not connected."

        logger.info(f"Starting SCP upload to {remote_path}...")
        try:
            self._last_reported_progress = -1
            file_size = os.path.getsize(local_file_path)

            send_event(
                "UPLOAD_START",
                f"Beginning file transfer ({format_bytes_to_mb(file_size)} MB)",
                {"file_size_bytes": file_size},
                run_id=self.run_id,
            )

            # FIXED: Added proper device check before SCP operation
            if not self.device:
                return False, "Device not initialized for SCP transfer"

            with SCP(self.device, progress=self._upload_progress_callback) as scp:
                scp.put(local_file_path, remote_path=remote_path)

            send_event(
                "UPLOAD_COMPLETE",
                "File transfer completed successfully",
                run_id=self.run_id,
            )

            return True, "File uploaded successfully"

        except Exception as e:
            logger.error(f"SCP upload failed: {e}", exc_info=True)
            error_msg = f"Upload failed: {str(e)}"
            if "No space left" in str(e):
                error_msg += "\n\n💡 The device ran out of space during upload. Try cleaning up storage first."
            return False, error_msg

    def get_device_info(self) -> Dict:
        """Enhanced device info with more details."""
        if not self._ensure_connected():
            return {"hostname": self.hostname, "error": "Device not connected"}

        try:
            # FIXED: Added proper device check before facts refresh
            if not self.device:
                return {"hostname": self.hostname, "error": "Device not initialized"}

            self.device.facts_refresh()
            facts = self.device.facts

            device_info = {
                "hostname": facts.get("hostname", "N/A"),
                "model": facts.get("model", "N/A"),
                "version": facts.get("version", "N/A"),
                "serial_number": facts.get("serialnumber", "N/A"),
                "device_family": facts.get("model", "N/A").split("-")[0]
                if facts.get("model")
                else "N/A",
            }

            logger.info(f"Retrieved device info: {device_info}")
            return device_info

        except Exception as e:
            logger.warning(f"Could not retrieve device facts: {e}")
            return {"hostname": self.hostname, "error": str(e)}

    def disconnect(self):
        """Enhanced disconnect with logging."""
        if self.device and self.device.connected:
            logger.info("Closing device connection...")
            self.device.close()
            self._is_connected = False
            logger.info("Device connection closed.")


# =================================================================================================
# SECTION 6: STORAGE-ONLY CHECK MODE
# =================================================================================================
def storage_check_only(args: argparse.Namespace):
    """
    Run storage analysis only without uploading files.
    Provides comprehensive storage report.
    """
    device_manager = None
    try:
        send_event(
            "OPERATION_START",
            "Starting storage analysis...",
            {"mode": "storage_check"},
            run_id=args.run_id,
        )

        # Connect to device
        send_event(
            "STEP_START",
            f"Connecting to {args.hostname}...",
            run_id=args.run_id,
        )

        device_manager = JuniperDeviceManager(
            args.hostname, args.username, args.password, args.run_id
        )
        success, message = device_manager.connect()
        if not success:
            raise ConnectionError(message)

        send_event("STEP_COMPLETE", "Connected successfully", run_id=args.run_id)

        # Get comprehensive storage info
        send_event(
            "STEP_START",
            "Analyzing device storage...",
            run_id=args.run_id,
        )

        storage_info = device_manager.get_comprehensive_storage_info()
        if not storage_info["success"]:
            raise Exception(storage_info["error"])

        # Calculate required space if file is provided
        required_space = 0
        if hasattr(args, "file") and args.file and os.path.exists(args.file):
            file_size = os.path.getsize(args.file)
            required_space = int(file_size * SPACE_CHECK_SAFETY_MARGIN)

        # Generate storage report
        report = {
            "success": True,
            "runId": args.run_id,
            "storage_report": {
                "timestamp": datetime.now().isoformat(),
                "device": args.hostname,
                "required_space_mb": format_bytes_to_mb(required_space)
                if required_space
                else "N/A",
                "filesystems": storage_info["filesystems"],
                "summary": {
                    "total_filesystems": len(storage_info["filesystems"]),
                    "suitable_for_upload": len(
                        [
                            fs
                            for fs in storage_info["filesystems"]
                            if fs["available_bytes"] >= required_space
                        ]
                    )
                    if required_space
                    else "N/A",
                    "total_available_space_mb": sum(
                        [fs["available_bytes"] for fs in storage_info["filesystems"]]
                    )
                    / (1024 * 1024),
                },
            },
        }

        send_event("STEP_COMPLETE", "Storage analysis complete", run_id=args.run_id)

        # Print the comprehensive report
        print(json.dumps(report), flush=True)
        sys.exit(0)

    except Exception as e:
        error_result = {
            "success": False,
            "runId": args.run_id,
            "error": {"type": type(e).__name__, "message": str(e)},
        }
        print(json.dumps(error_result), flush=True)
        if device_manager:
            device_manager.disconnect()
        sys.exit(1)


# =================================================================================================
# SECTION 7: ENHANCED CLI UPLOAD
# =================================================================================================
def cli_upload(args: argparse.Namespace):
    """Enhanced CLI upload with better feedback and error handling."""
    device_manager = None
    try:
        # -----------------------------------------------------------------------------------------
        # OPERATION START
        # -----------------------------------------------------------------------------------------
        send_event(
            "OPERATION_START",
            "File upload process initiated",
            {"total_steps": 5},
            run_id=args.run_id,
        )

        # -----------------------------------------------------------------------------------------
        # STEP 1: VALIDATION
        # -----------------------------------------------------------------------------------------
        send_event(
            "STEP_START",
            "Validating inputs...",
            run_id=args.run_id,
        )

        if not all(
            [
                args.hostname,
                args.username,
                args.password,
                args.file,
                args.remote_filename,
            ]
        ):
            raise ValueError("Missing required arguments")

        local_file_path = args.file
        if not os.path.exists(local_file_path):
            raise FileNotFoundError(f"File not found: {local_file_path}")

        file_size = os.path.getsize(local_file_path)
        is_valid, msg = validate_file(args.remote_filename)
        if not is_valid:
            raise ValueError(msg)

        upload_directory = sanitize_path(args.path or DEFAULT_UPLOAD_PATH)
        full_remote_path = os.path.join(upload_directory, args.remote_filename).replace(
            "//", "/"
        )

        send_event(
            "STEP_COMPLETE",
            f"Validation passed - File size: {format_bytes_to_mb(file_size)} MB",
            run_id=args.run_id,
        )

        # -----------------------------------------------------------------------------------------
        # STEP 2: CONNECTION
        # -----------------------------------------------------------------------------------------
        send_event(
            "STEP_START",
            f"Connecting to {args.hostname}...",
            run_id=args.run_id,
        )

        device_manager = JuniperDeviceManager(
            args.hostname, args.username, args.password, args.run_id
        )
        success, message = device_manager.connect()
        if not success:
            raise ConnectionError(message)

        send_event("STEP_COMPLETE", message, run_id=args.run_id)

        # -----------------------------------------------------------------------------------------
        # STEP 3: ENHANCED PRE-FLIGHT CHECKS
        # -----------------------------------------------------------------------------------------
        send_event(
            "STEP_START",
            "Performing comprehensive storage analysis...",
            run_id=args.run_id,
        )

        success, message, analysis = device_manager.perform_enhanced_pre_flight_checks(
            local_file_path, full_remote_path
        )
        if not success:
            # Include the detailed analysis in the error
            error_msg = f"Storage check failed:\n\n{message}"
            if analysis.get("recommendations"):
                error_msg += "\n\n" + "\n".join(analysis["recommendations"])
            raise ValueError(error_msg)

        send_event(
            "STEP_COMPLETE",
            "Storage analysis passed",
            {"analysis_summary": analysis},
            run_id=args.run_id,
        )

        # -----------------------------------------------------------------------------------------
        # STEP 4: FILE UPLOAD
        # -----------------------------------------------------------------------------------------
        send_event(
            "STEP_START",
            f"Uploading {args.remote_filename}...",
            run_id=args.run_id,
        )

        success, message = device_manager.upload_file(local_file_path, full_remote_path)
        if not success:
            raise IOError(message)

        send_event("STEP_COMPLETE", "Upload completed", run_id=args.run_id)

        # -----------------------------------------------------------------------------------------
        # STEP 5: FINALIZATION
        # -----------------------------------------------------------------------------------------
        send_event(
            "STEP_START",
            "Finalizing...",
            run_id=args.run_id,
        )

        device_info = device_manager.get_device_info()
        device_manager.disconnect()

        send_event("STEP_COMPLETE", "Disconnected from device", run_id=args.run_id)

        # -----------------------------------------------------------------------------------------
        # SUCCESS RESULT
        # -----------------------------------------------------------------------------------------
        final_result = {
            "success": True,
            "runId": args.run_id,
            "details": {
                "summary": "File uploaded successfully",
                "filename": args.remote_filename,
                "remote_path": full_remote_path,
                "file_size_mb": format_bytes_to_mb(file_size),
                "device_info": device_info,
                "upload_timestamp": datetime.now().isoformat(),
            },
        }
        print(json.dumps(final_result), flush=True)
        sys.exit(0)

    except Exception as e:
        # -----------------------------------------------------------------------------------------
        # ENHANCED ERROR HANDLING
        # -----------------------------------------------------------------------------------------
        error_type = type(e).__name__
        error_message = str(e)

        # Add context-specific advice
        if "authentication" in error_message.lower():
            error_message += "\n💡 Check username/password and ensure user has appropriate permissions"
        elif (
            "connection" in error_message.lower() or "timeout" in error_message.lower()
        ):
            error_message += f"\n💡 Verify device {args.hostname} is reachable and NETCONF is enabled"
        elif "space" in error_message.lower() or "disk" in error_message.lower():
            error_message += (
                "\n💡 Use 'show system storage' on device to check available space"
            )
        elif "file not found" in error_message.lower():
            error_message += "\n💡 Verify the file exists and path is correct"

        error_result = {
            "success": False,
            "runId": args.run_id,
            "error": {
                "type": error_type,
                "message": error_message,
                "timestamp": datetime.now().isoformat(),
            },
        }
        print(json.dumps(error_result), flush=True)
        if device_manager:
            device_manager.disconnect()
        sys.exit(1)


# =================================================================================================
# SECTION 8: MAIN EXECUTION
# =================================================================================================
def main():
    """Enhanced main function with storage-only check mode."""
    parser = argparse.ArgumentParser(
        description="Enhanced Juniper File Upload Service with Storage Analysis",
        formatter_class=argparse.RawTextHelpFormatter,
    )

    # Required Arguments
    parser.add_argument(
        "--run-id", required=True, help="Unique identifier for this run"
    )
    parser.add_argument(
        "--mode",
        choices=["cli", "storage-check"],
        required=True,
        help='Operation mode: "cli" for upload, "storage-check" for analysis only',
    )
    parser.add_argument("--hostname", required=True, help="Device hostname or IP")
    parser.add_argument("--username", required=True, help="Authentication username")
    parser.add_argument("--password", required=True, help="Authentication password")

    # File-related arguments (required for cli mode, optional for storage-check)
    parser.add_argument("--file", help="Local file path to upload")
    parser.add_argument("--remote-filename", help="Filename on remote device")

    # Optional arguments
    parser.add_argument(
        "--path", help=f"Remote directory (default: {DEFAULT_UPLOAD_PATH})"
    )

    args = parser.parse_args()

    # Validate mode-specific requirements
    if args.mode == "cli" and not all([args.file, args.remote_filename]):
        parser.error("--file and --remote-filename are required in cli mode")

    if args.mode == "cli":
        cli_upload(args)
    elif args.mode == "storage-check":
        storage_check_only(args)


if __name__ == "__main__":
    main()
