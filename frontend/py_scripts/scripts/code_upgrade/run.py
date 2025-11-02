#!/usr/bin/env python3
"""
================================================================================
SCRIPT:             Device Code Upgrade - PROPER JUNIPER SW INSTALL
FILENAME:           run.py
VERSION:            17.3 (PROPER SW INSTALL METHOD)
LAST UPDATED:       2025-11-02
AUTHOR:             Network Automation Team
================================================================================

🎯 ENHANCEMENTS IN v17.3:
    🔧 PROPER SW INSTALL: Use Juniper's official SW.install() method
    🔄 CORRECT REBOOT HANDLING: Proper reboot parameter for downgrades
    📦 VALIDATION FIX: Fix package validation logic
    🎯 DOWNSGRADE SUPPORT: Handle OS downgrade requirements
"""

import logging
import sys
import argparse
import time
import json
import re
import os
import socket
from typing import List, Optional, Tuple, Dict, Any
from enum import Enum
from dataclasses import dataclass, field
from contextlib import contextmanager

# ================================================================================
# THIRD-PARTY LIBRARIES IMPORT & VALIDATION
# ================================================================================
try:
    from jnpr.junos import Device
    from jnpr.junos.utils.sw import SW
    from jnpr.junos.exception import ConnectError, RpcError, ConfigLoadError, ProbeError

    JUNIPER_AVAILABLE = True
except ImportError as e:
    print(f"❌ CRITICAL: Juniper PyEZ library not available: {e}", file=sys.stderr)
    print("💡 SOLUTION: Install with: pip install junos-eznc", file=sys.stderr)
    JUNIPER_AVAILABLE = False
    sys.exit(1)

# ================================================================================
# LOGGING CONFIGURATION
# ================================================================================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)-8s - [%(filename)s:%(lineno)d] - %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)

# ================================================================================
# CONFIGURATION CONSTANTS - ENHANCED REBOOT SETTINGS
# ================================================================================
DEFAULT_CONNECTION_TIMEOUT = 30
DEFAULT_OPERATION_TIMEOUT = 1800
DEFAULT_REBOOT_TIMEOUT = 900
DEFAULT_RETRY_ATTEMPTS = 3
MINIMUM_STORAGE_FREE_PERCENT = 20
STEPS_PER_DEVICE = 8

# Enhanced reboot waiting constants
INITIAL_REBOOT_WAIT = 60
POLLING_INTERVAL = 30
MAX_REBOOT_WAIT_TIME = 1200

# Event delivery optimization constants
EVENT_DELIVERY_DELAY = 1.0
EVENT_FLUSH_DELAY = 0.5
EVENT_RETRY_COUNT = 2

# ================================================================================
# ENHANCED REACHABILITY CHECKING
# ================================================================================


def test_basic_reachability(host: str, port: int = 22, timeout: int = 10) -> bool:
    """Tests basic TCP connectivity to the host on the specified port."""
    try:
        socket.setdefaulttimeout(timeout)
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            result = sock.connect_ex((host, port))
            reachable = result == 0
            if reachable:
                logger.debug(f"✅ Basic reachability confirmed for {host}:{port}")
            else:
                logger.debug(
                    f"❌ Basic reachability failed for {host}:{port} (error: {result})"
                )
            return reachable
    except Exception as e:
        logger.debug(f"❌ Basic reachability exception for {host}:{port}: {e}")
        return False


def test_junos_reachability(
    host: str, username: str, password: str, timeout: int = 30
) -> Tuple[bool, str]:
    """Tests Junos device reachability using PyEZ's probe functionality."""
    try:
        with Device(
            host=host,
            user=username,
            password=password,
            connect_timeout=timeout,
            normalize=True,
        ) as dev:
            if dev.probe(timeout=timeout):
                return True, f"Device {host} is reachable and responsive via NETCONF"
            else:
                return False, f"Device {host} is not responding to NETCONF probe"
    except ProbeError as e:
        return False, f"NETCONF probe failed for {host}: {str(e)}"
    except Exception as e:
        return False, f"Connection test failed for {host}: {str(e)}"


def wait_for_device_recovery(
    hostname: str,
    username: str,
    password: str,
    max_wait_time: int = MAX_REBOOT_WAIT_TIME,
    polling_interval: int = POLLING_INTERVAL,
) -> Tuple[bool, str]:
    """Enhanced device recovery waiting with multi-stage reachability checks."""
    logger.info(f"[{hostname}] 🔄 Waiting for device recovery (max: {max_wait_time}s)")

    start_time = time.time()
    last_status_time = start_time
    status_interval = 60

    # Stage tracking
    basic_reachability_achieved = False
    junos_reachability_achieved = False

    while time.time() - start_time < max_wait_time:
        elapsed = time.time() - start_time
        remaining = max_wait_time - elapsed

        # Report status periodically
        if time.time() - last_status_time >= status_interval:
            logger.info(
                f"[{hostname}] ⏳ Recovery status: {elapsed:.0f}s elapsed, {remaining:.0f}s remaining"
            )
            last_status_time = time.time()

        # Stage 1: Check basic TCP connectivity
        if not basic_reachability_achieved:
            if test_basic_reachability(hostname):
                basic_reachability_achieved = True
                logger.info(f"[{hostname}] ✅ Stage 1: Basic TCP connectivity restored")
                continue
            else:
                logger.debug(
                    f"[{hostname}] 🔄 Waiting for basic connectivity... ({elapsed:.0f}s)"
                )
                time.sleep(polling_interval)
                continue

        # Stage 2: Check Junos NETCONF service
        if basic_reachability_achieved and not junos_reachability_achieved:
            junos_reachable, junos_message = test_junos_reachability(
                hostname, username, password, timeout=30
            )
            if junos_reachable:
                junos_reachability_achieved = True
                logger.info(f"[{hostname}] ✅ Stage 2: Junos NETCONF service restored")
                return True, f"Device fully recovered in {elapsed:.1f}s"
            else:
                logger.debug(
                    f"[{hostname}] 🔄 Waiting for NETCONF service... ({elapsed:.0f}s): {junos_message}"
                )
                time.sleep(polling_interval)
                continue

        # If we reach here, both stages are complete
        break

    # Timeout reached
    elapsed = time.time() - start_time
    status_summary = []
    if not basic_reachability_achieved:
        status_summary.append("no TCP connectivity")
    elif not junos_reachability_achieved:
        status_summary.append("TCP connected but NETCONF unavailable")

    error_msg = (
        f"Device recovery timeout after {elapsed:.1f}s: {', '.join(status_summary)}"
    )
    logger.error(f"[{hostname}] ❌ {error_msg}")
    return False, error_msg


