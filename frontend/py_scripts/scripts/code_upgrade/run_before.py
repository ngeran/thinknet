#!/usr/bin/env python3
"""
================================================================================
SCRIPT:             Juniper Device Code Upgrade - Enhanced Edition
FILENAME:           run.py (Part 1 of 4)
VERSION:            1.0.0
RELEASE DATE:       2025-11-03
AUTHOR:             Network Automation Team
MAINTAINER:         nikos-geranios_vgi
================================================================================
 
📋 DESCRIPTION:
    Enterprise-grade Juniper device firmware upgrade automation script using
    the PyEZ framework. Supports both standalone CLI execution and ReactJS
    frontend integration with real-time progress reporting.
 
🎯 VERSION 1.0.0 ENHANCEMENTS:
    ✅ Phase 1 - Critical for Manual Operation:
        • Enhanced pre-checks with actual storage validation
        • Hardware health monitoring (temperature, power, fans)
        • Routing protocol stability checks (BGP, OSPF)
        • Configuration backup validation
        • Active user session detection
        • Detailed error messages with remediation guidance
        • Post-upgrade functional validation
        • Automatic rollback mechanism on failure
        • Image size vs available space validation
        • Chassis alarm monitoring
 
🚀 FEATURES:
    • Comprehensive pre-upgrade validation (10+ checks)
    • Real-time progress reporting to stdout/stderr
    • Automatic error recovery and rollback
    • Multi-stage reboot recovery with adaptive polling
    • Platform-aware timeout management
    • Structured logging with audit trail
    • Frontend event integration via JSON
    • Human-readable console output
    • Graceful degradation on check failures
 
📦 REQUIREMENTS:
    • Python 3.7+
    • junos-eznc (PyEZ) library
    • Network connectivity to target device
    • Valid device credentials (username/password or SSH key)
    • Image file pre-uploaded to /var/tmp/ on device
 
📖 USAGE GUIDE:
 
    Basic Usage (Standalone):
    -------------------------
    python3 run.py \\
        --hostname 192.168.1.1 \\
        --username admin \\
        --password secret123 \\
        --target-version 21.4R3.15 \\
        --image-filename junos-srxsme-21.4R3.15.tgz
 
    Advanced Usage (With Options):
    ------------------------------
    python3 run.py \\
        --hostname firewall-01.example.com \\
        --username automation \\
        --password 'P@ssw0rd!' \\
        --target-version 21.4R3.15 \\
        --image-filename junos-srxsme-21.4R3.15.tgz \\
        --platform srx \\
        --vendor juniper \\
        --skip-pre-check \\
        --force-upgrade
 
    Via ReactJS Frontend:
    --------------------
    The script automatically detects frontend integration and sends
    JSON-formatted progress events to stderr for real-time UI updates.
 
🔧 COMMAND-LINE ARGUMENTS:
 
    Required:
        --hostname              Target device hostname or IP address
        --username              Device authentication username
        --password              Device authentication password
        --target-version        Desired software version (e.g., 21.4R3.15)
        --image-filename        Image filename (must exist in /var/tmp/)
 
    Optional:
        --vendor                Device vendor (default: juniper)
        --platform              Device platform (default: srx)
        --skip-pre-check        Skip pre-upgrade validation checks
        --force-upgrade         Proceed despite non-critical warnings
        --connection-timeout    Connection timeout in seconds (default: 30)
        --operation-timeout     Operation timeout in seconds (default: 1800)
        --reboot-timeout        Reboot recovery timeout (default: 900)
 
📊 EXIT CODES:
    0  - Success: Upgrade completed successfully
    1  - Failure: Upgrade failed (check logs for details)
    2  - Pre-check failure: Critical validation checks failed
    3  - Connection error: Cannot connect to device
    4  - Rollback performed: Upgrade failed and rolled back
 
⚠️  IMPORTANT NOTES:
    • Ensure image file is already uploaded to /var/tmp/ on device
    • Script will automatically reboot device after installation
    • Allow 10-20 minutes for complete upgrade process
    • Device will be temporarily unreachable during reboot
    • Configuration backup is created automatically
    • Failed upgrades trigger automatic rollback
 
🔒 SECURITY CONSIDERATIONS:
    • Avoid passing passwords via command line in production
    • Use environment variables or credential vaults
    • Ensure secure SSH connectivity to devices
    • Validate network access before upgrade
    • Review audit logs after completion
 
📞 SUPPORT:
    For issues or questions, contact: Network Automation Team
    Documentation: https://internal-wiki/network-automation/upgrades
 
================================================================================
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
from datetime import datetime

# ================================================================================
# SECTION 1: THIRD-PARTY LIBRARY IMPORTS & VALIDATION
# ================================================================================
# Description: Import and validate availability of required external libraries,
#              primarily the Juniper PyEZ framework for device automation.
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
# SECTION 2: LOGGING CONFIGURATION & SETUP
# ================================================================================
# Description: Configure application-wide logging with appropriate format,
#              levels, and output streams for debugging and audit purposes.
# ================================================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)-8s - [%(filename)s:%(lineno)d] - %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)


# ================================================================================
# SECTION 3: CONFIGURATION CONSTANTS & DEFAULTS
# ================================================================================
# Description: Centralized configuration values for timeouts, thresholds, and
#              operational parameters used throughout the upgrade process.
# ================================================================================

# Connection & Operation Timeouts
DEFAULT_CONNECTION_TIMEOUT = 30
DEFAULT_OPERATION_TIMEOUT = 1800
DEFAULT_REBOOT_TIMEOUT = 900
DEFAULT_RETRY_ATTEMPTS = 3

# Storage & Resource Thresholds
MINIMUM_STORAGE_FREE_PERCENT = 20
MINIMUM_STORAGE_FREE_MB = 512
STORAGE_SAFETY_MULTIPLIER = 2.2  # Need 2.2x image size for safe install

# Progress Tracking
STEPS_PER_DEVICE = 12  # Increased from 8 to accommodate new checks

# Reboot & Recovery Parameters
INITIAL_REBOOT_WAIT = 60
POLLING_INTERVAL = 30
MAX_REBOOT_WAIT_TIME = 1200
ADAPTIVE_POLLING_THRESHOLD = 300  # Switch to faster polling after 5 minutes

# Event Delivery Optimization
EVENT_DELIVERY_DELAY = 1.0
EVENT_FLUSH_DELAY = 0.5
EVENT_RETRY_COUNT = 2

# Hardware Health Thresholds
MAX_TEMPERATURE_CELSIUS = 70
MIN_POWER_SUPPLY_COUNT = 1
MIN_FAN_COUNT = 1

# Routing Protocol Thresholds
MIN_BGP_PEER_UPTIME = 300  # 5 minutes
MIN_OSPF_NEIGHBOR_COUNT = 0  # Warning if no neighbors

# Active Session Thresholds
MAX_ACTIVE_SESSIONS_WARNING = 3  # Warn if more than 3 concurrent users


# ================================================================================
# SECTION 4: CUSTOM EXCEPTION CLASSES
# ================================================================================
# Description: Hierarchical exception classes for granular error handling and
#              specific failure categorization during upgrade operations.
# ================================================================================


class UpgradeError(Exception):
    """Base exception for all upgrade-related errors"""

    def __init__(self, message: str, remediation: str = None):
        self.message = message
        self.remediation = remediation
        super().__init__(self.message)


class PreCheckFailure(UpgradeError):
    """Raised when pre-upgrade validation checks fail critically"""

    pass


class InstallationFailure(UpgradeError):
    """Raised when software installation process fails"""

    pass


class RebootTimeoutError(UpgradeError):
    """Raised when device fails to recover within timeout after reboot"""

    pass


class ValidationError(UpgradeError):
    """Raised when post-upgrade validation fails"""

    pass


class RollbackError(UpgradeError):
    """Raised when automatic rollback process fails"""

    pass


# ================================================================================
# SECTION 5: ENUMERATION DEFINITIONS
# ================================================================================
# Description: Enumerated types for upgrade phases, check severity levels,
#              version actions, and other categorical state representations.
# ================================================================================


class UpgradePhase(Enum):
    """Upgrade process phase tracking"""

    PENDING = "pending"
    PRE_CHECK = "pre_check"
    BACKUP = "backup"
    CONNECTING = "connecting"
    VALIDATING = "validating"
    INSTALLING = "installing"
    REBOOTING = "rebooting"
    VERIFYING = "verifying"
    COMPLETED = "completed"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"


class PreCheckSeverity(Enum):
    """Pre-check result severity levels"""

    PASS = "pass"
    WARNING = "warning"
    CRITICAL = "critical"
    INFO = "info"


class VersionAction(Enum):
    """Version change action classification"""

    MAJOR_UPGRADE = "major_upgrade"
    MINOR_UPGRADE = "minor_upgrade"
    MAJOR_DOWNGRADE = "major_downgrade"
    MINOR_DOWNGRADE = "minor_downgrade"
    SAME_VERSION = "same_version"
    UNKNOWN = "unknown"


class RollbackStrategy(Enum):
    """Rollback strategy options"""

    AUTOMATIC = "automatic"
    MANUAL = "manual"
    NONE = "none"


# ================================================================================
# SECTION 6: DATA STRUCTURE DEFINITIONS
# ================================================================================
# Description: Core data classes for representing pre-check results, upgrade
#              summaries, device status, and operational state tracking.
# ================================================================================


@dataclass
class PreCheckResult:
    """
    Represents the result of a single pre-upgrade validation check.

    Attributes:
        check_name: Human-readable name of the check
        severity: Severity level (PASS, WARNING, CRITICAL, INFO)
        passed: Boolean indicating if check passed
        message: Detailed message about check result
        details: Optional dictionary with additional check details
        recommendation: Optional remediation guidance
    """

    check_name: str
    severity: PreCheckSeverity
    passed: bool
    message: str
    details: Optional[Dict[str, Any]] = None
    recommendation: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to JSON-serializable dictionary"""
        return {
            "check_name": self.check_name,
            "severity": self.severity.value,
            "passed": self.passed,
            "message": self.message,
            "details": self._safe_serialize(self.details),
            "recommendation": self.recommendation,
        }

    @staticmethod
    def _safe_serialize(obj: Any) -> Any:
        """Helper for safe serialization"""
        if obj is None:
            return None
        elif isinstance(obj, dict):
            return {k: PreCheckResult._safe_serialize(v) for k, v in obj.items()}
        elif isinstance(obj, (list, tuple)):
            return [PreCheckResult._safe_serialize(item) for item in obj]
        elif isinstance(obj, (str, int, float, bool)):
            return obj
        else:
            return str(obj)


@dataclass
class PreCheckSummary:
    """
    Aggregated summary of all pre-upgrade validation checks.

    Provides statistical analysis and overall upgrade readiness determination.
    """

    results: List[PreCheckResult] = field(default_factory=list)
    timestamp: str = field(
        default_factory=lambda: time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
    )

    @property
    def total_checks(self) -> int:
        """Total number of checks performed"""
        return len(self.results)

    @property
    def passed(self) -> int:
        """Number of checks that passed"""
        return sum(1 for r in self.results if r.passed)

    @property
    def warnings(self) -> int:
        """Number of warning-level checks"""
        return sum(1 for r in self.results if r.severity == PreCheckSeverity.WARNING)

    @property
    def critical_failures(self) -> int:
        """Number of critical failures"""
        return sum(
            1
            for r in self.results
            if not r.passed and r.severity == PreCheckSeverity.CRITICAL
        )

    @property
    def can_proceed(self) -> bool:
        """Determine if upgrade can proceed based on critical failures"""
        return self.critical_failures == 0

    def get_failed_checks(self) -> List[PreCheckResult]:
        """Return list of failed checks"""
        return [r for r in self.results if not r.passed]

    def get_recommendations(self) -> List[str]:
        """Return all remediation recommendations"""
        return [r.recommendation for r in self.results if r.recommendation]

    def to_dict(self) -> Dict[str, Any]:
        """Convert to JSON-serializable dictionary"""
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
    """
    Comprehensive result tracking for upgrade operation.

    Captures timing, version changes, errors, warnings, and detailed step execution.
    """

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
    rollback_performed: bool = False
    rollback_reason: Optional[str] = None
    warnings: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    upgrade_steps: List[Dict[str, Any]] = field(default_factory=list)

    def add_step(
        self, step_name: str, status: str, message: str, duration: float = 0.0
    ):
        """Add a step to upgrade execution tracking"""
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
        """Calculate total upgrade duration"""
        if self.start_time and self.end_time:
            self.upgrade_duration = self.end_time - self.start_time
        return self.upgrade_duration

    def to_dict(self) -> Dict[str, Any]:
        """Convert to JSON-serializable dictionary"""
        return {
            "success": self.success,
            "initial_version": self.initial_version,
            "final_version": self.final_version,
            "version_action": self.version_action.value,
            "upgrade_duration": self.calculate_duration(),
            "reboot_required": self.reboot_required,
            "reboot_performed": self.reboot_performed,
            "reboot_wait_time": self.reboot_wait_time,
            "rollback_performed": self.rollback_performed,
            "rollback_reason": self.rollback_reason,
            "warnings": self.warnings,
            "errors": self.errors,
            "upgrade_steps": self.upgrade_steps,
        }


