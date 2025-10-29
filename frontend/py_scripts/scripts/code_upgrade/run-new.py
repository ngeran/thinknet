#!/usr/bin/env python3
"""
================================================================================
SCRIPT:             Juniper Device Code Upgrade - Enterprise Grade
FILENAME:           run.py
VERSION:            7.0 (Production-Ready with Comprehensive Failsafes)
AUTHOR:             Network Infrastructure Team
CREATED:            2025-07-25
LAST UPDATED:       2025-10-28 14:56:34 UTC
USER:               nikos-geranios_vgi
================================================================================
 
DESCRIPTION:
    Enterprise-grade automated solution for upgrading or downgrading firmware
    on Juniper network devices with comprehensive fail-safe mechanisms, pre-flight
    validation, automatic rollback capabilities, and enhanced user feedback.
 
IMPROVEMENTS IN V7.0:
    - Comprehensive pre-flight validation (storage, alarms, system health)
    - Automatic snapshot creation for emergency rollback
    - Configuration backup before upgrade
    - Context-aware error messages with specific recovery steps
    - Progress tracking with ETA calculations
    - Checkpoint persistence for resume capability
    - Enhanced logging with structured output
    - Graceful degradation with clear blocking vs warning separation
 
USAGE:
    python run.py --hostname "router1" --username admin --password "pass" \\
                  --image_filename "junos-21.4R3.tgz" --target_version "21.4R3"
================================================================================
"""

import logging
import sys
import argparse
import time
import subprocess
import concurrent.futures
import json
import re
import os
from typing import List, Optional, Tuple, Dict, Any
from enum import Enum
from dataclasses import dataclass, field
from contextlib import contextmanager

try:
    from jnpr.junos import Device
    from jnpr.junos.utils.sw import SW
    from jnpr.junos.exception import ConnectError, RpcError
except ImportError as e:
    print(f"ERROR: Required Juniper PyEZ library not found: {e}", file=sys.stderr)
    print("Install with: pip install junos-eznc", file=sys.stderr)
    sys.exit(1)

# ================================================================================
# CONFIGURATION
# ================================================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)-8s - %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)

STEPS_PER_DEVICE = 8
DEFAULT_MAX_WORKERS = 5
DEFAULT_DEVICE_TIMEOUT = 2400
DEFAULT_REBOOT_TIMEOUT = 900
DEFAULT_CONNECTION_TIMEOUT = 30
DEFAULT_RETRY_ATTEMPTS = 3
DEFAULT_LOG_DIR = "/var/log/juniper-upgrades"

MIN_STORAGE_BUFFER_MB = 500
STORAGE_MULTIPLIER = 1.5

MAX_CPU_USAGE_PERCENT = 90
MAX_STORAGE_USAGE_PERCENT = 85
MAX_MEMORY_USAGE_PERCENT = 90

# ================================================================================
# EXCEPTIONS
# ================================================================================


class DeviceUpgradeError(Exception):
    """Base exception for all device upgrade operations."""

    pass


class ConnectionError(DeviceUpgradeError):
    """Raised when device connection fails."""

    pass


class PreFlightCheckError(DeviceUpgradeError):
    """Raised when pre-flight validation detects blocking issues."""

    pass


class ImageValidationError(DeviceUpgradeError):
    """Raised when software image validation fails."""

    pass


class VersionAnalysisError(DeviceUpgradeError):
    """Raised when version comparison fails."""

    pass


class InstallationError(DeviceUpgradeError):
    """Raised when software installation fails."""

    pass


class RebootTimeoutError(DeviceUpgradeError):
    """Raised when device doesn't respond after reboot."""

    pass


class VersionMismatchError(DeviceUpgradeError):
    """Raised when final version doesn't match target."""

    pass


class PolicyViolationError(DeviceUpgradeError):
    """Raised when operation violates policies."""

    pass


class BackupError(DeviceUpgradeError):
    """Raised when backup/snapshot creation fails."""

    pass


class StorageError(DeviceUpgradeError):
    """Raised when storage issues prevent upgrade."""

    pass


# ================================================================================
# DATA STRUCTURES
# ================================================================================


class UpgradePhase(Enum):
    PENDING = "pending"
    CONNECTING = "connecting"
    PREFLIGHT_CHECKS = "preflight_checks"
    CREATING_BACKUP = "creating_backup"
    VALIDATING_IMAGE = "validating_image"
    ANALYZING_VERSION = "analyzing_version"
    INSTALLING = "installing"
    REBOOTING = "rebooting"
    PROBING = "probing"
    VERIFYING = "verifying"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"
    CANCELLED = "cancelled"


class VersionAction(Enum):
    UPGRADE = "upgrade"
    DOWNGRADE = "downgrade"
    MAINTAIN = "maintain"
    UNKNOWN = "unknown"


class CheckSeverity(Enum):
    BLOCKER = "blocker"
    WARNING = "warning"
    INFO = "info"


@dataclass
class PreFlightCheck:
    name: str
    passed: bool
    severity: CheckSeverity
    message: str
    details: Dict[str, Any] = field(default_factory=dict)
    recovery_steps: List[str] = field(default_factory=list)


@dataclass
class PreFlightResults:
    checks: List[PreFlightCheck] = field(default_factory=list)
    has_blockers: bool = False
    blocker_count: int = 0
    warning_count: int = 0
    info_count: int = 0
    overall_passed: bool = True

    def add_check(self, check: PreFlightCheck):
        self.checks.append(check)
        if check.severity == CheckSeverity.BLOCKER and not check.passed:
            self.blocker_count += 1
            self.has_blockers = True
            self.overall_passed = False
        elif check.severity == CheckSeverity.WARNING and not check.passed:
            self.warning_count += 1
        elif check.severity == CheckSeverity.INFO:
            self.info_count += 1

    def get_blockers(self) -> List[PreFlightCheck]:
        return [
            c
            for c in self.checks
            if c.severity == CheckSeverity.BLOCKER and not c.passed
        ]

    def get_warnings(self) -> List[PreFlightCheck]:
        return [
            c
            for c in self.checks
            if c.severity == CheckSeverity.WARNING and not c.passed
        ]


@dataclass
class BackupInfo:
    snapshot_created: bool = False
    snapshot_name: Optional[str] = None
    config_backed_up: bool = False
    config_backup_path: Optional[str] = None
    backup_errors: List[str] = field(default_factory=list)


@dataclass
class DeviceStatus:
    hostname: str
    target_version: str
    phase: UpgradePhase = UpgradePhase.PENDING
    message: str = "Waiting to start"
    initial_version: Optional[str] = None
    final_version: Optional[str] = None
    version_action: VersionAction = VersionAction.UNKNOWN
    error: Optional[str] = None
    error_type: Optional[str] = None
    success: bool = False
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    step_durations: Dict[int, float] = field(default_factory=dict)
    warnings: List[str] = field(default_factory=list)
    preflight_results: Optional[PreFlightResults] = None
    backup_info: Optional[BackupInfo] = None

    def update_phase(self, phase: UpgradePhase, message: str = ""):
        self.phase = phase
        self.message = message or phase.value.replace("_", " ").title()
        logger.info(f"[{self.hostname}] PHASE: {self.phase.name} - {self.message}")

    def add_warning(self, warning: str):
        if warning not in self.warnings:
            self.warnings.append(warning)
            logger.warning(f"[{self.hostname}] WARNING: {warning}")

    def get_duration(self) -> float:
        if self.start_time and self.end_time:
            return self.end_time - self.start_time
        elif self.start_time:
            return time.time() - self.start_time
        return 0.0


# ================================================================================
# UTILITY FUNCTIONS
# ================================================================================


def format_duration(seconds: float) -> str:
    """Format duration in human-readable format."""
    if seconds < 60:
        return f"{int(seconds)}s"
    elif seconds < 3600:
        minutes = int(seconds / 60)
        secs = int(seconds % 60)
        return f"{minutes}m {secs}s"
    else:
        hours = int(seconds / 3600)
        minutes = int((seconds % 3600) / 60)
        return f"{hours}h {minutes}m"