# ================================================================================
# UTILITY FUNCTIONS
# ================================================================================


def debug_event_flow(event_type: str, data: Dict[str, Any], stage: str = "SENDING"):
    """Enhanced event flow debugging for monitoring event propagation."""
    debug_message = f"🔍 [EVENT_FLOW] {stage} {event_type}"

    if event_type == "PRE_CHECK_COMPLETE":
        if "pre_check_summary" in data:
            summary = data["pre_check_summary"]
            debug_message += f" | Checks: {summary.get('total_checks', 'N/A')}"
            debug_message += f" | Can proceed: {summary.get('can_proceed', 'N/A')}"
    elif event_type == "OPERATION_COMPLETE":
        if "success" in data:
            debug_message += f" | Success: {data.get('success', 'N/A')}"

    print(debug_message, file=sys.stderr, flush=True)
    logger.debug(f"[EVENT_FLOW] {event_type} {stage} - Data keys: {list(data.keys())}")


def safe_json_serialize(obj: Any) -> Any:
    """Safe JSON serialization with comprehensive fallbacks for complex objects."""
    if obj is None:
        return None
    elif isinstance(obj, (str, int, float, bool)):
        return obj
    elif isinstance(obj, dict):
        return {k: safe_json_serialize(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [safe_json_serialize(item) for item in obj]
    elif isinstance(obj, tuple):
        return [safe_json_serialize(item) for item in obj]
    elif isinstance(obj, Enum):
        return obj.value
    elif hasattr(obj, "__dict__"):
        try:
            return safe_json_serialize(obj.__dict__)
        except Exception:
            try:
                return str(obj)
            except Exception:
                return "UNSERIALIZABLE_OBJECT"
    else:
        try:
            return str(obj)
        except Exception:
            return "UNSERIALIZABLE_OBJECT"


# ================================================================================
# ENUM DEFINITIONS
# ================================================================================


class UpgradePhase(Enum):
    PENDING = "pending"
    PRE_CHECK = "pre_check"
    CONNECTING = "connecting"
    VALIDATING = "validating"
    INSTALLING = "installing"
    REBOOTING = "rebooting"
    VERIFYING = "verifying"
    COMPLETED = "completed"
    FAILED = "failed"


class PreCheckSeverity(Enum):
    PASS = "pass"
    WARNING = "warning"
    CRITICAL = "critical"


class VersionAction(Enum):
    MAJOR_UPGRADE = "major_upgrade"
    MINOR_UPGRADE = "minor_upgrade"
    MAJOR_DOWNGRADE = "major_downgrade"
    MINOR_DOWNGRADE = "minor_downgrade"
    SAME_VERSION = "same_version"
    UNKNOWN = "unknown"


# ================================================================================
# DATA STRUCTURES
# ================================================================================


@dataclass
class PreCheckResult:
    check_name: str
    severity: PreCheckSeverity
    passed: bool
    message: str
    details: Optional[Dict[str, Any]] = None
    recommendation: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "check_name": self.check_name,
            "severity": self.severity.value,
            "passed": self.passed,
            "message": self.message,
            "details": safe_json_serialize(self.details),
            "recommendation": self.recommendation,
        }


@dataclass
class PreCheckSummary:
    results: List[PreCheckResult] = field(default_factory=list)
    timestamp: str = field(
        default_factory=lambda: time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
    )

    @property
    def total_checks(self) -> int:
        return len(self.results)

    @property
    def passed(self) -> int:
        return sum(1 for r in self.results if r.passed)

    @property
    def warnings(self) -> int:
        return sum(1 for r in self.results if r.severity == PreCheckSeverity.WARNING)

    @property
    def critical_failures(self) -> int:
        return sum(
            1
            for r in self.results
            if not r.passed and r.severity == PreCheckSeverity.CRITICAL
        )

    @property
    def can_proceed(self) -> bool:
        return self.critical_failures == 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "total_checks": self.total_checks,
            "passed": self.passed,
            "warnings": self.warnings,
            "critical_failures": self.critical_failures,
            "can_proceed": self.can_proceed,
            "results": [r.to_dict() for r in self.results],
            "timestamp": self.timestamp,
        }


@dataclass
class UpgradeResult:
    success: bool
    start_time: float
    end_time: float
    initial_version: str
    final_version: Optional[str] = None
    version_action: VersionAction = VersionAction.UNKNOWN
    upgrade_duration: float = 0.0
    reboot_required: bool = False
    reboot_performed: bool = False
    reboot_wait_time: float = 0.0
    warnings: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    upgrade_steps: List[Dict[str, Any]] = field(default_factory=list)

    def add_step(
        self, step_name: str, status: str, message: str, duration: float = 0.0
    ):
        self.upgrade_steps.append(
            {
                "step": step_name,
                "status": status,
                "message": message,
                "duration": duration,
                "timestamp": time.time(),
            }
        )

    def calculate_duration(self) -> float:
        if self.start_time and self.end_time:
            self.upgrade_duration = self.end_time - self.start_time
        return self.upgrade_duration

    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "initial_version": self.initial_version,
            "final_version": self.final_version,
            "version_action": self.version_action.value,
            "upgrade_duration": self.calculate_duration(),
            "reboot_required": self.reboot_required,
            "reboot_performed": self.reboot_performed,
            "reboot_wait_time": self.reboot_wait_time,
            "warnings": self.warnings,
            "errors": self.errors,
            "upgrade_steps": self.upgrade_steps,
        }