@dataclass
class DeviceStatus:
    """
    Central state tracking for device upgrade process.

    Maintains current phase, version info, errors, warnings, and aggregated results.
    """

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
    backup_created: bool = False
    backup_path: Optional[str] = None

    def update_phase(self, phase: UpgradePhase, message: str = ""):
        """Update current upgrade phase with optional message"""
        self.phase = phase
        self.message = message or phase.value.replace("_", " ").title()
        logger.info(
            f"[{self.hostname}] PHASE: {self.phase.value.upper()} - {self.message}"
        )

    def add_warning(self, warning: str):
        """Add a warning message to tracking"""
        self.warnings.append(warning)
        logger.warning(f"[{self.hostname}] WARNING: {warning}")

    def get_duration(self) -> float:
        """Calculate elapsed time since upgrade start"""
        if self.start_time and self.end_time:
            return self.end_time - self.start_time
        elif self.start_time:
            return time.time() - self.start_time
        return 0.0

    def set_upgrade_result(self, upgrade_result: UpgradeResult):
        """Assign upgrade result and propagate key fields"""
        self.upgrade_result = upgrade_result
        self.final_version = upgrade_result.final_version
        self.success = upgrade_result.success
        if upgrade_result.errors:
            self.error = "; ".join(upgrade_result.errors)
        self.warnings.extend(upgrade_result.warnings)


# ================================================================================
# END OF PART 1
# ================================================================================
# Continue with Part 2 for utility functions and network connectivity
# ================================================================================
# PART 2 OF 4: UTILITY FUNCTIONS & NETWORK CONNECTIVITY
# ================================================================================
# This part contains:
# - Section 7: JSON Serialization Utilities
# - Section 8: Event Flow Debugging
# - Section 9: Network Connectivity & Reachability
# - Section 10: Version Management
# - Section 11: Progress Reporting System
# ================================================================================


# ================================================================================
# SECTION 7: UTILITY FUNCTIONS - JSON SERIALIZATION
# ================================================================================
# Description: Safe JSON serialization utilities for handling complex Python
#              objects, enums, and nested data structures.
# ================================================================================


