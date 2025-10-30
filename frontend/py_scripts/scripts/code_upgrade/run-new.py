#!/usr/bin/env python3
"""
================================================================================
SCRIPT:             Device Code Upgrade with Pre-Check Phase
FILENAME:           run.py
VERSION:            7.1 (FIXED - Pre-Check Completion Event)
LAST UPDATED:       2025-10-30
AUTHOR:             nikos-geranios_vgi
================================================================================
 
CRITICAL FIXES IN THIS VERSION:
    🔧 FIX 1: Added OPERATION_COMPLETE event after PRE_CHECK_COMPLETE
    🔧 FIX 2: Fixed step counter consistency (no jumps from 2→3)
    🔧 FIX 3: Proper stderr flushing with adequate delays
    🔧 FIX 4: Ensured total_steps matches actual step count
    🔧 FIX 5: Aligned event structure with frontend expectations
 
WHY THESE FIXES MATTER:
    The frontend (CodeUpgrades.jsx) listens for OPERATION_COMPLETE to:
    - Mark the job as finished
    - Unsubscribe from WebSocket channel
    - Transition to the review tab
 
    Without OPERATION_COMPLETE, the frontend keeps waiting indefinitely,
    even though PRE_CHECK_COMPLETE was sent and processed correctly.
 
PRE-CHECK CATEGORIES:
    CRITICAL (Must Pass):
    - Device connectivity
    - Storage space (30% minimum free)
    - System state (alarms, config)
    - Redundancy status (HA systems)
    - Image availability
 
    WARNING (Proceed with Caution):
    - Version compatibility
    - Snapshot availability
    - Resource utilization
    - Configuration complexity
 
USAGE:
    # Pre-check phase
    python run.py --phase pre_check --hostname 172.27.200.200 --username admin \
                  --password secret --image_filename junos.tgz --target_version 24.4R2
 
    # Upgrade phase (after pre-check approval)
    python run.py --phase upgrade --hostname 172.27.200.200 --username admin \
                  --password secret --image_filename junos.tgz --target_version 24.4R2
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
# PROGRESS REPORTING
# ================================================================================
def send_progress(event_type: str, data: Dict[str, Any], message: str = ""):
    """
    Send structured progress updates via stderr
 
    CRITICAL: This function outputs to stderr (not stdout) because:
    1. The job orchestrator captures stderr for real-time WebSocket updates
    2. stdout is reserved for final results/return values
    3. All progress events MUST go through stderr to reach the frontend
 
    MESSAGE FORMAT:
    - Prefixed with "JSON_PROGRESS:" for orchestrator parsing
    - Contains event_type, message, data, and timestamp
    - Serialized as JSON for structured processing
 
    FRONTEND CONTRACT:
    - Frontend expects specific event_types (STEP_START, STEP_COMPLETE, etc.)
    - Each event must include proper data fields for UI updates
    - Timestamps are critical for ordering and deduplication
 
    Args:
        event_type: Event identifier (STEP_START, OPERATION_COMPLETE, etc.)
        data: Event-specific data payload
        message: Human-readable message for UI display
    """
    progress_update = {
        "event_type": event_type,
        "message": message,
        "data": {
            **data,
            "timestamp": time.time(),
            "iso_timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        },
    }
 
    # ⭐ CRITICAL: Use print() with file=sys.stderr to ensure orchestrator captures it
    # Do NOT use logger.info() as it may not be captured by stderr stream
    print(f"JSON_PROGRESS: {json.dumps(progress_update)}", file=sys.stderr, flush=True)
 
    # Also log for debugging (goes to stdout for local troubleshooting)
    logger.debug(f"Progress sent: {event_type} - {message}")
 
 
def send_step_progress(
    step: int,
    event_type: str,
    status: str = None,
    message: str = "",
    duration: float = None,
    **extra_data,
):
    """
    Send step-specific progress updates
 
    Convenience wrapper for send_progress() that automatically includes
    step number and optional status/duration.
 
    Args:
        step: Step number (1-based counter)
        event_type: STEP_START or STEP_COMPLETE
        status: Step status (COMPLETED, FAILED, IN_PROGRESS)
        message: Step description
        duration: Step execution time in seconds
        **extra_data: Additional data fields
    """
    data = {"step": step, **extra_data}
    if status:
        data["status"] = status
    if duration is not None:
        data["duration"] = round(duration, 2)
    send_progress(event_type, data, message)
 
 
# ================================================================================
# PRE-CHECK VALIDATORS - CRITICAL
# ================================================================================
def precheck_device_connectivity(dev: Device, hostname: str) -> PreCheckResult:
    """
    ✅ CRITICAL: Validate device connectivity and authentication
 
    This check ensures:
    - Device is network-reachable
    - SSH/NETCONF connection is stable
    - Authentication credentials are valid
    - Device can respond to CLI commands
 
    Failure Impact: CRITICAL - Cannot proceed without device access
    """
    try:
        # Test basic CLI access with a simple command
        dev.cli("show version | match Hostname", warning=False)
 
        return PreCheckResult(
            check_name="Device Connectivity",
            severity=PreCheckSeverity.PASS,
            passed=True,
            message=f"Device {hostname} is reachable and responsive",
            details={"hostname": hostname, "connected": True},
        )
 
    except Exception as e:
        return PreCheckResult(
            check_name="Device Connectivity",
            severity=PreCheckSeverity.CRITICAL,
            passed=False,
            message=f"Cannot establish stable connection to {hostname}",
            details={"hostname": hostname, "error": str(e)},
            recommendation="Verify network connectivity and credentials before proceeding",
        )
 
 
def precheck_storage_space(dev: Device, hostname: str) -> PreCheckResult:
    """
    ✅ CRITICAL: Validate sufficient storage space for upgrade
 
    This check ensures:
    - At least 30% free space on /var partition
    - Sufficient space for image download and installation
    - Room for temporary files and snapshots
 
    Failure Impact: CRITICAL - Insufficient space causes upgrade failures
    """
    try:
        storage_output = dev.cli("show system storage", warning=False)
 
        storage_critical = False
        storage_details = {}
 
        for line in storage_output.split("\n"):
            if "/var" in line or "/tmp" in line:
                parts = line.split()
                if len(parts) >= 5:
                    filesystem = parts[0]
                    use_percent = parts[4].replace("%", "")
 
                    try:
                        use_percent_int = int(use_percent)
                        free_percent = 100 - use_percent_int
 
                        storage_details[filesystem] = {
                            "used_percent": use_percent_int,
                            "free_percent": free_percent,
                        }
 
                        if free_percent < MINIMUM_STORAGE_FREE_PERCENT:
                            storage_critical = True
 
                    except ValueError:
                        pass
 
        if storage_critical:
            return PreCheckResult(
                check_name="Storage Space",
                severity=PreCheckSeverity.CRITICAL,
                passed=False,
                message=f"Insufficient storage space on {hostname}",
                details=storage_details,
                recommendation=f"Free up storage space. Minimum {MINIMUM_STORAGE_FREE_PERCENT}% free required on /var partition",
            )
 
        return PreCheckResult(
            check_name="Storage Space",
            severity=PreCheckSeverity.PASS,
            passed=True,
            message=f"Storage space adequate on {hostname}",
            details=storage_details,
        )
 
    except Exception as e:
        return PreCheckResult(
            check_name="Storage Space",
            severity=PreCheckSeverity.CRITICAL,
            passed=False,
            message=f"Failed to check storage space on {hostname}",
            details={"error": str(e)},
            recommendation="Manually verify storage space via console",
        )
 
 
def precheck_system_state(dev: Device, hostname: str) -> PreCheckResult:
    """
    ✅ CRITICAL: Check for system alarms and configuration state
 
    This check ensures:
    - No major/critical system alarms
    - Configuration is committed
    - No pending system errors
 
    Failure Impact: CRITICAL - Active alarms indicate system problems
    """
    try:
        # Check for critical alarms
        alarms_output = dev.cli("show system alarms", warning=False)
 
        has_critical_alarms = False
        alarm_details = []
 
        if "No alarms currently active" not in alarms_output:
            for line in alarms_output.split("\n"):
                if any(
                    keyword in line.lower()
                    for keyword in ["major", "critical", "emergency"]
                ):
                    has_critical_alarms = True
                    alarm_details.append(line.strip())
 
        # Check for uncommitted configuration
        try:
            commit_check = dev.cli("show system commit", warning=False)
            has_uncommitted = "0 minutes ago" not in commit_check
        except:
            has_uncommitted = False
 
        if has_critical_alarms:
            return PreCheckResult(
                check_name="System State",
                severity=PreCheckSeverity.CRITICAL,
                passed=False,
                message=f"Critical system alarms detected on {hostname}",
                details={
                    "alarms": alarm_details,
                    "uncommitted_config": has_uncommitted,
                },
                recommendation="Resolve critical alarms before upgrade. Check 'show system alarms' for details",
            )
 
        if has_uncommitted:
            return PreCheckResult(
                check_name="System State",
                severity=PreCheckSeverity.WARNING,
                passed=True,
                message=f"Uncommitted configuration changes detected on {hostname}",
                details={"uncommitted_config": True},
                recommendation="Commit or rollback pending changes before upgrade",
            )
 
        return PreCheckResult(
            check_name="System State",
            severity=PreCheckSeverity.PASS,
            passed=True,
            message=f"System state healthy on {hostname}",
            details={"alarms": "None", "uncommitted_config": False},
        )
 
    except Exception as e:
        return PreCheckResult(
            check_name="System State",
            severity=PreCheckSeverity.WARNING,
            passed=True,
            message=f"Unable to fully verify system state on {hostname}",
            details={"error": str(e)},
            recommendation="Manually verify system alarms and configuration state",
        )
 
 
def precheck_redundancy_status(dev: Device, hostname: str) -> PreCheckResult:
    """
    ✅ CRITICAL: Validate redundancy status for HA systems
 
    This check ensures:
    - Chassis cluster is healthy (if configured)
    - Redundancy groups are active
    - No failover conditions exist
 
    Failure Impact: CRITICAL for HA systems - Degraded redundancy is unsafe
    """
    try:
        # Check if this is a chassis cluster
        try:
            cluster_status = dev.cli("show chassis cluster status", warning=False)
            is_cluster = True
        except:
            is_cluster = False
 
        if not is_cluster:
            return PreCheckResult(
                check_name="Redundancy Status",
                severity=PreCheckSeverity.PASS,
                passed=True,
                message=f"Standalone device (no redundancy configured) on {hostname}",
                details={"cluster_mode": False},
            )
 
        # Parse cluster status
        cluster_healthy = True
        cluster_details = {}
 
        if "redundancy group" in cluster_status.lower():
            # Check for "lost" or "ineligible" states
            if any(
                keyword in cluster_status.lower()
                for keyword in ["lost", "ineligible", "disabled"]
            ):
                cluster_healthy = False
                cluster_details["issues"] = "Redundancy group in degraded state"
 
        if not cluster_healthy:
            return PreCheckResult(
                check_name="Redundancy Status",
                severity=PreCheckSeverity.CRITICAL,
                passed=False,
                message=f"Chassis cluster redundancy degraded on {hostname}",
                details=cluster_details,
                recommendation="Resolve cluster issues before upgrade. Both nodes should be healthy",
            )
 
        return PreCheckResult(
            check_name="Redundancy Status",
            severity=PreCheckSeverity.PASS,
            passed=True,
            message=f"Redundancy status healthy on {hostname}",
            details={"cluster_mode": True, "status": "healthy"},
        )
 
    except Exception as e:
        return PreCheckResult(
            check_name="Redundancy Status",
            severity=PreCheckSeverity.WARNING,
            passed=True,
            message=f"Unable to verify redundancy status on {hostname}",
            details={"error": str(e)},
            recommendation="Manually verify chassis cluster status if applicable",
        )
 
 
def precheck_image_availability(
    dev: Device, hostname: str, image_filename: str
) -> PreCheckResult:
    """
    ✅ CRITICAL: Verify upgrade image exists and is valid
 
    This check ensures:
    - Image file exists in /var/tmp/
    - File size is reasonable (not corrupted)
    - File is accessible and readable
 
    Failure Impact: CRITICAL - Cannot upgrade without valid image
    """
    try:
        file_list_output = dev.cli("file list /var/tmp/ detail", warning=False)
 
        image_found = False
        image_size = 0
 
        for line in file_list_output.split("\n"):
            if image_filename in line:
                parts = line.split()
                if len(parts) >= 5:
                    try:
                        image_size = int(parts[4])
                        image_found = True
                    except:
                        pass
 
        if not image_found:
            return PreCheckResult(
                check_name="Image Availability",
                severity=PreCheckSeverity.CRITICAL,
                passed=False,
                message=f"Upgrade image '{image_filename}' not found on {hostname}",
                details={"image_filename": image_filename, "location": "/var/tmp/"},
                recommendation=f"Upload {image_filename} to /var/tmp/ before upgrade",
            )
 
        # Check image size
        image_size_mb = image_size / (1024 * 1024)
        if image_size_mb < MINIMUM_IMAGE_SIZE_MB:
            return PreCheckResult(
                check_name="Image Availability",
                severity=PreCheckSeverity.CRITICAL,
                passed=False,
                message=f"Image file appears corrupted or incomplete on {hostname}",
                details={
                    "image_filename": image_filename,
                    "size_mb": round(image_size_mb, 2),
                    "minimum_expected_mb": MINIMUM_IMAGE_SIZE_MB,
                },
                recommendation="Re-upload the image file as it appears corrupted",
            )
 
        return PreCheckResult(
            check_name="Image Availability",
            severity=PreCheckSeverity.PASS,
            passed=True,
            message=f"Upgrade image validated on {hostname}",
            details={
                "image_filename": image_filename,
                "size_mb": round(image_size_mb, 2),
                "location": "/var/tmp/",
            },
        )
 
    except Exception as e:
        return PreCheckResult(
            check_name="Image Availability",
            severity=PreCheckSeverity.CRITICAL,
            passed=False,
            message=f"Failed to validate image on {hostname}",
            details={"error": str(e)},
            recommendation="Manually verify image exists in /var/tmp/",
        )
 
 
# ================================================================================
# PRE-CHECK VALIDATORS - WARNING
# ================================================================================
def precheck_version_compatibility(
    dev: Device, hostname: str, current_version: str, target_version: str
) -> PreCheckResult:
    """
    ⚠️ WARNING: Analyze version compatibility and upgrade path
 
    This check warns about:
    - Large version jumps (major version changes)
    - Unusual upgrade paths
    - Potential compatibility issues
 
    Failure Impact: WARNING - User should review but can proceed
    """
    try:
        # Parse versions
        current_parsed = parse_junos_version(current_version)
        target_parsed = parse_junos_version(target_version)
 
        current_major, current_minor = current_parsed[:2]
        target_major, target_minor = target_parsed[:2]
 
        # Major version jump
        if abs(target_major - current_major) > 1:
            return PreCheckResult(
                check_name="Version Compatibility",
                severity=PreCheckSeverity.WARNING,
                passed=True,
                message=f"Major version jump detected: {current_version} → {target_version}",
                details={
                    "current": current_version,
                    "target": target_version,
                    "major_jump": abs(target_major - current_major),
                },
                recommendation="Consider intermediate upgrade steps for large version jumps",
            )
 
        # Large minor version gap
        version_gap = abs(target_minor - current_minor)
        if version_gap > 3:
            return PreCheckResult(
                check_name="Version Compatibility",
                severity=PreCheckSeverity.WARNING,
                passed=True,
                message=f"Large version gap detected ({version_gap} minor versions)",
                details={
                    "current": current_version,
                    "target": target_version,
                    "minor_gap": version_gap,
                },
                recommendation="Review release notes for compatibility issues",
            )
 
        return PreCheckResult(
            check_name="Version Compatibility",
            severity=PreCheckSeverity.PASS,
            passed=True,
            message=f"Version upgrade path appears compatible",
            details={"current": current_version, "target": target_version},
        )
 
    except Exception as e:
        return PreCheckResult(
            check_name="Version Compatibility",
            severity=PreCheckSeverity.WARNING,
            passed=True,
            message=f"Unable to analyze version compatibility",
            details={"error": str(e)},
            recommendation="Manually review Juniper upgrade guidelines",
        )
 
 
def precheck_snapshot_availability(
    dev: Device, hostname: str, require_snapshot: bool = False
) -> PreCheckResult:
    """
    ⚠️ WARNING: Check for configuration snapshots (rollback capability)
 
    This check ensures:
    - System snapshot exists for emergency rollback
    - Snapshot is recent and valid
 
    Failure Impact: WARNING (or CRITICAL if require_snapshot=True)
    """
    try:
        # Check for recent snapshots
        snapshot_output = dev.cli("show system snapshot media internal", warning=False)
 
        has_snapshot = "No snapshot information" not in snapshot_output
 
        if not has_snapshot:
            severity = (
                PreCheckSeverity.CRITICAL
                if require_snapshot
                else PreCheckSeverity.WARNING
            )
 
            return PreCheckResult(
                check_name="Snapshot Availability",
                severity=severity,
                passed=not require_snapshot,
                message=f"No system snapshot found on {hostname}",
                details={"snapshot_exists": False},
                recommendation="Create snapshot before upgrade for rollback capability: 'request system snapshot slice alternate'",
            )
 
        return PreCheckResult(
            check_name="Snapshot Availability",
            severity=PreCheckSeverity.PASS,
            passed=True,
            message=f"System snapshot available on {hostname}",
            details={"snapshot_exists": True},
        )
 
    except Exception as e:
        return PreCheckResult(
            check_name="Snapshot Availability",
            severity=PreCheckSeverity.WARNING,
            passed=True,
            message=f"Unable to verify snapshot status on {hostname}",
            details={"error": str(e)},
            recommendation="Manually verify snapshot availability",
        )
 
 
def precheck_resource_utilization(dev: Device, hostname: str) -> PreCheckResult:
    """
    ⚠️ WARNING: Check CPU and memory utilization
 
    This check warns about:
    - High CPU usage during upgrade window
    - High memory usage that could impact upgrade
 
    Failure Impact: WARNING - High utilization increases upgrade risk
    """
    try:
        # Get CPU and memory stats
        re_info = dev.cli("show chassis routing-engine", warning=False)
 
        cpu_usage = None
        memory_usage = None
 
        for line in re_info.split("\n"):
            if "CPU utilization" in line:
                match = re.search(r"(\d+)\s*percent", line)
                if match:
                    cpu_usage = int(match.group(1))
 
            if "Memory utilization" in line:
                match = re.search(r"(\d+)\s*percent", line)
                if match:
                    memory_usage = int(match.group(1))
 
        high_utilization = False
        issues = []
 
        if cpu_usage and cpu_usage > MAXIMUM_CPU_PERCENT:
            high_utilization = True
            issues.append(f"CPU usage high: {cpu_usage}%")
 
        if memory_usage and memory_usage > MAXIMUM_MEMORY_PERCENT:
            high_utilization = True
            issues.append(f"Memory usage high: {memory_usage}%")
 
        if high_utilization:
            return PreCheckResult(
                check_name="Resource Utilization",
                severity=PreCheckSeverity.WARNING,
                passed=True,
                message=f"High resource utilization on {hostname}",
                details={
                    "cpu_percent": cpu_usage,
                    "memory_percent": memory_usage,
                    "issues": issues,
                },
                recommendation="Consider upgrading during maintenance window with lower traffic",
            )
 
        return PreCheckResult(
            check_name="Resource Utilization",
            severity=PreCheckSeverity.PASS,
            passed=True,
            message=f"Resource utilization normal on {hostname}",
            details={"cpu_percent": cpu_usage, "memory_percent": memory_usage},
        )
 
    except Exception as e:
        return PreCheckResult(
            check_name="Resource Utilization",
            severity=PreCheckSeverity.WARNING,
            passed=True,
            message=f"Unable to check resource utilization on {hostname}",
            details={"error": str(e)},
            recommendation="Manually verify CPU and memory usage",
        )
 
 
# ================================================================================
# PRE-CHECK ORCHESTRATION
# ================================================================================
def run_all_prechecks(
    dev: Device,
    hostname: str,
    target_version: str,
    image_filename: str,
    skip_storage: bool = False,
    skip_snapshot: bool = False,
    require_snapshot: bool = False,
) -> PreCheckSummary:
    """
    🔍 Execute all pre-check validators and aggregate results
 
    This orchestrates the complete pre-check workflow:
    1. Runs all CRITICAL checks first
    2. Then runs WARNING checks
    3. Aggregates results into summary
    4. Determines if upgrade can proceed
 
    Returns:
        PreCheckSummary with all check results and overall assessment
    """
    logger.info(f"[{hostname}] Starting comprehensive pre-check validation")
 
    summary = PreCheckSummary()
    current_version = dev.facts.get("version", "Unknown")
 
    # Run CRITICAL checks
    summary.results.append(precheck_device_connectivity(dev, hostname))
 
    if not skip_storage:
        summary.results.append(precheck_storage_space(dev, hostname))
 
    summary.results.append(precheck_system_state(dev, hostname))
    summary.results.append(precheck_redundancy_status(dev, hostname))
    summary.results.append(precheck_image_availability(dev, hostname, image_filename))
 
    # Run WARNING checks
    summary.results.append(
        precheck_version_compatibility(dev, hostname, current_version, target_version)
    )
 
    if not skip_snapshot:
        summary.results.append(
            precheck_snapshot_availability(dev, hostname, require_snapshot)
        )
 
    summary.results.append(precheck_resource_utilization(dev, hostname))
 
    # Log summary
    logger.info(
        f"[{hostname}] Pre-check complete: {summary.passed} passed, "
        f"{summary.warnings} warnings, {summary.critical_failures} critical failures"
    )
 
    return summary
 
 
# ================================================================================
# VERSION COMPARISON FUNCTIONS
# ================================================================================
def parse_junos_version(version_string: str) -> Tuple[int, ...]:
    """Parse Junos version string into comparable components"""
    if not version_string:
        return (0, 0, 0, 0, 0)
 
    clean_version = version_string.replace("Junos: ", "").strip()
 
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
 
    except (ValueError, AttributeError) as e:
        logger.warning(f"Failed to parse version '{version_string}': {e}")
 
    return (0, 0, 0, 0, 0)
 
 
def compare_junos_versions(current: str, target: str) -> VersionAction:
    """Compare two Junos versions"""
    try:
        current_parsed = parse_junos_version(current)
        target_parsed = parse_junos_version(target)
 
        if current_parsed == target_parsed:
            return VersionAction.MAINTAIN
        elif current_parsed < target_parsed:
            return VersionAction.UPGRADE
        else:
            return VersionAction.DOWNGRADE
 
    except Exception as e:
        logger.error(f"Error comparing versions: {e}")
        return VersionAction.UNKNOWN
 
 
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
    """Context manager for device connections"""
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
                logger.debug(f"[{hostname}] Connection closed")
            except Exception as e:
                logger.warning(f"[{hostname}] Error closing connection: {e}")
 
 
def establish_connection_with_retry(
    hostname: str,
    username: str,
    password: str,
    max_retries: int = DEFAULT_RETRY_ATTEMPTS,
) -> Device:
    """Establish connection with retry logic"""
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
                    f"[{hostname}] Connection attempt {attempt + 1} failed: {e}. "
                    f"Retrying in {wait_time} seconds..."
                )
                time.sleep(wait_time)
            else:
                logger.error(f"[{hostname}] All connection attempts failed")
 
    raise ConnectionError(
        f"Failed to connect after {max_retries} attempts. Last error: {str(last_error)}"
    )
 
 
# ================================================================================
# PRE-CHECK EXECUTION WORKFLOW (FIXED VERSION)
# ================================================================================
def execute_precheck_workflow(
    hostname: str,
    username: str,
    password: str,
    target_version: str,
    image_filename: str,
    skip_storage: bool = False,
    skip_snapshot: bool = False,
    require_snapshot: bool = False,
) -> PreCheckSummary:
    """
    🔍 MAIN PRE-CHECK WORKFLOW EXECUTION (FIXED VERSION)
 
    This function orchestrates the complete pre-check phase with CRITICAL FIXES:
 
    🔧 FIX 1: Now sends OPERATION_COMPLETE after PRE_CHECK_COMPLETE
    🔧 FIX 2: Fixed step counter to be consistent (no jumps)
    🔧 FIX 3: Proper stderr flushing with adequate delays
    🔧 FIX 4: Total steps (10) matches actual step count
 
    WHY THESE FIXES MATTER:
    - The frontend REQUIRES OPERATION_COMPLETE to finalize the job
    - Without it, the WebSocket stays open and UI waits indefinitely
    - PRE_CHECK_COMPLETE alone is not sufficient for job completion
 
    WORKFLOW STEPS:
    1. Send OPERATION_START (total_steps=10)
    2. Connect to device (step 1-2)
    3. Run 8 validation checks (steps 3-10)
    4. Send PRE_CHECK_COMPLETE with summary
    5. Send OPERATION_COMPLETE to finalize (CRITICAL FIX)
 
    Args:
        hostname: Target device IP/hostname
        username: Authentication username
        password: Authentication password
        target_version: Target Junos version
        image_filename: Software image filename
        skip_storage: Skip storage check (optional)
        skip_snapshot: Skip snapshot check (optional)
        require_snapshot: Make snapshot mandatory (optional)
 
    Returns:
        PreCheckSummary: Complete pre-check results
    """
    logger.info(f"[{hostname}] ===== PRE-CHECK PHASE STARTING =====")
 
    # ⭐ FIX 4: Correctly calculate total steps
    # Step 1: Connection
    # Step 2: Connection complete
    # Steps 3-10: 8 validation checks
    # Total: 10 steps
    total_validation_checks = 8
    total_steps = 2 + total_validation_checks  # Connection (2) + Checks (8) = 10
 
    # Send OPERATION_START with correct total_steps
    send_progress(
        "OPERATION_START",
        {
            "hostname": hostname,
            "target_version": target_version,
            "image_filename": image_filename,
            "operation": "pre_check",
            "total_steps": total_steps,  # FIXED: Now 10 instead of 8
        },
        f"Starting pre-check validation for {hostname}",
    )
 
    dev = None
    step_counter = 0
 
    try:
        # ====================================================================
        # STEP 1-2: DEVICE CONNECTION
        # ====================================================================
        step_counter += 1
        send_progress(
            "STEP_START",
            {"step": step_counter, "step_name": "connectivity", "hostname": hostname},
            "Connecting to device...",
        )
 
        dev = establish_connection_with_retry(hostname, username, password)
        logger.info(f"[{hostname}] Connected successfully")
 
        send_progress(
            "STEP_COMPLETE",
            {"step": step_counter, "status": "COMPLETED", "hostname": hostname},
            f"Connected to {hostname}",
        )
 
        # ====================================================================
        # STEPS 3-10: VALIDATION CHECKS
        # ====================================================================
        step_counter += 1
        send_progress(
            "STEP_START",
            {"step": step_counter, "step_name": "validation", "hostname": hostname},
            "Running validation checks...",
        )
 
        summary = run_all_prechecks(
            dev,
            hostname,
            target_version,
            image_filename,
            skip_storage,
            skip_snapshot,
            require_snapshot,
        )
 
        # Send individual check results with proper step counting
        # ⭐ FIX 2: Fixed step counter - now increments properly from step 2
        for idx, result in enumerate(summary.results, start=step_counter + 1):
            # Send PRE_CHECK_RESULT event for each check
            send_progress("PRE_CHECK_RESULT", result.to_dict(), result.message)
 
            # Send STEP_COMPLETE for each check
            send_progress(
                "STEP_COMPLETE",
                {
                    "step": idx,
                    "status": "COMPLETED" if result.passed else "WARNING",
                    "hostname": hostname,
                    "check_name": result.check_name,
                },
                f"Check completed: {result.check_name}",
            )
 
        # ====================================================================
        # PRE-CHECK COMPLETE EVENT
        # ====================================================================
        # Prepare completion data
        completion_data = {
            "hostname": hostname,
            "summary": summary.to_dict(),
            "operation": "pre_check",
            "can_proceed": summary.can_proceed,
            "total_checks": summary.total_checks,
            "passed": summary.passed,
            "warnings": summary.warnings,
            "critical_failures": summary.critical_failures,
        }
 
        # Send PRE_CHECK_COMPLETE (for UI to display detailed results)
        send_progress(
            "PRE_CHECK_COMPLETE",
            completion_data,
            f"Pre-check complete: {summary.passed} passed, {summary.warnings} warnings, {summary.critical_failures} critical",
        )
 
        # ⭐ FIX 3: Proper stderr flushing with adequate delay
        # Allow PRE_CHECK_COMPLETE to be captured before sending OPERATION_COMPLETE
        sys.stderr.flush()
        time.sleep(0.15)  # Increased from 0.05 to 0.15 seconds
 
        # ====================================================================
        # ⭐⭐⭐ CRITICAL FIX 1: OPERATION_COMPLETE EVENT ⭐⭐⭐
        # ====================================================================
        # This is the MISSING PIECE that prevents the frontend from transitioning
        # to the review tab. The frontend's completion detection REQUIRES this event
        # to mark the job as finished and trigger UI updates.
 
        # Determine final status based on pre-check results
        final_status = "SUCCESS" if summary.can_proceed else "FAILED"
 
        # Prepare operation complete data
        operation_complete_data = {
            "hostname": hostname,
            "status": final_status,  # CRITICAL: Frontend checks this field
            "operation": "pre_check",
            "summary": summary.to_dict(),
            "can_proceed": summary.can_proceed,
            "final_results": {
                "success": summary.can_proceed,  # CRITICAL: Frontend checks this field
                "total_checks": summary.total_checks,
                "passed": summary.passed,
                "warnings": summary.warnings,
                "critical_failures": summary.critical_failures,
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
            }
        }
 
        # Send OPERATION_COMPLETE event
        send_progress(
            "OPERATION_COMPLETE",
            operation_complete_data,
            f"Pre-check validation {final_status}: {summary.passed}/{summary.total_checks} checks passed",
        )
 
        # ⭐ FIX 3: Ensure message is fully transmitted before script exits
        # This is CRITICAL because:
        # 1. The orchestrator captures stderr asynchronously
        # 2. If the script exits too quickly, the last message may be truncated
        # 3. The frontend will never receive OPERATION_COMPLETE and hang forever
        sys.stderr.flush()
        time.sleep(0.25)  # Increased delay to ensure orchestrator processes the message
 
        logger.info(f"[{hostname}] ===== PRE-CHECK PHASE COMPLETE =====")
        logger.info(f"[{hostname}] Final Status: {final_status}")
        logger.info(f"[{hostname}] Can Proceed: {summary.can_proceed}")
 
        return summary
 
    except Exception as e:
        logger.error(f"[{hostname}] Pre-check failed: {e}", exc_info=True)
 
        # Send failure event
        send_progress(
            "PRE_CHECK_FAILED",
            {"hostname": hostname, "error": str(e), "error_type": type(e).__name__},
            f"Pre-check failed: {str(e)}",
        )
 
        # ⭐ CRITICAL: Also send OPERATION_COMPLETE for failures
        sys.stderr.flush()
        time.sleep(0.1)
 
        send_progress(
            "OPERATION_COMPLETE",
            {
                "hostname": hostname,
                "status": "FAILED",
                "operation": "pre_check",
                "error": str(e),
                "final_results": {
                    "success": False,
                    "error": str(e),
                    "error_type": type(e).__name__,
                }
            },
            f"Pre-check failed with error: {str(e)}",
        )
 
        sys.stderr.flush()
        time.sleep(0.2)
        raise
 
    finally:
        if dev and dev.connected:
            try:
                dev.close()
            except:
                pass
 
 
# ================================================================================
# MAIN UPGRADE WORKFLOW (PLACEHOLDER - Original code continues here)
# ================================================================================
def upgrade_device(
    hostname: str,
    username: str,
    password: str,
    image_filename: str,
    target_version: str,
    start_step: int,
    allow_downgrade: bool = False,
    skip_pre_check: bool = False,
    force: bool = False,
    skip_storage: bool = False,
    skip_snapshot: bool = False,
    require_snapshot: bool = False,
) -> DeviceStatus:
    """
    Execute complete device upgrade workflow
 
    NOTE: This is a placeholder. In production, include full upgrade logic
    from the original run.py file (connection, validation, installation, etc.)
    """
    status = DeviceStatus(hostname=hostname, target_version=target_version)
    status.start_time = time.time()
 
    # Placeholder for actual upgrade implementation
    logger.info(f"[{hostname}] Upgrade workflow would execute here")
 
    status.success = True
    status.end_time = time.time()
 
    return status
 
 
def handle_upgrade_error(
    status: DeviceStatus, error: Exception, current_step: int, start_step: int
) -> DeviceStatus:
    """Centralized error handling"""
    error_type = type(error).__name__
    error_message = str(error)
 
    logger.error(f"[{status.hostname}] {error_type}: {error_message}", exc_info=True)
 
    status.update_phase(UpgradePhase.FAILED, f"{error_type}: {error_message}")
    status.error = error_message
    status.error_type = error_type
    status.end_time = time.time()
 
    send_step_progress(
        current_step, "STEP_COMPLETE", "FAILED", error_message, error_type=error_type
    )
 
    # Mark remaining steps as failed
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
# COMMAND-LINE ARGUMENT PARSER
# ================================================================================
def parse_arguments():
    """Parse command-line arguments with pre-check support"""
    parser = argparse.ArgumentParser(
        description="Juniper Device Upgrade with Pre-Check Validation (FIXED VERSION)",
        formatter_class=argparse.RawTextHelpFormatter,
    )
 
    # Phase selector
    parser.add_argument(
        "--phase",
        choices=["pre_check", "upgrade"],
        default="upgrade",
        help="Execution phase: 'pre_check' (validation only) or 'upgrade' (full upgrade)",
    )
 
    # Required arguments
    parser.add_argument("--hostname", required=True, help="Target device hostname/IP")
    parser.add_argument("--username", required=True, help="Device username")
    parser.add_argument("--password", required=True, help="Device password")
    parser.add_argument(
        "--image_filename", required=True, help="Software image filename"
    )
    parser.add_argument("--target_version", required=True, help="Target Junos version")
 
    # Optional arguments
    parser.add_argument("--vendor", help="Device vendor")
    parser.add_argument("--platform", help="Device platform")
    parser.add_argument(
        "--allow-downgrade", action="store_true", help="Allow downgrades"
    )
    parser.add_argument(
        "--force", action="store_true", help="Force upgrade despite warnings"
    )
 
    # Pre-check control flags
    parser.add_argument(
        "--skip-pre-check",
        action="store_true",
        help="Skip inline pre-check validation (not recommended)",
    )
    parser.add_argument(
        "--skip-storage-check",
        action="store_true",
        help="Skip storage space validation",
    )
    parser.add_argument(
        "--skip-snapshot-check",
        action="store_true",
        help="Skip snapshot availability check",
    )
    parser.add_argument(
        "--require-snapshot",
        action="store_true",
        help="Make snapshot a critical requirement",
    )
 
    # Utility flags
    parser.add_argument(
        "--dry-run", action="store_true", help="Validate without changes"
    )
    parser.add_argument("-v", "--verbose", action="store_true", help="Verbose logging")
 
    return parser.parse_args()
 
 
# ================================================================================
# MAIN ENTRY POINT
# ================================================================================
def main():
    """Main script entry point with phase selection"""
    args = parse_arguments()
 
    if args.verbose:
        logger.setLevel(logging.DEBUG)
 
    try:
        if args.phase == "pre_check":
            logger.info("===== EXECUTING PRE-CHECK PHASE (FIXED VERSION) =====")
 
            summary = execute_precheck_workflow(
                hostname=args.hostname,
                username=args.username,
                password=args.password,
                target_version=args.target_version,
                image_filename=args.image_filename,
                skip_storage=args.skip_storage_check,
                skip_snapshot=args.skip_snapshot_check,
                require_snapshot=args.require_snapshot,
            )
 
            # Output final results to stdout for backend capture
            print("\n" + "=" * 80)
            print("PRE-CHECK VALIDATION RESULTS".center(80))
            print("=" * 80)
            print(f"\nHostname: {args.hostname}")
            print(f"Target Version: {args.target_version}")
            print(f"Image: {args.image_filename}")
            print(f"\nTotal Checks: {summary.total_checks}")
            print(f"Passed: {summary.passed}")
            print(f"Warnings: {summary.warnings}")
            print(f"Critical Failures: {summary.critical_failures}")
            print(f"\nCan Proceed: {'✅ YES' if summary.can_proceed else '❌ NO'}")
            print("\n" + "=" * 80)
 
            # ⭐ ENSURE STDERR IS FLUSHED before stdout
            # This prevents race condition where stdout might be processed before
            # the final OPERATION_COMPLETE message in stderr
            sys.stderr.flush()
            time.sleep(0.15)
 
            # Output JSON result for programmatic parsing
            print("\nJSON_RESULT:", json.dumps(summary.to_dict()))
            sys.stdout.flush()
 
            sys.exit(0 if summary.can_proceed else 1)
 
        elif args.phase == "upgrade":
            logger.info("===== EXECUTING UPGRADE PHASE =====")
 
            if args.dry_run:
                logger.info("DRY-RUN mode: Validation only")
                print("\nDRY-RUN VALIDATION SUCCESSFUL")
                print(f"Would upgrade {args.hostname} to {args.target_version}")
                sys.exit(0)
 
            # Execute upgrade (placeholder - implement full upgrade logic)
            status = upgrade_device(
                hostname=args.hostname,
                username=args.username,
                password=args.password,
                image_filename=args.image_filename,
                target_version=args.target_version,
                start_step=1,
                allow_downgrade=args.allow_downgrade,
                skip_pre_check=args.skip_pre_check,
                force=args.force,
                skip_storage=args.skip_storage_check,
                skip_snapshot=args.skip_snapshot_check,
                require_snapshot=args.require_snapshot,
            )
 
            sys.exit(0 if status.success else 1)
 
    except Exception as e:
        logger.fatal(f"Critical error: {e}", exc_info=True)
        sys.exit(1)
 
 
if __name__ == "__main__":
    main()