@dataclass
class DeviceStatus:
    hostname: str
    target_version: str
    phase: UpgradePhase = UpgradePhase.PENDING
    message: str = "Initializing upgrade process"
    current_version: Optional[str] = None
    final_version: Optional[str] = None
    version_action: VersionAction = VersionAction.UNKNOWN
    error: Optional[str] = None
    error_type: Optional[str] = None
    success: bool = False
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    warnings: List[str] = field(default_factory=list)
    pre_check_summary: Optional[PreCheckSummary] = None
    upgrade_result: Optional[UpgradeResult] = None

    def update_phase(self, phase: UpgradePhase, message: str = ""):
        self.phase = phase
        self.message = message or phase.value.replace("_", " ").title()
        logger.info(
            f"[{self.hostname}] PHASE: {self.phase.value.upper()} - {self.message}"
        )

    def add_warning(self, warning: str):
        self.warnings.append(warning)
        logger.warning(f"[{self.hostname}] WARNING: {warning}")

    def get_duration(self) -> float:
        if self.start_time and self.end_time:
            return self.end_time - self.start_time
        elif self.start_time:
            return time.time() - self.start_time
        return 0.0

    def set_upgrade_result(self, upgrade_result: UpgradeResult):
        self.upgrade_result = upgrade_result
        self.final_version = upgrade_result.final_version
        self.success = upgrade_result.success
        if upgrade_result.errors:
            self.error = "; ".join(upgrade_result.errors)
        self.warnings.extend(upgrade_result.warnings)


# ================================================================================
# HUMAN READABLE OUTPUT FORMATTER
# ================================================================================


class HumanReadableFormatter:
    @staticmethod
    def print_banner(title: str, width: int = 80):
        print(f"\n{'=' * width}")
        print(f"🎯 {title.upper()}")
        print(f"{'=' * width}")

    @staticmethod
    def print_check_results_table(pre_check_summary: PreCheckSummary):
        print(f"\n📊 PRE-CHECK RESULTS SUMMARY")
        print(f"{'─' * 80}")

        stats_line = f"✅ Passed: {pre_check_summary.passed} | "
        stats_line += f"⚠️  Warnings: {pre_check_summary.warnings} | "
        stats_line += f"❌ Critical: {pre_check_summary.critical_failures} | "
        stats_line += f"📋 Total: {pre_check_summary.total_checks}"
        print(stats_line)
        print(f"{'─' * 80}")

        print(f"\n{'CHECK NAME':<25} {'STATUS':<12} {'SEVERITY':<10} {'MESSAGE'}")
        print(f"{'─' * 25} {'─' * 12} {'─' * 10} {'─' * 40}")

        for result in pre_check_summary.results:
            status_icon = "✅" if result.passed else "❌"
            status_text = "PASS" if result.passed else "FAIL"

            severity_icon = {
                PreCheckSeverity.PASS: "🟢",
                PreCheckSeverity.WARNING: "🟡",
                PreCheckSeverity.CRITICAL: "🔴",
            }.get(result.severity, "⚪")
            severity_text = result.severity.value.upper()

            message = result.message
            if len(message) > 40:
                message = message[:37] + "..."

            print(
                f"{result.check_name:<25} {status_icon} {status_text:<8} {severity_icon} {severity_text:<6} {message}"
            )

        print(f"{'─' * 80}")

        if pre_check_summary.can_proceed:
            print(f"\n🎉 OVERALL STATUS: ✅ UPGRADE CAN PROCEED")
        else:
            print(
                f"\n🚫 OVERALL STATUS: ❌ UPGRADE BLOCKED - Critical failures detected"
            )

    @staticmethod
    def print_upgrade_results(device_status: DeviceStatus):
        if not device_status.upgrade_result:
            print(f"\n📭 No upgrade results available")
            return

        upgrade_result = device_status.upgrade_result
        HumanReadableFormatter.print_banner("UPGRADE RESULTS")

        status_icon = "✅" if upgrade_result.success else "❌"
        status_text = "SUCCESS" if upgrade_result.success else "FAILED"
        print(f"\n{status_icon} OVERALL STATUS: {status_text}")

        print(f"\n🔄 VERSION TRANSITION:")
        print(f"   From: {upgrade_result.initial_version}")
        print(f"   To:   {upgrade_result.final_version or 'N/A'}")
        print(
            f"   Action: {upgrade_result.version_action.value.replace('_', ' ').title()}"
        )

        print(f"\n⏱️  DURATION: {upgrade_result.calculate_duration():.1f} seconds")

        if upgrade_result.reboot_required:
            reboot_status = (
                "✅ Performed"
                if upgrade_result.reboot_performed
                else "❌ Not Performed"
            )
            print(f"\n🔁 REBOOT: {reboot_status}")
            if upgrade_result.reboot_performed and upgrade_result.reboot_wait_time > 0:
                print(f"   Reboot Wait Time: {upgrade_result.reboot_wait_time:.1f}s")

        if upgrade_result.upgrade_steps:
            print(f"\n📋 UPGRADE STEPS:")
            print(f"{'─' * 80}")
            print(f"{'STEP':<25} {'STATUS':<12} {'DURATION':<10} {'MESSAGE'}")
            print(f"{'─' * 25} {'─' * 12} {'─' * 10} {'─' * 30}")

            for step in upgrade_result.upgrade_steps:
                step_icon = (
                    "✅"
                    if step["status"] == "completed"
                    else "🔄"
                    if step["status"] == "in_progress"
                    else "❌"
                )
                duration = f"{step['duration']:.1f}s" if step["duration"] > 0 else "N/A"
                message = (
                    step["message"][:30] + "..."
                    if len(step["message"]) > 30
                    else step["message"]
                )
                print(
                    f"{step['step']:<25} {step_icon} {step['status']:<8} {duration:<10} {message}"
                )

            print(f"{'─' * 80}")

        if upgrade_result.warnings:
            print(f"\n⚠️  WARNINGS ({len(upgrade_result.warnings)}):")
            for warning in upgrade_result.warnings:
                print(f"   • {warning}")

        if upgrade_result.errors:
            print(f"\n❌ ERRORS ({len(upgrade_result.errors)}):")
            for error in upgrade_result.errors:
                print(f"   • {error}")

        print(f"\n💡 RECOMMENDATION:")
        if upgrade_result.success:
            if upgrade_result.final_version == device_status.target_version:
                print(f"   ✅ Upgrade completed successfully to target version")
            else:
                print(f"   ⚠️  Upgrade completed but final version differs from target")
        else:
            print(f"   🔧 Investigate errors and retry upgrade")

        print(f"{'─' * 80}")


# ================================================================================
# PROGRESS REPORTING SYSTEM
# ================================================================================


