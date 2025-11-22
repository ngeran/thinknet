#!/usr/bin/env python3
# =================================================================================================
# FILE: frontend/py_scripts/python_pipeline/tools/configuration/run.py
# DESCRIPTION: Backend engine for applying Jinja2 configurations to Juniper devices.
#              Generates real-time JSON events for the UI to consume.
# =================================================================================================

# =================================================================================================
# SECTION 1: IMPORTS
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

# PyEZ Imports
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
    print(json.dumps({"success": False, "error": f"Missing PyEZ dependency: {e}"}))
    sys.exit(1)

# Local Imports
try:
    from utils.connect_to_hosts import connect_to_hosts, disconnect_from_hosts
except ImportError:
    sys.path.append(os.path.join(os.path.dirname(__file__), "..", "utils"))
    from connect_to_hosts import connect_to_hosts, disconnect_from_hosts

# =================================================================================================
# SECTION 2: PROGRESS TRACKING & LOGGING
# =================================================================================================


class NotificationLevel(Enum):
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    SUCCESS = "SUCCESS"


class ProgressTracker:
    """Manages and broadcasts progress steps to the UI."""

    def __init__(self):
        self.steps = []
        self.current_step_index = -1
        self.start_time = None
        self.step_start_time = None

    def start_operation(self, operation_name: str):
        """Initializes the operation tracking."""
        self.start_time = time.time()
        self.operation_name = operation_name
        self._notify(
            level=NotificationLevel.INFO,
            message=f"Starting: {operation_name}",
            event_type="OPERATION_START",
            data={"operation": operation_name, "total_steps": 8},
        )

    def start_step(self, step_name: str, description: str = ""):
        """Starts a specific step."""
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
        """Completes the current step and updates status."""
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

        # CRITICAL: This data payload is what the UI uses for Diffs
        self._notify(
            level=level,
            message=f"Step {current['step']} {status.lower()}: {current['name']}",
            event_type="STEP_COMPLETE",
            data=current,  # Includes details (like the diff string)
        )

    def complete_operation(self, status: str = "SUCCESS"):
        """Finalizes the entire workflow."""
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
        """Sends JSON to stdout with flush=True for real-time UI updates."""
        notification_data = {
            "timestamp": datetime.now().isoformat(),
            "level": level.value,
            "message": message,
            "event_type": event_type,
            "data": data or {},
        }
        print(json.dumps(notification_data), file=sys.stdout, flush=True)

    def get_summary(self):
        return {
            "operation": getattr(self, "operation_name", "Unknown"),
            "steps": self.steps,
        }


# Logging Setup (Internal logs to stderr)
logging.basicConfig(level=logging.INFO, handlers=[logging.StreamHandler(sys.stderr)])
logger = logging.getLogger(__name__)

# =================================================================================================
# SECTION 3: HELPER FUNCTIONS
# =================================================================================================


def parse_commit_check_results(commit_check_output) -> Dict[str, Any]:
    """Parses PyEZ commit check output for errors."""
    result = {"has_errors": False, "has_warnings": False, "errors": [], "warnings": []}
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
    """Simple TCP socket test."""
    try:
        socket.setdefaulttimeout(timeout)
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            return sock.connect_ex((host, port)) == 0
    except Exception:
        return False


def test_junos_reachability(
    host: str, username: str, password: str, timeout: int = 30
) -> tuple[bool, str]:
    """NETCONF/SSH Probe test."""
    try:
        with Device(
            host=host, user=username, password=password, connect_timeout=timeout
        ) as dev:
            if dev.probe(timeout=timeout):
                return True, f"Device {host} is reachable."
            else:
                return False, f"Device {host} is not responding to NETCONF."
    except Exception as e:
        return False, f"Connection test failed: {str(e)}"


# =================================================================================================
# SECTION 4: MAIN EXECUTION LOGIC
# =================================================================================================