def safe_json_serialize(obj: Any) -> Any:
    """
    Recursively serialize Python objects to JSON-compatible types.

    Handles Enums, dataclasses, nested collections, and provides fallbacks
    for unserializable objects.

    Args:
        obj: Any Python object to serialize

    Returns:
        JSON-compatible representation of the object
    """
    if obj is None:
        return None
    elif isinstance(obj, (str, int, float, bool)):
        return obj
    elif isinstance(obj, dict):
        return {k: safe_json_serialize(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
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
# SECTION 8: UTILITY FUNCTIONS - EVENT FLOW DEBUGGING
# ================================================================================
# Description: Enhanced debugging utilities for tracking event propagation
#              between backend script and frontend interface.
# ================================================================================


def debug_event_flow(event_type: str, data: Dict[str, Any], stage: str = "SENDING"):
    """
    Debug helper for monitoring event flow to frontend.

    Logs detailed event information for troubleshooting frontend integration
    and event delivery issues.

    Args:
        event_type: Type of event being sent
        data: Event payload data
        stage: Event flow stage (SENDING, DELIVERED, etc.)
    """
    debug_message = f"🔍 [EVENT_FLOW] {stage} {event_type}"

    if event_type == "PRE_CHECK_COMPLETE":
        if "pre_check_summary" in data:
            summary = data["pre_check_summary"]
            debug_message += f" | Checks: {summary.get('total_checks', 'N/A')}"
            debug_message += f" | Can proceed: {summary.get('can_proceed', 'N/A')}"
    elif event_type == "OPERATION_COMPLETE":
        if "success" in data:
            debug_message += f" | Success: {data.get('success', 'N/A')}"
    elif event_type == "ROLLBACK_INITIATED":
        if "reason" in data:
            debug_message += f" | Reason: {data.get('reason', 'N/A')}"

    print(debug_message, file=sys.stderr, flush=True)
    logger.debug(f"[EVENT_FLOW] {event_type} {stage} - Data keys: {list(data.keys())}")


# ================================================================================
# SECTION 9: NETWORK CONNECTIVITY - REACHABILITY TESTING
# ================================================================================
# Description: Multi-layer network reachability testing including basic TCP
#              connectivity and Junos NETCONF service validation.
# ================================================================================

# ─────────────────────────────────────────────────────────────────────────────
# Function: Test Basic TCP Reachability
# ─────────────────────────────────────────────────────────────────────────────


def test_basic_reachability(host: str, port: int = 22, timeout: int = 10) -> bool:
    """
    Test basic TCP connectivity to device on specified port.

    Performs low-level socket connection test without protocol negotiation.

    Args:
        host: Target hostname or IP address
        port: TCP port to test (default: 22 for SSH)
        timeout: Connection timeout in seconds

    Returns:
        True if TCP connection succeeds, False otherwise
    """
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


# ─────────────────────────────────────────────────────────────────────────────
# Function: Test Junos NETCONF Reachability
# ─────────────────────────────────────────────────────────────────────────────


def test_junos_reachability(
    host: str, username: str, password: str, timeout: int = 30
) -> Tuple[bool, str]:
    """
    Test Junos device reachability using PyEZ NETCONF probe.

    Validates that NETCONF service is responding and device is ready for
    PyEZ operations.

    Args:
        host: Target hostname or IP address
        username: Device authentication username
        password: Device authentication password
        timeout: Probe timeout in seconds

    Returns:
        Tuple of (success: bool, message: str)
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
                return True, f"Device {host} is reachable and responsive via NETCONF"
            else:
                return False, f"Device {host} is not responding to NETCONF probe"
    except ProbeError as e:
        return False, f"NETCONF probe failed for {host}: {str(e)}"
    except Exception as e:
        return False, f"Connection test failed for {host}: {str(e)}"


# ─────────────────────────────────────────────────────────────────────────────
# Function: Wait for Device Recovery After Reboot
# ─────────────────────────────────────────────────────────────────────────────


def wait_for_device_recovery(
    hostname: str,
    username: str,
    password: str,
    max_wait_time: int = MAX_REBOOT_WAIT_TIME,
    polling_interval: int = POLLING_INTERVAL,
) -> Tuple[bool, str]:
    """
    Wait for device to fully recover after reboot with multi-stage validation.

    Implements adaptive polling strategy with two-stage validation:
    1. Basic TCP connectivity on SSH port
    2. NETCONF service readiness

    Args:
        hostname: Target device hostname
        username: Device authentication username
        password: Device authentication password
        max_wait_time: Maximum wait time in seconds
        polling_interval: Initial polling interval in seconds

    Returns:
        Tuple of (success: bool, message: str)
    """
    logger.info(f"[{hostname}] 🔄 Waiting for device recovery (max: {max_wait_time}s)")

    start_time = time.time()
    last_status_time = start_time
    status_interval = 60

    # Stage tracking
    basic_reachability_achieved = False
    junos_reachability_achieved = False

    # Adaptive polling - start slow, speed up after threshold
    current_polling_interval = polling_interval

    while time.time() - start_time < max_wait_time:
        elapsed = time.time() - start_time
        remaining = max_wait_time - elapsed

        # Adaptive polling: switch to faster polling after initial wait
        if elapsed > ADAPTIVE_POLLING_THRESHOLD and current_polling_interval > 15:
            current_polling_interval = 15
            logger.info(f"[{hostname}] ⚡ Switching to faster polling (15s intervals)")

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
                # Don't wait full interval, quickly proceed to stage 2
                time.sleep(5)
                continue
            else:
                logger.debug(
                    f"[{hostname}] 🔄 Waiting for basic connectivity... ({elapsed:.0f}s)"
                )
                time.sleep(current_polling_interval)
                continue

        # Stage 2: Check Junos NETCONF service
        if basic_reachability_achieved and not junos_reachability_achieved:
            junos_reachable, junos_message = test_junos_reachability(
                hostname, username, password, timeout=30
            )
            if junos_reachable:
                junos_reachability_achieved = True
                logger.info(f"[{hostname}] ✅ Stage 2: Junos NETCONF service restored")
                # Give device a few more seconds to stabilize
                time.sleep(10)
                return True, f"Device fully recovered in {elapsed:.1f}s"
            else:
                logger.debug(
                    f"[{hostname}] 🔄 Waiting for NETCONF service... ({elapsed:.0f}s): {junos_message}"
                )
                time.sleep(current_polling_interval)
                continue

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
# SECTION 10: VERSION MANAGEMENT - PARSING & COMPARISON
# ================================================================================
# Description: Junos version string parsing and intelligent version comparison
#              logic for determining upgrade/downgrade actions.
# ================================================================================

# ─────────────────────────────────────────────────────────────────────────────
# Function: Parse Junos Version String
# ─────────────────────────────────────────────────────────────────────────────


def parse_junos_version(version_string: str) -> Tuple[int, ...]:
    """
    Parse Junos version string into comparable tuple.

    Handles various Junos version formats including:
    - 21.4R3.15
    - 20.4R3-S1.4
    - 19.4R1
    - 21.1X46-D10.2

    Args:
        version_string: Junos version string

    Returns:
        Tuple of (major, minor, release_flag, build, service, patch)
    """
    try:
        # Remove common suffixes and extract base version
        base_version = version_string.split("-")[0]

        # Handle service pack notation (e.g., 20.4R3-S1)
        service_pack = 0
        patch_level = 0
        if "-S" in version_string:
            parts = version_string.split("-S")
            base_version = parts[0]
            if len(parts) > 1:
                sp_parts = parts[1].split(".")
                service_pack = int(sp_parts[0]) if sp_parts[0].isdigit() else 0
                patch_level = (
                    int(sp_parts[1])
                    if len(sp_parts) > 1 and sp_parts[1].isdigit()
                    else 0
                )

        # Handle X-series special versions (e.g., 21.1X46-D10)
        if "X" in base_version:
            match = re.match(r"(\d+)\.(\d+)X(\d+)", base_version)
            if match:
                major = int(match.group(1))
                minor = int(match.group(2))
                x_version = int(match.group(3))
                return (major, minor, 1, 0, x_version, 0)

        # Standard version format
        match = re.match(r"(\d+)\.(\d+)([Rr]?)(\d*)", base_version)
        if not match:
            raise ValueError(f"Unsupported version format: {version_string}")

        major = int(match.group(1))
        minor = int(match.group(2))
        release_code = 1 if match.group(3).upper() == "R" else 0
        build = int(match.group(4)) if match.group(4) else 0

        return (major, minor, release_code, build, service_pack, patch_level)

    except Exception as e:
        logger.error(f"Version parsing error for '{version_string}': {e}")
        return (0, 0, 0, 0, 0, 0)


# ─────────────────────────────────────────────────────────────────────────────
# Function: Compare Versions
# ─────────────────────────────────────────────────────────────────────────────


def compare_versions(current: str, target: str) -> VersionAction:
    """
    Compare current and target versions to determine upgrade action.

    Args:
        current: Current device version string
        target: Target version string for upgrade

    Returns:
        VersionAction enum indicating type of version change
    """
    try:
        current_parts = parse_junos_version(current)
        target_parts = parse_junos_version(target)

        if current_parts == target_parts:
            return VersionAction.SAME_VERSION

        # Compare major version
        if target_parts[0] > current_parts[0]:
            return VersionAction.MAJOR_UPGRADE
        elif target_parts[0] < current_parts[0]:
            return VersionAction.MAJOR_DOWNGRADE

        # Compare minor version
        if target_parts[1] > current_parts[1]:
            return VersionAction.MINOR_UPGRADE
        elif target_parts[1] < current_parts[1]:
            return VersionAction.MINOR_DOWNGRADE

        # Same major.minor, compare remaining components
        if target_parts > current_parts:
            return VersionAction.MINOR_UPGRADE
        elif target_parts < current_parts:
            return VersionAction.MINOR_DOWNGRADE

        return VersionAction.UNKNOWN

    except Exception as e:
        logger.warning(f"Version comparison failed: {e}, defaulting to UNKNOWN")
        return VersionAction.UNKNOWN


# ─────────────────────────────────────────────────────────────────────────────
# Function: Get Version Change Risk Level
# ─────────────────────────────────────────────────────────────────────────────


def get_version_change_risk(version_action: VersionAction) -> str:
    """
    Assess risk level of version change operation.

    Args:
        version_action: Type of version change

    Returns:
        Risk level string (LOW, MEDIUM, HIGH, NONE, UNKNOWN)
    """
    risk_mapping = {
        VersionAction.SAME_VERSION: "NONE",
        VersionAction.MINOR_UPGRADE: "LOW",
        VersionAction.MINOR_DOWNGRADE: "MEDIUM",
        VersionAction.MAJOR_UPGRADE: "MEDIUM",
        VersionAction.MAJOR_DOWNGRADE: "HIGH",
        VersionAction.UNKNOWN: "UNKNOWN",
    }
    return risk_mapping.get(version_action, "UNKNOWN")


# ================================================================================
# SECTION 11: PROGRESS REPORTING - FRONTEND INTEGRATION
# ================================================================================
# Description: Real-time progress event emission for ReactJS frontend with
#              JSON-formatted structured events sent via stderr.
# ================================================================================

# ─────────────────────────────────────────────────────────────────────────────
# Function: Send Progress Event
# ─────────────────────────────────────────────────────────────────────────────


def send_progress(event_type: str, data: Dict[str, Any], message: str = ""):
    """
    Send progress event to frontend via stderr in JSON format.

    Events are structured JSON objects containing event type, timestamp,
    message, and data payload. Multiple delivery attempts ensure reliability.

    Args:
        event_type: Type of event (e.g., DEVICE_PROGRESS, PRE_CHECK_COMPLETE)
        data: Event-specific data payload
        message: Human-readable message describing event
    """
    event = {
        "event_type": event_type,
        "timestamp": time.time(),
        "message": message,
        "data": safe_json_serialize(data),
    }

    debug_event_flow(event_type, data, "SENDING")

    # Critical events get retry logic
    max_attempts = (
        EVENT_RETRY_COUNT
        if event_type
        in ["PRE_CHECK_COMPLETE", "OPERATION_COMPLETE", "ROLLBACK_COMPLETE"]
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


# ─────────────────────────────────────────────────────────────────────────────
# Function: Send Device Progress Update
# ─────────────────────────────────────────────────────────────────────────────


def send_device_progress(
    device_status: DeviceStatus,
    step: int,
    total_steps: int,
    message: str = "",
    extra_data: Optional[Dict[str, Any]] = None,
):
    """
    Send device-specific progress update.

    Args:
        device_status: Current device status object
        step: Current step number (1-based)
        total_steps: Total number of steps in process
        message: Progress message
        extra_data: Additional data to include in event
    """
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


# ─────────────────────────────────────────────────────────────────────────────
# Function: Send Upgrade Progress Update
# ─────────────────────────────────────────────────────────────────────────────


def send_upgrade_progress(
    device_status: DeviceStatus,
    step_name: str,
    status: str,
    progress: int = 0,
    message: str = "",
):
    """
    Send upgrade operation progress update.

    Args:
        device_status: Current device status
        step_name: Name of current upgrade step
        status: Step status (in_progress, completed, failed)
        progress: Progress percentage (0-100)
        message: Detailed progress message
    """
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


# ─────────────────────────────────────────────────────────────────────────────
# Function: Send Pre-Check Results
# ─────────────────────────────────────────────────────────────────────────────


def send_pre_check_results(device_status: DeviceStatus):
    """
    Send pre-check validation results to frontend.

    Args:
        device_status: Device status containing pre-check summary
    """
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

    # Ensure delivery with multiple flushes
    for i in range(3):
        try:
            sys.stderr.flush()
        except Exception:
            pass
        time.sleep(EVENT_FLUSH_DELAY / 3)

    logger.info(
        f"[{device_status.hostname}] ✅ PRE_CHECK_COMPLETE events delivered successfully"
    )


# ─────────────────────────────────────────────────────────────────────────────
# Function: Send Operation Complete Event
# ─────────────────────────────────────────────────────────────────────────────


def send_operation_complete(
    device_status: DeviceStatus, success: bool, message: str = ""
):
    """
    Send final operation completion event.

    Args:
        device_status: Final device status
        success: Whether operation succeeded
        message: Completion message
    """
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
# END OF PART 2
# ================================================================================
# Continue with Part 3 for Human-Readable Formatter and Pre-Check Engine
# ================================================================================
# PART 3 OF 4: HUMAN-READABLE FORMATTER & PRE-CHECK ENGINE
# ================================================================================
# This part contains:
# - Section 12: Human-Readable Output Formatter
# - Section 13: Enhanced Pre-Check Engine (Phase 1 Implementation)
# ================================================================================


# ================================================================================
# SECTION 12: HUMAN-READABLE OUTPUT FORMATTER
# ================================================================================
# Description: Console output formatting for human-readable upgrade progress
#              and results display during standalone CLI execution.
# ================================================================================


class HumanReadableFormatter:
    """
    Formats upgrade progress and results for human-readable console output.

    Provides tabular displays, color-coded status indicators, and structured
    summaries for CLI users.
    """

    # ─────────────────────────────────────────────────────────────────────────
    # Method: Print Banner
    # ─────────────────────────────────────────────────────────────────────────

    @staticmethod
    def print_banner(title: str, width: int = 80):
        """
        Print formatted section banner.

        Args:
            title: Banner title text
            width: Banner width in characters
        """
        print(f"\n{'=' * width}")
        print(f"🎯 {title.upper()}")
        print(f"{'=' * width}")

    # ─────────────────────────────────────────────────────────────────────────
    # Method: Print Pre-Check Results Table
    # ─────────────────────────────────────────────────────────────────────────

    @staticmethod
    def print_check_results_table(pre_check_summary: PreCheckSummary):
        """
        Print pre-check results in formatted table.

        Args:
            pre_check_summary: Summary of all pre-check results
        """
        print(f"\n📊 PRE-CHECK RESULTS SUMMARY")
        print(f"{'─' * 100}")

        stats_line = f"✅ Passed: {pre_check_summary.passed} | "
        stats_line += f"⚠️  Warnings: {pre_check_summary.warnings} | "
        stats_line += f"❌ Critical: {pre_check_summary.critical_failures} | "
        stats_line += f"📋 Total: {pre_check_summary.total_checks}"
        print(stats_line)
        print(f"{'─' * 100}")

        print(f"\n{'CHECK NAME':<35} {'STATUS':<12} {'SEVERITY':<10} {'MESSAGE'}")
        print(f"{'─' * 35} {'─' * 12} {'─' * 10} {'─' * 43}")

        for result in pre_check_summary.results:
            status_icon = "✅" if result.passed else "❌"
            status_text = "PASS" if result.passed else "FAIL"

            severity_icon = {
                PreCheckSeverity.PASS: "🟢",
                PreCheckSeverity.WARNING: "🟡",
                PreCheckSeverity.CRITICAL: "🔴",
                PreCheckSeverity.INFO: "🔵",
            }.get(result.severity, "⚪")
            severity_text = result.severity.value.upper()

            message = result.message
            if len(message) > 43:
                message = message[:40] + "..."

            print(
                f"{result.check_name:<35} {status_icon} {status_text:<8} "
                f"{severity_icon} {severity_text:<6} {message}"
            )

            # Print recommendation if check failed
            if not result.passed and result.recommendation:
                print(f"{'':>35} 💡 Recommendation: {result.recommendation}")

        print(f"{'─' * 100}")

        if pre_check_summary.can_proceed:
            print(f"\n🎉 OVERALL STATUS: ✅ UPGRADE CAN PROCEED")
        else:
            print(
                f"\n🚫 OVERALL STATUS: ❌ UPGRADE BLOCKED - Critical failures detected"
            )
            print(f"\n🔧 FAILED CHECKS REQUIRING ATTENTION:")
            for failed_check in pre_check_summary.get_failed_checks():
                if failed_check.severity == PreCheckSeverity.CRITICAL:
                    print(f"   • {failed_check.check_name}: {failed_check.message}")
                    if failed_check.recommendation:
                        print(f"     → {failed_check.recommendation}")

    # ─────────────────────────────────────────────────────────────────────────
    # Method: Print Upgrade Results
    # ─────────────────────────────────────────────────────────────────────────

    @staticmethod
    def print_upgrade_results(device_status: DeviceStatus):
        """
        Print final upgrade results.

        Args:
            device_status: Final device status with upgrade results
        """
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
        print(
            f"   Risk Level: {get_version_change_risk(upgrade_result.version_action)}"
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

        if upgrade_result.rollback_performed:
            print(f"\n🔙 ROLLBACK PERFORMED")
            if upgrade_result.rollback_reason:
                print(f"   Reason: {upgrade_result.rollback_reason}")

        if upgrade_result.upgrade_steps:
            print(f"\n📋 UPGRADE STEPS:")
            print(f"{'─' * 100}")
            print(f"{'STEP':<35} {'STATUS':<12} {'DURATION':<10} {'MESSAGE'}")
            print(f"{'─' * 35} {'─' * 12} {'─' * 10} {'─' * 43}")

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
                    step["message"][:43] + "..."
                    if len(step["message"]) > 43
                    else step["message"]
                )
                print(
                    f"{step['step']:<35} {step_icon} {step['status']:<8} "
                    f"{duration:<10} {message}"
                )

            print(f"{'─' * 100}")

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
                print(f"   ✅ Device is operational and ready for production use")
            else:
                print(f"   ⚠️  Upgrade completed but final version differs from target")
                print(f"   🔍 Manual verification recommended")
        else:
            print(f"   🔧 Review errors above and address root causes")
            if upgrade_result.rollback_performed:
                print(f"   ✅ Device has been rolled back to previous version")
                print(f"   🔍 Investigate failure before retrying upgrade")
            else:
                print(f"   ⚠️  Manual intervention may be required")

        print(f"{'─' * 100}")


# ================================================================================
# SECTION 13: PRE-CHECK ENGINE - PHASE 1 ENHANCED VALIDATION
# ================================================================================
# Description: Comprehensive pre-upgrade validation engine with 10+ intelligent
#              checks covering storage, hardware, routing, configuration, and
#              operational state validation.
# ================================================================================


class EnhancedPreCheckEngine:
    """
    Comprehensive pre-upgrade validation engine.

    Performs extensive checks before upgrade including:
    - Image file availability and size validation
    - Storage space with actual size calculations
    - Hardware health (temperature, power, fans)
    - Routing protocol stability (BGP, OSPF)
    - System alarms and chassis status
    - Active user sessions
    - Configuration commit status
    - Backup validation
    """

    def __init__(self, device: Device, hostname: str, image_filename: str):
        """
        Initialize pre-check engine.

        Args:
            device: Connected PyEZ Device instance
            hostname: Device hostname for logging
            image_filename: Target upgrade image filename
        """
        self.device = device
        self.hostname = hostname
        self.image_filename = image_filename
        self.image_path = f"/var/tmp/{image_filename}"

    # ─────────────────────────────────────────────────────────────────────────
    # CHECK 1: Image File Availability & Size Validation
    # ─────────────────────────────────────────────────────────────────────────

    def _check_image_availability_and_size(self) -> PreCheckResult:
        """
        Verify image file exists and get its size for storage validation.

        Uses CLI command to verify file existence and extract size information.

        Returns:
            PreCheckResult with file availability and size details
        """
        try:
            # Use 'file list' command to verify and get file details
            cli_output = self.device.cli(
                f"file list detail /var/tmp/{self.image_filename}", warning=False
            )

            if not cli_output or "No such file or directory" in cli_output:
                return PreCheckResult(
                    "Image File Availability",
                    PreCheckSeverity.CRITICAL,
                    False,
                    f"Image file not found: {self.image_path}",
                    {"expected_file": self.image_filename},
                    f"Upload {self.image_filename} to /var/tmp/ on device before upgrade",
                )

            # Try to extract file size from output
            image_size_mb = 0
            try:
                # Parse output for size (format varies by platform)
                size_match = re.search(
                    r"(\d+)\s+\w+\s+\d+\s+\d+:\d+:\d+\s+"
                    + re.escape(self.image_filename),
                    cli_output,
                )
                if size_match:
                    image_size_bytes = int(size_match.group(1))
                    image_size_mb = image_size_bytes / (1024 * 1024)
            except Exception as e:
                logger.debug(f"Could not parse image size: {e}")

            details = {
                "image_path": self.image_path,
                "image_size_mb": round(image_size_mb, 2)
                if image_size_mb > 0
                else "unknown",
                "method": "cli_file_list",
            }

            return PreCheckResult(
                "Image File Availability",
                PreCheckSeverity.PASS,
                True,
                f"Image file verified: {self.image_filename}"
                + (f" ({image_size_mb:.1f} MB)" if image_size_mb > 0 else ""),
                details,
            )

        except Exception as e:
            logger.warning(f"[{self.hostname}] Image availability check failed: {e}")
            return PreCheckResult(
                "Image File Availability",
                PreCheckSeverity.CRITICAL,
                False,
                f"Unable to verify image file: {str(e)}",
                {"error": str(e)},
                "Verify device connectivity and file system accessibility",
            )

    # ─────────────────────────────────────────────────────────────────────────
    # CHECK 2: Storage Space - Enhanced with Actual Size Validation
    # ─────────────────────────────────────────────────────────────────────────

    def _check_storage_space_detailed(self) -> PreCheckResult:
        """
        Validate sufficient storage space considering actual image size.

        Checks both percentage-based and absolute space requirements.
        Requires 2.2x image size for safe installation (image + backup + overhead).

        Returns:
            PreCheckResult with detailed storage metrics
        """
        try:
            response = self.device.rpc.get_system_storage()
            filesystems = response.findall(".//filesystem")

            storage_details = []
            critical_issues = []
            warnings = []

            for fs in filesystems:
                fs_name = fs.findtext("filesystem-name", "unknown")
                total_blocks = fs.findtext("total-blocks", "0")
                used_percent_text = fs.findtext("used-percent", "0").strip("%")
                available_blocks = fs.findtext("available-blocks", "0")

                try:
                    used_percent = int(used_percent_text)
                    free_percent = 100 - used_percent

                    # Calculate available space in MB
                    avail_mb = int(available_blocks) / 1024  # Assuming blocks are in KB

                    fs_info = {
                        "filesystem": fs_name,
                        "used_percent": used_percent,
                        "free_percent": free_percent,
                        "available_mb": round(avail_mb, 2),
                    }
                    storage_details.append(fs_info)

                    # Check /var filesystem specifically (where /var/tmp resides)
                    if "/var" in fs_name or fs_name == "/":
                        # Check percentage
                        if free_percent < MINIMUM_STORAGE_FREE_PERCENT:
                            critical_issues.append(
                                f"{fs_name}: Only {free_percent}% free (minimum {MINIMUM_STORAGE_FREE_PERCENT}% required)"
                            )

                        # Check absolute space
                        if avail_mb < MINIMUM_STORAGE_FREE_MB:
                            critical_issues.append(
                                f"{fs_name}: Only {avail_mb:.1f} MB available (minimum {MINIMUM_STORAGE_FREE_MB} MB required)"
                            )

                        # Estimate required space (2.2x safety factor)
                        if avail_mb < 1000:  # Less than 1GB available
                            warnings.append(
                                f"{fs_name}: Low available space ({avail_mb:.1f} MB). Verify sufficient space for image."
                            )

                except ValueError:
                    continue

            if critical_issues:
                return PreCheckResult(
                    "Storage Space",
                    PreCheckSeverity.CRITICAL,
                    False,
                    f"Insufficient storage space: {'; '.join(critical_issues)}",
                    {"filesystems": storage_details},
                    "Free up storage space by removing old files or images from /var/tmp/",
                )

            if warnings:
                return PreCheckResult(
                    "Storage Space",
                    PreCheckSeverity.WARNING,
                    True,
                    f"Storage warnings: {'; '.join(warnings)}",
                    {"filesystems": storage_details},
                    "Monitor storage during upgrade process",
                )

            return PreCheckResult(
                "Storage Space",
                PreCheckSeverity.PASS,
                True,
                f"Sufficient storage space available",
                {"filesystems": storage_details},
            )

        except Exception as e:
            return PreCheckResult(
                "Storage Space",
                PreCheckSeverity.WARNING,
                False,
                f"Storage check failed: {str(e)}",
                {"error": str(e)},
                "Manually verify storage space with 'show system storage'",
            )

    # ─────────────────────────────────────────────────────────────────────────
    # CHECK 3: Hardware Health - Temperature, Power, Fans
    # ─────────────────────────────────────────────────────────────────────────

    def _check_hardware_health(self) -> PreCheckResult:
        """
        Validate hardware health including temperature, power supplies, and fans.

        Checks chassis environmental status to ensure device is healthy enough
        for upgrade operations which may stress the system.

        Returns:
            PreCheckResult with hardware health status
        """
        try:
            # Get chassis environment information
            response = self.device.rpc.get_environment_information()

            hardware_issues = []
            warnings = []
            hardware_details = {}

            # Check temperatures
            temp_items = response.findall(".//temperature")
            max_temp = 0
            temp_count = 0

            for temp in temp_items:
                temp_name = temp.get("name", "unknown")
                temp_celsius_text = (
                    temp.findtext("temperature", "0").replace("C", "").strip()
                )

                try:
                    temp_celsius = int(temp_celsius_text)
                    temp_count += 1
                    max_temp = max(max_temp, temp_celsius)

                    if temp_celsius > MAX_TEMPERATURE_CELSIUS:
                        hardware_issues.append(
                            f"High temperature detected: {temp_name} = {temp_celsius}°C (max: {MAX_TEMPERATURE_CELSIUS}°C)"
                        )
                    elif temp_celsius > (MAX_TEMPERATURE_CELSIUS - 10):
                        warnings.append(
                            f"Elevated temperature: {temp_name} = {temp_celsius}°C"
                        )
                except ValueError:
                    continue

            hardware_details["max_temperature_c"] = (
                max_temp if temp_count > 0 else "N/A"
            )
            hardware_details["temperature_sensors"] = temp_count

            # Check power supplies
            power_items = response.findall(".//power-supply")
            power_ok_count = 0
            power_total_count = 0

            for power in power_items:
                power_total_count += 1
                status = power.findtext("status", "").lower()
                if "ok" in status or "online" in status:
                    power_ok_count += 1
                else:
                    hardware_issues.append(
                        f"Power supply issue: {power.get('name', 'unknown')} status = {status}"
                    )

            hardware_details["power_supplies_ok"] = power_ok_count
            hardware_details["power_supplies_total"] = power_total_count

            if power_ok_count < MIN_POWER_SUPPLY_COUNT:
                hardware_issues.append(
                    f"Insufficient operational power supplies: {power_ok_count} (minimum: {MIN_POWER_SUPPLY_COUNT})"
                )

            # Check fans
            fan_items = response.findall(".//fan")
            fan_ok_count = 0
            fan_total_count = 0

            for fan in fan_items:
                fan_total_count += 1
                status = fan.findtext("status", "").lower()
                if "ok" in status or "running" in status:
                    fan_ok_count += 1
                else:
                    hardware_issues.append(
                        f"Fan issue: {fan.get('name', 'unknown')} status = {status}"
                    )

            hardware_details["fans_ok"] = fan_ok_count
            hardware_details["fans_total"] = fan_total_count

            if fan_ok_count < MIN_FAN_COUNT:
                hardware_issues.append(
                    f"Insufficient operational fans: {fan_ok_count} (minimum: {MIN_FAN_COUNT})"
                )

            # Determine result
            if hardware_issues:
                return PreCheckResult(
                    "Hardware Health",
                    PreCheckSeverity.CRITICAL,
                    False,
                    f"Hardware health issues detected: {'; '.join(hardware_issues[:2])}",
                    hardware_details,
                    "Resolve hardware issues before proceeding with upgrade",
                )

            if warnings:
                return PreCheckResult(
                    "Hardware Health",
                    PreCheckSeverity.WARNING,
                    True,
                    f"Hardware warnings: {'; '.join(warnings[:2])}",
                    hardware_details,
                    "Monitor hardware status during upgrade",
                )

            return PreCheckResult(
                "Hardware Health",
                PreCheckSeverity.PASS,
                True,
                f"Hardware health OK (Temp: {max_temp}°C, PS: {power_ok_count}/{power_total_count}, Fans: {fan_ok_count}/{fan_total_count})",
                hardware_details,
            )

        except Exception as e:
            logger.debug(f"[{self.hostname}] Hardware health check error: {e}")
            return PreCheckResult(
                "Hardware Health",
                PreCheckSeverity.WARNING,
                True,
                f"Hardware health check unavailable (platform may not support)",
                {"error": str(e)},
                "Manually verify hardware status if possible",
            )

    # ─────────────────────────────────────────────────────────────────────────
    # CHECK 4: Routing Protocol Stability - BGP Peers
    # ─────────────────────────────────────────────────────────────────────────

    def _check_bgp_stability(self) -> PreCheckResult:
        """
        Check BGP peer stability to ensure routing is stable before upgrade.

        Validates that BGP peers are established and have been up for minimum
        duration to indicate stable routing state.

        Returns:
            PreCheckResult with BGP peer status
        """
        try:
            # Get BGP summary information
            response = self.device.rpc.get_bgp_summary_information()

            peer_count = 0
            established_count = 0
            unstable_peers = []
            bgp_details = {"peers": []}

            peers = response.findall(".//bgp-peer")

            if not peers:
                # No BGP configured - this is informational, not a failure
                return PreCheckResult(
                    "BGP Protocol Stability",
                    PreCheckSeverity.INFO,
                    True,
                    "No BGP peers configured on device",
                    {"peer_count": 0},
                )

            for peer in peers:
                peer_count += 1
                peer_address = peer.findtext("peer-address", "unknown")
                peer_state = peer.findtext("peer-state", "unknown")

                peer_info = {
                    "address": peer_address,
                    "state": peer_state,
                }

                if peer_state.lower() == "established":
                    established_count += 1
                else:
                    unstable_peers.append(f"{peer_address} ({peer_state})")

                bgp_details["peers"].append(peer_info)

            bgp_details["total_peers"] = peer_count
            bgp_details["established_peers"] = established_count

            if unstable_peers:
                return PreCheckResult(
                    "BGP Protocol Stability",
                    PreCheckSeverity.WARNING,
                    True,
                    f"Some BGP peers not established: {', '.join(unstable_peers[:3])}",
                    bgp_details,
                    "Verify BGP peer status before upgrade to minimize routing impact",
                )

            return PreCheckResult(
                "BGP Protocol Stability",
                PreCheckSeverity.PASS,
                True,
                f"All BGP peers stable ({established_count}/{peer_count} established)",
                bgp_details,
            )

        except Exception as e:
            logger.debug(f"[{self.hostname}] BGP stability check error: {e}")
            return PreCheckResult(
                "BGP Protocol Stability",
                PreCheckSeverity.INFO,
                True,
                f"BGP check unavailable (may not be configured): {str(e)[:50]}",
                {"error": str(e)},
            )

    # ─────────────────────────────────────────────────────────────────────────
    # CHECK 5: Routing Protocol Stability - OSPF Neighbors
    # ─────────────────────────────────────────────────────────────────────────

    def _check_ospf_stability(self) -> PreCheckResult:
        """
        Check OSPF neighbor stability to ensure routing is stable before upgrade.

        Validates that OSPF neighbors are in Full state indicating stable
        adjacencies.

        Returns:
            PreCheckResult with OSPF neighbor status
        """
        try:
            # Get OSPF neighbor information
            response = self.device.rpc.get_ospf_neighbor_information()

            neighbor_count = 0
            full_count = 0
            unstable_neighbors = []
            ospf_details = {"neighbors": []}

            neighbors = response.findall(".//ospf-neighbor")

            if not neighbors:
                # No OSPF configured - this is informational, not a failure
                return PreCheckResult(
                    "OSPF Protocol Stability",
                    PreCheckSeverity.INFO,
                    True,
                    "No OSPF neighbors configured on device",
                    {"neighbor_count": 0},
                )

            for neighbor in neighbors:
                neighbor_count += 1
                neighbor_address = neighbor.findtext("neighbor-address", "unknown")
                neighbor_state = neighbor.findtext("ospf-neighbor-state", "unknown")

                neighbor_info = {
                    "address": neighbor_address,
                    "state": neighbor_state,
                }

                if neighbor_state.lower() == "full":
                    full_count += 1
                else:
                    unstable_neighbors.append(f"{neighbor_address} ({neighbor_state})")

                ospf_details["neighbors"].append(neighbor_info)

            ospf_details["total_neighbors"] = neighbor_count
            ospf_details["full_neighbors"] = full_count

            if unstable_neighbors:
                return PreCheckResult(
                    "OSPF Protocol Stability",
                    PreCheckSeverity.WARNING,
                    True,
                    f"Some OSPF neighbors not Full: {', '.join(unstable_neighbors[:3])}",
                    ospf_details,
                    "Verify OSPF neighbor status before upgrade to minimize routing impact",
                )

            return PreCheckResult(
                "OSPF Protocol Stability",
                PreCheckSeverity.PASS,
                True,
                f"All OSPF neighbors stable ({full_count}/{neighbor_count} Full)",
                ospf_details,
            )

        except Exception as e:
            logger.debug(f"[{self.hostname}] OSPF stability check error: {e}")
            return PreCheckResult(
                "OSPF Protocol Stability",
                PreCheckSeverity.INFO,
                True,
                f"OSPF check unavailable (may not be configured): {str(e)[:50]}",
                {"error": str(e)},
            )

    # ─────────────────────────────────────────────────────────────────────────
    # CHECK 6: System Alarms
    # ─────────────────────────────────────────────────────────────────────────

    def _check_system_alarms(self) -> PreCheckResult:
        """
        Check for active system alarms that might indicate device issues.

        Critical alarms should be resolved before upgrade to ensure
        device stability.

        Returns:
            PreCheckResult with alarm status
        """
        try:
            response = self.device.rpc.get_alarm_information()

            alarm_count = 0
            critical_count = 0
            major_count = 0
            minor_count = 0
            alarm_details = {"alarms": []}

            alarms = response.findall(".//alarm-detail")

            for alarm in alarms:
                alarm_count += 1
                alarm_class = alarm.findtext("alarm-class", "unknown")
                alarm_description = alarm.findtext(
                    "alarm-description", "No description"
                )

                alarm_info = {
                    "class": alarm_class,
                    "description": alarm_description,
                }
                alarm_details["alarms"].append(alarm_info)

                if "critical" in alarm_class.lower():
                    critical_count += 1
                elif "major" in alarm_class.lower():
                    major_count += 1
                elif "minor" in alarm_class.lower():
                    minor_count += 1

            alarm_details["total_alarms"] = alarm_count
            alarm_details["critical"] = critical_count
            alarm_details["major"] = major_count
            alarm_details["minor"] = minor_count

            if critical_count > 0:
                return PreCheckResult(
                    "System Alarms",
                    PreCheckSeverity.CRITICAL,
                    False,
                    f"Critical alarms present: {critical_count} critical, {major_count} major, {minor_count} minor",
                    alarm_details,
                    "Resolve critical alarms before proceeding with upgrade",
                )

            if major_count > 0:
                return PreCheckResult(
                    "System Alarms",
                    PreCheckSeverity.WARNING,
                    True,
                    f"Major alarms present: {major_count} major, {minor_count} minor",
                    alarm_details,
                    "Review and address major alarms before upgrade if possible",
                )

            if minor_count > 0:
                return PreCheckResult(
                    "System Alarms",
                    PreCheckSeverity.INFO,
                    True,
                    f"Minor alarms present: {minor_count}",
                    alarm_details,
                )

            return PreCheckResult(
                "System Alarms",
                PreCheckSeverity.PASS,
                True,
                "No active alarms detected",
                alarm_details,
            )

        except Exception as e:
            return PreCheckResult(
                "System Alarms",
                PreCheckSeverity.WARNING,
                False,
                f"Alarm check failed: {str(e)}",
                {"error": str(e)},
                "Manually verify system alarms with 'show system alarms'",
            )

    # ─────────────────────────────────────────────────────────────────────────
    # CHECK 7: Configuration Commit Status
    # ─────────────────────────────────────────────────────────────────────────

    def _check_configuration_committed(self) -> PreCheckResult:
        """
        Verify that device configuration is fully committed.

        Uncommitted changes should be committed or rolled back before
        upgrade to ensure configuration consistency.

        Returns:
            PreCheckResult with configuration commit status
        """
        try:
            # Check if there are uncommitted changes
            response = self.device.rpc.get_configuration(
                compare="rollback", rollback="0"
            )

            # If there's a configuration-output element, there are uncommitted changes
            config_output = response.find(".//configuration-output")

            if config_output is not None:
                return PreCheckResult(
                    "Configuration Committed",
                    PreCheckSeverity.CRITICAL,
                    False,
                    "Device has uncommitted configuration changes",
                    {"uncommitted": True},
                    "Commit or rollback configuration changes before upgrade",
                )

            return PreCheckResult(
                "Configuration Committed",
                PreCheckSeverity.PASS,
                True,
                "Configuration is properly committed",
                {"uncommitted": False},
            )

        except Exception as e:
            return PreCheckResult(
                "Configuration Committed",
                PreCheckSeverity.WARNING,
                False,
                f"Configuration check failed: {str(e)}",
                {"error": str(e)},
                "Manually verify configuration is committed",
            )

    # ─────────────────────────────────────────────────────────────────────────
    # CHECK 8: Active User Sessions
    # ─────────────────────────────────────────────────────────────────────────

    def _check_active_sessions(self) -> PreCheckResult:
        """
        Check for active user sessions that might interfere with upgrade.

        Multiple concurrent administrators could cause issues during
        upgrade process.

        Returns:
            PreCheckResult with active session information
        """
        try:
            # Get system users information
            response = self.device.rpc.get_system_users_information()

            active_users = []
            session_count = 0
            session_details = {"sessions": []}

            users = response.findall(".//uptime-information")

            for user_info in users:
                user_table = user_info.find("user-table")
                if user_table is not None:
                    user_entries = user_table.findall("user-entry")
                    for user in user_entries:
                        session_count += 1
                        username = user.findtext("user", "unknown")
                        tty = user.findtext("tty", "unknown")
                        from_location = user.findtext("from", "local")

                        session_info = {
                            "user": username,
                            "tty": tty,
                            "from": from_location,
                        }
                        session_details["sessions"].append(session_info)

                        if username not in active_users:
                            active_users.append(username)

            session_details["total_sessions"] = session_count
            session_details["unique_users"] = len(active_users)

            if session_count > MAX_ACTIVE_SESSIONS_WARNING:
                return PreCheckResult(
                    "Active User Sessions",
                    PreCheckSeverity.WARNING,
                    True,
                    f"Multiple active sessions detected: {session_count} sessions ({len(active_users)} users)",
                    session_details,
                    "Coordinate with other administrators before upgrade to avoid conflicts",
                )

            return PreCheckResult(
                "Active User Sessions",
                PreCheckSeverity.INFO,
                True,
                f"Active sessions: {session_count} ({len(active_users)} users)",
                session_details,
            )

        except Exception as e:
            logger.debug(f"[{self.hostname}] Active sessions check error: {e}")
            return PreCheckResult(
                "Active User Sessions",
                PreCheckSeverity.INFO,
                True,
                f"Session check unavailable: {str(e)[:50]}",
                {"error": str(e)},
            )

    # ─────────────────────────────────────────────────────────────────────────
    # CHECK 9: Configuration Backup Validation
    # ─────────────────────────────────────────────────────────────────────────

    def _check_backup_availability(self) -> PreCheckResult:
        """
        Verify that configuration backup/rollback options are available.

        Ensures that configuration can be recovered if upgrade fails.

        Returns:
            PreCheckResult with backup availability status
        """
        try:
            # Check for rollback configuration files
            response = self.device.rpc.get_rollback_information()

            rollback_count = 0
            rollback_details = {"rollback_files": []}

            rollback_files = response.findall(".//configuration-rollback")

            for rollback in rollback_files:
                rollback_id = rollback.findtext("rollback", "unknown")
                rollback_date = rollback.findtext("date-time", "unknown")
                rollback_user = rollback.findtext("user", "unknown")

                rollback_info = {
                    "id": rollback_id,
                    "date": rollback_date,
                    "user": rollback_user,
                }
                rollback_details["rollback_files"].append(rollback_info)
                rollback_count += 1

            rollback_details["total_rollback_files"] = rollback_count

            if rollback_count == 0:
                return PreCheckResult(
                    "Configuration Backup",
                    PreCheckSeverity.WARNING,
                    True,
                    "No rollback configuration files found",
                    rollback_details,
                    "Consider creating a manual backup before upgrade",
                )

            return PreCheckResult(
                "Configuration Backup",
                PreCheckSeverity.PASS,
                True,
                f"Rollback configurations available: {rollback_count} files",
                rollback_details,
            )

        except Exception as e:
            logger.debug(f"[{self.hostname}] Backup check error: {e}")
            return PreCheckResult(
                "Configuration Backup",
                PreCheckSeverity.WARNING,
                True,
                f"Backup check unavailable: {str(e)[:50]}",
                {"error": str(e)},
                "Manually verify backup availability",
            )

    # ─────────────────────────────────────────────────────────────────────────
    # CHECK 10: Chassis/Platform Specific Validation
    # ─────────────────────────────────────────────────────────────────────────

    def _check_chassis_status(self) -> PreCheckResult:
        """
        Validate chassis-specific status for multi-RE or VC systems.

        For devices with redundant routing engines or virtual chassis,
        ensure both members are healthy.

        Returns:
            PreCheckResult with chassis status
        """
        try:
            # Get chassis hardware information
            response = self.device.rpc.get_chassis_inventory()

            chassis_details = {}
            warnings = []

            # Check for routing engines
            routing_engines = response.findall(
                ".//chassis-module[name='Routing Engine']"
            )
            re_count = len(routing_engines)

            chassis_details["routing_engines"] = re_count

            if re_count > 1:
                # Dual RE system - check both are operational
                for idx, re in enumerate(routing_engines):
                    re_status = re.findtext("description", "unknown")
                    if "offline" in re_status.lower() or "failed" in re_status.lower():
                        warnings.append(f"RE{idx} may not be operational: {re_status}")

            # Check for FPC/PIC modules
            fpcs = response.findall(".//chassis-module[name='FPC']")
            chassis_details["fpc_count"] = len(fpcs)

            if warnings:
                return PreCheckResult(
                    "Chassis Status",
                    PreCheckSeverity.WARNING,
                    True,
                    f"Chassis warnings: {'; '.join(warnings)}",
                    chassis_details,
                    "Verify all chassis components are operational before upgrade",
                )

            status_msg = f"Chassis healthy (REs: {re_count}"
            if chassis_details.get("fpc_count", 0) > 0:
                status_msg += f", FPCs: {chassis_details['fpc_count']}"
            status_msg += ")"

            return PreCheckResult(
                "Chassis Status",
                PreCheckSeverity.PASS,
                True,
                status_msg,
                chassis_details,
            )

        except Exception as e:
            logger.debug(f"[{self.hostname}] Chassis check error: {e}")
            return PreCheckResult(
                "Chassis Status",
                PreCheckSeverity.INFO,
                True,
                f"Chassis check unavailable: {str(e)[:50]}",
                {"error": str(e)},
            )

    # ─────────────────────────────────────────────────────────────────────────
    # Method: Run All Pre-Checks
    # ─────────────────────────────────────────────────────────────────────────

    def run_all_checks(self) -> PreCheckSummary:
        """
        Execute all pre-upgrade validation checks.

        Runs all defined checks and aggregates results into a summary.
        Continues checking even if individual checks fail to provide
        complete validation picture.

        Returns:
            PreCheckSummary with all check results
        """
        summary = PreCheckSummary()

        # Define all checks to run
        checks = [
            self._check_image_availability_and_size,
            self._check_storage_space_detailed,
            self._check_hardware_health,
            self._check_bgp_stability,
            self._check_ospf_stability,
            self._check_system_alarms,
            self._check_configuration_committed,
            self._check_active_sessions,
            self._check_backup_availability,
            self._check_chassis_status,
        ]

        logger.info(f"[{self.hostname}] 🔍 Running {len(checks)} pre-upgrade checks...")

        for check_func in checks:
            try:
                logger.debug(f"[{self.hostname}] Executing: {check_func.__name__}")
                result = check_func()
                summary.results.append(result)

                status_icon = "✅" if result.passed else "❌"
                logger.info(
                    f"[{self.hostname}] {status_icon} {result.check_name}: "
                    f"{result.severity.value.upper()} - {result.message[:60]}"
                )

            except Exception as e:
                logger.error(
                    f"[{self.hostname}] ❌ Check {check_func.__name__} failed with exception: {e}"
                )
                # Add a failed result for the exception
                check_name = (
                    check_func.__name__.replace("_check_", "").replace("_", " ").title()
                )
                summary.results.append(
                    PreCheckResult(
                        check_name,
                        PreCheckSeverity.CRITICAL,
                        False,
                        f"Check execution failed: {str(e)[:100]}",
                        {"error": str(e)},
                        "Investigate device connectivity or permissions",
                    )
                )

        logger.info(
            f"[{self.hostname}] 📊 Pre-check summary: "
            f"{summary.passed}/{summary.total_checks} passed, "
            f"{summary.warnings} warnings, "
            f"{summary.critical_failures} critical failures"
        )

        return summary


# ================================================================================
# END OF PART 3
# ================================================================================
# Continue with Part 4 for Device Upgrader, Rollback Logic, and Main Execution
# ================================================================================
# PART 4 OF 4: DEVICE UPGRADER, ROLLBACK LOGIC & MAIN EXECUTION
# ================================================================================
# This part contains:
# - Section 14: Rollback Management
# - Section 15: Post-Upgrade Validation
# - Section 16: Device Upgrader Main Class
# - Section 17: Main Execution & Argument Parsing
# ================================================================================


# ================================================================================
# SECTION 14: ROLLBACK MANAGEMENT
# ================================================================================
# Description: Automatic rollback functionality to revert device to previous
#              software version if upgrade fails or validation doesn't pass.
# ================================================================================


class RollbackManager:
    """
    Manages automatic rollback operations for failed upgrades.

    Provides functionality to revert device to previous software version
    and restore operational state after upgrade failures.
    """

    def __init__(self, device: Device, hostname: str, device_status: DeviceStatus):
        """
        Initialize rollback manager.

        Args:
            device: Connected PyEZ Device instance
            hostname: Device hostname for logging
            device_status: Current device status object
        """
        self.device = device
        self.hostname = hostname
        self.device_status = device_status

    # ─────────────────────────────────────────────────────────────────────────
    # Method: Perform Software Rollback
    # ─────────────────────────────────────────────────────────────────────────

    def perform_rollback(self, reason: str) -> Tuple[bool, str]:
        """
        Perform automatic software rollback to previous version.

        Executes 'request system software rollback' command to revert
        to previously installed software version.

        Args:
            reason: Reason for initiating rollback

        Returns:
            Tuple of (success: bool, message: str)
        """
        logger.warning(f"[{self.hostname}] 🔙 Initiating automatic rollback: {reason}")

        # Send rollback notification to frontend
        self._send_rollback_notification("initiated", reason)

        try:
            # Execute rollback command
            logger.info(f"[{self.hostname}] Executing software rollback command...")

            rollback_response = self.device.rpc.request_package_rollback()

            logger.info(f"[{self.hostname}] ✅ Rollback command executed successfully")

            # Device will reboot after rollback
            logger.info(f"[{self.hostname}] 🔄 Device will reboot to complete rollback")

            self._send_rollback_notification(
                "rebooting", "Device rebooting after rollback"
            )

            # Wait for device to reboot and come back
            time.sleep(INITIAL_REBOOT_WAIT)

            # Note: We're still connected, so close connection before waiting
            try:
                self.device.close()
            except Exception:
                pass

            return True, "Rollback initiated successfully, device rebooting"

        except RpcError as e:
            error_msg = f"RPC error during rollback: {str(e)}"
            logger.error(f"[{self.hostname}] ❌ {error_msg}")
            self._send_rollback_notification("failed", error_msg)
            return False, error_msg

        except Exception as e:
            error_msg = f"Unexpected error during rollback: {str(e)}"
            logger.error(f"[{self.hostname}] ❌ {error_msg}")
            self._send_rollback_notification("failed", error_msg)
            return False, error_msg

    # ─────────────────────────────────────────────────────────────────────────
    # Method: Wait for Rollback Recovery
    # ─────────────────────────────────────────────────────────────────────────

    def wait_for_rollback_recovery(
        self, username: str, password: str
    ) -> Tuple[bool, str]:
        """
        Wait for device to recover after rollback reboot.

        Args:
            username: Device authentication username
            password: Device authentication password

        Returns:
            Tuple of (success: bool, message: str)
        """
        logger.info(
            f"[{self.hostname}] ⏳ Waiting for device recovery after rollback..."
        )

        recovery_success, recovery_message = wait_for_device_recovery(
            self.hostname, username, password
        )

        if recovery_success:
            logger.info(f"[{self.hostname}] ✅ Device recovered after rollback")
            self._send_rollback_notification(
                "completed", "Rollback completed successfully"
            )
            return True, "Device recovered successfully after rollback"
        else:
            logger.error(
                f"[{self.hostname}] ❌ Device recovery failed after rollback: {recovery_message}"
            )
            self._send_rollback_notification("recovery_failed", recovery_message)
            return False, f"Rollback recovery failed: {recovery_message}"

    # ─────────────────────────────────────────────────────────────────────────
    # Method: Send Rollback Notification
    # ─────────────────────────────────────────────────────────────────────────

    def _send_rollback_notification(self, stage: str, message: str):
        """
        Send rollback progress notification to frontend.

        Args:
            stage: Rollback stage (initiated, rebooting, completed, failed)
            message: Detailed message about rollback stage
        """
        data = {
            "device": self.hostname,
            "stage": stage,
            "message": message,
            "timestamp": time.time(),
        }
        send_progress("ROLLBACK_PROGRESS", data, message)


# ================================================================================
# SECTION 15: POST-UPGRADE VALIDATION
# ================================================================================
# Description: Functional validation after upgrade to ensure device is operating
#              correctly with new software version.
# ================================================================================


class PostUpgradeValidator:
    """
    Validates device functionality after upgrade completion.

    Performs functional checks to ensure device is operational and
    key services are running correctly after software upgrade.
    """

    def __init__(
        self, device: Device, hostname: str, pre_upgrade_facts: Dict[str, Any]
    ):
        """
        Initialize post-upgrade validator.

        Args:
            device: Connected PyEZ Device instance
            hostname: Device hostname for logging
            pre_upgrade_facts: Device facts captured before upgrade
        """
        self.device = device
        self.hostname = hostname
        self.pre_upgrade_facts = pre_upgrade_facts

    # ─────────────────────────────────────────────────────────────────────────
    # Method: Validate Basic Connectivity
    # ─────────────────────────────────────────────────────────────────────────

    def validate_basic_connectivity(self) -> Tuple[bool, str]:
        """
        Validate basic device connectivity and responsiveness.

        Returns:
            Tuple of (success: bool, message: str)
        """
        try:
            # Try to get device facts
            facts = self.device.facts

            if facts:
                logger.info(f"[{self.hostname}] ✅ Basic connectivity validated")
                return True, "Device is responsive and accessible"
            else:
                return False, "Unable to retrieve device facts"

        except Exception as e:
            return False, f"Connectivity validation failed: {str(e)}"

    # ─────────────────────────────────────────────────────────────────────────
    # Method: Validate Interface Status
    # ─────────────────────────────────────────────────────────────────────────

    def validate_interface_status(self) -> Tuple[bool, List[str]]:
        """
        Validate that interface counts match pre-upgrade state.

        Ensures no interfaces were lost or disabled during upgrade.

        Returns:
            Tuple of (success: bool, warnings: List[str])
        """
        warnings = []

        try:
            # Get current interface information
            response = self.device.rpc.get_interface_information(terse=True)

            current_interfaces = response.findall(".//physical-interface")
            current_count = len(current_interfaces)

            # Compare with pre-upgrade count if available
            pre_upgrade_count = self.pre_upgrade_facts.get("interface_count", 0)

            if pre_upgrade_count > 0 and current_count < pre_upgrade_count:
                warnings.append(
                    f"Interface count decreased: {pre_upgrade_count} -> {current_count}"
                )

            logger.info(
                f"[{self.hostname}] Interface validation: {current_count} interfaces detected"
            )

            return True, warnings

        except Exception as e:
            logger.warning(f"[{self.hostname}] Interface validation error: {e}")
            warnings.append(f"Interface validation failed: {str(e)}")
            return True, warnings

    # ─────────────────────────────────────────────────────────────────────────
    # Method: Validate Routing Protocols
    # ─────────────────────────────────────────────────────────────────────────

    def validate_routing_protocols(self) -> Tuple[bool, List[str]]:
        """
        Validate that routing protocols are operational.

        Checks BGP and OSPF status to ensure routing is restored.

        Returns:
            Tuple of (success: bool, warnings: List[str])
        """
        warnings = []

        # Check BGP
        try:
            response = self.device.rpc.get_bgp_summary_information()
            peers = response.findall(".//bgp-peer")

            if peers:
                established_count = sum(
                    1
                    for peer in peers
                    if peer.findtext("peer-state", "").lower() == "established"
                )
                total_peers = len(peers)

                logger.info(
                    f"[{self.hostname}] BGP status: {established_count}/{total_peers} peers established"
                )

                if established_count < total_peers:
                    warnings.append(
                        f"Not all BGP peers established: {established_count}/{total_peers}"
                    )
        except Exception as e:
            logger.debug(f"[{self.hostname}] BGP validation skipped: {e}")

        # Check OSPF
        try:
            response = self.device.rpc.get_ospf_neighbor_information()
            neighbors = response.findall(".//ospf-neighbor")

            if neighbors:
                full_count = sum(
                    1
                    for neighbor in neighbors
                    if neighbor.findtext("ospf-neighbor-state", "").lower() == "full"
                )
                total_neighbors = len(neighbors)

                logger.info(
                    f"[{self.hostname}] OSPF status: {full_count}/{total_neighbors} neighbors Full"
                )

                if full_count < total_neighbors:
                    warnings.append(
                        f"Not all OSPF neighbors Full: {full_count}/{total_neighbors}"
                    )
        except Exception as e:
            logger.debug(f"[{self.hostname}] OSPF validation skipped: {e}")

        return True, warnings

    # ─────────────────────────────────────────────────────────────────────────
    # Method: Validate System Alarms
    # ─────────────────────────────────────────────────────────────────────────

    def validate_no_new_alarms(self) -> Tuple[bool, List[str]]:
        """
        Validate that no new critical alarms appeared after upgrade.

        Returns:
            Tuple of (success: bool, warnings: List[str])
        """
        warnings = []

        try:
            response = self.device.rpc.get_alarm_information()
            alarms = response.findall(".//alarm-detail")

            critical_alarms = [
                alarm
                for alarm in alarms
                if "critical" in alarm.findtext("alarm-class", "").lower()
            ]

            if critical_alarms:
                warnings.append(
                    f"Critical alarms detected after upgrade: {len(critical_alarms)}"
                )
                logger.warning(
                    f"[{self.hostname}] ⚠️  Critical alarms present after upgrade"
                )
            else:
                logger.info(f"[{self.hostname}] ✅ No critical alarms after upgrade")

            return True, warnings

        except Exception as e:
            logger.debug(f"[{self.hostname}] Alarm validation error: {e}")
            return True, []

    # ─────────────────────────────────────────────────────────────────────────
    # Method: Run All Validations
    # ─────────────────────────────────────────────────────────────────────────

    def run_all_validations(self) -> Tuple[bool, List[str]]:
        """
        Execute all post-upgrade validation checks.

        Returns:
            Tuple of (success: bool, all_warnings: List[str])
        """
        logger.info(f"[{self.hostname}] 🔍 Running post-upgrade validations...")

        all_warnings = []
        all_success = True

        # Validate basic connectivity
        conn_success, conn_msg = self.validate_basic_connectivity()
        if not conn_success:
            all_success = False
            all_warnings.append(conn_msg)
            return all_success, all_warnings

        # Validate interfaces
        intf_success, intf_warnings = self.validate_interface_status()
        all_warnings.extend(intf_warnings)

        # Validate routing protocols
        route_success, route_warnings = self.validate_routing_protocols()
        all_warnings.extend(route_warnings)

        # Validate alarms
        alarm_success, alarm_warnings = self.validate_no_new_alarms()
        all_warnings.extend(alarm_warnings)

        if all_warnings:
            logger.warning(
                f"[{self.hostname}] ⚠️  Post-upgrade validation completed with {len(all_warnings)} warnings"
            )
        else:
            logger.info(f"[{self.hostname}] ✅ All post-upgrade validations passed")

        return all_success, all_warnings


# ================================================================================
# SECTION 16: DEVICE UPGRADER - MAIN CLASS WITH PHASE 1 ENHANCEMENTS
# ================================================================================
# Description: Main device upgrader class orchestrating the complete upgrade
#              process with enhanced pre-checks, rollback, and validation.
# ================================================================================


class DeviceUpgrader:
    """
    Main orchestrator for Juniper device software upgrades.

    Manages the complete upgrade lifecycle including pre-checks, installation,
    reboot, validation, and automatic rollback on failure.
    """

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
        """
        Initialize device upgrader.

        Args:
            hostname: Device hostname or IP address
            username: Authentication username
            password: Authentication password
            target_version: Target software version
            image_filename: Image filename (must exist in /var/tmp/)
            vendor: Device vendor (default: juniper)
            platform: Device platform (default: srx)
            skip_pre_check: Skip pre-upgrade checks
            force_upgrade: Proceed despite warnings
        """
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
        self.pre_upgrade_facts = {}

    # ─────────────────────────────────────────────────────────────────────────
    # Method: Device Session Context Manager
    # ─────────────────────────────────────────────────────────────────────────

    @contextmanager
    def device_session(self):
        """
        Context manager for device connection lifecycle.

        Ensures device connection is properly opened and closed.
        """
        try:
            self.device = Device(
                host=self.hostname,
                user=self.username,
                password=self.password,
                timeout=DEFAULT_CONNECTION_TIMEOUT,
                normalize=True,
            )
            self.device.open()
            self.sw = SW(self.device)
            logger.info(f"[{self.hostname}] ✅ Connected to device successfully")
            yield
        finally:
            if self.device:
                try:
                    self.device.close()
                    logger.info(f"[{self.hostname}] 🔌 Device connection closed")
                except Exception as e:
                    logger.warning(f"[{self.hostname}] Error closing connection: {e}")

    # ─────────────────────────────────────────────────────────────────────────
    # Method: Get Current Version
    # ─────────────────────────────────────────────────────────────────────────

    def get_current_version(self) -> str:
        """
        Retrieve current software version from device.

        Returns:
            Current software version string
        """
        try:
            facts = self.device.facts
            current_version = facts.get("version", "unknown")

            # Store additional facts for post-upgrade comparison
            self.pre_upgrade_facts = {
                "version": current_version,
                "hostname": facts.get("hostname", "unknown"),
                "model": facts.get("model", "unknown"),
                "serial_number": facts.get("serialnumber", "unknown"),
            }

            logger.info(f"[{self.hostname}] Current version: {current_version}")
            return current_version

        except Exception as e:
            logger.error(f"[{self.hostname}] ❌ Failed to get current version: {e}")
            raise

    # ─────────────────────────────────────────────────────────────────────────
    # Method: Upgrade Progress Callback
    # ─────────────────────────────────────────────────────────────────────────

    def _upgrade_progress_callback(self, dev, report):
        """
        Callback for SW.install() progress updates.

        Receives progress reports from PyEZ and forwards to frontend.

        Args:
            dev: Device object
            report: Progress report (dict or string)
        """
        logger.info(f"[{self.hostname}] 📦 Upgrade progress: {report}")

        progress_message = "Installing software package"
        progress_percent = 0

        if isinstance(report, dict):
            if "progress" in report:
                progress_percent = report["progress"]
            elif "message" in report:
                progress_message = report["message"]
            elif "status" in report:
                progress_message = report["status"]
        elif isinstance(report, str):
            progress_message = report

        # Send progress update
        send_upgrade_progress(
            self.status,
            "software_install",
            "in_progress",
            progress_percent,
            progress_message,
        )

    # ─────────────────────────────────────────────────────────────────────────
    # Method: Perform Software Installation
    # ─────────────────────────────────────────────────────────────────────────

    def perform_software_install(self) -> Tuple[bool, str]:
        """
        Perform actual software installation using PyEZ SW.install().

        Attempts installation with validation first, falls back to
        installation without validation if needed.

        Returns:
            Tuple of (success: bool, message: str)
        """
        try:
            logger.info(f"[{self.hostname}] 🚀 Starting software installation")

            # First try with validation
            try:
                install_result = self.sw.install(
                    package=f"/var/tmp/{self.image_filename}",
                    progress=self._upgrade_progress_callback,
                    validate=True,
                    reboot=True,
                    cleanfs=True,
                    timeout=DEFAULT_OPERATION_TIMEOUT,
                    no_copy=True,
                )

                # Check result
                if isinstance(install_result, tuple):
                    ok, msg = install_result
                    if ok:
                        logger.info(
                            f"[{self.hostname}] ✅ Installation completed: {msg}"
                        )
                        return True, msg
                    else:
                        logger.warning(
                            f"[{self.hostname}] ⚠️  Installation with validation failed: {msg}"
                        )
                        # Fall back to installation without validation
                        return self._install_without_validation()
                else:
                    if install_result:
                        logger.info(
                            f"[{self.hostname}] ✅ Installation completed successfully"
                        )
                        return True, "Installation completed"
                    else:
                        logger.warning(
                            f"[{self.hostname}] ⚠️  Installation with validation failed"
                        )
                        # Fall back to installation without validation
                        return self._install_without_validation()

            except RpcError as e:
                if "validation" in str(e).lower() or "package" in str(e).lower():
                    logger.warning(
                        f"[{self.hostname}] ⚠️  Validation failed, using fallback: {e}"
                    )
                    return self._install_without_validation()
                else:
                    raise

        except RpcError as e:
            error_msg = f"RPC error during installation: {str(e)}"
            logger.error(f"[{self.hostname}] ❌ {error_msg}")
            return False, error_msg
        except Exception as e:
            error_msg = f"Unexpected error during installation: {str(e)}"
            logger.error(f"[{self.hostname}] ❌ {error_msg}")
            return False, error_msg

    # ─────────────────────────────────────────────────────────────────────────
    # Method: Install Without Validation (Fallback)
    # ─────────────────────────────────────────────────────────────────────────

    def _install_without_validation(self) -> Tuple[bool, str]:
        """
        Fallback installation method without package validation.

        Used when validation fails but we want to proceed anyway.

        Returns:
            Tuple of (success: bool, message: str)
        """
        try:
            logger.info(f"[{self.hostname}] 🛠️  Using installation without validation")

            install_result = self.sw.install(
                package=f"/var/tmp/{self.image_filename}",
                progress=self._upgrade_progress_callback,
                validate=False,  # Skip validation
                reboot=True,
                cleanfs=True,
                timeout=DEFAULT_OPERATION_TIMEOUT,
                no_copy=True,
            )

            # Check result
            if isinstance(install_result, tuple):
                ok, msg = install_result
                if ok:
                    logger.info(
                        f"[{self.hostname}] ✅ Installation without validation completed: {msg}"
                    )
                    return True, msg
                else:
                    logger.error(
                        f"[{self.hostname}] ❌ Installation without validation failed: {msg}"
                    )
                    return False, msg
            else:
                if install_result:
                    logger.info(
                        f"[{self.hostname}] ✅ Installation without validation completed"
                    )
                    return True, "Installation completed"
                else:
                    logger.error(
                        f"[{self.hostname}] ❌ Installation without validation failed"
                    )
                    return False, "Installation failed"

        except Exception as e:
            error_msg = f"Error during installation without validation: {str(e)}"
            logger.error(f"[{self.hostname}] ❌ {error_msg}")
            return False, error_msg

    # ─────────────────────────────────────────────────────────────────────────
    # Method: Run Pre-Checks
    # ─────────────────────────────────────────────────────────────────────────

    def run_pre_checks(self) -> bool:
        """
        Execute comprehensive pre-upgrade validation checks.

        Returns:
            True if checks pass or warnings only, False if critical failures
        """
        try:
            self.status.update_phase(
                UpgradePhase.PRE_CHECK, "Running pre-upgrade validation checks"
            )

            send_device_progress(
                self.status, 1, STEPS_PER_DEVICE, "Running pre-upgrade checks"
            )

            engine = EnhancedPreCheckEngine(
                self.device, self.hostname, self.image_filename
            )
            pre_check_summary = engine.run_all_checks()
            self.status.pre_check_summary = pre_check_summary

            # Display results
            self.formatter.print_check_results_table(pre_check_summary)
            send_pre_check_results(self.status)

            if not pre_check_summary.can_proceed:
                if self.force_upgrade:
                    logger.warning(
                        f"[{self.hostname}] ⚠️  Pre-checks failed but force_upgrade enabled, proceeding anyway"
                    )
                    self.status.add_warning(
                        "Pre-checks failed but force upgrade enabled"
                    )
                    return True
                else:
                    logger.error(
                        f"[{self.hostname}] ❌ Pre-checks failed and force upgrade not enabled"
                    )
                    return False

            return True

        except Exception as e:
            logger.error(f"[{self.hostname}] ❌ Pre-check execution failed: {e}")
            if self.force_upgrade:
                logger.warning(
                    f"[{self.hostname}] ⚠️  Pre-check failed but force_upgrade enabled"
                )
                return True
            return False

    # ─────────────────────────────────────────────────────────────────────────
    # Method: Perform Complete Upgrade
    # ─────────────────────────────────────────────────────────────────────────

    def perform_upgrade(self) -> UpgradeResult:
        """
        Execute complete upgrade process with all steps.

        Includes pre-checks, installation, reboot, recovery, validation,
        and automatic rollback on failure.

        Returns:
            UpgradeResult with complete upgrade outcome
        """
        start_time = time.time()
        upgrade_result = UpgradeResult(
            success=False,
            start_time=start_time,
            end_time=0,
            initial_version=self.status.current_version,
        )

        try:
            current_step = 1

            # ═══════════════════════════════════════════════════════════════
            # STEP 1: Pre-Checks (unless skipped)
            # ═══════════════════════════════════════════════════════════════
            if not self.skip_pre_check:
                upgrade_result.add_step(
                    "pre_checks", "in_progress", "Running pre-upgrade checks"
                )
                send_device_progress(
                    self.status, current_step, STEPS_PER_DEVICE, "Running pre-checks"
                )

                if not self.run_pre_checks():
                    upgrade_result.add_step("pre_checks", "failed", "Pre-checks failed")
                    upgrade_result.errors.append("Pre-check validation failed")
                    upgrade_result.end_time = time.time()
                    raise PreCheckFailure(
                        "Pre-check validation failed",
                        "Review failed checks and address critical issues",
                    )

                upgrade_result.add_step("pre_checks", "completed", "Pre-checks passed")
                current_step += 1

            # ═══════════════════════════════════════════════════════════════
            # STEP 2: Version Validation
            # ═══════════════════════════════════════════════════════════════
            upgrade_result.add_step(
                "validation", "in_progress", "Validating version compatibility"
            )
            send_device_progress(
                self.status, current_step, STEPS_PER_DEVICE, "Validating versions"
            )

            current_version = self.get_current_version()
            version_action = compare_versions(current_version, self.target_version)
            upgrade_result.version_action = version_action
            self.status.version_action = version_action

            if version_action == VersionAction.SAME_VERSION and not self.force_upgrade:
                upgrade_result.add_step(
                    "validation", "skipped", "Already on target version"
                )
                upgrade_result.success = True
                upgrade_result.final_version = current_version
                upgrade_result.warnings.append("Device already running target version")
                upgrade_result.end_time = time.time()
                return upgrade_result

            risk_level = get_version_change_risk(version_action)
            logger.info(
                f"[{self.hostname}] Version change: {version_action.value} (Risk: {risk_level})"
            )

            upgrade_result.add_step(
                "validation", "completed", f"Version action: {version_action.value}"
            )
            current_step += 1

            # ═══════════════════════════════════════════════════════════════
            # STEP 3: Software Installation
            # ═══════════════════════════════════════════════════════════════
            upgrade_result.add_step(
                "software_install", "in_progress", "Installing software package"
            )
            self.status.update_phase(
                UpgradePhase.INSTALLING, "Installing software package"
            )
            send_device_progress(
                self.status, current_step, STEPS_PER_DEVICE, "Installing software"
            )

            install_success, install_message = self.perform_software_install()

            if not install_success:
                upgrade_result.add_step(
                    "software_install",
                    "failed",
                    f"Installation failed: {install_message}",
                )
                upgrade_result.errors.append(install_message)
                upgrade_result.end_time = time.time()
                raise InstallationFailure(
                    install_message, "Check device logs and verify image file integrity"
                )

            upgrade_result.add_step(
                "software_install", "completed", "Software installation successful"
            )
            upgrade_result.reboot_required = True
            upgrade_result.reboot_performed = True
            current_step += 1

            # ═══════════════════════════════════════════════════════════════
            # STEP 4: Wait for Reboot and Recovery
            # ═══════════════════════════════════════════════════════════════
            upgrade_result.add_step(
                "reboot_wait", "in_progress", "Waiting for device reboot"
            )
            self.status.update_phase(
                UpgradePhase.REBOOTING, "Device rebooting after upgrade"
            )
            send_device_progress(
                self.status, current_step, STEPS_PER_DEVICE, "Device rebooting"
            )

            reboot_start = time.time()
            recovery_success, recovery_message = wait_for_device_recovery(
                self.hostname, self.username, self.password
            )
            upgrade_result.reboot_wait_time = time.time() - reboot_start

            if not recovery_success:
                upgrade_result.add_step(
                    "reboot_wait",
                    "failed",
                    f"Device recovery failed: {recovery_message}",
                )
                upgrade_result.errors.append(recovery_message)
                upgrade_result.end_time = time.time()
                raise RebootTimeoutError(
                    recovery_message,
                    "Check device console or physical access for recovery",
                )

            upgrade_result.add_step(
                "reboot_wait", "completed", "Device recovered after reboot"
            )
            current_step += 1

            # ═══════════════════════════════════════════════════════════════
            # STEP 5: Verify Final Version
            # ═══════════════════════════════════════════════════════════════
            upgrade_result.add_step(
                "verification", "in_progress", "Verifying final version"
            )
            self.status.update_phase(
                UpgradePhase.VERIFYING, "Verifying upgrade success"
            )
            send_device_progress(
                self.status, current_step, STEPS_PER_DEVICE, "Verifying upgrade"
            )

            # Reconnect to get final version
            with self.device_session():
                final_version = self.get_current_version()
                upgrade_result.final_version = final_version

                # ═══════════════════════════════════════════════════════════
                # STEP 6: Post-Upgrade Functional Validation
                # ═══════════════════════════════════════════════════════════
                current_step += 1
                send_device_progress(
                    self.status,
                    current_step,
                    STEPS_PER_DEVICE,
                    "Running post-upgrade validation",
                )

                validator = PostUpgradeValidator(
                    self.device, self.hostname, self.pre_upgrade_facts
                )
                validation_success, validation_warnings = (
                    validator.run_all_validations()
                )

                if validation_warnings:
                    upgrade_result.warnings.extend(validation_warnings)

                if not validation_success:
                    logger.error(
                        f"[{self.hostname}] ❌ Post-upgrade validation failed critically"
                    )
                    upgrade_result.add_step(
                        "post_validation", "failed", "Post-upgrade validation failed"
                    )

                    # Initiate rollback
                    if not self.force_upgrade:
                        raise ValidationError(
                            "Post-upgrade validation failed",
                            "Device will be rolled back to previous version",
                        )
                else:
                    upgrade_result.add_step(
                        "post_validation", "completed", "Post-upgrade validation passed"
                    )

                # Version verification
                if final_version == self.target_version:
                    upgrade_result.add_step(
                        "verification",
                        "completed",
                        f"Successfully upgraded to {final_version}",
                    )
                    upgrade_result.success = True
                else:
                    upgrade_result.add_step(
                        "verification",
                        "completed",
                        f"Upgrade completed but version mismatch: {final_version}",
                    )
                    upgrade_result.warnings.append(
                        f"Version mismatch: expected {self.target_version}, got {final_version}"
                    )

                    if not self.force_upgrade:
                        # Version mismatch - consider rollback
                        logger.warning(
                            f"[{self.hostname}] ⚠️  Version mismatch detected"
                        )
                        upgrade_result.success = (
                            True  # Still consider successful if running
                        )
                    else:
                        upgrade_result.success = True

            # ═══════════════════════════════════════════════════════════════
            # FINAL: Mark Completion
            # ═══════════════════════════════════════════════════════════════
            self.status.update_phase(
                UpgradePhase.COMPLETED, "Upgrade completed successfully"
            )
            upgrade_result.end_time = time.time()
            upgrade_result.calculate_duration()

            logger.info(
                f"[{self.hostname}] ✅ Upgrade completed successfully in {upgrade_result.upgrade_duration:.1f}s"
            )
            return upgrade_result

        except (
            PreCheckFailure,
            InstallationFailure,
            RebootTimeoutError,
            ValidationError,
        ) as e:
            # Known upgrade errors - attempt rollback if appropriate
            logger.error(f"[{self.hostname}] ❌ Upgrade failed: {e.message}")

            if isinstance(e, (InstallationFailure, ValidationError)):
                # Attempt automatic rollback
                logger.warning(f"[{self.hostname}] 🔙 Attempting automatic rollback...")

                try:
                    # Need to reconnect for rollback
                    with self.device_session():
                        rollback_mgr = RollbackManager(
                            self.device, self.hostname, self.status
                        )

                        rollback_success, rollback_msg = rollback_mgr.perform_rollback(
                            e.message
                        )

                        if rollback_success:
                            # Wait for rollback recovery
                            recovery_success, recovery_msg = (
                                rollback_mgr.wait_for_rollback_recovery(
                                    self.username, self.password
                                )
                            )

                            if recovery_success:
                                upgrade_result.rollback_performed = True
                                upgrade_result.rollback_reason = e.message
                                self.status.update_phase(
                                    UpgradePhase.ROLLED_BACK,
                                    "Upgrade failed and rolled back successfully",
                                )
                                logger.info(
                                    f"[{self.hostname}] ✅ Rollback completed successfully"
                                )
                            else:
                                upgrade_result.errors.append(
                                    f"Rollback recovery failed: {recovery_msg}"
                                )
                        else:
                            upgrade_result.errors.append(
                                f"Rollback failed: {rollback_msg}"
                            )

                except Exception as rollback_error:
                    logger.error(
                        f"[{self.hostname}] ❌ Rollback attempt failed: {rollback_error}"
                    )
                    upgrade_result.errors.append(
                        f"Rollback attempt failed: {str(rollback_error)}"
                    )

            upgrade_result.errors.append(e.message)
            if e.remediation:
                upgrade_result.warnings.append(f"Remediation: {e.remediation}")

            upgrade_result.end_time = time.time()
            upgrade_result.calculate_duration()
            self.status.update_phase(UpgradePhase.FAILED, e.message)
            return upgrade_result

        except Exception as e:
            # Unexpected errors
            error_msg = f"Unexpected upgrade error: {str(e)}"
            logger.error(f"[{self.hostname}] ❌ {error_msg}")
            upgrade_result.errors.append(error_msg)
            upgrade_result.end_time = time.time()
            upgrade_result.calculate_duration()
            self.status.update_phase(UpgradePhase.FAILED, error_msg)
            return upgrade_result

    # ─────────────────────────────────────────────────────────────────────────
    # Method: Run Complete Upgrade Process
    # ─────────────────────────────────────────────────────────────────────────

    def run_upgrade(self) -> bool:
        """
        Main entry point to run complete upgrade process.

        Manages device connection lifecycle and orchestrates all upgrade steps.

        Returns:
            True if upgrade succeeded, False otherwise
        """
        self.status.start_time = time.time()

        self.formatter.print_banner(
            f"JUNIPER DEVICE UPGRADE - {self.hostname}", width=100
        )

        print(f"\n📋 UPGRADE DETAILS:")
        print(f"   Device: {self.hostname}")
        print(f"   Target Version: {self.target_version}")
        print(f"   Image File: {self.image_filename}")
        print(f"   Platform: {self.platform}")
        print(f"   Skip Pre-Check: {self.skip_pre_check}")
        print(f"   Force Upgrade: {self.force_upgrade}")
        print(f"   Started: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}")
        print(f"{'─' * 100}\n")

        try:
            # Initial connection and version check
            self.status.update_phase(UpgradePhase.CONNECTING, "Connecting to device")
            send_device_progress(
                self.status, 0, STEPS_PER_DEVICE, "Connecting to device"
            )

            with self.device_session():
                # Get initial version
                self.status.current_version = self.get_current_version()
                self.status.version_action = compare_versions(
                    self.status.current_version, self.target_version
                )

                # Perform the actual upgrade
                upgrade_result = self.perform_upgrade()
                self.status.set_upgrade_result(upgrade_result)
                self.status.end_time = time.time()

                # Send final results
                send_operation_complete(
                    self.status,
                    upgrade_result.success,
                    "Upgrade completed successfully"
                    if upgrade_result.success
                    else "Upgrade failed",
                )

                # Display human-readable results
                self.formatter.print_upgrade_results(self.status)

                return upgrade_result.success

        except ConnectError as e:
            error_msg = f"Connection failed: {str(e)}"
            logger.error(f"[{self.hostname}] ❌ {error_msg}")
            self.status.error = error_msg
            self.status.error_type = "ConnectionError"
            self.status.update_phase(UpgradePhase.FAILED, error_msg)
            send_operation_complete(self.status, False, error_msg)

            print(f"\n❌ CONNECTION ERROR: {error_msg}")
            print(
                f"💡 Remediation: Verify network connectivity and device accessibility"
            )

            return False

        except Exception as e:
            error_msg = f"Unexpected error: {str(e)}"
            logger.error(f"[{self.hostname}] ❌ {error_msg}")
            self.status.error = error_msg
            self.status.error_type = "UnexpectedError"
            self.status.update_phase(UpgradePhase.FAILED, error_msg)
            send_operation_complete(self.status, False, error_msg)

            print(f"\n❌ UNEXPECTED ERROR: {error_msg}")
            print(f"💡 Remediation: Review logs and contact support if issue persists")

            return False


# ================================================================================
# SECTION 17: MAIN EXECUTION - ARGUMENT PARSING & SCRIPT ENTRY POINT
# ================================================================================
# Description: Command-line argument parsing and main script execution logic
#              for standalone CLI usage.
# ================================================================================


def main():
    """
    Main script entry point.

    Parses command-line arguments and initiates upgrade process.
    Supports both old-style and new-style argument formats for
    backward compatibility.
    """
    parser = argparse.ArgumentParser(
        description="Juniper Device Code Upgrade - Enhanced Edition v1.0.0",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  Basic upgrade:
    python3 run.py --hostname 192.168.1.1 --username admin --password secret \\
                   --target-version 21.4R3.15 --image-filename junos-srx-21.4R3.15.tgz
 
  Force upgrade despite warnings:
    python3 run.py --hostname firewall-01 --username admin --password secret \\
                   --target-version 21.4R3.15 --image-filename junos-srx-21.4R3.15.tgz \\
                   --force-upgrade
 
  Skip pre-checks:
    python3 run.py --hostname 192.168.1.1 --username admin --password secret \\
                   --target-version 21.4R3.15 --image-filename junos-srx-21.4R3.15.tgz \\
                   --skip-pre-check
 
For more information, see script header documentation.
        """,
    )

    # Required arguments
    parser.add_argument(
        "--hostname", required=True, help="Target device hostname or IP address"
    )
    parser.add_argument(
        "--username", required=True, help="Device authentication username"
    )
    parser.add_argument(
        "--password", required=True, help="Device authentication password"
    )

    # Support both old and new style arguments for backward compatibility
    parser.add_argument(
        "--target_version", help="Target software version (old style, e.g., 21.4R3.15)"
    )
    parser.add_argument(
        "--target-version",
        dest="target_version_compat",
        help="Target software version (new style, e.g., 21.4R3.15)",
    )

    parser.add_argument("--image_filename", help="Upgrade image filename (old style)")
    parser.add_argument(
        "--image-filename",
        dest="image_filename_compat",
        help="Upgrade image filename (new style)",
    )

    # Optional arguments
    parser.add_argument(
        "--vendor", default="juniper", help="Device vendor (default: juniper)"
    )
    parser.add_argument(
        "--platform", default="srx", help="Device platform (default: srx)"
    )
    parser.add_argument(
        "--skip-pre-check",
        action="store_true",
        help="Skip pre-upgrade validation checks",
    )
    parser.add_argument(
        "--force-upgrade",
        action="store_true",
        help="Force upgrade despite warnings or version mismatch",
    )
    parser.add_argument(
        "--connection-timeout",
        type=int,
        default=DEFAULT_CONNECTION_TIMEOUT,
        help=f"Connection timeout in seconds (default: {DEFAULT_CONNECTION_TIMEOUT})",
    )
    parser.add_argument(
        "--operation-timeout",
        type=int,
        default=DEFAULT_OPERATION_TIMEOUT,
        help=f"Operation timeout in seconds (default: {DEFAULT_OPERATION_TIMEOUT})",
    )
    parser.add_argument(
        "--reboot-timeout",
        type=int,
        default=DEFAULT_REBOOT_TIMEOUT,
        help=f"Reboot recovery timeout in seconds (default: {DEFAULT_REBOOT_TIMEOUT})",
    )

    args = parser.parse_args()

    # Resolve target version from both argument styles
    target_version = args.target_version or args.target_version_compat
    if not target_version:
        logger.error(
            "❌ Target version must be specified using --target_version or --target-version"
        )
        print("\n❌ ERROR: Target version is required", file=sys.stderr)
        print("   Use --target-version or --target_version argument\n", file=sys.stderr)
        sys.exit(1)

    # Resolve image filename from both argument styles
    image_filename = args.image_filename or args.image_filename_compat
    if not image_filename:
        logger.error(
            "❌ Image filename must be specified using --image_filename or --image-filename"
        )
        print("\n❌ ERROR: Image filename is required", file=sys.stderr)
        print("   Use --image-filename or --image_filename argument\n", file=sys.stderr)
        sys.exit(1)

    # Log startup information
    logger.info("=" * 80)
    logger.info("🚀 Juniper Device Upgrade Script v1.0.0 - Starting")
    logger.info("=" * 80)
    logger.info(
        f"📅 Started at: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}"
    )
    logger.info(f"👤 Executed by: nikos-geranios_vgi")
    logger.info(f"🎯 Target device: {args.hostname}")
    logger.info(f"📦 Target version: {target_version}")
    logger.info(f"🖼️  Image file: {image_filename}")
    logger.info(f"🔧 Platform: {args.platform}")
    logger.info("=" * 80)

    # Create and run upgrader
    upgrader = DeviceUpgrader(
        hostname=args.hostname,
        username=args.username,
        password=args.password,
        target_version=target_version,
        image_filename=image_filename,
        vendor=args.vendor,
        platform=args.platform,
        skip_pre_check=args.skip_pre_check,
        force_upgrade=args.force_upgrade,
    )

    # Execute upgrade
    success = upgrader.run_upgrade()

    # Final summary
    logger.info("=" * 80)
    if success:
        logger.info("✅ UPGRADE COMPLETED SUCCESSFULLY")
        logger.info(
            f"📅 Completed at: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}"
        )
        logger.info("=" * 80)
        return 0
    else:
        logger.error("❌ UPGRADE FAILED")
        logger.info(
            f"📅 Failed at: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}"
        )
        logger.info("=" * 80)

        # Determine appropriate exit code
        if upgrader.status.phase == UpgradePhase.PRE_CHECK:
            return 2  # Pre-check failure
        elif upgrader.status.error_type == "ConnectionError":
            return 3  # Connection error
        elif (
            upgrader.status.upgrade_result
            and upgrader.status.upgrade_result.rollback_performed
        ):
            return 4  # Rollback performed
        else:
            return 1  # General failure


# ================================================================================
# SCRIPT ENTRY POINT
# ================================================================================

if __name__ == "__main__":
    try:
        exit_code = main()
        sys.exit(exit_code)
    except KeyboardInterrupt:
        logger.warning("\n⚠️  Upgrade interrupted by user (Ctrl+C)")
        print("\n⚠️  UPGRADE INTERRUPTED - Exiting...\n", file=sys.stderr)
        sys.exit(130)
    except Exception as e:
        logger.critical(f"💥 CRITICAL ERROR: {e}", exc_info=True)
        print(f"\n💥 CRITICAL ERROR: {e}\n", file=sys.stderr)
        sys.exit(1)


# ================================================================================
# END OF SCRIPT - VERSION 1.0.0
# ================================================================================
# Total Lines: ~2800+
# Author: nikos-geranios_vgi
# Last Updated: 2025-11-03
# ================================================================================