def send_progress(event_type: str, data: Dict[str, Any], message: str = ""):
    event = {
        "event_type": event_type,
        "timestamp": time.time(),
        "message": message,
        "data": safe_json_serialize(data),
    }

    debug_event_flow(event_type, data, "SENDING")

    max_attempts = (
        EVENT_RETRY_COUNT
        if event_type in ["PRE_CHECK_COMPLETE", "OPERATION_COMPLETE"]
        else 1
    )

    for attempt in range(max_attempts):
        try:
            event_json = json.dumps(event, ensure_ascii=False)
            print(event_json, file=sys.stderr, flush=True)
            try:
                sys.stderr.flush()
            except Exception:
                pass
            if attempt > 0:
                logger.info(
                    f"📤 [{event_type}] Retry {attempt + 1}/{max_attempts} successful"
                )
            break
        except Exception as e:
            logger.error(
                f"❌ [{event_type}] Failed to send event (attempt {attempt + 1}): {e}"
            )
            if attempt == max_attempts - 1:
                logger.critical(f"💥 [{event_type}] ALL DELIVERY ATTEMPTS FAILED!")
            if attempt < max_attempts - 1:
                time.sleep(0.2)


def send_device_progress(
    device_status: DeviceStatus,
    step: int,
    total_steps: int,
    message: str = "",
    extra_data: Optional[Dict[str, Any]] = None,
):
    data = {
        "device": device_status.hostname,
        "phase": device_status.phase.value,
        "step": step,
        "total_steps": total_steps,
        "message": message or device_status.message,
        "initial_version": device_status.current_version,
        "target_version": device_status.target_version,
        "version_action": device_status.version_action.value,
        "success": device_status.success,
        "warnings": device_status.warnings,
    }
    if extra_data:
        data.update(extra_data)
    send_progress("DEVICE_PROGRESS", data, message)


def send_upgrade_progress(
    device_status: DeviceStatus,
    step_name: str,
    status: str,
    progress: int = 0,
    message: str = "",
):
    data = {
        "device": device_status.hostname,
        "step": step_name,
        "status": status,
        "progress": progress,
        "message": message,
        "current_version": device_status.current_version,
        "target_version": device_status.target_version,
        "phase": device_status.phase.value,
    }
    send_progress("UPGRADE_PROGRESS", data, message)


def send_pre_check_results(device_status: DeviceStatus):
    if not device_status.pre_check_summary:
        logger.error(f"[{device_status.hostname}] ❌ No pre-check results to send")
        return

    summary = device_status.pre_check_summary.to_dict()
    data = {
        "device": device_status.hostname,
        "pre_check_summary": summary,
        "can_proceed": summary["can_proceed"],
        "total_checks": summary["total_checks"],
        "passed": summary["passed"],
        "warnings": summary["warnings"],
        "critical_failures": summary["critical_failures"],
    }

    logger.info(f"[{device_status.hostname}] 🎯 Sending PRE_CHECK_COMPLETE event")
    send_progress("PRE_CHECK_COMPLETE", data, "Pre-check validation completed")

    for i in range(3):
        try:
            sys.stderr.flush()
        except Exception:
            pass
        time.sleep(EVENT_FLUSH_DELAY / 3)

    logger.info(
        f"[{device_status.hostname}] ✅ PRE_CHECK_COMPLETE events delivered successfully"
    )


def send_operation_complete(
    device_status: DeviceStatus, success: bool, message: str = ""
):
    data = {
        "device": device_status.hostname,
        "success": success,
        "message": message or device_status.message,
        "initial_version": device_status.current_version,
        "final_version": device_status.final_version,
        "version_action": device_status.version_action.value,
        "warnings": device_status.warnings,
        "duration": device_status.get_duration(),
    }

    if device_status.pre_check_summary:
        data["pre_check_summary"] = device_status.pre_check_summary.to_dict()
    if device_status.upgrade_result:
        data["upgrade_result"] = device_status.upgrade_result.to_dict()

    logger.info(f"[{device_status.hostname}] 🎯 Sending OPERATION_COMPLETE event")
    send_progress("OPERATION_COMPLETE", data, message)
    try:
        sys.stderr.flush()
    except Exception:
        pass
    time.sleep(EVENT_DELIVERY_DELAY)
    logger.info(
        f"[{device_status.hostname}] ✅ OPERATION_COMPLETE delivered: success={success}"
    )


# ================================================================================
# PRE-CHECK ENGINE
# ================================================================================


