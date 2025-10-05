#!/usr/bin/env python3
# =================================================================================================
#
# FILE:               run.py
#
# OVERVIEW:
#   A robust and intelligent Python backend script for securely uploading files to Juniper
#   devices using the Junos PyEZ library. This script is designed to be executed in a
#   containerized environment, providing detailed, structured feedback for consumption
#   by a frontend application via a WebSocket stream.
#
# KEY FEATURES:
#   - Pre-flight Checks: Proactively verifies sufficient disk space on the target device
#     before initiating the transfer, preventing failed uploads and providing immediate,
#     actionable feedback to the user.
#   - Structured JSON Event Emission: Communicates progress and results through a series
#     of well-defined JSON objects, enabling rich, real-time UI updates.
#   - Accurate, Non-Flooding Progress Reporting: Uses a stateful, threshold-based
#     callback to report SCP upload progress in clean increments without overwhelming the
#     event stream.
#   - Safe Progress Reporting via Stderr: Emits fine-grained `PROGRESS_UPDATE` events to
#     `stderr`, preventing any interference with the `stdout`-based SCP protocol, which is a
#     critical feature for stability.
#   - Robust Error Handling & Graceful Exit: Captures exceptions at each stage and reports
#     them in a structured final JSON error object, ensuring the frontend can display clear
#     and specific error messages.
#   - Original Filename Preservation: Ensures the file arrives on the remote device with
#     the same name the user selected in the UI.
#
# DEPENDENCIES:
#   - jnpr-pyez: The official Juniper library for automating Junos devices.
#
# HOW-TO GUIDE (INTEGRATION):
#   This script is intended to be executed by a backend service (e.g., a Node.js API)
#   in response to a user request. The service is responsible for spawning this script
#   in a container and passing all required parameters as command-line arguments.
#
# HOW-TO GUIDE (CLI EXECUTION):
#   The script is fully operable via the command line for testing and automation. The '-u'
#   flag in the python command is critical to ensure unbuffered output for real-time streaming.
#
#   Example Command:
#   docker run --rm -v /path/to/local/files:/uploads vlabs-python-runner \\
#     python -u /path/to/script/run.py \\
#       --mode cli \\
#       --run-id "test-run-123" \\
#       --hostname "192.168.1.1" \\
#       --username "admin" \\
#       --password "juniper123" \\
#       --file "/uploads/temp-file-name.tgz" \\
#       --remote-filename "junos-install-image.tgz" \\
#       --path "/var/tmp/"
#
# =================================================================================================


# =================================================================================================
# SECTION 1: IMPORTS
# All necessary standard library and third-party modules are imported here.
# =================================================================================================
import os
import sys
import logging
import argparse
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, Tuple

try:
    from jnpr.junos import Device
    from jnpr.junos.utils.scp import SCP
    from jnpr.junos.exception import RpcError
except ImportError as e:
    # If a critical dependency is missing, exit immediately with a structured error.
    print(json.dumps({"success": False, "error": {"type": "ImportError", "message": f"Missing dependency: {e}"}}), file=sys.stderr)
    sys.exit(1)


# =================================================================================================
# SECTION 2: CONFIGURATION
# Centralized constants for easy tuning and maintenance.
# =================================================================================================
DEFAULT_UPLOAD_PATH = "/var/tmp/"
CONNECTION_TIMEOUT = 60
SCP_TIMEOUT = 3600
# Define a safety buffer (e.g., 1.10 for 10%) for the disk space check.
SPACE_CHECK_SAFETY_MARGIN = 1.10
# Define allowed file extensions for security and validation.
ALLOWED_EXTENSIONS = {'.tgz', '.txt', '.cfg', '.py', '.xml', '.json', '.yaml', '.yml', '.sh', '.conf', '.img'}


# =================================================================================================
# SECTION 3: LOGGING AND EVENT EMISSION
# Setup for both internal debug logging and structured event emission for the frontend.
# =================================================================================================
# Configure a logger for detailed internal diagnostics, printed to stderr.
logging.basicConfig(level=logging.INFO, format='%(asctime)s - [PY-DEBUG] - %(levelname)s - %(message)s', stream=sys.stderr)
logger = logging.getLogger('juniper_uploader')

def send_event(event_type: str, message: str, data: Dict = None, stream=sys.stdout, run_id: str = None):
    """Constructs and prints a structured JSON event to the specified stream."""
    event = {
        "event_type": event_type,
        "message": message,
        "timestamp": datetime.now().isoformat(),
        "data": data or {}
    }
    if run_id:
        event["runId"] = run_id
    print(json.dumps(event), flush=True, file=stream)


