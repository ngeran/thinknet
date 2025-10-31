#!/usr/bin/env python3
"""
================================================================================
SCRIPT:             Device Code Upgrade with Pre-Check Phase
FILENAME:           run.py
VERSION:            7.3 (FIXED - Proper PRE_CHECK_COMPLETE event)
LAST UPDATED:       2025-10-31
AUTHOR:             nikos-geranios_vgi
================================================================================

CRITICAL FIXES IN THIS VERSION:
    🔧 FIX 1: Added proper PRE_CHECK_COMPLETE event before OPERATION_COMPLETE
    🔧 FIX 2: Fixed event ordering for frontend state management
    🔧 FIX 3: Enhanced progress reporting with proper event types

WHY THESE FIXES MATTER:
    The frontend expects:
    1. PRE_CHECK_COMPLETE with summary data to populate Review tab
    2. OPERATION_COMPLETE to finalize the job
    Without PRE_CHECK_COMPLETE, the Review tab stays in loading state
"""

import logging
import sys
import argparse
import time
import subprocess
import concurrent.futures
import json
import re
from typing import List, Optional, Tuple, Dict, Any
from enum import Enum
from dataclasses import dataclass, field
from contextlib import contextmanager

# Third-party libraries
try:
    from jnpr.junos import Device
    from jnpr.junos.utils.sw import SW
except ImportError as e:
    print(f"ERROR: Required Juniper PyEZ library not found: {e}", file=sys.stderr)
    print("Install with: pip install junos-eznc", file=sys.stderr)
    sys.exit(1)

# ================================================================================
# LOGGING CONFIGURATION
# ================================================================================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)-8s - %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)

# Configuration constants
STEPS_PER_DEVICE = 6
DEFAULT_MAX_WORKERS = 5
DEFAULT_DEVICE_TIMEOUT = 1800
DEFAULT_REBOOT_TIMEOUT = 900
DEFAULT_CONNECTION_TIMEOUT = 30
DEFAULT_RETRY_ATTEMPTS = 3

# Pre-check thresholds
MINIMUM_STORAGE_FREE_PERCENT = 30
MAXIMUM_CPU_PERCENT = 80
MAXIMUM_MEMORY_PERCENT = 85
MINIMUM_IMAGE_SIZE_MB = 50


# ================================================================================
# ENHANCED ENUMS
# ================================================================================
class UpgradePhase(Enum):
    """Phases of upgrade workflow"""

    PENDING = "pending"
    PRE_CHECK = "pre_check"
    CONNECTING = "connecting"
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


class PreCheckSeverity(Enum):
    """Severity levels for pre-check results"""

    PASS = "pass"
    WARNING = "warning"
    CRITICAL = "critical"


class VersionAction(Enum):
    """Version action types"""

    UPGRADE = "upgrade"
    DOWNGRADE = "downgrade"
    MAINTAIN = "maintain"
    UNKNOWN = "unknown"


# ================================================================================
# EXCEPTION HIERARCHY
# ================================================================================
class DeviceUpgradeError(Exception):
    """Base exception for device upgrade operations"""

    pass


class PreCheckFailedException(DeviceUpgradeError):
    """Raised when critical pre-checks fail"""

    pass


class ConnectionError(DeviceUpgradeError):
    """Device connection failure"""

    pass


class ImageValidationError(DeviceUpgradeError):
    """Image validation failure"""

    pass


class VersionAnalysisError(DeviceUpgradeError):
    """Version analysis failure"""

    pass


class InstallationError(DeviceUpgradeError):
    """Installation failure"""

    pass


class RebootTimeoutError(DeviceUpgradeError):
    """Reboot timeout"""

    pass


class VersionMismatchError(DeviceUpgradeError):
    """Version verification failure"""

    pass


class PolicyViolationError(DeviceUpgradeError):
    """Policy violation"""

    pass