class EnhancedPreCheckEngine:
    def __init__(self, device: Device, hostname: str, image_filename: str):
        self.device = device
        self.hostname = hostname
        self.image_filename = image_filename

    def _check_image_availability_robust(self) -> PreCheckResult:
        try:
            cli_output = self.device.cli(
                f"file list /var/tmp/{self.image_filename}", warning=False
            )
            if (
                cli_output
                and "No such file or directory" not in cli_output
                and "error" not in cli_output.lower()
            ):
                return PreCheckResult(
                    "Image Availability",
                    PreCheckSeverity.PASS,
                    True,
                    f"Image file verified: /var/tmp/{self.image_filename}",
                    {
                        "image_path": f"/var/tmp/{self.image_filename}",
                        "method": "cli_command",
                    },
                )
        except Exception as e:
            logger.warning(f"[{self.hostname}] CLI command method failed: {e}")

        return PreCheckResult(
            "Image Availability",
            PreCheckSeverity.CRITICAL,
            False,
            f"Image file not found: /var/tmp/{self.image_filename}",
            {"expected_file": self.image_filename},
            f"Verify {self.image_filename} exists in /var/tmp/ on device",
        )

    def _check_storage_space_enhanced(self) -> PreCheckResult:
        try:
            response = self.device.rpc.get_system_storage()
            filesystems = response.findall(".//filesystem")
            for fs in filesystems:
                used_percent_text = fs.findtext("used-percent", "0").strip("%")
                try:
                    used_percent = int(used_percent_text)
                    free_percent = 100 - used_percent
                    if free_percent < MINIMUM_STORAGE_FREE_PERCENT:
                        return PreCheckResult(
                            "Storage Space",
                            PreCheckSeverity.CRITICAL,
                            False,
                            f"Insufficient storage space: {free_percent}% free",
                            recommendation="Clean up storage space before upgrade",
                        )
                except ValueError:
                    continue
            return PreCheckResult(
                "Storage Space",
                PreCheckSeverity.PASS,
                True,
                f"Sufficient storage space available (>{MINIMUM_STORAGE_FREE_PERCENT}% free)",
            )
        except Exception as e:
            return PreCheckResult(
                "Storage Space",
                PreCheckSeverity.WARNING,
                False,
                f"Storage check failed: {str(e)}",
                recommendation="Manually verify storage space",
            )

    def _check_configuration_committed_enhanced(self) -> PreCheckResult:
        try:
            response = self.device.rpc.get_configuration(
                compare="rollback", rollback="0"
            )
            if response.find(".//configuration-output") is not None:
                return PreCheckResult(
                    "Configuration Committed",
                    PreCheckSeverity.CRITICAL,
                    False,
                    "Device has uncommitted configuration changes",
                    recommendation="Commit configuration changes before upgrade",
                )
            return PreCheckResult(
                "Configuration Committed",
                PreCheckSeverity.PASS,
                True,
                "Configuration is properly committed",
            )
        except Exception as e:
            return PreCheckResult(
                "Configuration Committed",
                PreCheckSeverity.WARNING,
                False,
                f"Configuration check failed: {str(e)}",
                recommendation="Manually verify configuration is committed",
            )

    def _check_system_alarms_enhanced(self) -> PreCheckResult:
        try:
            response = self.device.rpc.get_alarm_information()
            critical_count = 0
            for severity in response.findall(".//alarm-severity"):
                if severity.text == "Critical":
                    critical_count += 1
            if critical_count > 0:
                return PreCheckResult(
                    "System Alarms",
                    PreCheckSeverity.CRITICAL,
                    False,
                    f"Critical alarms present: {critical_count}",
                    recommendation="Resolve critical alarms before upgrade",
                )
            return PreCheckResult(
                "System Alarms",
                PreCheckSeverity.PASS,
                True,
                f"No critical alarms detected",
            )
        except Exception as e:
            return PreCheckResult(
                "System Alarms",
                PreCheckSeverity.WARNING,
                False,
                f"Alarm check failed: {str(e)}",
                recommendation="Manually verify system alarms",
            )

    def run_all_checks(self) -> PreCheckSummary:
        summary = PreCheckSummary()
        checks = [
            self._check_image_availability_robust,
            self._check_storage_space_enhanced,
            self._check_configuration_committed_enhanced,
            self._check_system_alarms_enhanced,
        ]

        for check_func in checks:
            try:
                result = check_func()
                summary.results.append(result)
                logger.info(
                    f"[{self.hostname}] {check_func.__name__}: {result.severity.value}"
                )
            except Exception as e:
                logger.error(
                    f"[{self.hostname}] Check {check_func.__name__} failed: {e}"
                )
                summary.results.append(
                    PreCheckResult(
                        check_func.__name__.replace("_check_", "")
                        .replace("_", " ")
                        .title(),
                        PreCheckSeverity.CRITICAL,
                        False,
                        f"Check execution failed: {str(e)}",
                        recommendation="Investigate device connectivity",
                    )
                )
        return summary


# ================================================================================
# VERSION ANALYSIS UTILITIES
# ================================================================================


def parse_junos_version(version_string: str) -> Tuple[int, ...]:
    try:
        base_version = version_string.split("-")[0]
        match = re.match(r"(\d+)\.(\d+)([Rr]?)(\d*)", base_version)
        if not match:
            raise ValueError(f"Unsupported version format: {version_string}")
        major = int(match.group(1))
        minor = int(match.group(2))
        release_code = 1 if match.group(3).upper() == "R" else 0
        build = int(match.group(4)) if match.group(4) else 0
        return (major, minor, release_code, build, 0, 0)
    except Exception as e:
        logger.error(f"Version parsing error: {e}")
        return (0, 0, 0, 0, 0, 0)


def compare_versions(current: str, target: str) -> VersionAction:
    try:
        current_parts = parse_junos_version(current)
        target_parts = parse_junos_version(target)
        if current_parts == target_parts:
            return VersionAction.SAME_VERSION
        if target_parts[0] > current_parts[0]:
            return VersionAction.MAJOR_UPGRADE
        elif target_parts[0] < current_parts[0]:
            return VersionAction.MAJOR_DOWNGRADE
        if target_parts[1] > current_parts[1]:
            return VersionAction.MINOR_UPGRADE
        elif target_parts[1] < current_parts[1]:
            return VersionAction.MINOR_DOWNGRADE
        return VersionAction.UNKNOWN
    except Exception as e:
        logger.warning(f"Version comparison failed: {e}, defaulting to UNKNOWN")
        return VersionAction.UNKNOWN


# ================================================================================
# DEVICE UPGRADER - PROPER JUNIPER SW INSTALL METHOD
# ================================================================================