# =================================================================================================
# SECTION 4: UTILITY FUNCTIONS
# Helper functions for validation, sanitization, and formatting.
# =================================================================================================
def validate_file(filename: str) -> Tuple[bool, str]:
    """Checks if the file extension is in the allowed list."""
    file_ext = Path(filename).suffix.lower()
    if ALLOWED_EXTENSIONS and file_ext not in ALLOWED_EXTENSIONS:
        return False, f"File extension '{file_ext}' is not allowed."
    return True, "File validation passed."

def sanitize_path(path: str) -> str:
    """Sanitizes the remote directory path to prevent security issues."""
    if not path or not path.strip(): return DEFAULT_UPLOAD_PATH
    path = path.strip()
    if not path.startswith('/'): path = f"/{path}"
    if not path.endswith('/'): path = f"{path}/"
    # Remove potentially dangerous characters/sequences.
    for char in ['..', ';', '&', '|', '`', '$']:
        path = path.replace(char, '')
    return path

def format_bytes_to_mb(byte_count: int) -> str:
    """Converts a byte count to a human-readable MB string."""
    if byte_count is None: return "0.00"
    return f"{byte_count / (1024 * 1024):.2f}"


# =================================================================================================
# SECTION 5: JUNIPER DEVICE MANAGER
# A class encapsulating all interactions with the Junos device.
# =================================================================================================
class JuniperDeviceManager:
    """Manages the connection, pre-flight checks, and file operations for a Juniper device."""

    def __init__(self, hostname: str, username: str, password: str, run_id: str):
        self.hostname = hostname
        self.username = username
        self.password = password
        self.run_id = run_id
        self.device = None
        # State for reporting progress in clean, non-flooding increments.
        self._last_reported_progress = -1
        logger.info(f"JuniperDeviceManager initialized for host {hostname} and run_id {run_id}")

    def connect(self) -> Tuple[bool, str]:
        """Establishes a secure NETCONF connection to the Juniper device."""
        logger.info("Attempting to connect to device...")
        try:
            self.device = Device(host=self.hostname, user=self.username, password=self.password, timeout=CONNECTION_TIMEOUT, gather_facts=False)
            self.device.open()
            logger.info(f"Successfully connected to host. Device is open: {self.device.connected}")
            return True, "Connection established successfully"
        except Exception as e:
            logger.error(f"Failed to connect: {e}", exc_info=True)
            return False, f"Failed to connect: {str(e)}"
    # ==============================PRE CHECKS======================================================
    def perform_pre_flight_checks(self, local_file_path: str, remote_dest_path: str) -> Tuple[bool, str]:
        """
        Performs checks on the remote device using a robust filesystem matching algorithm.
        """
        logger.info("Performing pre-flight checks on remote device...")
        try:
            # 1. Get the required file size, including a safety margin.
            file_size_bytes = os.path.getsize(local_file_path)
            required_space_bytes = int(file_size_bytes * SPACE_CHECK_SAFETY_MARGIN)

            # 2. Get the system storage information from the device.
            logger.info("Checking remote system storage via RPC...")
            storage_info = self.device.rpc.get_system_storage()

            # 3. Find the BEST filesystem match for the destination path.
            # The "best" match is the mount point with the longest common prefix.
            best_match_fs = None
            longest_match_len = -1

            # Loop through ALL filesystems without breaking early.
            for fs in storage_info.findall('filesystem'):
                # Safely get the mount point, stripping any whitespace.
                mount_point = fs.findtext('mounted-on', default='').strip()
                if not mount_point:
                    continue # Skip this filesystem if it has no mount point.

                # Check if our destination path is located within this filesystem.
                if remote_dest_path.startswith(mount_point):
                    # If it is, check if this match is better (longer) than any previous match.
                    if len(mount_point) > longest_match_len:
                        # We found a new best match. Record it.
                        longest_match_len = len(mount_point)
                        best_match_fs = fs

            # 4. After checking all filesystems, see if we found a viable candidate.
            if best_match_fs is None:
                # If no match was ever found, the original error was correct. Abort.
                return False, f"Could not determine the target filesystem for path '{remote_dest_path}'."

            # We now have the correct filesystem. Proceed with this one.
            target_fs = best_match_fs
            target_mount_point = target_fs.findtext('mounted-on')

            # 5. Get the available space on that filesystem.
            available_bytes = int(target_fs.findtext('available-blocks'))

            # 6. Compare required space vs. available space.
            logger.info(f"Required space: ~{format_bytes_to_mb(required_space_bytes)} MB. Available: {format_bytes_to_mb(available_bytes)} MB on '{target_mount_point}'.")
            if available_bytes < required_space_bytes:
                error_msg = (
                    f"Insufficient space on device filesystem '{target_mount_point}'. "
                    f"Required: ~{format_bytes_to_mb(required_space_bytes)} MB, "
                    f"Available: {format_bytes_to_mb(available_bytes)} MB."
                )
                return False, error_msg

            logger.info("Disk space check passed.")
            return True, "Pre-flight checks passed successfully."

        except RpcError as e:
            logger.error(f"RPC error during pre-flight check: {e}", exc_info=True)
            return False, f"Could not retrieve device storage information: {str(e)}"
        except Exception as e:
            logger.error(f"An unexpected error occurred during pre-flight checks: {e}", exc_info=True)
            return False, f"An unexpected error occurred during pre-flight checks: {str(e)}"

    # ==============================PROGRESS CALL===================================================
    def _upload_progress_callback(self, filename: str, size: int, sent: int):
        """A stateful callback that reports progress in clean, ~5% increments."""
        try:
            if size > 0:
                percent = (sent / size) * 100
                current_percent_int = int(percent)
                # Report if progress has crossed a 5% threshold or if it's the final packet.
                if (current_percent_int >= self._last_reported_progress + 5) or (sent == size):
                    send_event(
                        "PROGRESS_UPDATE",
                        f"Uploading {filename.decode('utf-8') if isinstance(filename, bytes) else filename}: {percent:.1f}%",
                        {"progress": percent, "sent": sent, "total": size},
                        stream=sys.stdout, # Send to stderr to not interfere with SCP
                        run_id=self.run_id
                    )
                    self._last_reported_progress = current_percent_int
        except Exception as e:
            logger.error(f"Error in progress callback: {e}", exc_info=True)

    def upload_file(self, local_file_path: str, remote_path: str) -> Tuple[bool, str]:
        """Uploads a local file using the PyEZ SCP utility with a progress callback."""
        if not self.device or not self.device.connected:
            return False, "Device is not connected."
        logger.info(f"Starting SCP upload of {local_file_path} to {self.hostname}:{remote_path}...")
        try:
            # Reset the progress tracker before every new upload.
            self._last_reported_progress = -1
            with SCP(self.device, progress=self._upload_progress_callback) as scp:
                scp.put(local_file_path, remote_path=remote_path)
            logger.info("SCP put command completed.")
            return True, "File uploaded successfully"
        except Exception as e:
            logger.error(f"SCP upload failed: {e}", exc_info=True)
            return False, f"SCP upload failed: {str(e)}"

    def get_device_info(self) -> Dict:
        """Retrieves basic facts (hostname, model, version) from the connected device."""
        if not self.device: return {}
        try:
            logger.info("Refreshing device facts...")
            self.device.facts_refresh()
            facts = self.device.facts
            device_info = {
                'hostname': facts.get('hostname', 'N/A'),
                'model': facts.get('model', 'N/A'),
                'version': facts.get('version', 'N/A'),
            }
            logger.info(f"Successfully retrieved device facts: {device_info}")
            return device_info
        except Exception as e:
            logger.warning(f"Could not retrieve device facts: {e}", exc_info=True)
            return {'hostname': self.hostname}

    def disconnect(self):
        """Closes the connection to the device if it's open."""
        if self.device and self.device.connected:
            logger.info("Disconnecting from device.")
            self.device.close()
            logger.info("Device connection closed.")


