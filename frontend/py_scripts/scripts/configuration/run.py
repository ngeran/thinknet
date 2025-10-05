#!/usr/bin/env python3
# =================================================================================================
#
# FILE:               python_pipeline/tools/configuration/run.py (v2.1 - Standardized & Robust)
#
# OVERVIEW:
#   A robust backend script for applying rendered Jinja2 template configurations to Juniper
#   devices using the Junos PyEZ library. This script is the engine for the "Apply Template"
#   workflow, providing a rich, step-by-step execution flow with detailed real-time
#   feedback suitable for a WebSocket-driven UI.
#
# KEY FEATURES:
#   - Standardized JSON Output: Adheres to the unified data contract by sending all UI-facing
#     JSON events (both progress and final result) to `stdout` as single, compact lines, ensuring
#     compatibility with the unified backend stream parser.
#   - Robust Timeouts: Explicitly sets generous timeouts for potentially slow device operations
#     (`commit_check` and `commit`), preventing `RpcTimeoutError` on virtual or busy devices.
#   - Comprehensive Pre-Flight Checks: Includes multi-stage reachability tests (basic TCP,
#     then Junos NETCONF) to provide fast and clear feedback on connectivity issues.
#   - Detailed Progress Tracking: Utilizes a `ProgressTracker` class to emit structured
#     `STEP_START` and `STEP_COMPLETE` events for each phase of the operation.
#   - Safe Configuration Application: Implements a lock->load->diff->validate->commit
#     workflow to ensure that configurations are syntactically valid and safe to apply.
#
# HOW-TO GUIDE (INTEGRATION):
#   This script is designed to be executed by the `executeWithRealTimeUpdates` utility in the
#   Node.js backend. The backend is responsible for spawning this script and passing all
#   required parameters (template ID, rendered config, host, credentials) as command-line arguments.
#
# =================================================================================================

# =================================================================================================
# SECTION 1: IMPORTS
# Standard library and third-party modules required for operation.
# =================================================================================================
import argparse
import json
import sys
import os
import logging
import time
import socket
from datetime import datetime
from enum import Enum
from typing import Optional, Dict, Any

# Third-party imports for Juniper device interaction.
try:
    from jnpr.junos import Device
    from jnpr.junos.utils.config import Config
    from jnpr.junos.exception import (
        ConnectError,
        ConfigLoadError,
        CommitError,
        LockError,
        ProbeError,
        RpcTimeoutError,
    )
except ImportError as e:
    # If PyEZ is not installed, print a clear error message in a JSON format.
    print(
        json.dumps(
            {"success": False, "error": f"Missing critical PyEZ dependency: {e}"}
        )
    )
    sys.exit(1)

# Local utility imports.
# The `try-except` block handles cases where the script is run from a different directory.
try:
    from utils.connect_to_hosts import connect_to_hosts, disconnect_from_hosts
except ImportError:
    # Adjusts the Python path to find the 'utils' directory relative to this script.
    sys.path.append(os.path.join(os.path.dirname(__file__), "..", "utils"))
    from connect_to_hosts import connect_to_hosts, disconnect_from_hosts

# =================================================================================================
# SECTION 2: PROGRESS TRACKING & LOGGING
# Classes and configuration for managing real-time feedback and internal logging.
# =================================================================================================


class NotificationLevel(Enum):
    """Enumeration for standard logging/notification levels."""

    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    SUCCESS = "SUCCESS"