class DeviceUpgrader:
    def __init__(
        self,
        hostname: str,
        username: str,
        password: str,
        target_version: str,
        image_filename: str,
        vendor: str = "juniper",
        platform: str = "srx",
        skip_pre_check: bool = False,
        force_upgrade: bool = False,
    ):
        self.hostname = hostname
        self.username = username
        self.password = password
        self.target_version = target_version
        self.image_filename = image_filename
        self.vendor = vendor
        self.platform = platform
        self.skip_pre_check = skip_pre_check
        self.force_upgrade = force_upgrade

        self.device = None
        self.sw = None
        self.status = DeviceStatus(hostname, target_version)
        self.formatter = HumanReadableFormatter()

    @contextmanager
    def device_session(self):
        try:
            self.device = Device(
                host=self.hostname,
                user=self.username,
                password=self.password,
                timeout=DEFAULT_CONNECTION_TIMEOUT,
            )
            self.device.open()
            self.sw = SW(self.device)
            yield
        finally:
            if self.device:
                self.device.close()

    def get_current_version(self) -> str:
        try:
            facts = self.device.facts
            current_version = facts.get("version", "unknown")
            logger.info(f"[{self.hostname}] Current version: {current_version}")
            return current_version
        except Exception as e:
            logger.error(f"[{self.hostname}] ❌ Failed to get current version: {e}")
            raise

    def _upgrade_progress_callback(self, dev, report):
        """🎯 PROPER: Juniper-style progress callback"""
        logger.info(f"[{self.hostname}] 📦 Upgrade progress: {report}")

        progress_message = "Installing software package"
        progress_percent = 0

        if isinstance(report, dict):
            if "progress" in report:
                progress_percent = report["progress"]
            elif "message" in report:
                progress_message = report["message"]
        elif isinstance(report, str):
            progress_message = report

        send_upgrade_progress(
            self.status,
            "software_install",
            "in_progress",
            progress_percent,
            progress_message,
        )

    def execute_proper_software_install(self) -> Tuple[bool, str]:
        """
        Execute software installation using Juniper's official SW.install() method.

        Returns:
            Tuple[bool, str]: (success, message)
        """
        try:
            logger.info(
                f"[{self.hostname}] 📦 Starting PROPER Juniper software installation"
            )

            # 🎯 KEY FIX: Use the proper SW.install() method with correct parameters
            # For downgrades, we need to handle reboot parameter carefully
            version_action = compare_versions(
                self.status.current_version, self.target_version
            )
            is_downgrade = "downgrade" in version_action.value

            logger.info(
                f"[{self.hostname}] 🔄 Version action: {version_action.value}, Is downgrade: {is_downgrade}"
            )

            # Install with proper parameters
            # Note: For PyEZ 2.5.0+, install() returns a tuple (ok, msg)
            install_result = self.sw.install(
                package=f"/var/tmp/{self.image_filename}",
                progress=self._upgrade_progress_callback,
                validate=True,  # Always validate first
                no_copy=True,  # File already on device
                timeout=DEFAULT_OPERATION_TIMEOUT,
                # For downgrades, we'll handle reboot separately to ensure proper sequencing
                reboot=is_downgrade,  # Let Juniper handle reboot for downgrades
            )

            # Handle different return types based on PyEZ version
            if isinstance(install_result, tuple):
                # PyEZ 2.5.0+ returns (ok, msg)
                ok, msg = install_result
                if ok:
                    logger.info(
                        f"[{self.hostname}] ✅ Software installation completed successfully: {msg}"
                    )
                    return True, msg
                else:
                    logger.error(
                        f"[{self.hostname}] ❌ Software installation failed: {msg}"
                    )
                    return False, msg
            else:
                # Older PyEZ versions return boolean
                if install_result:
                    logger.info(
                        f"[{self.hostname}] ✅ Software installation completed successfully"
                    )
                    return True, "Installation completed"
                else:
                    logger.error(f"[{self.hostname}] ❌ Software installation failed")
                    return False, "Installation failed"

        except RpcError as e:
            error_msg = f"RPC error during installation: {str(e)}"
            logger.error(f"[{self.hostname}] ❌ {error_msg}")
            return False, error_msg
        except Exception as e:
            error_msg = f"Unexpected error during installation: {str(e)}"
            logger.error(f"[{self.hostname}] ❌ {error_msg}")
            return False, error_msg

    def run_pre_checks(self, current_version: str) -> bool:
        if self.skip_pre_check:
            logger.info(f"[{self.hostname}] ⏭️ Pre-check skipped by request")
            return True

        self.status.update_phase(UpgradePhase.PRE_CHECK, "Running enhanced pre-checks")
        send_device_progress(
            self.status, 1, STEPS_PER_DEVICE, "Running enhanced pre-checks"
        )

        checker = EnhancedPreCheckEngine(
            self.device, self.hostname, self.image_filename
        )
        pre_check_summary = checker.run_all_checks()

        try:
            version_action = compare_versions(current_version, self.target_version)
            self.status.version_action = version_action
            version_details = {
                "current_version": current_version,
                "target_version": self.target_version,
                "version_action": version_action.value,
            }

            if version_action == VersionAction.SAME_VERSION:
                pre_check_summary.results.append(
                    PreCheckResult(
                        "Version Compatibility",
                        PreCheckSeverity.WARNING,
                        True,
                        f"Version maintenance: already at {current_version}",
                        version_details,
                        "No version change required",
                    )
                )
            elif "downgrade" in version_action.value:
                pre_check_summary.results.append(
                    PreCheckResult(
                        "Version Compatibility",
                        PreCheckSeverity.WARNING,
                        True,
                        f"Version downgrade detected: {current_version} -> {self.target_version}",
                        version_details,
                        "Verify downgrade compatibility and risks",
                    )
                )
            else:
                pre_check_summary.results.append(
                    PreCheckResult(
                        "Version Compatibility",
                        PreCheckSeverity.PASS,
                        True,
                        f"Version upgrade: {current_version} -> {self.target_version}",
                        version_details,
                    )
                )
        except Exception as e:
            logger.warning(f"[{self.hostname}] Version compatibility check failed: {e}")

        self.status.pre_check_summary = pre_check_summary

        self.formatter.print_banner("PRE-CHECK COMPLETED")
        self.formatter.print_check_results_table(pre_check_summary)

        send_pre_check_results(self.status)

        if not pre_check_summary.can_proceed:
            if self.force_upgrade:
                logger.warning(
                    f"[{self.hostname}] ⚠️ Critical pre-check failures detected, but proceeding due to force_upgrade=True"
                )
                return True
            else:
                logger.error(
                    f"[{self.hostname}] ❌ Critical pre-check failures detected, upgrade blocked"
                )
                return False

        logger.info(f"[{self.hostname}] ✅ All pre-checks passed or acceptable")
        return True

    def _perform_enhanced_reboot_wait(self, upgrade_result: UpgradeResult) -> bool:
        reboot_start_time = time.time()

        try:
            logger.info(
                f"[{self.hostname}] ⏳ Initial reboot wait ({INITIAL_REBOOT_WAIT}s)"
            )
            time.sleep(INITIAL_REBOOT_WAIT)

            logger.info(
                f"[{self.hostname}] 🔄 Starting enhanced device recovery monitoring"
            )
            recovery_success, recovery_message = wait_for_device_recovery(
                hostname=self.hostname,
                username=self.username,
                password=self.password,
                max_wait_time=MAX_REBOOT_WAIT_TIME,
                polling_interval=POLLING_INTERVAL,
            )

            reboot_wait_time = time.time() - reboot_start_time
            upgrade_result.reboot_wait_time = reboot_wait_time

            if recovery_success:
                logger.info(
                    f"[{self.hostname}] ✅ Device fully recovered after {reboot_wait_time:.1f}s"
                )
                return True
            else:
                logger.error(
                    f"[{self.hostname}] ❌ Device recovery failed: {recovery_message}"
                )
                upgrade_result.errors.append(
                    f"Device recovery failed: {recovery_message}"
                )
                return False

        except Exception as e:
            reboot_wait_time = time.time() - reboot_start_time
            upgrade_result.reboot_wait_time = reboot_wait_time
            error_msg = f"Reboot wait process failed: {str(e)}"
            logger.error(f"[{self.hostname}] ❌ {error_msg}")
            upgrade_result.errors.append(error_msg)
            return False

    def execute_upgrade_workflow(self) -> bool:
        """🎯 FIXED: Use proper Juniper SW.install() method"""
        self.status.start_time = time.time()
        logger.info(f"[{self.hostname}] 🚀 Starting upgrade process")

        try:
            with self.device_session():
                # Step 1: Get current version
                self.status.update_phase(
                    UpgradePhase.CONNECTING, "Connecting to device"
                )
                send_device_progress(
                    self.status, 1, STEPS_PER_DEVICE, "Connecting to device"
                )

                current_version = self.get_current_version()
                self.status.current_version = current_version

                # Step 2: Run pre-checks
                self.status.update_phase(
                    UpgradePhase.PRE_CHECK, "Running enhanced pre-checks"
                )
                send_device_progress(
                    self.status, 2, STEPS_PER_DEVICE, "Running pre-checks"
                )

                if not self.run_pre_checks(current_version):
                    return False

                # Initialize upgrade result tracking
                upgrade_result = UpgradeResult(
                    success=False,
                    start_time=time.time(),
                    end_time=0,
                    initial_version=current_version,
                    version_action=self.status.version_action,
                )

                # Step 3: Validate upgrade parameters
                self.status.update_phase(
                    UpgradePhase.VALIDATING, "Validating upgrade parameters"
                )
                send_device_progress(
                    self.status, 3, STEPS_PER_DEVICE, "Validating upgrade"
                )
                upgrade_result.add_step(
                    "validation", "completed", "Upgrade parameters validated", 0.5
                )

                # Step 4: Install the software using PROPER method
                self.status.update_phase(
                    UpgradePhase.INSTALLING, "Installing new software version"
                )
                send_device_progress(
                    self.status, 4, STEPS_PER_DEVICE, "Installing software"
                )

                install_start = time.time()
                try:
                    # 🎯 KEY FIX: Use the proper installation method
                    install_success, install_message = (
                        self.execute_proper_software_install()
                    )

                    install_duration = time.time() - install_start
                    if install_success:
                        upgrade_result.add_step(
                            "installation",
                            "completed",
                            f"Software installed: {install_message}",
                            install_duration,
                        )
                        logger.info(
                            f"[{self.hostname}] ✅ Software installation completed successfully"
                        )
                    else:
                        upgrade_result.add_step(
                            "installation",
                            "failed",
                            f"Installation failed: {install_message}",
                            install_duration,
                        )
                        upgrade_result.errors.append(
                            f"Software installation failed: {install_message}"
                        )
                        raise Exception(f"Installation failed: {install_message}")

                except Exception as e:
                    install_duration = time.time() - install_start
                    upgrade_result.add_step(
                        "installation",
                        "failed",
                        f"Installation failed: {str(e)}",
                        install_duration,
                    )
                    upgrade_result.errors.append(
                        f"Software installation failed: {str(e)}"
                    )
                    raise

                # Step 5: Handle reboot if needed
                # Check if we need to manually trigger reboot (for some downgrade scenarios)
                version_action = compare_versions(current_version, self.target_version)
                is_downgrade = "downgrade" in version_action.value

                if is_downgrade:
                    # For downgrades, we might need to manually trigger reboot
                    self.status.update_phase(
                        UpgradePhase.REBOOTING,
                        "Rebooting device to activate new software",
                    )
                    send_device_progress(
                        self.status, 5, STEPS_PER_DEVICE, "Rebooting device"
                    )

                    reboot_start = time.time()
                    try:
                        logger.info(
                            f"[{self.hostname}] 🔄 Manually triggering reboot for downgrade"
                        )
                        reboot_result = self.sw.reboot()
                        reboot_duration = time.time() - reboot_start
                        upgrade_result.reboot_required = True
                        upgrade_result.reboot_performed = True
                        upgrade_result.add_step(
                            "reboot",
                            "completed",
                            "Device rebooted successfully",
                            reboot_duration,
                        )

                        # Enhanced reboot waiting
                        logger.info(
                            f"[{self.hostname}] ⏳ Starting enhanced reboot waiting"
                        )
                        if not self._perform_enhanced_reboot_wait(upgrade_result):
                            raise Exception(
                                "Device did not recover within expected time"
                            )

                    except Exception as e:
                        reboot_duration = time.time() - reboot_start
                        upgrade_result.add_step(
                            "reboot",
                            "failed",
                            f"Reboot failed: {str(e)}",
                            reboot_duration,
                        )
                        upgrade_result.errors.append(f"Device reboot failed: {str(e)}")
                        raise

                # Step 6: Reconnect and verify
                self.status.update_phase(
                    UpgradePhase.VERIFYING, "Verifying new software version"
                )
                send_device_progress(
                    self.status, 6, STEPS_PER_DEVICE, "Verifying upgrade"
                )

                verify_start = time.time()
                try:
                    # Re-establish connection to verify version
                    if self.device:
                        self.device.close()
                    time.sleep(10)

                    # Reconnect using device session
                    with self.device_session():
                        final_version = self.get_current_version()
                        self.status.final_version = final_version
                        upgrade_result.final_version = final_version

                        verify_duration = time.time() - verify_start
                        upgrade_result.add_step(
                            "verification",
                            "completed",
                            f"Verified version: {final_version}",
                            verify_duration,
                        )

                except Exception as e:
                    verify_duration = time.time() - verify_start
                    upgrade_result.add_step(
                        "verification",
                        "failed",
                        f"Verification failed: {str(e)}",
                        verify_duration,
                    )
                    upgrade_result.errors.append(
                        f"Version verification failed: {str(e)}"
                    )
                    raise

                # Step 7: Complete the upgrade
                upgrade_result.end_time = time.time()
                upgrade_result.success = True
                self.status.set_upgrade_result(upgrade_result)

                self.status.end_time = time.time()
                self.status.update_phase(
                    UpgradePhase.COMPLETED, "Upgrade completed successfully"
                )
                send_device_progress(
                    self.status, 7, STEPS_PER_DEVICE, "Upgrade completed"
                )

                logger.info(
                    f"[{self.hostname}] ✅ Upgrade completed successfully in {self.status.get_duration():.1f} seconds"
                )

                self.formatter.print_upgrade_results(self.status)
                send_operation_complete(
                    self.status, True, "Upgrade completed successfully"
                )
                return True

        except Exception as e:
            self.status.end_time = time.time()
            self.status.update_phase(UpgradePhase.FAILED, f"Upgrade failed: {str(e)}")
            self.status.error = str(e)
            self.status.error_type = type(e).__name__
            self.status.success = False

            if hasattr(self, "upgrade_result") and self.status.upgrade_result:
                self.status.upgrade_result.end_time = time.time()
                self.status.upgrade_result.success = False
                self.status.upgrade_result.errors.append(
                    f"Upgrade workflow failed: {str(e)}"
                )

            logger.error(f"[{self.hostname}] ❌ Upgrade failed: {str(e)}")
            self.formatter.print_upgrade_results(self.status)
            send_operation_complete(self.status, False, f"Upgrade failed: {str(e)}")
            return False