# =================================================================================================
# SECTION 6: CLI MODE EXECUTION LOGIC
# This is the main workflow orchestrator when the script is run with `--mode cli`.
# =================================================================================================
def cli_upload(args: argparse.Namespace):
    """Handles the end-to-end file upload process, emitting structured JSON events."""
    device_manager = None
    try:
        # -----------------------------------------------------------------------------------------
        # OPERATION START: Announce the beginning of the process.
        # -----------------------------------------------------------------------------------------
        send_event("OPERATION_START", "File upload process initiated.", {"total_steps": 5}, run_id=args.run_id)

        # -----------------------------------------------------------------------------------------
        # STEP 1: INPUT VALIDATION AND NORMALIZATION
        # -----------------------------------------------------------------------------------------
        send_event("STEP_START", "Validating file and connection parameters...", run_id=args.run_id)
        if not all([args.hostname, args.username, args.password, args.file, args.remote_filename]):
            raise ValueError("Missing required arguments: hostname, username, password, file, and remote_filename are required.")
        local_file_path = args.file
        if not os.path.exists(local_file_path):
            raise FileNotFoundError(f"Source file not found at path: {local_file_path}")
        is_valid, msg = validate_file(args.remote_filename)
        if not is_valid:
            raise ValueError(f"File validation failed: {msg}")
        upload_directory = sanitize_path(args.path or DEFAULT_UPLOAD_PATH)
        full_remote_path = os.path.join(upload_directory, args.remote_filename).replace('//','/')
        send_event("STEP_COMPLETE", "Validation successful.", run_id=args.run_id)

        # -----------------------------------------------------------------------------------------
        # STEP 2: DEVICE CONNECTION
        # -----------------------------------------------------------------------------------------
        send_event("STEP_START", f"Connecting to device: {args.hostname}...", run_id=args.run_id)
        device_manager = JuniperDeviceManager(args.hostname, args.username, args.password, run_id=args.run_id)
        success, message = device_manager.connect()
        if not success:
            raise ConnectionError(message)
        send_event("STEP_COMPLETE", "Successfully connected to device.", run_id=args.run_id)

        # -----------------------------------------------------------------------------------------
        # STEP 3: PRE-FLIGHT CHECKS
        # -----------------------------------------------------------------------------------------
        send_event("STEP_START", "Performing pre-flight checks (e.g., disk space)...", run_id=args.run_id)
        success, message = device_manager.perform_pre_flight_checks(local_file_path, full_remote_path)
        if not success:
            raise ValueError(message)
        send_event("STEP_COMPLETE", "Pre-flight checks passed.", run_id=args.run_id)

        # -----------------------------------------------------------------------------------------
        # STEP 4: FILE UPLOAD VIA SCP
        # -----------------------------------------------------------------------------------------
        send_event("STEP_START", f"Uploading {args.remote_filename} to {upload_directory}...", run_id=args.run_id)
        success, message = device_manager.upload_file(local_file_path, full_remote_path)
        if not success:
            raise IOError(message)
        send_event("STEP_COMPLETE", "File uploaded successfully.", run_id=args.run_id)

        # -----------------------------------------------------------------------------------------
        # STEP 5: FINALIZE AND DISCONNECT
        # -----------------------------------------------------------------------------------------
        send_event("STEP_START", "Gathering final device info and disconnecting...", run_id=args.run_id)
        device_info = device_manager.get_device_info()
        device_manager.disconnect()
        send_event("STEP_COMPLETE", "Disconnected from device.", run_id=args.run_id)

        # -----------------------------------------------------------------------------------------
        # FINAL SUCCESS HANDLER: Report a successful outcome.
        # -----------------------------------------------------------------------------------------
        final_result = {
            "success": True,
            "runId": args.run_id,
            "details": {
                "summary": "File was uploaded and verified successfully.",
                "filename": args.remote_filename,
                "remote_path": full_remote_path,
                "device_info": device_info
            }
        }
        print(json.dumps(final_result), flush=True)
        sys.exit(0)

    except Exception as e:
        # -----------------------------------------------------------------------------------------
        # GLOBAL FAILURE HANDLER: Catch any exception and report it gracefully.
        # -----------------------------------------------------------------------------------------
        error_result = {
            "success": False,
            "runId": args.run_id,
            "error": { "type": type(e).__name__, "message": str(e) }
        }
        print(json.dumps(error_result), flush=True)
        if device_manager:
            device_manager.disconnect()
        sys.exit(1)