class ProgressTracker:
    """A class to manage and broadcast the progress of a multi-step operation."""

    def __init__(self):
        self.steps = []
        self.current_step_index = -1
        self.start_time = None
        self.step_start_time = None

    def start_operation(self, operation_name: str):
        """Initializes the start time and operation name."""
        self.start_time = time.time()
        self.operation_name = operation_name
        self._notify(
            level=NotificationLevel.INFO,
            message=f"Starting: {operation_name}",
            event_type="OPERATION_START",
            data={"operation": operation_name, "total_steps": 9},
        )

    def start_step(self, step_name: str, description: str = ""):
        """Starts a new progress step, recording its name and start time."""
        self.current_step_index += 1
        self.step_start_time = time.time()
        step_info = {
            "step": self.current_step_index + 1,
            "name": step_name,
            "description": description,
            "status": "IN_PROGRESS",
            "start_time": datetime.now().isoformat(),
            "details": {},
        }
        self.steps.append(step_info)
        self._notify(
            level=NotificationLevel.INFO,
            message=f"Step {step_info['step']}: {step_name}",
            event_type="STEP_START",
            data=step_info,
        )

    def complete_step(self, status: str = "COMPLETED", details: Optional[Dict] = None):
        """Completes the current step, recording its status, duration, and details."""
        if self.current_step_index < 0:
            return
        current = self.steps[self.current_step_index]
        current["status"] = status
        current["duration"] = time.time() - self.step_start_time
        current["end_time"] = datetime.now().isoformat()
        if details:
            current["details"].update(details)
        level = (
            NotificationLevel.SUCCESS
            if status == "COMPLETED"
            else NotificationLevel.ERROR
        )
        self._notify(
            level=level,
            message=f"Step {current['step']} {status.lower()}: {current['name']} ({current['duration']:.2f}s)",
            event_type="STEP_COMPLETE",
            data=current,
        )

    def complete_operation(self, status: str = "SUCCESS"):
        """Finalizes the entire operation, calculating total duration and broadcasting the final status."""
        total_duration = time.time() - self.start_time if self.start_time else 0
        level = (
            NotificationLevel.SUCCESS
            if status == "SUCCESS"
            else NotificationLevel.ERROR
        )
        self._notify(
            level=level,
            message=f"Operation completed in {total_duration:.2f}s with status: {status}",
            event_type="OPERATION_COMPLETE",
            data={
                "operation": getattr(self, "operation_name", "Unknown"),
                "status": status,
            },
        )

    def _notify(
        self,
        level: NotificationLevel,
        message: str,
        event_type: str,
        data: Dict[Any, Any] = None,
    ):
        """Unified notification method. Sends structured JSON to stdout for the UI."""
        notification_data = {
            "timestamp": datetime.now().isoformat(),
            "level": level.value,
            "message": message,
            "event_type": event_type,
            "data": data or {},
        }
        # By directing this to `sys.stdout`, we adhere to the new data contract where all
        # UI-facing information is sent over a single, predictable channel.
        print(json.dumps(notification_data), file=sys.stdout, flush=True)

    def get_summary(self):
        """Returns a summary of all steps and their statuses."""
        return {
            "operation": getattr(self, "operation_name", "Unknown"),
            "total_steps": len(self.steps),
            "steps": self.steps,
        }


# --- Logging Configuration ---
# Internal developer logs are sent to stderr for the backend console.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - [CONFIG-RUNNER] - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stderr)],
)
logger = logging.getLogger(__name__)

# =================================================================================================
# SECTION 3: HELPER & UTILITY FUNCTIONS
# These functions perform specific, reusable tasks like parsing and connectivity checks.
# =================================================================================================


def parse_commit_check_results(commit_check_output) -> Dict[str, Any]:
    """
    Parses commit check output to extract errors and warnings.

    Args:
        commit_check_output: The output from the device's commit check.

    Returns:
        A dictionary containing error and warning details.
    """
    result = {
        "has_errors": False,
        "has_warnings": False,
        "errors": [],
        "warnings": [],
        "raw_output": str(commit_check_output) if commit_check_output else "",
    }
    if not commit_check_output:
        return result
    error_patterns = [
        r"error:",
        r"invalid",
        r"syntax error",
        r"configuration check fails",
    ]
    for line in str(commit_check_output).split("\n"):
        if any(p in line.lower() for p in error_patterns):
            result["errors"].append(line.strip())
            result["has_errors"] = True
    return result


def test_basic_reachability(host: str, port: int = 22, timeout: int = 10) -> bool:
    """
    Tests basic TCP connectivity to the host on the specified port.

    Args:
        host: The hostname or IP address to test.
        port: The TCP port to connect to.
        timeout: The connection timeout in seconds.

    Returns:
        True if the host is reachable, False otherwise.
    """
    try:
        socket.setdefaulttimeout(timeout)
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            return sock.connect_ex((host, port)) == 0
    except Exception:
        return False