# ================================================================================
# PRE-CHECK ONLY WORKFLOW
# ================================================================================


def execute_pre_check_only(
    hostname: str,
    username: str,
    password: str,
    target_version: str,
    image_filename: str,
    vendor: str = "juniper",
    platform: str = "srx",
) -> bool:
    logger.info(f"[{hostname}] 🔍 Starting pre-check only workflow")

    upgrader = DeviceUpgrader(
        hostname=hostname,
        username=username,
        password=password,
        target_version=target_version,
        image_filename=image_filename,
        vendor=vendor,
        platform=platform,
        skip_pre_check=False,
        force_upgrade=False,
    )

    upgrader.status.start_time = time.time()
    upgrader.status.phase = UpgradePhase.PRE_CHECK

    try:
        with upgrader.device_session():
            upgrader.status.update_phase(
                UpgradePhase.CONNECTING, "Connecting to device"
            )
            send_device_progress(upgrader.status, 1, 3, "Connecting to device")

            current_version = upgrader.get_current_version()
            upgrader.status.current_version = current_version

            upgrader.status.update_phase(
                UpgradePhase.PRE_CHECK, "Running enhanced pre-checks"
            )
            send_device_progress(upgrader.status, 2, 3, "Running enhanced pre-checks")

            success = upgrader.run_pre_checks(current_version)

            upgrader.status.update_phase(
                UpgradePhase.COMPLETED, "Pre-check validation completed"
            )
            send_device_progress(
                upgrader.status, 3, 3, "Pre-check validation completed"
            )

            upgrader.status.end_time = time.time()
            upgrader.status.success = success

            send_operation_complete(
                upgrader_status,
                success,
                "Pre-check completed successfully"
                if success
                else "Pre-check completed with warnings",
            )

            logger.info(
                f"[{hostname}] ✅ Pre-check only workflow completed successfully"
            )
            return success

    except Exception as e:
        logger.error(f"[{hostname}] ❌ Pre-check only workflow failed: {str(e)}")
        upgrader.status.end_time = time.time()
        upgrader.status.success = False
        send_operation_complete(upgrader.status, False, f"Pre-check failed: {str(e)}")
        return False