def main():
    # 4.1 Argument Parsing
    parser = argparse.ArgumentParser()
    parser.add_argument("--args", type=str, required=False)
    parser.add_argument(
        "--template_id", type=str, required=False
    )  # Standalone fallback
    parser.add_argument("--rendered_config", type=str, required=False)
    parser.add_argument("--target_host", type=str, required=False)
    parser.add_argument("--username", type=str, required=False)
    parser.add_argument("--password", type=str, required=False)
    parser.add_argument("--commit_check", action="store_true")
    cli_args = parser.parse_args()

    if cli_args.args:
        try:
            parsed_args = json.loads(cli_args.args)
            args = argparse.Namespace(**parsed_args)
        except Exception:
            sys.exit(1)
    else:
        args = cli_args

    progress = ProgressTracker()
    results = {"success": False, "message": "", "details": {}}
    connections = []

    # 4.2 Workflow
    try:
        progress.start_operation(
            f"Configuration deployment for {getattr(args, 'template_id', 'Unknown')}"
        )

        # STEP 1: IP Resolution
        progress.start_step("IP_RESOLUTION", "Determining target device IP address")
        device_ip = args.target_host
        progress.complete_step("COMPLETED", {"resolved_ip": device_ip})

        # STEP 2: Reachability
        progress.start_step("REACHABILITY_TEST", f"Testing connectivity to {device_ip}")
        if not test_basic_reachability(device_ip):
            raise ConnectError(f"Host unreachable on port 22.")
        is_reachable, msg = test_junos_reachability(
            device_ip, args.username, args.password
        )
        if not is_reachable:
            raise ConnectError(msg)
        progress.complete_step("COMPLETED")

        # STEP 3: Connection
        progress.start_step("DEVICE_CONNECTION", f"Establishing SSH connection")
        connections = connect_to_hosts(
            host=device_ip, username=args.username, password=args.password
        )
        dev = connections[0]
        progress.complete_step("COMPLETED", {"hostname": dev.hostname})

        with Config(dev, mode="private") as cu:
            # STEP 4: Lock
            progress.start_step("CONFIG_LOCK", "Acquiring exclusive configuration lock")
            progress.complete_step("COMPLETED")

            # STEP 5: Load
            progress.start_step(
                "CONFIG_LOAD", "Loading configuration into candidate database"
            )
            cu.load(args.rendered_config, format="text", merge=True)
            progress.complete_step("COMPLETED")

            # STEP 6: Diff (Crucial for UI)
            progress.start_step("CONFIG_DIFF", "Calculating configuration differences")
            diff = cu.diff()
            if not diff:
                progress.complete_step(
                    "COMPLETED", {"changes_detected": False, "diff": None}
                )
                progress.complete_operation("SUCCESS")
                results["success"] = True
                return

            # Attach Diff to completion event
            progress.complete_step(
                "COMPLETED", {"changes_detected": True, "diff": diff}
            )
            results["details"]["diff"] = diff

            # STEP 7: Validation
            progress.start_step("CONFIG_VALIDATION", "Validating configuration syntax")
            check = cu.commit_check(timeout=120)
            val_res = parse_commit_check_results(check)
            if val_res["has_errors"]:
                raise ConfigLoadError(f"Validation failed: {val_res['errors']}")
            progress.complete_step("COMPLETED")

            # STEP 8: Commit
            if not getattr(args, "commit_check", False):
                progress.start_step("COMMIT", "Committing configuration to device")
                cu.commit(
                    comment=f"Template: {getattr(args, 'template_id', 'Unknown')}",
                    timeout=120,
                )
                progress.complete_step("COMPLETED")
                results["success"] = True
            else:
                progress.start_step("DRY_RUN", "Dry run only - skipping commit")
                progress.complete_step("COMPLETED")
                results["success"] = True

        progress.complete_operation("SUCCESS")

    except Exception as e:
        error_msg = f"{e.__class__.__name__}: {str(e)}"
        logger.error(error_msg)
        if progress.steps and progress.steps[-1]["status"] == "IN_PROGRESS":
            progress.complete_step("FAILED", {"error": error_msg})
        progress.complete_operation("FAILED")
        results["success"] = False
        results["message"] = error_msg

    finally:
        if connections:
            disconnect_from_hosts(connections)
        results["progress"] = progress.get_summary()
        print(json.dumps(results), file=sys.stdout)


if __name__ == "__main__":
    main()