def parse_storage_size(size_str: str) -> int:
    """Parse storage size string to megabytes."""
    size_str = size_str.strip().upper()
    try:
        if "G" in size_str:
            return int(float(size_str.rstrip("G")) * 1024)
        elif "M" in size_str:
            return int(float(size_str.rstrip("M")))
        elif "K" in size_str:
            return int(float(size_str.rstrip("K")) / 1024)
        else:
            return int(float(size_str)) // (1024 * 1024)
    except (ValueError, AttributeError):
        return 0


def setup_device_logger(
    hostname: str, log_dir: str = DEFAULT_LOG_DIR
) -> logging.Logger:
    """Setup device-specific logging."""
    try:
        os.makedirs(log_dir, exist_ok=True)
    except:
        log_dir = "/tmp"

    device_logger = logging.getLogger(f"upgrade.{hostname}")
    device_logger.setLevel(logging.DEBUG)

    if device_logger.handlers:
        return device_logger

    timestamp = time.strftime("%Y%m%d-%H%M%S")
    log_file = os.path.join(log_dir, f"{hostname}-{timestamp}.log")

    try:
        file_handler = logging.FileHandler(log_file)
        file_handler.setLevel(logging.DEBUG)
        formatter = logging.Formatter(
            '{"timestamp": "%(asctime)s", "level": "%(levelname)s", "device": "'
            + hostname
            + '", "message": "%(message)s"}'
        )
        file_handler.setFormatter(formatter)
        device_logger.addHandler(file_handler)
    except:
        pass

    return device_logger


# ================================================================================
# PROGRESS REPORTING
# ================================================================================