# ================================================================================
# MAIN EXECUTION - BACKWARD COMPATIBLE ARGUMENT PARSING
# ================================================================================


def main():
    parser = argparse.ArgumentParser(
        description="Device Code Upgrade - Proper Juniper SW Install",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    # Phase argument (required)
    parser.add_argument(
        "--phase",
        required=True,
        choices=["pre_check", "upgrade"],
        help="Operation phase",
    )

    # Device targeting arguments
    parser.add_argument("--hostname", help="Target device hostname or IP")
    parser.add_argument("--inventory-file", help="Inventory file for multiple devices")

    # Authentication arguments
    parser.add_argument("--username", required=True, help="Device username")
    parser.add_argument("--password", required=True, help="Device password")

    # Vendor and platform arguments
    parser.add_argument("--vendor", default="juniper", help="Device vendor")
    parser.add_argument("--platform", default="srx", help="Device platform")

    # 🎯 BACKWARD COMPATIBLE: Support both old and new argument names
    parser.add_argument("--target_version", help="Target software version (old style)")
    parser.add_argument(
        "--target-version",
        dest="target_version_compat",
        help="Target software version (new style)",
    )

    parser.add_argument("--image_filename", help="Upgrade image filename (old style)")
    parser.add_argument(
        "--image-file",
        dest="image_filename_compat",
        help="Upgrade image filename (new style)",
    )

    # Upgrade control arguments
    parser.add_argument(
        "--skip-pre-check", action="store_true", help="Skip pre-check phase"
    )
    parser.add_argument(
        "--force", action="store_true", help="Force upgrade despite warnings"
    )

    args = parser.parse_args()

    # 🎯 BACKWARD COMPATIBLE: Resolve target version from both argument names
    target_version = args.target_version or args.target_version_compat
    if not target_version:
        logger.error(
            "❌ Target version must be specified using either --target_version or --target-version"
        )
        sys.exit(1)

    # 🎯 BACKWARD COMPATIBLE: Resolve image filename from both argument names
    image_filename = args.image_filename or args.image_filename_compat
    if not image_filename:
        logger.error(
            "❌ Image filename must be specified using either --image_filename or --image-file"
        )
        sys.exit(1)

    if not args.hostname and not args.inventory_file:
        logger.error("❌ Either --hostname or --inventory-file must be specified")
        sys.exit(1)

    try:
        if args.hostname:
            if args.phase == "pre_check":
                success = execute_pre_check_only(
                    hostname=args.hostname,
                    username=args.username,
                    password=args.password,
                    target_version=target_version,
                    image_filename=image_filename,
                    vendor=args.vendor,
                    platform=args.platform,
                )
                sys.exit(0 if success else 1)
            else:
                upgrader = DeviceUpgrader(
                    hostname=args.hostname,
                    username=args.username,
                    password=args.password,
                    target_version=target_version,
                    image_filename=image_filename,
                    vendor=args.vendor,
                    platform=args.platform,
                    skip_pre_check=args.skip_pre_check,
                    force_upgrade=args.force,
                )
                success = upgrader.execute_upgrade_workflow()
                sys.exit(0 if success else 1)
        else:
            logger.info(f"📋 Processing inventory file: {args.inventory_file}")
            sys.exit(1)

    except KeyboardInterrupt:
        logger.info("🛑 Operation cancelled by user")
        sys.exit(130)
    except Exception as e:
        logger.error(f"💥 Fatal error: {str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    main()