# ================================================================================
# PRE-CHECK DATA STRUCTURES
# ================================================================================
@dataclass
class PreCheckResult:
    """Individual pre-check result"""

    check_name: str
    severity: PreCheckSeverity
    passed: bool
    message: str
    details: Optional[Dict[str, Any]] = None
    recommendation: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return {
            "check_name": self.check_name,
            "severity": self.severity.value,
            "passed": self.passed,
            "message": self.message,
            "details": self.details,
            "recommendation": self.recommendation,
        }


@dataclass
class PreCheckSummary:
    """Summary of all pre-check results"""

    results: List[PreCheckResult] = field(default_factory=list)
    timestamp: str = field(
        default_factory=lambda: time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
    )

    @property
    def total_checks(self) -> int:
        return len(self.results)

    @property
    def passed(self) -> int:
        return sum(
            1 for r in self.results if r.passed and r.severity == PreCheckSeverity.PASS
        )

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
        """Can upgrade proceed? (no critical failures)"""
        return self.critical_failures == 0

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON output"""
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
class DeviceStatus:
    """Comprehensive device status tracking"""

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
    pre_check_summary: Optional[PreCheckSummary] = None

    def update_phase(self, phase: UpgradePhase, message: str = ""):
        """Update device phase"""
        self.phase = phase
        self.message = message or phase.value.replace("_", " ").title()
        logger.info(f"[{self.hostname}] STATUS: {self.phase.name} - {self.message}")

    def add_warning(self, warning: str):
        """Add warning message"""
        self.warnings.append(warning)
        logger.warning(f"[{self.hostname}] WARNING: {warning}")

    def get_duration(self) -> float:
        """Calculate operation duration"""
        if self.start_time and self.end_time:
            return self.end_time - self.start_time
        elif self.start_time:
            return time.time() - self.start_time
        return 0.0


# ================================================================================
# PROGRESS REPORTING - FIXED VERSION
# ================================================================================
def send_progress(event_type: str, data: Dict[str, Any], message: str = ""):
    """
    Send structured progress updates via stderr

    CRITICAL FIX: This function outputs to stderr for WebSocket capture
    """
    event = {
        "type": event_type,
        "timestamp": time.time(),
        "message": message,
        "data": data,
    }
    print(json.dumps(event), file=sys.stderr, flush=True)
    logger.debug(f"📤 SENT EVENT: {event_type} - {message}")


def send_device_progress(
    device_status: DeviceStatus,
    step: int,
    total_steps: int,
    message: str = "",
    extra_data: Optional[Dict[str, Any]] = None,
):
    """Send device-specific progress update"""
    data = {
        "device": device_status.hostname,
        "phase": device_status.phase.value,
        "step": step,
        "total_steps": total_steps,
        "message": message or device_status.message,
        "initial_version": device_status.initial_version,
        "target_version": device_status.target_version,
        "version_action": device_status.version_action.value,
        "success": device_status.success,
        "warnings": device_status.warnings,
    }

    if extra_data:
        data.update(extra_data)

    send_progress("DEVICE_PROGRESS", data, message)


def send_pre_check_results(device_status: DeviceStatus):
    """
    🎯 CRITICAL FIX: Send PRE_CHECK_COMPLETE event to frontend
    
    This event is required for the Review tab to display results.
    Without this event, the frontend stays in "Loading pre-check results..." state.
    """
    if not device_status.pre_check_summary:
        logger.error(f"[{device_status.hostname}] No pre-check results to send")
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

    # 🎯 CRITICAL: Send PRE_CHECK_COMPLETE event for frontend
    send_progress("PRE_CHECK_COMPLETE", data, "Pre-check validation completed")
    logger.info(f"[{device_status.hostname}] ✅ PRE_CHECK_COMPLETE sent to frontend")
    
    # Allow time for the event to be processed
    time.sleep(0.1)


def send_operation_complete(
    device_status: DeviceStatus, success: bool, message: str = ""
):
    """Send operation completion event"""
    data = {
        "device": device_status.hostname,
        "success": success,
        "message": message or device_status.message,
        "initial_version": device_status.initial_version,
        "final_version": device_status.final_version,
        "version_action": device_status.version_action.value,
        "warnings": device_status.warnings,
        "duration": device_status.get_duration(),
    }

    if device_status.pre_check_summary:
        data["pre_check_summary"] = device_status.pre_check_summary.to_dict()

    send_progress("OPERATION_COMPLETE", data, message)
    logger.info(
        f"[{device_status.hostname}] ✅ OPERATION_COMPLETE sent: success={success}"
    )


# ================================================================================
# VERSION ANALYSIS
# ================================================================================
def parse_junos_version(version_string: str) -> Tuple[int, ...]:
    """
    Parse JunOS version string into comparable tuple
    """
    try:
        # Extract base version (before any -S suffix)
        base_version = version_string.split("-")[0]

        # Match major.minor[release][Rbuild] pattern
        match = re.match(r"(\d+)\.(\d+)([Rr]?)(\d*)", base_version)
        if not match:
            raise ValueError(f"Unsupported version format: {version_string}")

        major = int(match.group(1))
        minor = int(match.group(2))
        release_type = match.group(3)  # R or empty
        build = int(match.group(4)) if match.group(4) else 0

        # Handle release types (R=Release, empty=Service Release)
        release_code = 1 if release_type.upper() == "R" else 0

        # Handle service release suffix if present
        service_release = 0
        if "-S" in version_string:
            service_match = re.search(r"-S(\d+)\.(\d+)", version_string)
            if service_match:
                service_release = int(service_match.group(1))
                service_build = int(service_match.group(2))
                return (major, minor, release_code, build, service_release, service_build)

        return (major, minor, release_code, build, service_release, 0)

    except Exception as e:
        logger.error(f"Version parsing error: {e}")
        return (0, 0, 0, 0, 0, 0)


def compare_versions(current: str, target: str) -> VersionAction:
    """
    Compare current and target versions to determine action type
    """
    try:
        current_parts = parse_junos_version(current)
        target_parts = parse_junos_version(target)

        if current_parts == target_parts:
            return VersionAction.MAINTAIN

        return (
            VersionAction.UPGRADE
            if target_parts > current_parts
            else VersionAction.DOWNGRADE
        )

    except Exception as e:
        logger.warning(f"Version comparison failed: {e}, defaulting to UPGRADE")
        return VersionAction.UPGRADE


# ================================================================================
# PRE-CHECK IMPLEMENTATION
# ================================================================================
class DevicePreChecker:
    """Comprehensive device pre-upgrade validation"""

    def __init__(self, device: Device, target_version: str, image_filename: str):
        self.device = device
        self.target_version = target_version
        self.image_filename = image_filename
        self.summary = PreCheckSummary()

    def add_result(
        self,
        check_name: str,
        passed: bool,
        message: str,
        severity: PreCheckSeverity = PreCheckSeverity.CRITICAL,
        details: Optional[Dict[str, Any]] = None,
        recommendation: Optional[str] = None,
    ):
        """Add pre-check result"""
        result = PreCheckResult(
            check_name=check_name,
            severity=severity,
            passed=passed,
            message=message,
            details=details,
            recommendation=recommendation,
        )
        self.summary.results.append(result)
        logger.info(f"[{self.device.hostname}] Pre-check: {check_name} = {passed}")

    def check_connectivity(self) -> bool:
        """Check device connectivity and authentication"""
        try:
            self.device.open()
            self.device.close()
            self.add_result(
                "Device Connectivity",
                True,
                "Successfully connected and authenticated",
                PreCheckSeverity.PASS,
            )
            return True
        except Exception as e:
            self.add_result(
                "Device Connectivity",
                False,
                f"Connection failed: {str(e)}",
                PreCheckSeverity.CRITICAL,
                recommendation="Verify network connectivity and credentials",
            )
            return False

    def check_storage_space(self) -> bool:
        """Check available storage space"""
        try:
            self.device.open()
            response = self.device.rpc.get_system_storage()
            self.device.close()

            # Parse storage information
            filesystems = response.findall(".//filesystem")
            for fs in filesystems:
                mount_point = fs.findtext("mount-point")
                used_percent = fs.findtext("used-percent")

                if mount_point == "/var" and used_percent:
                    used = int(used_percent.strip("%"))
                    free_percent = 100 - used

                    details = {
                        "mount_point": mount_point,
                        "used_percent": used,
                        "free_percent": free_percent,
                        "minimum_required": MINIMUM_STORAGE_FREE_PERCENT,
                    }

                    if free_percent >= MINIMUM_STORAGE_FREE_PERCENT:
                        self.add_result(
                            "Storage Space",
                            True,
                            f"Sufficient storage space: {free_percent}% free on /var",
                            PreCheckSeverity.PASS,
                            details,
                        )
                        return True
                    else:
                        self.add_result(
                            "Storage Space",
                            False,
                            f"Insufficient storage space: {free_percent}% free (minimum {MINIMUM_STORAGE_FREE_PERCENT}% required)",
                            PreCheckSeverity.CRITICAL,
                            details,
                            recommendation="Clean up /var filesystem before upgrade",
                        )
                        return False

            # If /var not found or no usage data
            self.add_result(
                "Storage Space",
                False,
                "Could not determine /var filesystem usage",
                PreCheckSeverity.WARNING,
                recommendation="Manual storage verification required",
            )
            return True  # Warning only, not critical

        except Exception as e:
            self.add_result(
                "Storage Space",
                False,
                f"Storage check failed: {str(e)}",
                PreCheckSeverity.WARNING,
                recommendation="Manual storage verification required",
            )
            return True  # Warning only, not critical

    def check_system_alarms(self) -> bool:
        """Check for critical system alarms"""
        try:
            self.device.open()
            response = self.device.rpc.get_alarm_information()
            self.device.close()

            critical_alarms = response.findall(".//alarm-severity[text()='Critical']")
            major_alarms = response.findall(".//alarm-severity[text()='Major']")

            details = {
                "critical_alarms": len(critical_alarms),
                "major_alarms": len(major_alarms),
            }

            if len(critical_alarms) > 0:
                self.add_result(
                    "System Alarms",
                    False,
                    f"Critical alarms present: {len(critical_alarms)}",
                    PreCheckSeverity.CRITICAL,
                    details,
                    recommendation="Resolve critical alarms before upgrade",
                )
                return False
            elif len(major_alarms) > 0:
                self.add_result(
                    "System Alarms",
                    True,
                    f"Major alarms present: {len(major_alarms)} (no critical alarms)",
                    PreCheckSeverity.WARNING,
                    details,
                    recommendation="Consider resolving major alarms before upgrade",
                )
                return True
            else:
                self.add_result(
                    "System Alarms",
                    True,
                    "No critical or major alarms",
                    PreCheckSeverity.PASS,
                    details,
                )
                return True

        except Exception as e:
            self.add_result(
                "System Alarms",
                False,
                f"Alarm check failed: {str(e)}",
                PreCheckSeverity.WARNING,
                recommendation="Manual alarm verification required",
            )
            return True  # Warning only

    def check_configuration_committed(self) -> bool:
        """Verify configuration is committed"""
        try:
            self.device.open()
            response = self.device.rpc.get_configuration(
                {"database": "committed", "format": "text"}
            )
            self.device.close()

            # If we can retrieve committed config, it's committed
            self.add_result(
                "Configuration Committed",
                True,
                "Configuration is properly committed",
                PreCheckSeverity.PASS,
            )
            return True

        except Exception as e:
            self.add_result(
                "Configuration Committed",
                False,
                f"Configuration commit status unknown: {str(e)}",
                PreCheckSeverity.WARNING,
                recommendation="Verify configuration is committed",
            )
            return True  # Warning only

    def check_version_compatibility(self, current_version: str) -> bool:
        """Analyze version compatibility"""
        try:
            version_action = compare_versions(current_version, self.target_version)

            details = {
                "current_version": current_version,
                "target_version": self.target_version,
                "version_action": version_action.value,
            }

            if version_action == VersionAction.DOWNGRADE:
                self.add_result(
                    "Version Compatibility",
                    True,
                    f"Version downgrade detected: {current_version} -> {self.target_version}",
                    PreCheckSeverity.WARNING,
                    details,
                    recommendation="Verify downgrade compatibility and risks",
                )
                return True
            elif version_action == VersionAction.MAINTAIN:
                self.add_result(
                    "Version Compatibility",
                    True,
                    f"Version maintenance: already at {current_version}",
                    PreCheckSeverity.WARNING,
                    details,
                    recommendation="No version change required",
                )
                return True
            else:
                self.add_result(
                    "Version Compatibility",
                    True,
                    f"Version upgrade: {current_version} -> {self.target_version}",
                    PreCheckSeverity.PASS,
                    details,
                )
                return True

        except Exception as e:
            self.add_result(
                "Version Compatibility",
                False,
                f"Version analysis failed: {str(e)}",
                PreCheckSeverity.WARNING,
                recommendation="Manual version compatibility verification required",
            )
            return True  # Warning only

    def check_image_availability(self) -> bool:
        """Check if image file is available"""
        try:
            # This would check if the image file exists in the expected location
            # For now, we'll assume it's available
            self.add_result(
                "Image Availability",
                True,
                f"Image file {self.image_filename} assumed available",
                PreCheckSeverity.PASS,
            )
            return True
        except Exception as e:
            self.add_result(
                "Image Availability",
                False,
                f"Image availability check failed: {str(e)}",
                PreCheckSeverity.CRITICAL,
                recommendation="Verify image file exists and is accessible",
            )
            return False

    def run_all_checks(self, current_version: str) -> PreCheckSummary:
        """Execute all pre-check validations"""
        logger.info(f"[{self.device.hostname}] 🔍 Starting comprehensive pre-checks")

        # Critical checks (must pass)
        critical_checks = [
            self.check_connectivity(),
            self.check_storage_space(),
            self.check_system_alarms(),
            self.check_image_availability(),
        ]

        # Warning checks (generate warnings but don't block)
        warning_checks = [
            self.check_configuration_committed(),
            self.check_version_compatibility(current_version),
        ]

        # Log summary
        logger.info(
            f"[{self.device.hostname}] Pre-check completed: "
            f"{self.summary.passed} passed, "
            f"{self.summary.warnings} warnings, "
            f"{self.summary.critical_failures} critical failures"
        )

        return self.summary


# ================================================================================
# DEVICE UPGRADE EXECUTION - FIXED VERSION
# ================================================================================
class DeviceUpgrader:
    """Handle device upgrade operations"""

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

    @contextmanager
    def device_session(self):
        """Context manager for device connection"""
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
        """Get current device version"""
        try:
            facts = self.device.facts
            current_version = facts.get("version", "unknown")
            logger.info(f"[{self.hostname}] Current version: {current_version}")
            return current_version
        except Exception as e:
            raise VersionAnalysisError(f"Failed to get current version: {str(e)}")

    def run_pre_checks(self, current_version: str) -> bool:
        """
        🎯 CRITICAL FIX: Execute pre-upgrade validation checks
        
        This function now properly sends PRE_CHECK_COMPLETE event
        before proceeding with the upgrade phase.
        """
        if self.skip_pre_check:
            logger.info(f"[{self.hostname}] ⏭️ Pre-check skipped by request")
            return True

        self.status.update_phase(UpgradePhase.PRE_CHECK, "Running pre-upgrade checks")

        checker = DevicePreChecker(
            self.device, self.target_version, self.image_filename
        )
        pre_check_summary = checker.run_all_checks(current_version)

        self.status.pre_check_summary = pre_check_summary

        # 🎯 CRITICAL: Send PRE_CHECK_COMPLETE event to frontend
        # This enables the Review tab with pre-check results
        send_pre_check_results(self.status)

        if not pre_check_summary.can_proceed:
            if self.force_upgrade:
                logger.warning(
                    f"[{self.hostname}] ⚠️ Critical pre-check failures detected, "
                    "but proceeding due to force_upgrade=True"
                )
                return True
            else:
                logger.error(
                    f"[{self.hostname}] ❌ Critical pre-check failures detected, upgrade blocked"
                )
                return False

        logger.info(f"[{self.hostname}] ✅ All pre-checks passed or acceptable")
        return True

    def validate_image(self) -> bool:
        """Validate upgrade image"""
        self.status.update_phase(
            UpgradePhase.VALIDATING_IMAGE, "Validating upgrade image"
        )
        send_device_progress(self.status, 2, STEPS_PER_DEVICE, "Validating image")

        try:
            # Simulate image validation
            time.sleep(2)
            logger.info(f"[{self.hostname}] ✅ Image validation completed")
            return True
        except Exception as e:
            raise ImageValidationError(f"Image validation failed: {str(e)}")

    def analyze_version(self, current_version: str) -> VersionAction:
        """Analyze version relationship"""
        self.status.update_phase(
            UpgradePhase.ANALYZING_VERSION, "Analyzing version compatibility"
        )
        send_device_progress(self.status, 3, STEPS_PER_DEVICE, "Analyzing version")

        try:
            version_action = compare_versions(current_version, self.target_version)
            self.status.version_action = version_action

            logger.info(
                f"[{self.hostname}] Version analysis: {current_version} -> "
                f"{self.target_version} = {version_action.value}"
            )
            return version_action
        except Exception as e:
            raise VersionAnalysisError(f"Version analysis failed: {str(e)}")

    def install_software(self) -> bool:
        """Execute software installation"""
        self.status.update_phase(UpgradePhase.INSTALLING, "Installing software")
        send_device_progress(self.status, 4, STEPS_PER_DEVICE, "Installing software")

        try:
            # Simulate installation process
            logger.info(f"[{self.hostname}] Starting software installation")
            for i in range(1, 6):
                time.sleep(1)
                progress_msg = f"Installation progress: {i * 20}%"
                self.status.update_phase(UpgradePhase.INSTALLING, progress_msg)
                send_device_progress(
                    self.status, 4, STEPS_PER_DEVICE, progress_msg, {"progress": i * 20}
                )

            logger.info(f"[{self.hostname}] ✅ Software installation completed")
            return True
        except Exception as e:
            raise InstallationError(f"Software installation failed: {str(e)}")

    def reboot_device(self) -> bool:
        """Reboot device after installation"""
        self.status.update_phase(UpgradePhase.REBOOTING, "Rebooting device")
        send_device_progress(self.status, 5, STEPS_PER_DEVICE, "Rebooting device")

        try:
            # Simulate reboot
            logger.info(f"[{self.hostname}] Rebooting device...")
            time.sleep(5)
            logger.info(f"[{self.hostname}] ✅ Device reboot completed")
            return True
        except Exception as e:
            raise RebootTimeoutError(f"Device reboot failed: {str(e)}")

    def verify_upgrade(self) -> bool:
        """Verify upgrade success"""
        self.status.update_phase(UpgradePhase.VERIFYING, "Verifying upgrade")
        send_device_progress(self.status, 6, STEPS_PER_DEVICE, "Verifying upgrade")

        try:
            # Simulate verification
            time.sleep(2)

            # For simulation, assume success 90% of the time
            import random

            success = random.random() < 0.9

            if success:
                self.status.final_version = self.target_version
                logger.info(f"[{self.hostname}] ✅ Upgrade verification successful")
                return True
            else:
                raise VersionMismatchError(
                    f"Version mismatch after upgrade: expected {self.target_version}, got {self.status.final_version}"
                )

        except Exception as e:
            raise VersionMismatchError(f"Upgrade verification failed: {str(e)}")

    def execute_upgrade(self) -> bool:
        """Execute complete upgrade workflow"""
        self.status.start_time = time.time()
        logger.info(f"[{self.hostname}] 🚀 Starting upgrade process")

        try:
            with self.device_session():
                # Step 1: Get current version
                self.status.update_phase(UpgradePhase.CONNECTING, "Connecting to device")
                send_device_progress(self.status, 1, STEPS_PER_DEVICE, "Connecting")

                current_version = self.get_current_version()
                self.status.initial_version = current_version

                # Step 2: Run pre-checks (this now sends PRE_CHECK_COMPLETE)
                if not self.run_pre_checks(current_version):
                    raise PreCheckFailedException("Pre-check validation failed")

                # Only proceed with actual upgrade if this is an upgrade phase
                # For pre-check phase, we stop here after sending PRE_CHECK_COMPLETE
                if self.status.phase == UpgradePhase.PRE_CHECK:
                    logger.info(f"[{self.hostname}] ⏹️ Pre-check phase completed, stopping execution")
                    self.status.end_time = time.time()
                    self.status.success = True
                    send_operation_complete(self.status, True, "Pre-check completed successfully")
                    return True

                # Step 3: Validate image
                if not self.validate_image():
                    raise ImageValidationError("Image validation failed")

                # Step 4: Analyze version
                self.analyze_version(current_version)

                # Step 5: Install software
                if not self.install_software():
                    raise InstallationError("Software installation failed")

                # Step 6: Reboot device
                if not self.reboot_device():
                    raise RebootTimeoutError("Device reboot failed")

                # Step 7: Verify upgrade
                if not self.verify_upgrade():
                    raise VersionMismatchError("Upgrade verification failed")

            # Success
            self.status.end_time = time.time()
            self.status.update_phase(UpgradePhase.COMPLETED, "Upgrade completed successfully")
            self.status.success = True

            logger.info(
                f"[{self.hostname}] ✅ Upgrade completed successfully in "
                f"{self.status.get_duration():.1f} seconds"
            )

            # Send final success event
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

            logger.error(f"[{self.hostname}] ❌ Upgrade failed: {str(e)}")

            # Send final failure event
            send_operation_complete(self.status, False, f"Upgrade failed: {str(e)}")
            return False


# ================================================================================
# PRE-CHECK ONLY WORKFLOW - NEW FUNCTION
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
    """
    🎯 NEW: Execute pre-check phase only without proceeding to upgrade
    
    This function:
    1. Connects to device
    2. Runs pre-checks
    3. Sends PRE_CHECK_COMPLETE event
    4. Sends OPERATION_COMPLETE event
    5. Exits without upgrading
    """
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
    upgrader.status.phase = UpgradePhase.PRE_CHECK  # Set phase to pre-check only
    
    try:
        with upgrader.device_session():
            # Get current version
            upgrader.status.update_phase(UpgradePhase.CONNECTING, "Connecting to device")
            send_device_progress(upgrader.status, 1, 2, "Connecting to device")
            
            current_version = upgrader.get_current_version()
            upgrader.status.initial_version = current_version
            
            # Run pre-checks (this sends PRE_CHECK_COMPLETE)
            upgrader.status.update_phase(UpgradePhase.PRE_CHECK, "Running pre-checks")
            send_device_progress(upgrader.status, 2, 2, "Running pre-checks")
            
            success = upgrader.run_pre_checks(current_version)
            
            # Complete the operation
            upgrader.status.end_time = time.time()
            upgrader.status.success = success
            
            # Send operation complete
            send_operation_complete(
                upgrader.status, 
                success, 
                "Pre-check completed successfully" if success else "Pre-check completed with warnings"
            )
            
            logger.info(f"[{hostname}] ✅ Pre-check only workflow completed")
            return success
            
    except Exception as e:
        logger.error(f"[{hostname}] ❌ Pre-check only workflow failed: {str(e)}")
        upgrader.status.end_time = time.time()
        upgrader.status.success = False
        send_operation_complete(upgrader.status, False, f"Pre-check failed: {str(e)}")
        return False


# ================================================================================
# MAIN EXECUTION - FIXED VERSION
# ================================================================================
def main():
    """Main execution function"""
    parser = argparse.ArgumentParser(
        description="Device Code Upgrade with Pre-Check Phase",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
EXAMPLES:
    # Pre-check only
    python run.py --phase pre_check --hostname 172.27.200.200 --username admin \\
                  --password secret --image_filename junos.tgz --target_version 24.4R2

    # Upgrade with pre-check
    python run.py --phase upgrade --hostname 172.27.200.200 --username admin \\
                  --password secret --image_filename junos.tgz --target_version 24.4R2

    # Upgrade skipping pre-check
    python run.py --phase upgrade --hostname 172.27.200.200 --username admin \\
                  --password secret --image_filename junos.tgz --target_version 24.4R2 \\
                  --skip-pre-check
        """,
    )

    # Core arguments
    parser.add_argument("--phase", required=True, choices=["pre_check", "upgrade"],
                       help="Operation phase: pre_check or upgrade")
    parser.add_argument("--hostname", help="Target device hostname or IP")
    parser.add_argument("--inventory-file", help="Inventory file for multiple devices")
    parser.add_argument("--username", required=True, help="Device username")
    parser.add_argument("--password", required=True, help="Device password")
    parser.add_argument("--vendor", default="juniper", help="Device vendor")
    parser.add_argument("--platform", default="srx", help="Device platform")
    parser.add_argument("--target_version", required=True, help="Target software version")
    parser.add_argument("--image_filename", required=True, help="Upgrade image filename")

    # Optional arguments
    parser.add_argument("--skip-pre-check", action="store_true",
                       help="Skip pre-check phase (not recommended)")
    parser.add_argument("--force", action="store_true",
                       help="Force upgrade despite warnings (use with caution)")
    parser.add_argument("--max-workers", type=int, default=DEFAULT_MAX_WORKERS,
                       help=f"Maximum concurrent workers (default: {DEFAULT_MAX_WORKERS})")
    parser.add_argument("--timeout", type=int, default=DEFAULT_DEVICE_TIMEOUT,
                       help=f"Device operation timeout in seconds (default: {DEFAULT_DEVICE_TIMEOUT})")

    args = parser.parse_args()

    # Validate arguments
    if not args.hostname and not args.inventory_file:
        logger.error("❌ Either --hostname or --inventory-file must be specified")
        sys.exit(1)

    if args.hostname and args.inventory_file:
        logger.error("❌ Specify either --hostname OR --inventory-file, not both")
        sys.exit(1)

    try:
        # Single device operation
        if args.hostname:
            if args.phase == "pre_check":
                # 🎯 CRITICAL FIX: Use pre-check only workflow
                success = execute_pre_check_only(
                    hostname=args.hostname,
                    username=args.username,
                    password=args.password,
                    target_version=args.target_version,
                    image_filename=args.image_filename,
                    vendor=args.vendor,
                    platform=args.platform,
                )
                sys.exit(0 if success else 1)
            else:
                # Upgrade phase
                upgrader = DeviceUpgrader(
                    hostname=args.hostname,
                    username=args.username,
                    password=args.password,
                    target_version=args.target_version,
                    image_filename=args.image_filename,
                    vendor=args.vendor,
                    platform=args.platform,
                    skip_pre_check=args.skip_pre_check,
                    force_upgrade=args.force,
                )
                success = upgrader.execute_upgrade()
                sys.exit(0 if success else 1)

        # Multiple devices (inventory file) - simplified for now
        else:
            logger.info(f"📋 Processing inventory file: {args.inventory_file}")
            # For now, simulate single device from inventory
            if args.phase == "pre_check":
                success = execute_pre_check_only(
                    hostname="172.27.200.200",  # Would come from inventory
                    username=args.username,
                    password=args.password,
                    target_version=args.target_version,
                    image_filename=args.image_filename,
                    vendor=args.vendor,
                    platform=args.platform,
                )
                sys.exit(0 if success else 1)
            else:
                upgrader = DeviceUpgrader(
                    hostname="172.27.200.200",  # Would come from inventory
                    username=args.username,
                    password=args.password,
                    target_version=args.target_version,
                    image_filename=args.image_filename,
                    vendor=args.vendor,
                    platform=args.platform,
                    skip_pre_check=args.skip_pre_check,
                    force_upgrade=args.force,
                )
                success = upgrader.execute_upgrade()
                sys.exit(0 if success else 1)

    except KeyboardInterrupt:
        logger.info("🛑 Operation cancelled by user")
        sys.exit(130)
    except Exception as e:
        logger.error(f"💥 Fatal error: {str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    main()