def test_junos_reachability(
    host: str, username: str, password: str, timeout: int = 30
) -> tuple[bool, str]:
    """
    Tests Junos device reachability using PyEZ's probe functionality.

    Args:
        host: The hostname or IP address of the device.
        username: The username for authentication.
        password: The password for authentication.
        timeout: The connection timeout in seconds.

    Returns:
        A tuple containing a boolean for reachability and a message.
    """
    try:
        with Device(
            host=host,
            user=username,
            password=password,
            connect_timeout=timeout,
            normalize=True,
        ) as dev:
            if dev.probe(timeout=timeout):
                return True, f"Device {host} is reachable and responsive."
            else:
                return False, f"Device {host} is not responding to NETCONF/SSH."
    except (ProbeError, Exception) as e:
        return False, f"Connection test failed for {host}: {str(e)}"


# =================================================================================================
# SECTION 4: MAIN EXECUTION WORKFLOW
# This is the primary function that orchestrates the entire configuration process.
# =================================================================================================


def main():
    """Main function to parse arguments and orchestrate the configuration application process."""
    # ---------------------------------------------------------------------------------------------
    # Subsection 4.1: Argument Parsing
    # ---------------------------------------------------------------------------------------------
    parser = argparse.ArgumentParser(
        description="Generate and apply Juniper configurations."
    )
    # The `api.py` script passes arguments using a JSON string, so we'll handle that here.
    parser.add_argument(
        "--args", type=str, required=False, help="JSON string with arguments."
    )
    cli_args = parser.parse_args()

    # If the script is called with the `--args` flag, parse the JSON.
    if cli_args.args:
        try:
            parsed_args = json.loads(cli_args.args)
            args = argparse.Namespace(**parsed_args)
        except (json.JSONDecodeError, TypeError) as e:
            logger.error(f"Failed to parse JSON arguments: {e}")
            print(
                json.dumps(
                    {"success": False, "message": "Invalid JSON arguments provided."}
                ),
                file=sys.stdout,
            )
            sys.exit(1)
    else:
        # Fallback for standalone execution (for testing).
        # This allows the script to be run manually without the FastAPI backend.
        parser.add_argument("--template_id", type=str, required=True)
        parser.add_argument("--rendered_config", type=str, required=True)
        parser.add_argument("--target_host", type=str, required=True)
        parser.add_argument("--username", type=str, required=True)
        parser.add_argument("--password", type=str, required=True)
        parser.add_argument("--commit_check", action="store_true")
        args = parser.parse_args()

    progress = ProgressTracker()
    results = {"success": False, "message": "", "details": {}}
    connections = []

    # ---------------------------------------------------------------------------------------------
    # Subsection 4.2: Main Workflow Execution
    # ---------------------------------------------------------------------------------------------
    try:
        progress.start_operation(
            f"Configuration deployment for template '{getattr(args, 'template_id', 'Unknown')}'"
        )
        logger.info(
            f"Starting config run for template '{getattr(args, 'template_id', 'Unknown')}' on target '{args.target_host}'"
        )

        # STEP 1: IP Resolution
        progress.start_step("IP_RESOLUTION", "Determining target device IP address")
        device_ip = args.target_host
        progress.complete_step("COMPLETED", {"resolved_ip": device_ip})

        # STEP 2: Pre-flight Reachability Checks
        progress.start_step("REACHABILITY_TEST", f"Testing connectivity to {device_ip}")
        if not test_basic_reachability(device_ip):
            raise ConnectError(f"Device {device_ip} is not reachable on port 22 (SSH).")
        is_reachable, reachability_msg = test_junos_reachability(
            device_ip, args.username, args.password
        )
        if not is_reachable:
            raise ConnectError(f"Junos connectivity test failed: {reachability_msg}.")
        progress.complete_step("COMPLETED", {"message": reachability_msg})

        # STEP 3: Device Connection
        progress.start_step(
            "DEVICE_CONNECTION", f"Establishing SSH connection to {device_ip}"
        )
        # The `connect_to_hosts` utility should handle the single-host case correctly.
        connections = connect_to_hosts(
            host=device_ip, username=args.username, password=args.password
        )
        dev = connections[0]
        progress.complete_step("COMPLETED", {"hostname": dev.hostname})

        # Use a context manager for safe, automatic configuration locking and unlocking.
        with Config(dev, mode="private") as cu:
            progress.start_step("CONFIG_LOCK", "Acquiring exclusive configuration lock")
            progress.complete_step("COMPLETED")

            # STEP 4: Load Configuration
            progress.start_step(
                "CONFIG_LOAD", "Loading configuration into candidate database"
            )
            cu.load(args.rendered_config, format="text", merge=True)
            progress.complete_step("COMPLETED")

            # STEP 5: Check for Differences
            progress.start_step("CONFIG_DIFF", "Calculating configuration differences")
            diff = cu.diff()
            if not diff:
                progress.complete_step(
                    "COMPLETED",
                    {
                        "changes_detected": False,
                        "message": "No configuration changes needed.",
                    },
                )
                results["success"] = True
                results["message"] = "No configuration changes needed."
                progress.complete_operation("SUCCESS")
                return  # Exit early, printing the final result in the `finally` block.
            progress.complete_step("COMPLETED", {"changes_detected": True})
            results["details"]["diff"] = diff

            # STEP 6: Validate Configuration Syntax
            progress.start_step("CONFIG_VALIDATION", "Validating configuration syntax")
            commit_check_result = cu.commit_check(timeout=120)
            validation_details = parse_commit_check_results(commit_check_result)
            if validation_details["has_errors"]:
                raise ConfigLoadError(
                    f"Configuration validation failed: {validation_details['errors']}"
                )
            progress.complete_step("COMPLETED", {"message": "Validation passed."})

            # STEP 7: Commit Configuration (if not a dry run)
            if not getattr(args, "commit_check", False):
                progress.start_step("COMMIT", "Committing configuration to device")
                cu.commit(
                    comment=f"Config applied via template {getattr(args, 'template_id', 'Unknown')}",
                    timeout=120,
                )
                progress.complete_step(
                    "COMPLETED", {"message": "Configuration committed successfully."}
                )
                results["success"] = True
                results["message"] = (
                    f"Configuration applied successfully to {dev.hostname}."
                )
            else:
                progress.start_step(
                    "COMMIT_CHECK_ONLY", "Dry run: not committing configuration"
                )
                progress.complete_step("COMPLETED", {"message": "Dry run completed."})
                results["success"] = True
                results["message"] = "Dry run completed successfully."

        progress.complete_operation("SUCCESS")

    except (
        ConnectError,
        ConfigLoadError,
        CommitError,
        LockError,
        RpcTimeoutError,
        ValueError,
    ) as e:
        error_msg = f"{e.__class__.__name__}: {str(e)}"
        logger.error(error_msg, exc_info=True)
        if progress.steps and progress.steps[-1]["status"] == "IN_PROGRESS":
            progress.complete_step("FAILED", {"error": error_msg})
        progress.complete_operation("FAILED")
        results["success"] = False
        results["message"] = error_msg
    except Exception as e:
        error_msg = f"An unexpected error occurred: {str(e)}"
        logger.error(error_msg, exc_info=True)
        if progress.steps and progress.steps[-1]["status"] == "IN_PROGRESS":
            progress.complete_step("FAILED", {"error": error_msg})
        progress.complete_operation("FAILED")
        results["success"] = False
        results["message"] = error_msg

    finally:
        if connections:
            disconnect_from_hosts(connections)
            logger.info("Disconnected from all devices.")

        results["progress"] = progress.get_summary()

        print(json.dumps(results), file=sys.stdout)


# =================================================================================================
# SECTION 5: SCRIPT ENTRY POINT
# =================================================================================================
if __name__ == "__main__":
    main()