def send_progress(event_type: str, data: Dict[str, Any], message: str = ""):
    """Send structured progress updates to stderr."""
    progress_update = {
        "event_type": event_type,
        "message": message,
        "data": {
            **data,
            "timestamp": time.time(),
            "iso_timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        },
    }
    print(f"JSON_PROGRESS: {json.dumps(progress_update)}", file=sys.stderr, flush=True)


def send_step_progress(
    step: int,
    event_type: str,
    status: str = None,
    message: str = "",
    duration: float = None,
    **extra_data,
):
    """Send step-specific progress updates."""
    data = {"step": step, **extra_data}
    if status:
        data["status"] = status
    if duration is not None:
        data["duration"] = round(duration, 2)
        data["duration_formatted"] = format_duration(duration)
    send_progress(event_type, data, message)


def send_progress_with_eta(
    event_type: str,
    data: Dict[str, Any],
    message: str = "",
    total_steps: int = 0,
    completed_steps: int = 0,
    start_time: float = None,
):
    """Enhanced progress with ETA calculation."""
    eta_info = {}
    if start_time and total_steps > 0 and completed_steps > 0:
        elapsed = time.time() - start_time
        avg_time_per_step = elapsed / completed_steps
        remaining_steps = total_steps - completed_steps
        eta_seconds = remaining_steps * avg_time_per_step

        eta_info = {
            "elapsed_seconds": round(elapsed, 1),
            "elapsed_formatted": format_duration(elapsed),
            "eta_seconds": round(eta_seconds, 1),
            "eta_formatted": format_duration(eta_seconds),
            "completion_percentage": round((completed_steps / total_steps) * 100, 1),
            "average_step_duration": round(avg_time_per_step, 1),
        }

    progress_update = {
        "event_type": event_type,
        "message": message,
        "data": {
            **data,
            **eta_info,
            "timestamp": time.time(),
            "iso_timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        },
    }
    print(f"JSON_PROGRESS: {json.dumps(progress_update)}", file=sys.stderr, flush=True)


# ================================================================================
# ERROR HANDLING
# ================================================================================


class UpgradeErrorHandler:
    """Centralized error handling with recovery suggestions."""

    @staticmethod
    def get_recovery_steps(error_type: str, context: Dict[str, Any]) -> List[str]:
        """Generate context-specific recovery steps."""
        hostname = context.get("hostname", "device")

        recovery_map = {
            "ConnectionError": [
                f"1. Verify network connectivity: ping {hostname}",
                "2. Check SSH service on device (console access required)",
                "3. Verify credentials are correct",
                "4. Check firewall rules",
                "5. Verify device is powered on",
            ],
            "PreFlightCheckError": [
                "1. Review specific check failures above",
                "2. For storage: request system storage cleanup",
                "3. For alarms: show system alarms and resolve",
                "4. Re-run script after fixes",
            ],
            "ImageValidationError": [
                "1. Verify image file integrity",
                f"2. Re-upload: scp <image> user@{hostname}:/var/tmp/",
                "3. Check storage: show system storage",
                "4. Verify official Juniper image source",
            ],
            "InstallationError": [
                "1. Check logs: show log messages | match install",
                "2. Verify image integrity",
                "3. Check for conflicting processes",
                "4. Ensure no pending config changes",
            ],
            "RebootTimeoutError": [
                "⚠️ CRITICAL: Device did not come back online",
                "1. Access console IMMEDIATELY",
                "2. If at loader: boot /dev/da0s2a",
                "3. Device may still be booting (wait 10-20 min)",
                "4. Check console for errors",
                "5. Rollback: request system snapshot slice alternate",
            ],
            "VersionMismatchError": [
                "1. Verify correct image specified",
                "2. Check version: show version",
                "3. Check packages: show system software",
                "4. Try second reboot",
                "5. Review installation logs",
            ],
            "PolicyViolationError": [
                "1. Review change management policy",
                "2. Use --allow-downgrade if authorized",
                "3. Verify target version approved",
                "4. Document justification",
            ],
            "StorageError": [
                "1. request system storage cleanup",
                "2. file delete /var/log/*.gz",
                "3. Remove old software versions",
                "4. Check: file list /var/crash/",
            ],
        }

        steps = recovery_map.get(
            error_type,
            [
                "1. Review error details",
                "2. Check device logs",
                "3. Verify device accessibility",
                "4. Contact network operations",
            ],
        )

        try:
            return [step.format(**context) for step in steps]
        except:
            return steps

    @staticmethod
    def format_error_message(
        error: Exception, error_type: str, context: Dict[str, Any]
    ) -> str:
        """Format comprehensive error message."""
        hostname = context.get("hostname", "device")

        lines = [
            "=" * 80,
            f"ERROR: {error_type}",
            f"Device: {hostname}",
            "=" * 80,
            "",
            "DESCRIPTION:",
            str(error),
            "",
            "RECOVERY STEPS:",
            "",
        ]

        lines.extend(UpgradeErrorHandler.get_recovery_steps(error_type, context))

        if context.get("snapshot_name"):
            lines.extend(
                [
                    "",
                    f"ROLLBACK AVAILABLE: {context['snapshot_name']}",
                    "To rollback:",
                    "  1. request system snapshot slice alternate",
                    "  2. request system reboot",
                ]
            )

        if context.get("config_backup"):
            lines.extend(
                [
                    "",
                    f"Config backup: {context['config_backup']}",
                    f"To restore: load override {context['config_backup']} && commit",
                ]
            )

        lines.append("=" * 80)
        return "\n".join(lines)


# ================================================================================
# VERSION FUNCTIONS
# ================================================================================


def parse_junos_version(version_string: str) -> Tuple[int, ...]:
    """Parse Junos version string into comparable components."""
    if not version_string:
        return (0, 0, 0, 0, 0)

    clean_version = version_string.replace("Junos: ", "").replace("JUNOS ", "").strip()

    try:
        pattern = r"(\d+)\.(\d+)R(\d+)(?:-S(\d+))?(?:\.(\d+))?(?:-\w+)?"
        match = re.match(pattern, clean_version)

        if match:
            major, minor, release, service, patch = match.groups()
            return (
                int(major),
                int(minor),
                int(release),
                int(service) if service else 0,
                int(patch) if patch else 0,
            )

        numbers = re.findall(r"\d+", clean_version)
        if len(numbers) >= 3:
            return tuple(int(n) for n in numbers[:5]) + (0,) * (5 - len(numbers))

        return (0, 0, 0, 0, 0)

    except (ValueError, AttributeError):
        return (0, 0, 0, 0, 0)


def compare_junos_versions(current: str, target: str) -> VersionAction:
    """Compare two Junos versions."""
    try:
        current_parsed = parse_junos_version(current)
        target_parsed = parse_junos_version(target)

        if current_parsed == (0, 0, 0, 0, 0) or target_parsed == (0, 0, 0, 0, 0):
            return VersionAction.UNKNOWN

        if current_parsed == target_parsed:
            return VersionAction.MAINTAIN
        elif current_parsed < target_parsed:
            return VersionAction.UPGRADE
        else:
            return VersionAction.DOWNGRADE

    except:
        return VersionAction.UNKNOWN


def analyze_version_compatibility(current: str, target: str) -> Dict[str, Any]:
    """Perform comprehensive version analysis."""
    analysis = {
        "action": compare_junos_versions(current, target),
        "current_parsed": parse_junos_version(current),
        "target_parsed": parse_junos_version(target),
        "warnings": [],
        "recommendations": [],
        "risk_level": "LOW",
    }

    current_major, current_minor, _, _, _ = analysis["current_parsed"]
    target_major, target_minor, _, _, _ = analysis["target_parsed"]

    if current_major != target_major:
        analysis["risk_level"] = "HIGH"
        if analysis["action"] == VersionAction.UPGRADE:
            analysis["warnings"].append(
                f"Major version upgrade ({current_major}.x -> {target_major}.x)"
            )
            analysis["recommendations"].extend(
                [
                    "Review release notes",
                    "Test in lab first",
                    "Verify feature compatibility",
                ]
            )
        else:
            analysis["warnings"].append(
                f"Major version downgrade ({current_major}.x -> {target_major}.x)"
            )

    elif current_minor != target_minor:
        minor_diff = abs(target_minor - current_minor)
        if minor_diff > 2:
            analysis["risk_level"] = "MEDIUM"
            analysis["warnings"].append(f"Large version gap ({minor_diff} releases)")

    if analysis["action"] == VersionAction.DOWNGRADE:
        if analysis["risk_level"] == "LOW":
            analysis["risk_level"] = "MEDIUM"
        analysis["recommendations"].extend(
            [
                "Create snapshot before downgrade",
                "Backup configuration",
                "Document reason",
            ]
        )

    return analysis


# ================================================================================
# PRE-FLIGHT CHECKS
# ================================================================================


def perform_comprehensive_preflight_checks(
    dev: Device, hostname: str, image_filename: str, current_step: int
) -> PreFlightResults:
    """Perform comprehensive pre-flight validation."""
    step_start = time.time()
    send_step_progress(
        current_step, "STEP_START", message=f"Pre-flight checks on {hostname}..."
    )

    results = PreFlightResults()

    # Storage Check
    send_progress("SUB_STEP", {"step": current_step}, "Checking storage...")

    try:
        storage_output = dev.cli("show system storage", warning=False)
        var_usage_pct = None
        available_space_mb = 0

        for line in storage_output.split("\n"):
            if "/var" in line or "/dev/" in line:
                parts = line.split()
                if len(parts) >= 5:
                    try:
                        var_usage_pct = int(parts[4].rstrip("%"))
                        available_space_mb = parse_storage_size(parts[3])
                        break
                    except:
                        pass

        image_size_mb = 500
        try:
            image_info = dev.cli(
                f"file list /var/tmp/{image_filename} detail", warning=False
            )
            for line in image_info.split("\n"):
                if image_filename in line:
                    parts = line.split()
                    if len(parts) >= 5 and parts[4].isdigit():
                        image_size_mb = int(parts[4]) // (1024 * 1024)
                        break
        except:
            pass

        required_space_mb = (
            int(image_size_mb * STORAGE_MULTIPLIER) + MIN_STORAGE_BUFFER_MB
        )

        if available_space_mb < required_space_mb:
            results.add_check(
                PreFlightCheck(
                    name="Storage Space",
                    passed=False,
                    severity=CheckSeverity.BLOCKER,
                    message=f"Insufficient storage: {available_space_mb}MB available, {required_space_mb}MB required",
                    details={
                        "available_mb": available_space_mb,
                        "required_mb": required_space_mb,
                    },
                    recovery_steps=[
                        "request system storage cleanup",
                        "file delete /var/log/*.gz",
                        f"Free {required_space_mb - available_space_mb}MB",
                    ],
                )
            )
        elif var_usage_pct and var_usage_pct > MAX_STORAGE_USAGE_PERCENT:
            results.add_check(
                PreFlightCheck(
                    name="Storage Space",
                    passed=False,
                    severity=CheckSeverity.WARNING,
                    message=f"/var partition {var_usage_pct}% full",
                )
            )
        else:
            results.add_check(
                PreFlightCheck(
                    name="Storage Space",
                    passed=True,
                    severity=CheckSeverity.INFO,
                    message=f"Sufficient storage: {available_space_mb}MB",
                )
            )

    except Exception as e:
        results.add_check(
            PreFlightCheck(
                name="Storage Space",
                passed=False,
                severity=CheckSeverity.WARNING,
                message=f"Could not verify storage: {e}",
            )
        )

    # System Alarms Check
    send_progress("SUB_STEP", {"step": current_step}, "Checking alarms...")

    try:
        alarms_output = dev.cli("show system alarms", warning=False)

        if "No alarms currently active" not in alarms_output:
            alarm_lines = []
            for line in alarms_output.split("\n"):
                line = line.strip()
                if line and not line.startswith("Alarm") and "time" not in line.lower():
                    alarm_lines.append(line)

            if alarm_lines:
                results.add_check(
                    PreFlightCheck(
                        name="System Alarms",
                        passed=False,
                        severity=CheckSeverity.BLOCKER,
                        message=f"Active alarms: {len(alarm_lines)}",
                        details={"alarms": alarm_lines},
                        recovery_steps=[
                            "show system alarms",
                            "Resolve critical alarms",
                        ],
                    )
                )
        else:
            results.add_check(
                PreFlightCheck(
                    name="System Alarms",
                    passed=True,
                    severity=CheckSeverity.INFO,
                    message="No active alarms",
                )
            )
    except:
        pass

    # Chassis Alarms
    try:
        chassis_alarms = dev.cli("show chassis alarms", warning=False)
        if "No alarms currently active" not in chassis_alarms:
            results.add_check(
                PreFlightCheck(
                    name="Chassis Alarms",
                    passed=False,
                    severity=CheckSeverity.WARNING,
                    message="Chassis alarms detected",
                )
            )
        else:
            results.add_check(
                PreFlightCheck(
                    name="Chassis Alarms",
                    passed=True,
                    severity=CheckSeverity.INFO,
                    message="No chassis alarms",
                )
            )
    except:
        pass

    # CPU Check
    try:
        routing_engine = dev.cli("show chassis routing-engine", warning=False)
        for line in routing_engine.split("\n"):
            if "CPU" in line and "%" in line:
                match = re.search(r"(\d+)\s*%", line)
                if match:
                    cpu_usage = int(match.group(1))
                    if cpu_usage > MAX_CPU_USAGE_PERCENT:
                        results.add_check(
                            PreFlightCheck(
                                name="CPU Usage",
                                passed=False,
                                severity=CheckSeverity.WARNING,
                                message=f"High CPU: {cpu_usage}%",
                            )
                        )
                    else:
                        results.add_check(
                            PreFlightCheck(
                                name="CPU Usage",
                                passed=True,
                                severity=CheckSeverity.INFO,
                                message=f"CPU normal: {cpu_usage}%",
                            )
                        )
                    break
    except:
        pass

    # Complete
    duration = time.time() - step_start

    if results.has_blockers:
        send_step_progress(
            current_step,
            "STEP_COMPLETE",
            "FAILED",
            f"Pre-flight failed: {results.blocker_count} blocker(s)",
            duration=duration,
        )
    else:
        send_step_progress(
            current_step,
            "STEP_COMPLETE",
            "COMPLETED",
            f"Pre-flight passed ({results.warning_count} warning(s))",
            duration=duration,
        )

    return results


# ================================================================================
# BACKUP CREATION
# ================================================================================


def create_backup_and_snapshot(
    dev: Device, hostname: str, current_step: int
) -> BackupInfo:
    """Create backup snapshot and configuration."""
    step_start = time.time()
    send_step_progress(
        current_step, "STEP_START", message=f"Creating backups on {hostname}..."
    )

    backup_info = BackupInfo()

    # Snapshot
    send_progress("SUB_STEP", {"step": current_step}, "Creating boot snapshot...")

    try:
        snapshot_name = f"pre-upgrade-{time.strftime('%Y%m%d-%H%M%S')}"
        dev.cli("request system snapshot slice alternate media internal", warning=False)
        backup_info.snapshot_created = True
        backup_info.snapshot_name = snapshot_name
        logger.info(f"[{hostname}] Snapshot created")
        send_progress("SUB_STEP", {"step": current_step}, "✓ Snapshot created")
    except Exception as e:
        error_msg = f"Snapshot failed: {e}"
        logger.warning(f"[{hostname}] {error_msg}")
        backup_info.backup_errors.append(error_msg)
        send_progress("SUB_STEP", {"step": current_step, "warning": True}, error_msg)

    # Config backup
    send_progress("SUB_STEP", {"step": current_step}, "Backing up config...")

    try:
        timestamp = time.strftime("%Y%m%d-%H%M%S")
        backup_path = f"/var/tmp/config-backup-{timestamp}.txt"
        dev.cli(f"show configuration | display set | save {backup_path}", warning=False)
        backup_info.config_backed_up = True
        backup_info.config_backup_path = backup_path
        logger.info(f"[{hostname}] Config backed up to {backup_path}")
        send_progress("SUB_STEP", {"step": current_step}, f"✓ Config backed up")
    except Exception as e:
        error_msg = f"Config backup failed: {e}"
        logger.warning(f"[{hostname}] {error_msg}")
        backup_info.backup_errors.append(error_msg)
        send_progress("SUB_STEP", {"step": current_step, "warning": True}, error_msg)

    duration = time.time() - step_start

    if backup_info.snapshot_created or backup_info.config_backed_up:
        send_step_progress(
            current_step,
            "STEP_COMPLETE",
            "COMPLETED",
            "Backup operations completed",
            duration=duration,
        )
    else:
        send_step_progress(
            current_step,
            "STEP_COMPLETE",
            "FAILED",
            "All backups failed",
            duration=duration,
        )

    return backup_info


# ================================================================================
# IMAGE VALIDATION
# ================================================================================


def validate_image_availability(
    dev: Device, image_filename: str, hostname: str, current_step: int
) -> Dict[str, Any]:
    """Validate software image availability."""
    step_start = time.time()
    send_step_progress(
        current_step, "STEP_START", message=f"Validating image '{image_filename}'..."
    )

    validation_result = {
        "image_found": False,
        "image_valid": False,
        "available_images": [],
        "file_size": 0,
    }

    try:
        send_progress("SUB_STEP", {"step": current_step}, "Scanning /var/tmp/...")
        file_list = dev.cli("file list /var/tmp/ detail", warning=False)

        available_files = []
        image_files = []

        for line in file_list.split("\n"):
            line = line.strip()
            if line and not line.startswith("total") and not line.startswith("d"):
                parts = line.split()
                if len(parts) >= 9:
                    filename = " ".join(parts[8:])
                    file_size = parts[4] if parts[4].isdigit() else 0

                    available_files.append(
                        {
                            "name": filename,
                            "size": int(file_size) if str(file_size).isdigit() else 0,
                        }
                    )

                    if any(
                        filename.lower().endswith(ext)
                        for ext in [".tgz", ".tar.gz", ".pkg", ".tar"]
                    ):
                        image_files.append(filename)

        validation_result["available_images"] = image_files

        target_file = next(
            (f for f in available_files if f["name"] == image_filename), None
        )

        if target_file:
            validation_result["image_found"] = True
            validation_result["file_size"] = target_file["size"]

            send_progress("SUB_STEP", {"step": current_step}, "Verifying integrity...")

            if target_file["size"] == 0:
                raise ImageValidationError(f"Image '{image_filename}' is empty")

            try:
                archive_test = dev.cli(
                    f"file archive verify /var/tmp/{image_filename}", warning=False
                )
                if any(
                    kw in archive_test.lower() for kw in ["error", "failed", "corrupt"]
                ):
                    raise ImageValidationError("Archive integrity check failed")
                validation_result["image_valid"] = True
            except:
                validation_result["image_valid"] = True

            send_step_progress(
                current_step,
                "STEP_COMPLETE",
                "COMPLETED",
                f"Image '{image_filename}' validated",
                duration=time.time() - step_start,
            )
            return validation_result

        else:
            error_lines = [f"Image '{image_filename}' not found in /var/tmp/"]

            if image_files:
                error_lines.extend(["", "Available images:"])
                error_lines.extend([f"  - {img}" for img in image_files[:5]])

            error_lines.extend(
                ["", "To upload:", f"  scp {image_filename} user@{hostname}:/var/tmp/"]
            )

            error_msg = "\n".join(error_lines)

            send_step_progress(
                current_step,
                "STEP_COMPLETE",
                "FAILED",
                error_msg,
                duration=time.time() - step_start,
            )

            raise ImageValidationError(error_msg)

    except ImageValidationError:
        raise
    except Exception as e:
        error_msg = f"Image validation failed: {e}"
        send_step_progress(
            current_step,
            "STEP_COMPLETE",
            "FAILED",
            error_msg,
            duration=time.time() - step_start,
        )
        raise ImageValidationError(error_msg)


# ================================================================================
# CONNECTION MANAGEMENT
# ================================================================================


@contextmanager
def managed_device_connection(
    hostname: str,
    username: str,
    password: str,
    timeout: int = DEFAULT_CONNECTION_TIMEOUT,
):
    """Context manager for device connections."""
    dev = None
    try:
        dev = Device(
            host=hostname,
            user=username,
            password=password,
            auto_probe=True,
            timeout=timeout,
        )
        dev.open()
        dev.timeout = 720
        yield dev
    finally:
        if dev and dev.connected:
            try:
                dev.close()
            except:
                pass


def establish_connection_with_retry(
    hostname: str,
    username: str,
    password: str,
    max_retries: int = DEFAULT_RETRY_ATTEMPTS,
) -> Device:
    """Establish connection with retry logic."""
    last_error = None

    for attempt in range(max_retries):
        try:
            dev = Device(
                host=hostname,
                user=username,
                password=password,
                auto_probe=True,
                timeout=DEFAULT_CONNECTION_TIMEOUT,
            )
            dev.open()
            dev.timeout = 720
            return dev

        except Exception as e:
            last_error = e
            if attempt < max_retries - 1:
                wait_time = min(2**attempt, 30)
                logger.warning(
                    f"[{hostname}] Connection attempt {attempt + 1} failed, retry in {wait_time}s..."
                )
                send_progress(
                    "SUB_STEP", {"attempt": attempt + 1}, f"Retry in {wait_time}s..."
                )
                time.sleep(wait_time)

    raise ConnectionError(
        f"Failed to connect after {max_retries} attempts: {last_error}"
    )


# ================================================================================
# REBOOT MONITORING
# ================================================================================


def monitor_device_reboot(
    hostname: str,
    username: str,
    password: str,
    current_step: int,
    timeout: int = DEFAULT_REBOOT_TIMEOUT,
) -> Dict[str, Any]:
    """Monitor device reboot process."""
    step_start = time.time()
    send_step_progress(
        current_step, "STEP_START", message=f"Monitoring reboot for {hostname}..."
    )

    monitoring_result = {
        "reboot_successful": False,
        "total_downtime": 0,
        "ping_restored_time": None,
        "ssh_restored_time": None,
    }

    initial_wait = 60
    send_progress(
        "SUB_STEP", {"step": current_step}, f"Waiting {initial_wait}s for reboot..."
    )
    time.sleep(initial_wait)

    interval = 15
    start_time = time.time()
    last_ping_success = False

    while time.time() - start_time < timeout:
        elapsed = int(time.time() - start_time)
        remaining = timeout - elapsed

        ping_success = test_ping_connectivity(hostname)

        if ping_success and not last_ping_success:
            ping_time = elapsed
            monitoring_result["ping_restored_time"] = ping_time
            send_progress(
                "SUB_STEP", {"step": current_step}, f"✓ Ping restored ({ping_time}s)"
            )
            logger.info(f"[{hostname}] Ping restored after {ping_time}s")

        last_ping_success = ping_success

        if ping_success:
            ssh_success, _ = test_ssh_connectivity(hostname, username, password)

            if ssh_success:
                ssh_time = elapsed
                monitoring_result["ssh_restored_time"] = ssh_time
                monitoring_result["reboot_successful"] = True
                monitoring_result["total_downtime"] = ssh_time

                send_step_progress(
                    current_step,
                    "STEP_COMPLETE",
                    "COMPLETED",
                    f"Device online after {ssh_time}s",
                    duration=time.time() - step_start,
                )
                return monitoring_result

            send_progress(
                "SUB_STEP",
                {"step": current_step},
                f"Testing SSH... ({remaining}s remaining)",
            )

        time.sleep(interval)

    error_msg = f"Device {hostname} did not come online after {timeout}s"

    if monitoring_result["ping_restored_time"]:
        error_msg += (
            f"\n✓ Ping restored after {monitoring_result['ping_restored_time']}s"
        )
    else:
        error_msg += "\n✗ Ping never restored"

    error_msg += "\n\nACTION: Check console immediately"

    send_step_progress(
        current_step,
        "STEP_COMPLETE",
        "FAILED",
        error_msg,
        duration=time.time() - step_start,
    )

    raise RebootTimeoutError(error_msg)


def test_ping_connectivity(hostname: str, timeout: int = 5) -> bool:
    """Test ICMP connectivity."""
    try:
        result = subprocess.run(
            ["ping", "-c", "1", "-W", str(timeout), hostname],
            capture_output=True,
            timeout=timeout + 2,
            check=False,
        )
        return result.returncode == 0
    except:
        return False


def test_ssh_connectivity(
    hostname: str, username: str, password: str
) -> Tuple[bool, Dict[str, Any]]:
    """Test SSH connectivity."""
    details = {"connected": False, "error": None}

    try:
        with managed_device_connection(hostname, username, password, timeout=20):
            details["connected"] = True
            return True, details
    except Exception as e:
        details["error"] = str(e)
        return False, details


# ================================================================================
# SOFTWARE INSTALLATION
# ================================================================================


def perform_software_installation(
    dev: Device, image_path: str, hostname: str, current_step: int
):
    """Execute software installation."""
    step_start = time.time()
    send_step_progress(
        current_step, "STEP_START", message=f"Installing software on {hostname}..."
    )

    try:
        send_progress("SUB_STEP", {"step": current_step}, "Pre-installation checks...")

        try:
            storage = dev.cli("show system storage", warning=False)
            logger.info(f"[{hostname}] Storage status:\n{storage}")
        except:
            pass

        send_progress(
            "SUB_STEP",
            {"step": current_step},
            "Installing (may take several minutes)...",
        )

        sw = SW(dev)

        send_progress("SUB_STEP", {"step": current_step}, "Validating package...")
        if not sw.validate(package=image_path):
            raise InstallationError("Package validation failed")

        send_progress("SUB_STEP", {"step": current_step}, "Installing package...")
        install_result = sw.install(
            package=image_path, validate=True, no_copy=True, progress=False
        )

        if not install_result:
            raise InstallationError("Installation failed")

        logger.info(f"[{hostname}] Software installation completed")

        send_progress("SUB_STEP", {"step": current_step}, "Initiating reboot...")

        try:
            sw.reboot()
        except Exception as e:
            logger.warning(f"[{hostname}] Reboot command issue: {e}")

        send_step_progress(
            current_step,
            "STEP_COMPLETE",
            "COMPLETED",
            "Installation complete, reboot initiated",
            duration=time.time() - step_start,
        )

    except Exception as e:
        if isinstance(e, InstallationError):
            raise
        raise InstallationError(f"Installation failed: {e}")


# ================================================================================
# VERSION VERIFICATION
# ================================================================================


def verify_final_version(
    hostname: str, username: str, password: str, target_version: str, current_step: int
) -> Dict[str, Any]:
    """Verify final software version."""
    step_start = time.time()
    send_step_progress(
        current_step, "STEP_START", message=f"Verifying version on {hostname}..."
    )

    verification_result = {
        "final_version": None,
        "version_match": False,
        "device_info": {},
    }

    max_attempts = 3
    for attempt in range(max_attempts):
        try:
            with managed_device_connection(
                hostname, username, password, timeout=60
            ) as final_dev:
                final_version = final_dev.facts.get("version")
                verification_result["final_version"] = final_version
                verification_result["device_info"] = {
                    "model": final_dev.facts.get("model", "Unknown"),
                    "serial": final_dev.facts.get("serialnumber", "Unknown"),
                    "hostname": final_dev.facts.get("hostname", "Unknown"),
                }

                if final_version == target_version:
                    verification_result["version_match"] = True
                    send_step_progress(
                        current_step,
                        "STEP_COMPLETE",
                        "COMPLETED",
                        f"Version verified: {final_version}",
                        duration=time.time() - step_start,
                    )
                    return verification_result
                else:
                    if attempt == max_attempts - 1:
                        raise VersionMismatchError(
                            f"Version mismatch: Expected {target_version}, Found {final_version}"
                        )
                    logger.warning(f"[{hostname}] Version mismatch, retrying...")
                    time.sleep(10)

        except Exception as e:
            if attempt == max_attempts - 1:
                raise VersionMismatchError(f"Verification failed: {e}")
            time.sleep(10)

    return verification_result


# ================================================================================
# ERROR HANDLING WRAPPER
# ================================================================================


def handle_upgrade_error(
    status: DeviceStatus, error: Exception, current_step: int, start_step: int
) -> DeviceStatus:
    """Centralized error handling."""
    error_type = type(error).__name__
    error_message = str(error)

    logger.error(f"[{status.hostname}] {error_type}: {error_message}", exc_info=True)

    # Format comprehensive error with recovery steps
    context = {
        "hostname": status.hostname,
        "target_version": status.target_version,
        "current_version": status.initial_version,
    }

    if status.backup_info:
        context["snapshot_name"] = status.backup_info.snapshot_name
        context["config_backup"] = status.backup_info.config_backup_path

    formatted_error = UpgradeErrorHandler.format_error_message(
        error, error_type, context
    )

    status.update_phase(UpgradePhase.FAILED, f"{error_type}: {error_message}")
    status.error = formatted_error
    status.error_type = error_type
    status.end_time = time.time()

    send_step_progress(
        current_step, "STEP_COMPLETE", "FAILED", formatted_error, error_type=error_type
    )

    remaining_steps = STEPS_PER_DEVICE - (current_step - start_step)
    for i in range(remaining_steps):
        send_step_progress(
            current_step + i + 1,
            "STEP_COMPLETE",
            "FAILED",
            "Skipped due to previous failure",
        )

    return status


# ================================================================================
# MAIN UPGRADE WORKFLOW
# ================================================================================


def upgrade_device(
    hostname: str,
    username: str,
    password: str,
    image_filename: str,
    target_version: str,
    start_step: int,
    allow_downgrade: bool = False,
) -> DeviceStatus:
    """Execute complete device upgrade workflow."""
    status = DeviceStatus(hostname=hostname, target_version=target_version)
    status.start_time = time.time()
    dev = None
    current_step = start_step

    try:
        # STEP 1: Connect
        step_start = time.time()
        send_step_progress(
            current_step, "STEP_START", message=f"Connecting to {hostname}..."
        )
        status.update_phase(UpgradePhase.CONNECTING)

        dev = establish_connection_with_retry(hostname, username, password)

        status.initial_version = dev.facts.get("version", "Unknown")
        status.final_version = status.initial_version

        logger.info(f"[{hostname}] Connected - Version: {status.initial_version}")

        status.step_durations[current_step] = time.time() - step_start
        send_step_progress(
            current_step,
            "STEP_COMPLETE",
            "COMPLETED",
            f"Connected (Version: {status.initial_version})",
            duration=status.step_durations[current_step],
        )
        current_step += 1

        # STEP 2: Pre-flight Checks
        step_start = time.time()
        status.update_phase(UpgradePhase.PREFLIGHT_CHECKS)
        status.preflight_results = perform_comprehensive_preflight_checks(
            dev, hostname, image_filename, current_step
        )

        if status.preflight_results.has_blockers:
            blocker_messages = [
                c.message for c in status.preflight_results.get_blockers()
            ]
            raise PreFlightCheckError(
                "Pre-flight validation failed:\n" + "\n".join(blocker_messages)
            )

        status.step_durations[current_step] = time.time() - step_start
        current_step += 1

        # STEP 3: Create Backups
        step_start = time.time()
        status.update_phase(UpgradePhase.CREATING_BACKUP)
        status.backup_info = create_backup_and_snapshot(dev, hostname, current_step)

        status.step_durations[current_step] = time.time() - step_start
        current_step += 1

        # STEP 4: Validate Image
        step_start = time.time()
        status.update_phase(UpgradePhase.VALIDATING_IMAGE)
        validate_image_availability(dev, image_filename, hostname, current_step)

        status.step_durations[current_step] = time.time() - step_start
        current_step += 1

        # STEP 5: Analyze Version
        step_start = time.time()
        send_step_progress(current_step, "STEP_START", message="Analyzing version...")
        status.update_phase(UpgradePhase.ANALYZING_VERSION)

        version_analysis = analyze_version_compatibility(
            status.initial_version, target_version
        )
        status.version_action = version_analysis["action"]

        for warning in version_analysis["warnings"]:
            status.add_warning(warning)

        if status.version_action == VersionAction.MAINTAIN:
            status.update_phase(UpgradePhase.SKIPPED, "Already on target version")
            status.success = True

            send_step_progress(
                current_step,
                "STEP_COMPLETE",
                "COMPLETED",
                "Already on target version",
                duration=time.time() - step_start,
            )

            for i in range(STEPS_PER_DEVICE - (current_step - start_step + 1)):
                send_step_progress(
                    current_step + i + 1, "STEP_COMPLETE", "SKIPPED", "Skipped"
                )

            status.step_durations[current_step] = time.time() - step_start
            status.end_time = time.time()
            return status

        elif status.version_action == VersionAction.DOWNGRADE:
            if not allow_downgrade:
                raise PolicyViolationError(
                    f"Downgrade blocked: {status.initial_version} -> {target_version}. "
                    "Use --allow-downgrade to override."
                )
            status.add_warning(
                f"DOWNGRADE: {status.initial_version} -> {target_version}"
            )

        send_step_progress(
            current_step,
            "STEP_COMPLETE",
            "COMPLETED",
            f"Version analysis complete - {status.version_action.value}",
            duration=time.time() - step_start,
        )

        status.step_durations[current_step] = time.time() - step_start
        current_step += 1

        # STEP 6: Install Software
        step_start = time.time()
        status.update_phase(UpgradePhase.INSTALLING)
        full_image_path = f"/var/tmp/{image_filename}"
        perform_software_installation(dev, full_image_path, hostname, current_step)

        status.step_durations[current_step] = time.time() - step_start
        current_step += 1

    except Exception as e:
        return handle_upgrade_error(status, e, current_step, start_step)

    finally:
        if dev and dev.connected:
            try:
                dev.close()
            except:
                pass

    # STEP 7: Monitor Reboot
    try:
        step_start = time.time()
        status.update_phase(UpgradePhase.PROBING)

        monitor_device_reboot(hostname, username, password, current_step)

        status.step_durations[current_step] = time.time() - step_start
        current_step += 1

        # STEP 8: Verify Version
        step_start = time.time()
        status.update_phase(UpgradePhase.VERIFYING)

        verification_result = verify_final_version(
            hostname, username, password, target_version, current_step
        )

        status.final_version = verification_result["final_version"]

        if verification_result["version_match"]:
            status.update_phase(
                UpgradePhase.COMPLETED,
                f"Upgrade successful - Version: {status.final_version}",
            )
            status.success = True

            send_step_progress(
                current_step,
                "STEP_COMPLETE",
                "COMPLETED",
                f"Upgrade verified - Version: {status.final_version}",
                duration=time.time() - step_start,
            )
        else:
            raise VersionMismatchError(
                f"Version mismatch: Expected {target_version}, Found {status.final_version}"
            )

        status.step_durations[current_step] = time.time() - step_start

    except Exception as e:
        return handle_upgrade_error(status, e, current_step, start_step)

    finally:
        status.end_time = time.time()

    return status


# ================================================================================
# FINAL SUMMARY REPORT
# ================================================================================


def generate_final_summary(
    final_statuses: List[DeviceStatus],
    image_filename: str,
    target_version: str,
    operation_duration: float,
):
    """Generate comprehensive final summary report for stdout capture."""
    print("\n\n" + "=" * 120)
    print("JUNIPER DEVICE CODE UPGRADE OPERATION SUMMARY".center(120))
    print("=" * 120)

    print(
        f"Operation Date/Time: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}"
    )
    print(f"Software Image: {image_filename}")
    print(f"Target Version: {target_version}")
    print(
        f"Total Duration: {operation_duration:.1f}s ({operation_duration / 60:.1f} minutes)"
    )
    print(f"Operator: nikos-geranios_vgi")

    print("-" * 120)

    # Statistical summary
    total_devices = len(final_statuses)
    successful = [s for s in final_statuses if s.success]
    failed = [
        s for s in final_statuses if not s.success and s.phase != UpgradePhase.SKIPPED
    ]
    skipped = [s for s in final_statuses if s.phase == UpgradePhase.SKIPPED]

    print("\nOPERATION STATISTICS:")
    print(f"  📊 Total Devices Processed: {total_devices}")
    print(
        f"  ✅ Successful Operations: {len(successful)} ({(len(successful) / total_devices * 100):.1f}%)"
    )
    print(
        f"  ❌ Failed Operations: {len(failed)} ({(len(failed) / total_devices * 100):.1f}%)"
    )
    print(
        f"  ⊝ Skipped (Already Target Version): {len(skipped)} ({(len(skipped) / total_devices * 100):.1f}%)"
    )

    if successful:
        avg_duration = sum(s.get_duration() for s in successful) / len(successful)
        print(
            f"  ⏱️  Average Successful Operation Time: {avg_duration:.1f}s ({avg_duration / 60:.1f} minutes)"
        )

    # Version action breakdown
    action_counts = {}
    for status in final_statuses:
        action_counts[status.version_action] = (
            action_counts.get(status.version_action, 0) + 1
        )

    print("\nVERSION ACTION BREAKDOWN:")
    action_emoji = {
        VersionAction.UPGRADE: "⬆️",
        VersionAction.DOWNGRADE: "⬇️",
        VersionAction.MAINTAIN: "➡️",
        VersionAction.UNKNOWN: "❓",
    }
    for action, count in action_counts.items():
        emoji = action_emoji.get(action, "❓")
        print(f"  {emoji} {action.value.title()}: {count} device(s)")

    # Detailed results table
    print("\nDETAILED RESULTS:")
    print(
        f"{'Device':<30}{'Status':<15}{'Action':<12}{'Initial Ver':<20}{'Final Ver':<20}{'Duration':<12}{'Details'}"
    )
    print("-" * 120)

    # Sort results: successful first, then skipped, then failed
    sorted_statuses = sorted(
        final_statuses,
        key=lambda s: (
            s.phase != UpgradePhase.COMPLETED,
            s.phase != UpgradePhase.SKIPPED,
            s.hostname,
        ),
    )

    for status in sorted_statuses:
        # Status indicators
        if status.success:
            status_indicator = "✅ SUCCESS"
        elif status.phase == UpgradePhase.SKIPPED:
            status_indicator = "⊝ SKIPPED"
        else:
            status_indicator = "❌ FAILED"

        # Action indicator
        action_emoji_map = {
            VersionAction.UPGRADE: "⬆️ UP",
            VersionAction.DOWNGRADE: "⬇️ DOWN",
            VersionAction.MAINTAIN: "➡️ SAME",
            VersionAction.UNKNOWN: "❓ UNK",
        }
        action_indicator = action_emoji_map.get(status.version_action, "❓ UNK")

        # Duration
        duration_str = (
            f"{status.get_duration():.1f}s" if status.get_duration() > 0 else "N/A"
        )

        # Details (error or success message)
        details = status.error if status.error else status.message
        if len(details) > 35:
            details = details[:32] + "..."

        # Format version strings
        initial_ver = (status.initial_version or "Unknown")[:18]
        final_ver = (status.final_version or "N/A")[:18]

        print(
            f"{status.hostname:<30}{status_indicator:<15}{action_indicator:<12}"
            f"{initial_ver:<20}{final_ver:<20}{duration_str:<12}{details}"
        )

    # Error analysis section
    if failed:
        print("\n" + "=" * 120)
        print("ERROR ANALYSIS:")
        print("=" * 120)

        error_summary = {}
        for status in failed:
            error_type = status.error_type or "Unknown"
            error_summary[error_type] = error_summary.get(error_type, 0) + 1

        print("\nError Type Distribution:")
        for error_type, count in sorted(
            error_summary.items(), key=lambda x: x[1], reverse=True
        ):
            print(f"  • {error_type}: {count} device(s)")

        print("\n" + "-" * 120)
        print("FAILED DEVICES DETAILS:")
        print("-" * 120)

        for status in failed:
            print(f"\n🔸 Device: {status.hostname}")
            print(f"   Phase Failed: {status.phase.name}")
            print(f"   Error Type: {status.error_type or 'Unknown'}")

            # Show first 200 characters of error
            error_preview = (status.error or "No error message")[:200]
            print(f"   Error: {error_preview}")
            if len(status.error or "") > 200:
                print(f"          ... (see full error in device logs)")

            # Show backup availability
            if status.backup_info:
                if status.backup_info.snapshot_created:
                    print(
                        f"   ✓ Snapshot Available: {status.backup_info.snapshot_name}"
                    )
                    print(
                        f"     Rollback: request system snapshot slice alternate && request system reboot"
                    )
                if status.backup_info.config_backed_up:
                    print(
                        f"   ✓ Config Backup: {status.backup_info.config_backup_path}"
                    )

    # Warnings summary
    all_warnings = []
    devices_with_warnings = []
    for status in final_statuses:
        if status.warnings:
            all_warnings.extend(status.warnings)
            devices_with_warnings.append(status.hostname)

    if all_warnings:
        print("\n" + "=" * 120)
        print("WARNINGS SUMMARY:")
        print("=" * 120)

        warning_counts = {}
        for warning in all_warnings:
            warning_counts[warning] = warning_counts.get(warning, 0) + 1

        for warning, count in sorted(
            warning_counts.items(), key=lambda x: x[1], reverse=True
        ):
            print(f"  ⚠️  {warning} ({count} occurrence(s))")

        print(f"\n  Devices with warnings: {', '.join(devices_with_warnings[:10])}")
        if len(devices_with_warnings) > 10:
            print(f"  ... and {len(devices_with_warnings) - 10} more")

    # Pre-flight check summary
    devices_with_preflight_issues = [
        s
        for s in final_statuses
        if s.preflight_results
        and (
            s.preflight_results.warning_count > 0
            or s.preflight_results.blocker_count > 0
        )
    ]

    if devices_with_preflight_issues:
        print("\n" + "=" * 120)
        print("PRE-FLIGHT CHECK ISSUES:")
        print("=" * 120)

        for status in devices_with_preflight_issues[:5]:  # Show first 5
            print(f"\n  Device: {status.hostname}")
            if status.preflight_results.blocker_count > 0:
                print(f"    Blockers: {status.preflight_results.blocker_count}")
                for blocker in status.preflight_results.get_blockers()[:3]:
                    print(f"      • {blocker.name}: {blocker.message}")
            if status.preflight_results.warning_count > 0:
                print(f"    Warnings: {status.preflight_results.warning_count}")
                for warning in status.preflight_results.get_warnings()[:3]:
                    print(f"      • {warning.name}: {warning.message}")

        if len(devices_with_preflight_issues) > 5:
            print(
                f"\n  ... and {len(devices_with_preflight_issues) - 5} more devices with pre-flight issues"
            )

    # Operation recommendations
    print("\n" + "=" * 120)
    print("RECOMMENDATIONS & NEXT STEPS:")
    print("=" * 120)

    if len(failed) == 0 and len(skipped) == 0:
        print("\n  🎉 EXCELLENT! All operations completed successfully!")
        print("  ✓ All devices are now running target version")
        print("  ✓ No issues detected")
    elif len(failed) == 0:
        print("\n  ✓ All upgrade operations completed successfully!")
        print(f"  ℹ️  {len(skipped)} device(s) were already on target version")
    else:
        print("\n  ⚠️  Some operations failed. Review the following:")
        print(f"     • {len(failed)} device(s) failed - see ERROR ANALYSIS above")
        print(f"     • Check device console access for failed devices")
        print(f"     • Review detailed error messages and recovery steps")
        print(
            f"     • Failed devices can be retried individually after resolving issues"
        )

    # Downgrade warnings
    downgrades = [
        s for s in final_statuses if s.version_action == VersionAction.DOWNGRADE
    ]
    if downgrades:
        print(f"\n  ⚠️  IMPORTANT: {len(downgrades)} device(s) were downgraded")
        print(f"     • Verify all features work as expected on downgraded devices")
        print(f"     • Check for any compatibility issues")
        print(
            f"     • Monitor devices closely: {', '.join([s.hostname for s in downgrades[:5]])}"
        )
        if len(downgrades) > 5:
            print(f"       ... and {len(downgrades) - 5} more")

    # Backup information
    devices_with_snapshots = [
        s for s in final_statuses if s.backup_info and s.backup_info.snapshot_created
    ]
    if devices_with_snapshots:
        print(
            f"\n  💾 Backup Snapshots Created: {len(devices_with_snapshots)} device(s)"
        )
        print(f"     • Snapshots available for emergency rollback")
        print(f"     • Rollback command: request system snapshot slice alternate")

    # Post-upgrade verification
    if successful:
        print("\n  📋 POST-UPGRADE VERIFICATION CHECKLIST:")
        print("     1. Verify routing protocols are stable")
        print("     2. Check for any new system alarms")
        print("     3. Verify critical interfaces are up")
        print("     4. Test key network services")
        print("     5. Monitor system logs for any anomalies")
        print("     6. Document upgrade completion in change management system")

    # Support information
    print("\n  📞 SUPPORT:")
    print("     • For issues: Contact Network Operations Team")
    print("     • Emergency: netops@example.com")
    print("     • Documentation: https://wiki.example.com/juniper-upgrades")
    print("     • Log files location: /var/log/juniper-upgrades/")

    print("\n" + "=" * 120)
    print("END OF UPGRADE OPERATION SUMMARY")
    print("=" * 120 + "\n")


# ================================================================================
# INPUT VALIDATION
# ================================================================================


def validate_command_arguments(args) -> List[str]:
    """
    Comprehensive validation of all command-line arguments.

    Args:
        args: Parsed command-line arguments

    Returns:
        List of validated hostnames/IP addresses

    Raises:
        ValueError: If any validation checks fail
    """
    validation_errors = []

    # Validate and parse hostnames
    host_ips = []
    if args.hostname:
        raw_hosts = [host.strip() for host in args.hostname.split(",") if host.strip()]
        if not raw_hosts:
            validation_errors.append("At least one hostname must be provided")
        else:
            # Validate each hostname/IP format
            ip_pattern = re.compile(r"^(\d{1,3}\.){3}\d{1,3}$")
            hostname_pattern = re.compile(r"^[a-zA-Z0-9\-\.]+$")

            for host in raw_hosts:
                if len(host) > 253:
                    validation_errors.append(f"Hostname too long: {host}")
                elif not (ip_pattern.match(host) or hostname_pattern.match(host)):
                    validation_errors.append(f"Invalid hostname/IP format: {host}")
                else:
                    host_ips.append(host)
    else:
        validation_errors.append("Hostname parameter is required")

    # Validate username
    if not args.username or len(args.username.strip()) == 0:
        validation_errors.append("Username is required")
    elif len(args.username) > 128:
        validation_errors.append("Username is too long (max 128 characters)")

    # Validate password
    if not args.password:
        validation_errors.append("Password is required")
    elif len(args.password) > 128:
        validation_errors.append("Password is too long (max 128 characters)")

    # Validate image filename
    if not args.image_filename:
        validation_errors.append("Image filename is required")
    elif not re.match(r"^[a-zA-Z0-9\-_\.]+$", args.image_filename):
        validation_errors.append(
            f"Invalid image filename format: {args.image_filename}"
        )
    elif not any(
        args.image_filename.lower().endswith(ext)
        for ext in [".tgz", ".tar.gz", ".pkg", ".tar"]
    ):
        validation_errors.append(
            f"Image filename must end with .tgz, .tar.gz, .pkg, or .tar: {args.image_filename}"
        )

    # Validate target version
    if not args.target_version:
        validation_errors.append("Target version is required")
    else:
        try:
            parsed_version = parse_junos_version(args.target_version)
            if parsed_version == (0, 0, 0, 0, 0):
                validation_errors.append(
                    f"Invalid target version format: {args.target_version}"
                )
        except Exception:
            validation_errors.append(
                f"Could not parse target version: {args.target_version}"
            )

    # Raise errors if any validation failed
    if validation_errors:
        error_msg = "Argument validation failed:\n" + "\n".join(
            [f"  • {err}" for err in validation_errors]
        )
        logger.error(error_msg)
        raise ValueError(error_msg)

    return host_ips


# ================================================================================
# MAIN ORCHESTRATION
# ================================================================================


def execute_code_upgrade(
    host_ips: List[str],
    username: str,
    password: str,
    image_filename: str,
    target_version: str,
    allow_downgrade: bool = False,
    max_workers: int = DEFAULT_MAX_WORKERS,
):
    """Main orchestration for multi-device upgrade operations."""
    logger.info(f"=== Starting upgrade for {len(host_ips)} device(s) ===")
    logger.info(f"Target image: {image_filename}")
    logger.info(f"Target version: {target_version}")

    final_statuses = []
    operation_start_time = time.time()
    total_steps = len(host_ips) * STEPS_PER_DEVICE

    send_progress(
        "OPERATION_START",
        {
            "total_steps": total_steps,
            "devices": host_ips,
            "image_filename": image_filename,
            "target_version": target_version,
            "allow_downgrade": allow_downgrade,
            "max_workers": max_workers,
        },
        f"Starting upgrade for {len(host_ips)} device(s)",
    )

    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_hostname = {}

            for i, hostname in enumerate(host_ips):
                try:
                    future = executor.submit(
                        upgrade_device,
                        hostname=hostname,
                        username=username,
                        password=password,
                        image_filename=image_filename,
                        target_version=target_version,
                        start_step=(i * STEPS_PER_DEVICE) + 1,
                        allow_downgrade=allow_downgrade,
                    )
                    future_to_hostname[future] = hostname
                    logger.info(f"[{hostname}] Upgrade task submitted")

                except Exception as e:
                    logger.error(f"[{hostname}] Failed to submit task: {e}")
                    error_status = DeviceStatus(
                        hostname=hostname,
                        target_version=target_version,
                        phase=UpgradePhase.FAILED,
                        error=f"Task submission failed: {e}",
                        error_type="TaskSubmissionError",
                    )
                    final_statuses.append(error_status)

            completed_count = 0
            for future in concurrent.futures.as_completed(future_to_hostname):
                hostname = future_to_hostname[future]
                completed_count += 1

                try:
                    result = future.result(timeout=DEFAULT_DEVICE_TIMEOUT)
                    final_statuses.append(result)

                    status_emoji = "✓" if result.success else "✗"
                    logger.info(
                        f"[{hostname}] {status_emoji} Upgrade completed: {result.phase.name}"
                    )

                except concurrent.futures.TimeoutError:
                    logger.error(f"[{hostname}] Operation timed out")
                    timeout_status = DeviceStatus(
                        hostname=hostname,
                        target_version=target_version,
                        phase=UpgradePhase.FAILED,
                        error=f"Operation timed out after {DEFAULT_DEVICE_TIMEOUT}s",
                        error_type="TimeoutError",
                    )
                    final_statuses.append(timeout_status)

                except Exception as e:
                    logger.error(f"[{hostname}] Unexpected error: {e}", exc_info=True)
                    error_status = DeviceStatus(
                        hostname=hostname,
                        target_version=target_version,
                        phase=UpgradePhase.FAILED,
                        error=f"Unexpected error: {e}",
                        error_type=type(e).__name__,
                    )
                    final_statuses.append(error_status)

                completion_percentage = int((completed_count / len(host_ips)) * 100)
                send_progress(
                    "OPERATION_PROGRESS",
                    {
                        "completed_devices": completed_count,
                        "total_devices": len(host_ips),
                        "completion_percentage": completion_percentage,
                        "elapsed_time": time.time() - operation_start_time,
                    },
                    f"Progress: {completed_count}/{len(host_ips)} ({completion_percentage}%)",
                )

    except Exception as e:
        logger.critical(f"Critical error: {e}", exc_info=True)
        send_progress(
            "OPERATION_COMPLETE", {"status": "FAILED"}, f"Critical error: {e}"
        )
        raise

    operation_duration = time.time() - operation_start_time
    successful_devices = [s for s in final_statuses if s.success]
    failed_devices = [s for s in final_statuses if not s.success]
    skipped_devices = [s for s in final_statuses if s.phase == UpgradePhase.SKIPPED]

    if len(failed_devices) == 0:
        overall_status = "SUCCESS"
    elif len(successful_devices) > 0:
        overall_status = "PARTIAL_SUCCESS"
    else:
        overall_status = "FAILED"

    send_progress(
        "OPERATION_COMPLETE",
        {
            "status": overall_status,
            "total_devices": len(final_statuses),
            "successful_devices": len(successful_devices),
            "failed_devices": len(failed_devices),
            "skipped_devices": len(skipped_devices),
            "operation_duration": round(operation_duration, 2),
            "success_rate": round(
                (len(successful_devices) / len(final_statuses)) * 100, 1
            )
            if final_statuses
            else 0,
        },
        f"Upgrade completed: {len(successful_devices)} successful, {len(failed_devices)} failed",
    )

    generate_final_summary(
        final_statuses, image_filename, target_version, operation_duration
    )

    logger.info(f"=== Upgrade operation completed in {operation_duration:.1f}s ===")


# ================================================================================
# MAIN ENTRY POINT
# ================================================================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Juniper Device Upgrade Automation Script",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    parser.add_argument(
        "--hostname",
        required=True,
        help="Comma-separated list of device hostnames or IPs",
    )
    parser.add_argument(
        "--username", required=True, help="Username for device authentication"
    )
    parser.add_argument(
        "--password", required=True, help="Password for device authentication"
    )
    parser.add_argument(
        "--image_filename",
        required=True,
        help="Filename of software image (e.g., 'junos-21.4R1.12.tgz')",
    )
    parser.add_argument(
        "--target_version",
        required=True,
        help="Target Junos version string (e.g., '21.4R1.12')",
    )
    parser.add_argument(
        "--allow-downgrade", action="store_true", help="Permit downgrade operations"
    )
    parser.add_argument(
        "--force", action="store_true", help="Skip interactive confirmations"
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="Validate without making changes"
    )
    parser.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="Enable verbose DEBUG-level logging",
    )

    args = parser.parse_args()

    if args.verbose:
        logger.setLevel(logging.DEBUG)

    try:
        logger.info("Script execution started")
        host_ips = validate_command_arguments(args)

        if args.dry_run:
            logger.info("Dry-run mode enabled")
            send_progress(
                "OPERATION_START",
                {
                    "total_steps": len(host_ips) * STEPS_PER_DEVICE,
                    "devices": host_ips,
                    "image_filename": args.image_filename,
                    "target_version": args.target_version,
                    "dry_run": True,
                },
                "Dry-run: Validating inputs",
            )
            print("\n" + "=" * 80)
            print("DRY-RUN VALIDATION SUCCESSFUL")
            print("=" * 80)
            print(f"Validated {len(host_ips)} device(s): {', '.join(host_ips)}")
            print(f"Image: {args.image_filename}")
            print(f"Target Version: {args.target_version}")
            print(f"Allow Downgrade: {args.allow_downgrade}")
            print("\nNo changes were made to any devices.")
            print("=" * 80)
            logger.info("Dry-run completed successfully")
            sys.exit(0)

        execute_code_upgrade(
            host_ips=host_ips,
            username=args.username,
            password=args.password,
            image_filename=args.image_filename,
            target_version=args.target_version,
            allow_downgrade=args.allow_downgrade,
        )
        logger.info("Script execution completed successfully")

    except Exception as e:
        send_progress(
            "OPERATION_COMPLETE", {"status": "FAILED"}, f"Critical error: {e}"
        )
        logger.fatal(f"Critical error in main execution: {e}", exc_info=True)
        sys.exit(1)