# =================================================================================================
# SECTION 7: MAIN EXECUTION BLOCK
# Parses command-line arguments and triggers the appropriate execution mode.
# =================================================================================================
def main():
    """Main entry point for the application."""
    parser = argparse.ArgumentParser(
        description='Juniper File Upload Service with Pre-flight Checks.',
        formatter_class=argparse.RawTextHelpFormatter
    )
    # --- Required Arguments ---
    parser.add_argument('--run-id', required=True, help='Unique identifier for the run, passed from the backend.')
    parser.add_argument('--mode', choices=['cli'], required=True, help='Operation mode (only "cli" is fully implemented).')
    parser.add_argument('--hostname', required=True, help='Router hostname or IP address.')
    parser.add_argument('--username', required=True, help='Router username for authentication.')
    parser.add_argument('--password', required=True, help='Router password for authentication.')
    parser.add_argument('--file', required=True, help='Full path to the local temporary file to upload.')
    parser.add_argument('--remote-filename', required=True, help='The desired original filename for the file on the remote device.')
    # --- Optional Arguments ---
    parser.add_argument('--path', help=f'Remote upload directory on the device.\n(default: {DEFAULT_UPLOAD_PATH})')

    args = parser.parse_args()

    if args.mode == 'cli':
        cli_upload(args)

if __name__ == '__main__':
    main()
