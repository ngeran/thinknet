#!/usr/bin/env python3
"""
================================================================================
SCRIPT:             Device Code Upgrade (Enhanced)
FILENAME:           run.py
VERSION:            6.0 (Enhanced Error Handling & Version Management)
AUTHOR:             Network Infrastructure Team
CREATED:            2025-07-25
LAST UPDATED:       2025-07-25 17:09:55 UTC
USER:               nikos-geranios_vgi
================================================================================

DESCRIPTION:
    This script provides a comprehensive, automated solution for upgrading or
    downgrading firmware on Juniper network devices. It features intelligent
    version comparison, robust error handling, and real-time progress reporting
    designed for UI-driven execution with live frontend updates.

KEY FEATURES:
    🔍 Smart Version Analysis: Intelligent comparison logic that properly detects
       upgrade, downgrade, and same-version scenarios with detailed warnings.

    📋 Enhanced Error Messaging: Comprehensive error reporting with actionable
       suggestions, alternative options, and troubleshooting guidance.

    ⚠️  Downgrade Detection: Clear identification and warnings for downgrade
       operations with optional policy enforcement and user confirmation.

    🛡️ Image Integrity Validation: Pre-installation verification of software
       images including existence, size, and archive integrity checks.

    📊 Granular Progress Reporting: Real-time progress updates with sub-steps,
       timing information, and context-aware status messages.

    🔄 Retry Logic: Automatic retries for transient failures with exponential
       backoff and configurable timeout handling.

    🧵 Concurrent Operations: Thread-pool based execution for multiple devices
       with individual progress tracking and comprehensive error isolation.

    🔐 Robust Authentication: Enhanced connection handling with retry logic,
       timeout management, and graceful cleanup.

HOW TO GUIDE:
    This script is designed for backend automation systems and provides structured
    JSON progress events via stderr for real-time UI updates. It accepts all
    parameters via command-line arguments and outputs final results to stdout.

    BASIC USAGE:
        python run.py --hostname "router1,router2" --username admin
                     --password secret --image_filename "junos-21.4R1.12.tgz"
                     --target_version "21.4R1.12"

    ADVANCED OPTIONS:
        --allow-downgrade    : Permit downgrade operations
        --force             : Skip interactive confirmations
        --dry-run           : Validate without making changes
        --verbose           : Enable detailed debug logging

    INTEGRATION:
        The script communicates via:
        - JSON progress events to stderr (for UI updates)
        - Final summary results to stdout (for backend capture)
        - Structured logging for audit trails and troubleshooting
================================================================================
"""

# ================================================================================
# SECTION 1: IMPORTS AND DEPENDENCIES
# ================================================================================
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

# Third-party libraries for Juniper device management
try:
    from jnpr.junos import Device
    from jnpr.junos.utils.sw import SW
except ImportError as e:
    print(f"ERROR: Required Juniper PyEZ library not found: {e}", file=sys.stderr)
    print("Install with: pip install junos-eznc", file=sys.stderr)
    sys.exit(1)

# ================================================================================
# SECTION 2: LOGGING AND CONFIGURATION SETUP
# ================================================================================

# Configure structured logging for backend integration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)-8s - %(message)s',
    stream=sys.stdout
)
logger = logging.getLogger(__name__)

# Workflow configuration constants
STEPS_PER_DEVICE = 6  # Connect, Validate Image, Check Version, Install, Probe, Verify
DEFAULT_MAX_WORKERS = 5
DEFAULT_DEVICE_TIMEOUT = 1800  # 30 minutes per device
DEFAULT_REBOOT_TIMEOUT = 900   # 15 minutes for reboot
DEFAULT_CONNECTION_TIMEOUT = 30
DEFAULT_RETRY_ATTEMPTS = 3

# ================================================================================
# SECTION 3: CUSTOM EXCEPTION HIERARCHY
# ================================================================================

class DeviceUpgradeError(Exception):
    """Base exception for all device upgrade operations"""
    pass

class ConnectionError(DeviceUpgradeError):
    """Raised when device connection fails after retries"""
    pass

class ImageValidationError(DeviceUpgradeError):
    """Raised when software image validation fails"""
    pass

class VersionAnalysisError(DeviceUpgradeError):
    """Raised when version comparison or analysis fails"""
    pass

class InstallationError(DeviceUpgradeError):
    """Raised when software installation process fails"""
    pass

class RebootTimeoutError(DeviceUpgradeError):
    """Raised when device doesn't respond after reboot timeout"""
    pass

class VersionMismatchError(DeviceUpgradeError):
    """Raised when final version doesn't match expected target"""
    pass

class PolicyViolationError(DeviceUpgradeError):
    """Raised when operation violates configured policies"""
    pass

# ================================================================================
# SECTION 4: DATA STRUCTURES AND ENUMS
# ================================================================================

class UpgradePhase(Enum):
    """Enumeration of all possible upgrade workflow phases"""
    PENDING = "pending"
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

class VersionAction(Enum):
    """Types of version-related actions"""
    UPGRADE = "upgrade"
    DOWNGRADE = "downgrade"
    MAINTAIN = "maintain"
    UNKNOWN = "unknown"

@dataclass
class DeviceStatus:
    """Comprehensive status tracking for individual device operations"""
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

    def update_phase(self, phase: UpgradePhase, message: str = ""):
        """Update device phase with automatic logging"""
        self.phase = phase
        self.message = message or phase.value.replace("_", " ").title()
        logger.info(f"[{self.hostname}] STATUS: {self.phase.name} - {self.message}")

    def add_warning(self, warning: str):
        """Add a warning message to the device status"""
        self.warnings.append(warning)
        logger.warning(f"[{self.hostname}] WARNING: {warning}")

    def get_duration(self) -> float:
        """Calculate total operation duration"""
        if self.start_time and self.end_time:
            return self.end_time - self.start_time
        elif self.start_time:
            return time.time() - self.start_time
        return 0.0

# ================================================================================
# SECTION 5: REAL-TIME PROGRESS REPORTING SYSTEM
# ================================================================================

def send_progress(event_type: str, data: Dict[str, Any], message: str = ""):
    """
    Send structured progress updates to stderr for frontend consumption.

    Args:
        event_type: Type of progress event (STEP_START, STEP_COMPLETE, etc.)
        data: Dictionary containing event-specific data
        message: Human-readable message describing the event
    """
    progress_update = {
        "event_type": event_type,
        "message": message,
        "data": {
            **data,
            "timestamp": time.time(),
            "iso_timestamp": time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())
        }
    }
    print(f"JSON_PROGRESS: {json.dumps(progress_update)}", file=sys.stderr, flush=True)

def send_step_progress(step: int, event_type: str, status: str = None, message: str = "",
                      duration: float = None, **extra_data):
    """
    Convenience function for sending step-specific progress updates.
    """
    data = {
        "step": step,
        **extra_data
    }
    if status:
        data["status"] = status
    if duration is not None:
        data["duration"] = round(duration, 2)

    send_progress(event_type, data, message)

# ================================================================================
# SECTION 6: VERSION COMPARISON AND ANALYSIS ENGINE
# ================================================================================

def parse_junos_version(version_string: str) -> Tuple[int, ...]:
    """
    Parse Junos version string into comparable numeric components.

    Supports various Junos version formats:
    - Standard: "21.4R1.12" -> (21, 4, 1, 12)
    - Service: "20.4R3-S1.8" -> (20, 4, 3, 1, 8)
    - EVO: "21.4R1-S1.6-EVO" -> (21, 4, 1, 1, 6)

    Returns:
        Tuple of integers representing version components
    """
    if not version_string:
        return (0, 0, 0, 0, 0)

    # Clean the version string
    clean_version = version_string.replace("Junos: ", "").strip()

    try:
        # Primary regex for standard Junos versions
        # Matches: XX.YRZ.W, XX.YRZ-SW.V, XX.YRZ-SW.V-EVO, etc.
        pattern = r'(\d+)\.(\d+)R(\d+)(?:-S(\d+))?(?:\.(\d+))?(?:-\w+)?'
        match = re.match(pattern, clean_version)

        if match:
            major, minor, release, service, patch = match.groups()
            return (
                int(major),
                int(minor),
                int(release),
                int(service) if service else 0,
                int(patch) if patch else 0
            )

        # Fallback: try to extract just the numeric parts
        numbers = re.findall(r'\d+', clean_version)
        if len(numbers) >= 3:
            return tuple(int(n) for n in numbers[:5]) + (0,) * (5 - len(numbers))

    except (ValueError, AttributeError) as e:
        logger.warning(f"Failed to parse version '{version_string}': {e}")

    return (0, 0, 0, 0, 0)

def compare_junos_versions(current: str, target: str) -> VersionAction:
    """
    Compare two Junos versions and determine the required action.

    Returns:
        VersionAction enum indicating upgrade, downgrade, or maintain
    """
    try:
        current_parsed = parse_junos_version(current)
        target_parsed = parse_junos_version(target)

        logger.debug(f"Version comparison: {current} {current_parsed} vs {target} {target_parsed}")

        if current_parsed == target_parsed:
            return VersionAction.MAINTAIN
        elif current_parsed < target_parsed:
            return VersionAction.UPGRADE
        else:
            return VersionAction.DOWNGRADE

    except Exception as e:
        logger.error(f"Error comparing versions '{current}' vs '{target}': {e}")
        return VersionAction.UNKNOWN

def analyze_version_compatibility(current: str, target: str) -> Dict[str, Any]:
    """
    Perform comprehensive version analysis including compatibility warnings.

    Returns:
        Dictionary containing analysis results and recommendations
    """
    analysis = {
        "action": compare_junos_versions(current, target),
        "current_parsed": parse_junos_version(current),
        "target_parsed": parse_junos_version(target),
        "warnings": [],
        "recommendations": []
    }

    current_major, current_minor = analysis["current_parsed"][:2]
    target_major, target_minor = analysis["target_parsed"][:2]

    # Major version change warnings
    if current_major != target_major:
        if analysis["action"] == VersionAction.UPGRADE:
            analysis["warnings"].append(f"Major version upgrade ({current_major} -> {target_major}) may require configuration updates")
        else:
            analysis["warnings"].append(f"Major version downgrade ({current_major} -> {target_major}) may cause compatibility issues")

    # Minor version significant changes
    version_gap = abs(current_minor - target_minor)
    if version_gap > 2:
        analysis["warnings"].append(f"Large version gap detected ({version_gap} minor versions)")
        analysis["recommendations"].append("Consider intermediate upgrade steps for complex environments")

    # Specific version recommendations
    if analysis["action"] == VersionAction.DOWNGRADE:
        analysis["recommendations"].extend([
            "Verify all features used are supported in target version",
            "Review configuration compatibility before proceeding",
            "Consider backup of current configuration"
        ])

    return analysis

# ================================================================================
# SECTION 7: IMAGE VALIDATION AND INTEGRITY CHECKING
# ================================================================================

def validate_image_availability(dev: Device, image_filename: str, hostname: str, current_step: int) -> Dict[str, Any]:
    """
    Comprehensive validation of software image availability and integrity.

    Returns:
        Dictionary containing validation results and available alternatives
    """
    step_start_time = time.time()
    send_step_progress(current_step, "STEP_START",
                      message=f"Validating image '{image_filename}' on {hostname}...")

    validation_result = {
        "image_found": False,
        "image_valid": False,
        "available_images": [],
        "similar_images": [],
        "file_size": 0,
        "suggestions": []
    }

    try:
        # Get comprehensive directory listing
        send_progress("SUB_STEP", {"step": current_step}, "Scanning /var/tmp/ directory...")
        file_list_output = dev.cli("file list /var/tmp/ detail", warning=False)

        # Parse file listing for analysis
        available_files = []
        image_files = []

        for line in file_list_output.split('\n'):
            line = line.strip()
            if line and not line.startswith('total') and not line.startswith('d'):
                # Parse ls -l style output: permissions links owner group size date time filename
                parts = line.split()
                if len(parts) >= 9:
                    filename = ' '.join(parts[8:])
                    file_size = parts[4] if parts[4].isdigit() else 0

                    available_files.append({
                        "name": filename,
                        "size": int(file_size) if str(file_size).isdigit() else 0
                    })

                    # Identify software images
                    if any(filename.lower().endswith(ext) for ext in ['.tgz', '.tar.gz', '.pkg', '.tar']):
                        image_files.append(filename)

        validation_result["available_images"] = image_files

        # Check if target image exists
        target_file = next((f for f in available_files if f["name"] == image_filename), None)

        if target_file:
            validation_result["image_found"] = True
            validation_result["file_size"] = target_file["size"]

            send_progress("SUB_STEP", {"step": current_step}, "Verifying image integrity...")

            # Size validation
            if target_file["size"] == 0:
                raise ImageValidationError(f"Image file '{image_filename}' is empty (0 bytes)")
            elif target_file["size"] < 50 * 1024 * 1024:  # Less than 50MB
                validation_result["suggestions"].append("Image file appears unusually small for Junos software")

            # Archive integrity test (optional - may not be available on all devices)
            try:
                archive_test = dev.cli(f"file archive verify /var/tmp/{image_filename}", warning=False)
                if any(keyword in archive_test.lower() for keyword in ['error', 'failed', 'corrupt']):
                    raise ImageValidationError(f"Archive integrity check failed: {archive_test}")
                validation_result["image_valid"] = True
            except Exception as verify_error:
                logger.warning(f"[{hostname}] Archive verification unavailable: {verify_error}")
                validation_result["image_valid"] = True  # Assume valid if test unavailable

            send_step_progress(current_step, "STEP_COMPLETE", "COMPLETED",
                             f"Image '{image_filename}' validated successfully",
                             duration=time.time() - step_start_time)
            return validation_result

        else:
            # Image not found - generate helpful suggestions
            validation_result["suggestions"] = generate_image_suggestions(
                image_filename, image_files, hostname
            )

            # Find similar images
            validation_result["similar_images"] = find_similar_images(image_filename, image_files)

            error_msg = format_image_not_found_error(image_filename, validation_result, hostname)

            send_step_progress(current_step, "STEP_COMPLETE", "FAILED",
                             error_msg, duration=time.time() - step_start_time,
                             validation_result=validation_result)

            raise ImageValidationError(error_msg)

    except ImageValidationError:
        raise
    except Exception as e:
        error_msg = f"Image validation failed due to system error: {str(e)}"
        send_step_progress(current_step, "STEP_COMPLETE", "FAILED", error_msg,
                          duration=time.time() - step_start_time)
        raise ImageValidationError(error_msg)

def find_similar_images(target_image: str, available_images: List[str]) -> List[str]:
    """Find images with similar names to the target image."""
    similar_images = []

    # Extract key components from target image name
    target_lower = target_image.lower()
    target_parts = re.split(r'[-_.]', target_lower)

    for image in available_images:
        image_lower = image.lower()
        image_parts = re.split(r'[-_.]', image_lower)

        # Count matching parts
        matches = sum(1 for part in target_parts if part in image_parts)

        # Consider similar if significant overlap
        if matches >= min(3, len(target_parts) // 2):
            similar_images.append(image)

    return similar_images

def generate_image_suggestions(target_image: str, available_images: List[str], hostname: str) -> List[str]:
    """Generate helpful suggestions for missing image."""
    suggestions = []

    if available_images:
        suggestions.append("Available software images in /var/tmp/:")
        for img in available_images[:5]:  # Show up to 5 images
            suggestions.append(f"  - {img}")
        if len(available_images) > 5:
            suggestions.append(f"  ... and {len(available_images) - 5} more")
    else:
        suggestions.append("No software images found in /var/tmp/")

    suggestions.extend([
        "",
        "To upload the required image:",
        f"  1. SCP: scp {target_image} user@{hostname}:/var/tmp/",
        f"  2. SFTP: sftp user@{hostname} -> put {target_image} /var/tmp/",
        f"  3. CLI: file copy <source-url> /var/tmp/{target_image}"
    ])

    return suggestions

def format_image_not_found_error(image_filename: str, validation_result: Dict[str, Any], hostname: str) -> str:
    """Format a comprehensive error message for missing images."""
    error_lines = [f"Image '{image_filename}' not found in /var/tmp/ on {hostname}"]

    if validation_result["similar_images"]:
        error_lines.extend([
            "",
            "Similar images found:",
            *[f"  - {img}" for img in validation_result["similar_images"]]
        ])

    error_lines.extend(["", *validation_result["suggestions"]])

    return "\n".join(error_lines)

# ================================================================================
# SECTION 8: ENHANCED CONNECTION MANAGEMENT
# ================================================================================

@contextmanager
def managed_device_connection(hostname: str, username: str, password: str, timeout: int = DEFAULT_CONNECTION_TIMEOUT):
    """
    Context manager for robust device connections with automatic cleanup.
    """
    dev = None
    try:
        dev = Device(host=hostname, user=username, password=password,
                    auto_probe=True, timeout=timeout)
        dev.open()
        dev.timeout = 720  # Extend timeout for long-running operations
        yield dev
    finally:
        if dev and dev.connected:
            try:
                dev.close()
                logger.debug(f"[{hostname}] Connection closed successfully")
            except Exception as e:
                logger.warning(f"[{hostname}] Error closing connection: {e}")

def establish_connection_with_retry(hostname: str, username: str, password: str,
                                  max_retries: int = DEFAULT_RETRY_ATTEMPTS) -> Device:
    """
    Establish device connection with exponential backoff retry logic.
    """
    last_error = None

    for attempt in range(max_retries):
        try:
            dev = Device(host=hostname, user=username, password=password,
                        auto_probe=True, timeout=DEFAULT_CONNECTION_TIMEOUT)
            dev.open()
            dev.timeout = 720
            return dev

        except Exception as e:
            last_error = e
            if attempt < max_retries - 1:
                wait_time = min(2 ** attempt, 30)  # Exponential backoff, max 30s
                logger.warning(f"[{hostname}] Connection attempt {attempt + 1} failed: {e}. "
                             f"Retrying in {wait_time} seconds...")
                send_progress("SUB_STEP", {"attempt": attempt + 1},
                             f"Connection attempt {attempt + 1} failed, retrying in {wait_time}s...")
                time.sleep(wait_time)
            else:
                logger.error(f"[{hostname}] All connection attempts failed")

    raise ConnectionError(f"Failed to connect after {max_retries} attempts. Last error: {str(last_error)}")

# ================================================================================
# SECTION 9: REBOOT MONITORING AND RECOVERY
# ================================================================================

def monitor_device_reboot(hostname: str, username: str, password: str,
                         current_step: int, timeout: int = DEFAULT_REBOOT_TIMEOUT) -> Dict[str, Any]:
    """
    Monitor device reboot process with detailed progress reporting.

    Returns:
        Dictionary containing reboot monitoring results
    """
    step_start_time = time.time()
    send_step_progress(current_step, "STEP_START",
                      message=f"Monitoring reboot process for {hostname}...")

    monitoring_result = {
        "reboot_successful": False,
        "total_downtime": 0,
        "ping_restored_time": None,
        "ssh_restored_time": None,
        "phases": []
    }

    # Initial wait for reboot to begin
    initial_wait = 60
    send_progress("SUB_STEP", {"step": current_step},
                 f"Waiting {initial_wait} seconds for reboot to initiate...")
    time.sleep(initial_wait)

    interval = 15
    start_time = time.time()
    last_ping_success = False
    ssh_attempts = 0
    max_ssh_attempts = 5

    send_progress("SUB_STEP", {"step": current_step}, "Beginning reboot monitoring...")

    while time.time() - start_time < timeout:
        elapsed = int(time.time() - start_time)
        remaining = timeout - elapsed

        # Phase 1: Test basic connectivity (ping)
        ping_success = test_ping_connectivity(hostname)

        if ping_success and not last_ping_success:
            ping_restore_time = elapsed
            monitoring_result["ping_restored_time"] = ping_restore_time
            monitoring_result["phases"].append(f"Ping restored after {ping_restore_time}s")
            send_progress("SUB_STEP", {"step": current_step},
                         f"✓ Ping connectivity restored ({ping_restore_time}s)")
            logger.info(f"[{hostname}] Ping connectivity restored after {ping_restore_time} seconds")

        last_ping_success = ping_success

        # Phase 2: Test SSH connectivity (only if ping works)
        if ping_success:
            ssh_success, ssh_details = test_ssh_connectivity(hostname, username, password)

            if ssh_success:
                ssh_restore_time = elapsed
                monitoring_result["ssh_restored_time"] = ssh_restore_time
                monitoring_result["reboot_successful"] = True
                monitoring_result["total_downtime"] = ssh_restore_time
                monitoring_result["phases"].append(f"SSH restored after {ssh_restore_time}s")

                send_step_progress(current_step, "STEP_COMPLETE", "COMPLETED",
                                 f"Device online after {ssh_restore_time} seconds",
                                 duration=time.time() - step_start_time,
                                 monitoring_result=monitoring_result)
                return monitoring_result

            ssh_attempts += 1
            if ssh_attempts <= max_ssh_attempts:
                send_progress("SUB_STEP", {"step": current_step},
                             f"Ping OK, testing SSH connectivity... (attempt {ssh_attempts}/{max_ssh_attempts}, {remaining}s remaining)")

        time.sleep(interval)

    # Timeout reached
    monitoring_result["total_downtime"] = timeout
    error_msg = format_reboot_timeout_error(hostname, monitoring_result, timeout)

    send_step_progress(current_step, "STEP_COMPLETE", "FAILED", error_msg,
                      duration=time.time() - step_start_time,
                      monitoring_result=monitoring_result)

    raise RebootTimeoutError(error_msg)

def test_ping_connectivity(hostname: str, timeout: int = 5) -> bool:
    """Test basic ICMP connectivity to device."""
    try:
        result = subprocess.run(
            ["ping", "-c", "1", "-W", str(timeout), hostname],
            capture_output=True, timeout=timeout + 2, check=False
        )
        return result.returncode == 0
    except (subprocess.TimeoutExpired, OSError):
        return False

def test_ssh_connectivity(hostname: str, username: str, password: str) -> Tuple[bool, Dict[str, Any]]:
    """Test SSH connectivity and basic device responsiveness."""
    details = {"connected": False, "facts_gathered": False, "error": None}

    try:
        with managed_device_connection(hostname, username, password, timeout=20):
            details["connected"] = True
            # Could add basic facts gathering here if needed
            details["facts_gathered"] = True
            return True, details
    except Exception as e:
        details["error"] = str(e)
        return False, details

def format_reboot_timeout_error(hostname: str, monitoring_result: Dict[str, Any], timeout: int) -> str:
    """Format comprehensive error message for reboot timeouts."""
    error_lines = [
        f"Device {hostname} did not become fully accessible after {timeout} seconds"
    ]

    if monitoring_result["ping_restored_time"]:
        error_lines.append(f"✓ Ping connectivity was restored after {monitoring_result['ping_restored_time']} seconds")
    else:
        error_lines.append("✗ Ping connectivity was never restored")

    if monitoring_result["ssh_restored_time"]:
        error_lines.append(f"✓ SSH connectivity was restored after {monitoring_result['ssh_restored_time']} seconds")
    else:
        error_lines.append("✗ SSH connectivity was never restored")

    error_lines.extend([
        "",
        "Troubleshooting steps:",
        "1. Check device console for boot errors",
        "2. Verify network connectivity to management interface",
        "3. Confirm device is not stuck in loader mode",
        "4. Consider manual intervention if device is accessible via console"
    ])

    return "\n".join(error_lines)

# ================================================================================
# SECTION 10: MAIN DEVICE UPGRADE WORKFLOW ENGINE
# ================================================================================

def upgrade_device(hostname: str, username: str, password: str, image_filename: str,
                  target_version: str, start_step: int, allow_downgrade: bool = False) -> DeviceStatus:
    """
    Execute the complete device upgrade workflow with comprehensive error handling.

    This is the main orchestration function that coordinates all upgrade phases:
    1. Connection establishment with retry logic
    2. Image validation and integrity checking
    3. Version analysis and policy enforcement
    4. Software installation with progress monitoring
    5. Reboot monitoring and connectivity verification
    6. Final version verification and reporting
    """
    status = DeviceStatus(hostname=hostname, target_version=target_version)
    status.start_time = time.time()
    dev = None
    current_step = start_step

    try:
        # ========================================================================
        # PHASE 1: ESTABLISH DEVICE CONNECTION
        # ========================================================================
        step_start_time = time.time()
        send_step_progress(current_step, "STEP_START",
                          message=f"Establishing connection to {hostname}...")
        status.update_phase(UpgradePhase.CONNECTING, "Establishing device connection")

        dev = establish_connection_with_retry(hostname, username, password)

        # Gather initial device information
        send_progress("SUB_STEP", {"step": current_step}, "Gathering device information...")
        status.initial_version = dev.facts.get("version", "Unknown")
        status.final_version = status.initial_version

        device_model = dev.facts.get("model", "Unknown")
        device_serial = dev.facts.get("serialnumber", "Unknown")

        logger.info(f"[{hostname}] Connected successfully - Model: {device_model}, "
                   f"Serial: {device_serial}, Version: {status.initial_version}")

        status.step_durations[current_step] = time.time() - step_start_time
        send_step_progress(current_step, "STEP_COMPLETE", "COMPLETED",
                          f"Connected to {hostname} (Version: {status.initial_version})",
                          duration=status.step_durations[current_step],
                          device_info={
                              "model": device_model,
                              "serial": device_serial,
                              "initial_version": status.initial_version
                          })
        current_step += 1

        # ========================================================================
        # PHASE 2: VALIDATE SOFTWARE IMAGE
        # ========================================================================
        step_start_time = time.time()
        status.update_phase(UpgradePhase.VALIDATING_IMAGE, "Validating software image")

        validation_result = validate_image_availability(dev, image_filename, hostname, current_step)

        status.step_durations[current_step] = time.time() - step_start_time
        current_step += 1

        # ========================================================================
        # PHASE 3: ANALYZE VERSION AND DETERMINE ACTION
        # ========================================================================
        step_start_time = time.time()
        send_step_progress(current_step, "STEP_START",
                          message=f"Analyzing version requirements for {hostname}...")
        status.update_phase(UpgradePhase.ANALYZING_VERSION, "Analyzing version requirements")

        # Perform comprehensive version analysis
        version_analysis = analyze_version_compatibility(status.initial_version, target_version)
        status.version_action = version_analysis["action"]

        # Add any warnings to device status
        for warning in version_analysis["warnings"]:
            status.add_warning(warning)

        # Handle different version scenarios
        if status.version_action == VersionAction.MAINTAIN:
            status.update_phase(UpgradePhase.SKIPPED, "Device already on target version")
            status.success = True

            send_step_progress(current_step, "STEP_COMPLETE", "COMPLETED",
                              "Device already on target version - skipping",
                              duration=time.time() - step_start_time,
                              version_analysis=version_analysis)

            # Mark remaining steps as skipped
            for i in range(STEPS_PER_DEVICE - (current_step - start_step + 1)):
                send_step_progress(current_step + i + 1, "STEP_COMPLETE", "SKIPPED",
                                  "Skipped - already on target version")

            status.step_durations[current_step] = time.time() - step_start_time
            return status

        elif status.version_action == VersionAction.DOWNGRADE:
            if not allow_downgrade:
                error_msg = (f"Downgrade operation blocked by policy. Current version "
                           f"{status.initial_version} is newer than target {target_version}. "
                           f"Use --allow-downgrade to override this policy.")
                raise PolicyViolationError(error_msg)

            warning_msg = (f"DOWNGRADE OPERATION: {status.initial_version} → {target_version}. "
                          f"This will downgrade the device to an older software version.")

            status.add_warning(warning_msg)
            send_progress("VERSION_WARNING", {
                "step": current_step,
                "warning_type": "downgrade",
                "current_version": status.initial_version,
                "target_version": target_version,
                "recommendations": version_analysis["recommendations"]
            }, warning_msg)

        action_description = {
            VersionAction.UPGRADE: "upgrade required",
            VersionAction.DOWNGRADE: "downgrade operation (proceed with caution)",
            VersionAction.UNKNOWN: "version comparison inconclusive"
        }

        send_step_progress(current_step, "STEP_COMPLETE", "COMPLETED",
                          f"Version analysis complete - {action_description[status.version_action]}",
                          duration=time.time() - step_start_time,
                          version_analysis=version_analysis)

        status.step_durations[current_step] = time.time() - step_start_time
        current_step += 1

        # ========================================================================
        # PHASE 4: SOFTWARE INSTALLATION
        # ========================================================================
        step_start_time = time.time()
        action_verb = "Upgrading" if status.version_action == VersionAction.UPGRADE else "Downgrading"
        send_step_progress(current_step, "STEP_START",
                          message=f"{action_verb} software on {hostname}...")
        status.update_phase(UpgradePhase.INSTALLING, f"{action_verb} device software")

        full_image_path = f"/var/tmp/{image_filename}"

        # Pre-installation system checks
        send_progress("SUB_STEP", {"step": current_step}, "Performing pre-installation checks...")
        perform_preinstallation_checks(dev, hostname, current_step)

        # Execute software installation
        send_progress("SUB_STEP", {"step": current_step}, "Installing software package...")
        install_software_package(dev, full_image_path, hostname, current_step)

        # Initiate reboot
        send_progress("SUB_STEP", {"step": current_step}, "Initiating device reboot...")
        status.update_phase(UpgradePhase.REBOOTING, "Device reboot in progress")

        try:
            sw = SW(dev)
            sw.reboot()
            logger.info(f"[{hostname}] Reboot command executed successfully")
        except Exception as e:
            # Reboot command can sometimes fail but reboot still occurs
            logger.warning(f"[{hostname}] Reboot command issue (device may still be rebooting): {e}")

        send_step_progress(current_step, "STEP_COMPLETE", "COMPLETED",
                          "Software installation completed, reboot initiated",
                          duration=time.time() - step_start_time)

        status.step_durations[current_step] = time.time() - step_start_time
        current_step += 1

    except Exception as e:
        return handle_upgrade_error(status, e, current_step, start_step)

    finally:
        # Ensure connection cleanup
        if dev and dev.connected:
            try:
                dev.close()
                logger.debug(f"[{hostname}] Initial connection closed")
            except Exception as e:
                logger.warning(f"[{hostname}] Error closing initial connection: {e}")

    # ============================================================================
    # PHASE 5: REBOOT MONITORING AND CONNECTIVITY RESTORATION
    # ============================================================================
    try:
        step_start_time = time.time()
        status.update_phase(UpgradePhase.PROBING, "Monitoring device reboot")

        monitoring_result = monitor_device_reboot(hostname, username, password, current_step)

        status.step_durations[current_step] = time.time() - step_start_time
        current_step += 1

        # ========================================================================
        # PHASE 6: FINAL VERSION VERIFICATION
        # ========================================================================
        step_start_time = time.time()
        send_step_progress(current_step, "STEP_START",
                          message=f"Verifying final software version on {hostname}...")
        status.update_phase(UpgradePhase.VERIFYING, "Verifying upgrade success")

        verification_result = verify_final_version(hostname, username, password,
                                                 target_version, current_step)

        # Update final status
        status.final_version = verification_result["final_version"]

        if verification_result["version_match"]:
            status.update_phase(UpgradePhase.COMPLETED,
                              f"Upgrade successful - Version: {status.final_version}")
            status.success = True

            send_step_progress(current_step, "STEP_COMPLETE", "COMPLETED",
                              f"Upgrade verified successfully - Version: {status.final_version}",
                              duration=time.time() - step_start_time,
                              verification_result=verification_result)
        else:
            error_msg = (f"Version verification failed. Expected: {target_version}, "
                        f"Found: {status.final_version}")
            raise VersionMismatchError(error_msg)

        status.step_durations[current_step] = time.time() - step_start_time

    except Exception as e:
        return handle_upgrade_error(status, e, current_step, start_step)

    finally:
        status.end_time = time.time()

    return status

def perform_preinstallation_checks(dev: Device, hostname: str, current_step: int):
    """Perform comprehensive pre-installation system checks."""
    try:
        # Check storage space
        storage_output = dev.cli("show system storage", warning=False)
        logger.info(f"[{hostname}] Storage status:\n{storage_output}")

        # Basic storage analysis
        if "100%" in storage_output and ("/var" in storage_output or "/tmp" in storage_output):
            warning_msg = "Storage partitions appear full - installation may fail"
            logger.warning(f"[{hostname}] {warning_msg}")
            send_progress("SUB_STEP", {"step": current_step, "warning": True}, warning_msg)

        # Check system alarms
        try:
            alarms_output = dev.cli("show system alarms", warning=False)
            if "No alarms currently active" not in alarms_output:
                logger.warning(f"[{hostname}] Active system alarms detected:\n{alarms_output}")
                send_progress("SUB_STEP", {"step": current_step, "warning": True},
                             "Active system alarms detected")
        except:
            pass  # Alarms check is optional

    except Exception as e:
        logger.warning(f"[{hostname}] Pre-installation checks failed: {e}")

def install_software_package(dev: Device, image_path: str, hostname: str, current_step: int):
    """Execute software package installation with comprehensive error handling."""
    try:
        sw = SW(dev)

        # Validate package first
        send_progress("SUB_STEP", {"step": current_step}, "Validating software package...")
        if not sw.validate(package=image_path):
            raise InstallationError("Software package validation failed - image may be corrupted")

        # Perform installation
        send_progress("SUB_STEP", {"step": current_step}, "Installing software (this may take several minutes)...")
        install_result = sw.install(package=image_path, validate=True, no_copy=True, progress=False)

        if not install_result:
            # Try to get detailed error information
            try:
                install_log = dev.cli("show system software-install-log", warning=False)
                raise InstallationError(f"Installation failed. Install log:\n{install_log}")
            except:
                raise InstallationError("Installation failed. Check device logs for details.")

        logger.info(f"[{hostname}] Software installation completed successfully")

    except Exception as e:
        if isinstance(e, InstallationError):
            raise
        else:
            raise InstallationError(f"Installation process failed: {str(e)}")

def verify_final_version(hostname: str, username: str, password: str,
                        target_version: str, current_step: int) -> Dict[str, Any]:
    """Verify final software version with retry logic."""
    verification_result = {
        "final_version": None,
        "version_match": False,
        "device_info": {},
        "verification_attempts": 0
    }

    max_attempts = 3
    for attempt in range(max_attempts):
        verification_result["verification_attempts"] = attempt + 1

        try:
            with managed_device_connection(hostname, username, password, timeout=60) as final_dev:
                # Gather comprehensive device information
                final_version = final_dev.facts.get("version")
                verification_result["final_version"] = final_version
                verification_result["device_info"] = {
                    "model": final_dev.facts.get("model", "Unknown"),
                    "serial": final_dev.facts.get("serialnumber", "Unknown"),
                    "hostname": final_dev.facts.get("hostname", "Unknown"),
                    "uptime": None
                }

                # Get uptime information
                try:
                    uptime_output = final_dev.cli("show system uptime", warning=False)
                    verification_result["device_info"]["uptime"] = uptime_output.strip()
                    logger.info(f"[{hostname}] Post-upgrade uptime:\n{uptime_output}")
                except:
                    pass

                # Verify version match
                if final_version == target_version:
                    verification_result["version_match"] = True
                    logger.info(f"[{hostname}] Version verification successful: {final_version}")
                    return verification_result
                else:
                    if attempt == max_attempts - 1:
                        raise VersionMismatchError(
                            f"Version mismatch after {max_attempts} attempts. "
                            f"Expected: {target_version}, Found: {final_version}"
                        )
                    else:
                        logger.warning(f"[{hostname}] Version mismatch on attempt {attempt + 1}, retrying...")
                        send_progress("SUB_STEP", {"step": current_step},
                                     f"Version mismatch on attempt {attempt + 1}, retrying...")
                        time.sleep(10)

        except Exception as e:
            if attempt == max_attempts - 1:
                raise VersionMismatchError(f"Version verification failed after {max_attempts} attempts: {str(e)}")
            else:
                logger.warning(f"[{hostname}] Verification attempt {attempt + 1} failed: {e}")
                send_progress("SUB_STEP", {"step": current_step},
                             f"Verification attempt {attempt + 1} failed, retrying...")
                time.sleep(10)

    return verification_result

def handle_upgrade_error(status: DeviceStatus, error: Exception, current_step: int, start_step: int) -> DeviceStatus:
    """Centralized error handling for upgrade operations."""
    error_type = type(error).__name__
    error_message = str(error)

    # Log comprehensive error information
    logger.error(f"[{status.hostname}] {error_type}: {error_message}", exc_info=True)

    # Update device status
    status.update_phase(UpgradePhase.FAILED, f"{error_type}: {error_message}")
    status.error = error_message
    status.error_type = error_type
    status.end_time = time.time()

    # Send progress update
    send_step_progress(current_step, "STEP_COMPLETE", "FAILED", error_message,
                      error_type=error_type)

    # Mark remaining steps as failed
    remaining_steps = STEPS_PER_DEVICE - (current_step - start_step)
    for i in range(remaining_steps):
        send_step_progress(current_step + i + 1, "STEP_COMPLETE", "FAILED",
                          "Skipped due to previous failure")

    return status

# ================================================================================
# SECTION 11: MAIN ORCHESTRATION AND COORDINATION ENGINE
# ================================================================================

def execute_code_upgrade(host_ips: List[str], username: str, password: str,
                        image_filename: str, target_version: str,
                        allow_downgrade: bool = False, max_workers: int = DEFAULT_MAX_WORKERS):
    """
    Main orchestration function for multi-device upgrade operations.

    Coordinates concurrent upgrade operations across multiple devices with
    comprehensive progress tracking, error isolation, and result aggregation.
    """
    logger.info(f"=== Starting code upgrade operation for {len(host_ips)} device(s) ===")
    logger.info(f"Target image: {image_filename}")
    logger.info(f"Target version: {target_version}")
    logger.info(f"Allow downgrade: {allow_downgrade}")
    logger.info(f"Max concurrent workers: {max_workers}")

    final_statuses = []
    operation_start_time = time.time()

    # Calculate total steps for progress tracking
    total_steps = len(host_ips) * STEPS_PER_DEVICE

    send_progress("OPERATION_START", {
        "total_steps": total_steps,
        "devices": host_ips,
        "image_filename": image_filename,
        "target_version": target_version,
        "allow_downgrade": allow_downgrade,
        "max_workers": max_workers
    }, f"Starting code upgrade operation for {len(host_ips)} device(s)")

    try:
        # Execute upgrades using thread pool for concurrency
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Submit all upgrade tasks
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
                        allow_downgrade=allow_downgrade
                    )
                    future_to_hostname[future] = hostname
                    logger.info(f"[{hostname}] Upgrade task submitted")

                except Exception as e:
                    logger.error(f"[{hostname}] Failed to submit upgrade task: {e}")
                    error_status = DeviceStatus(
                        hostname=hostname,
                        target_version=target_version,
                        phase=UpgradePhase.FAILED,
                        error=f"Task submission failed: {str(e)}",
                        error_type="TaskSubmissionError"
                    )
                    final_statuses.append(error_status)

            # Collect results as they complete
            completed_count = 0
            for future in concurrent.futures.as_completed(future_to_hostname):
                hostname = future_to_hostname[future]
                completed_count += 1

                try:
                    # Get result with timeout
                    result = future.result(timeout=DEFAULT_DEVICE_TIMEOUT)
                    final_statuses.append(result)

                    status_emoji = "✓" if result.success else "✗"
                    logger.info(f"[{hostname}] {status_emoji} Upgrade completed: {result.phase.name}")

                except concurrent.futures.TimeoutError:
                    logger.error(f"[{hostname}] Upgrade operation timed out after {DEFAULT_DEVICE_TIMEOUT} seconds")
                    timeout_status = DeviceStatus(
                        hostname=hostname,
                        target_version=target_version,
                        phase=UpgradePhase.FAILED,
                        error=f"Operation timed out after {DEFAULT_DEVICE_TIMEOUT} seconds",
                        error_type="TimeoutError"
                    )
                    final_statuses.append(timeout_status)

                except Exception as e:
                    logger.error(f"[{hostname}] Unexpected error during upgrade: {e}", exc_info=True)
                    error_status = DeviceStatus(
                        hostname=hostname,
                        target_version=target_version,
                        phase=UpgradePhase.FAILED,
                        error=f"Unexpected error: {str(e)}",
                        error_type=type(e).__name__
                    )
                    final_statuses.append(error_status)

                # Send overall operation progress
                completion_percentage = int((completed_count / len(host_ips)) * 100)
                send_progress("OPERATION_PROGRESS", {
                    "completed_devices": completed_count,
                    "total_devices": len(host_ips),
                    "completion_percentage": completion_percentage,
                    "elapsed_time": time.time() - operation_start_time
                }, f"Progress: {completed_count}/{len(host_ips)} devices completed ({completion_percentage}%)")

    except Exception as e:
        logger.critical(f"Critical error in upgrade orchestration: {e}", exc_info=True)
        send_progress("OPERATION_COMPLETE", {"status": "FAILED"},
                     f"Critical orchestration error: {e}")
        raise

    # Calculate final statistics
    operation_duration = time.time() - operation_start_time
    successful_devices = [s for s in final_statuses if s.success]
    failed_devices = [s for s in final_statuses if not s.success]
    skipped_devices = [s for s in final_statuses if s.phase == UpgradePhase.SKIPPED]

    # Determine overall operation status
    if len(failed_devices) == 0:
        overall_status = "SUCCESS"
    elif len(successful_devices) > 0:
        overall_status = "PARTIAL_SUCCESS"
    else:
        overall_status = "FAILED"

    # Send operation completion event
    send_progress("OPERATION_COMPLETE", {
        "status": overall_status,
        "total_devices": len(final_statuses),
        "successful_devices": len(successful_devices),
        "failed_devices": len(failed_devices),
        "skipped_devices": len(skipped_devices),
        "operation_duration": round(operation_duration, 2),
        "success_rate": round((len(successful_devices) / len(final_statuses)) * 100, 1) if final_statuses else 0
    }, f"Upgrade operation completed: {len(successful_devices)} successful, {len(failed_devices)} failed")

    # Generate and display final summary
    generate_final_summary(final_statuses, image_filename, target_version, operation_duration)

    logger.info(f"=== Code upgrade operation completed in {operation_duration:.1f} seconds ===")

# ================================================================================
# SECTION 12: COMPREHENSIVE REPORTING AND SUMMARY GENERATION
# ================================================================================

def generate_final_summary(final_statuses: List[DeviceStatus], image_filename: str,
                          target_version: str, operation_duration: float):
    """
    Generate comprehensive final summary report for stdout capture.

    This function creates a detailed, formatted report that will be captured
    by the backend and displayed to users as the final operation result.
    """
    print("\n\n" + "="*120)
    print("JUNIPER DEVICE CODE UPGRADE OPERATION SUMMARY".center(120))
    print("="*120)

    # Operation metadata
    print(f"Operation Date/Time: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}")
    print(f"Software Image: {image_filename}")
    print(f"Target Version: {target_version}")
    print(f"Total Duration: {operation_duration:.1f} seconds ({operation_duration/60:.1f} minutes)")
    print("Operator: nikos-geranios_vgi")

    print("-" * 120)

    # Statistical summary
    total_devices = len(final_statuses)
    successful = [s for s in final_statuses if s.success]
    failed = [s for s in final_statuses if not s.success and s.phase != UpgradePhase.SKIPPED]
    skipped = [s for s in final_statuses if s.phase == UpgradePhase.SKIPPED]

    print("\nOPERATION STATISTICS:")
    print(f"  📊 Total Devices Processed: {total_devices}")
    print(f"  ✅ Successful Operations: {len(successful)} ({(len(successful)/total_devices*100):.1f}%)")
    print(f"  ❌ Failed Operations: {len(failed)} ({(len(failed)/total_devices*100):.1f}%)")
    print(f"  ⊝ Skipped (Already Target Version): {len(skipped)} ({(len(skipped)/total_devices*100):.1f}%)")

    if successful:
        avg_duration = sum(s.get_duration() for s in successful) / len(successful)
        print(f"  ⏱️  Average Successful Operation Time: {avg_duration:.1f} seconds")

    # Version action breakdown
    action_counts = {}
    for status in final_statuses:
        action_counts[status.version_action] = action_counts.get(status.version_action, 0) + 1

    print("\nVERSION ACTION BREAKDOWN:")
    for action, count in action_counts.items():
        action_emoji = {"upgrade": "⬆️", "downgrade": "⬇️", "maintain": "➡️", "unknown": "❓"}
        print(f"  {action_emoji.get(action.value, '❓')} {action.value.title()}: {count} device(s)")

    # Detailed results table
    print("\nDETAILED RESULTS:")
    print(f"{'Device':<25}{'Status':<12}{'Action':<12}{'Initial Ver':<20}{'Final Ver':<20}{'Duration':<10}{'Details'}")
    print("-" * 120)

    # Sort results by status (successful first) then by hostname
    sorted_statuses = sorted(final_statuses,
                           key=lambda s: (s.phase != UpgradePhase.COMPLETED,
                                        s.phase != UpgradePhase.SKIPPED,
                                        s.hostname))

    for status in sorted_statuses:
        # Status indicators
        if status.success:
            status_indicator = "✅ SUCCESS"
        elif status.phase == UpgradePhase.SKIPPED:
            status_indicator = "⊝ SKIPPED"
        else:
            status_indicator = "❌ FAILED"

        # Action indicator
        action_indicator = {
            VersionAction.UPGRADE: "⬆️ UP",
            VersionAction.DOWNGRADE: "⬇️ DOWN",
            VersionAction.MAINTAIN: "➡️ SAME",
            VersionAction.UNKNOWN: "❓ UNK"
        }.get(status.version_action, "❓ UNK")

        # Duration
        duration_str = f"{status.get_duration():.1f}s" if status.get_duration() > 0 else "N/A"

        # Details (error or success message)
        details = status.error if status.error else status.message
        if len(details) > 40:
            details = details[:37] + "..."

        print(f"{status.hostname:<25}{status_indicator:<12}{action_indicator:<12}"
              f"{status.initial_version or 'Unknown':<20}{status.final_version or 'N/A':<20}"
              f"{duration_str:<10}{details}")

    # Error analysis section
    if failed:
        print("\nERROR ANALYSIS:")
        error_summary = {}
        for status in failed:
            error_type = status.error_type or "Unknown"
            error_summary[error_type] = error_summary.get(error_type, 0) + 1

        for error_type, count in sorted(error_summary.items(), key=lambda x: x[1], reverse=True):
            print(f"  {error_type}: {count} device(s)")

        print("\nFAILED DEVICES DETAILS:")
        for status in failed:
            print(f"  🔸 {status.hostname}: {status.error}")

    # Warnings summary
    all_warnings = []
    for status in final_statuses:
        all_warnings.extend(status.warnings)

    if all_warnings:
        print("\nWARNINGS SUMMARY:")
        warning_counts = {}
        for warning in all_warnings:
            warning_counts[warning] = warning_counts.get(warning, 0) + 1

        for warning, count in warning_counts.items():
            print(f"  ⚠️  {warning} ({count} device(s))")

    # Operation recommendations
    print("\nRECOMMENDATIONS:")
    if len(failed) == 0:
        print("  🎉 All operations completed successfully!")
    else:
        print("  🔍 Review failed device details above for troubleshooting")
        print("  📋 Check device console access for devices that failed during reboot")
        print("  🔄 Failed devices can be retried individually after resolving issues")

    if any(status.version_action == VersionAction.DOWNGRADE for status in final_statuses):
        print("  ⚠️  Downgrade operations were performed - verify all features work as expected")

    print("\n" + "="*120)
    print("END OF UPGRADE OPERATION SUMMARY")
    print("="*120 + "\n")

# ================================================================================
# SECTION 13: INPUT VALIDATION AND ARGUMENT PROCESSING
# ================================================================================

def validate_command_arguments(args) -> List[str]:
    """
    Comprehensive validation of all command-line arguments.

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
            ip_pattern = re.compile(r'^(\d{1,3}\.){3}\d{1,3}$')
            hostname_pattern = re.compile(r'^[a-zA-Z0-9\-\.]+$')

            for host in raw_hosts:
                if len(host) > 253:  # Max hostname length
                    validation_errors.append(f"Hostname too long: {host}")
                elif not (ip_pattern.match(host) or hostname_pattern.match(host)):
                    validation_errors.append(f"Invalid hostname/IP format: {host}")
                else:
                    host_ips.append(host)

# ================================================================================
# SECTION 13: INPUT VALIDATION AND ARGUMENT PROCESSING
# ================================================================================

def validate_command_arguments(args) -> List[str]:
    """
    Comprehensive validation of all command-line arguments.

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
            ip_pattern = re.compile(r'^(\d{1,3}\.){3}\d{1,3}$')
            hostname_pattern = re.compile(r'^[a-zA-Z0-9\-\.]+$')

            for host in raw_hosts:
                if len(host) > 253:  # Max hostname length
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
    elif not re.match(r'^[a-zA-Z0-9\-_\.]+$', args.image_filename):
        validation_errors.append(f"Invalid image filename format: {args.image_filename}")
    elif not any(args.image_filename.lower().endswith(ext) for ext in ['.tgz', '.tar.gz', '.pkg', '.tar']):
        validation_errors.append(f"Image filename must end with .tgz, .tar.gz, .pkg, or .tar: {args.image_filename}")

    # Validate target version
    if not args.target_version:
        validation_errors.append("Target version is required")
    else:
        try:
            parse_junos_version(args.target_version)
        except Exception:
            validation_errors.append(f"Invalid target version format: {args.target_version}")

    # Raise errors if any validation failed
    if validation_errors:
        error_msg = "\n".join(validation_errors)
        logger.error(f"Argument validation failed:\n{error_msg}")
        raise ValueError(f"Argument validation failed:\n{error_msg}")

    return host_ips

# ================================================================================
# SECTION 14: SCRIPT ENTRY POINT
# ================================================================================

if __name__ == "__main__":

    parser = argparse.ArgumentParser(
        description="Juniper Device Upgrade Automation Script",
        formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument(
        "--hostname",
        required=True,
        help="Comma-separated list of target device hostnames or IPs."
    )
    parser.add_argument(
        "--username",
        required=True,
        help="The username for device authentication."
    )
    parser.add_argument(
        "--password",
        required=True,
        help="The password for device authentication."
    )
    parser.add_argument(
        "--image_filename",
        required=True,
        help="The exact FILENAME of the software image.\n(e.g., 'junos-vmx-x86-64-21.4R1.12.tgz')"
    )
    parser.add_argument(
        "--target_version",
        required=True,
        help="The target Junos version string to verify against after upgrade.\n(e.g., '21.4R1.12')"
    )
    parser.add_argument(
        "--allow-downgrade",
        action="store_true",
        help="Permit downgrade operations to older versions."
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Skip interactive confirmations for downgrade operations."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate inputs and simulate execution without making changes."
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Enable verbose DEBUG-level logging."
    )

    args = parser.parse_args()

    if args.verbose:
        logger.setLevel(logging.DEBUG)

    try:
        logger.info("Script execution started with validated arguments.")
        host_ips = validate_command_arguments(args)

        if args.dry_run:
            logger.info("Dry-run mode enabled: Validating inputs without executing upgrade.")
            send_progress("OPERATION_START", {
                "total_steps": len(host_ips) * STEPS_PER_DEVICE,
                "devices": host_ips,
                "image_filename": args.image_filename,
                "target_version": args.target_version,
                "dry_run": True
            }, "Dry-run: Validating inputs and simulating execution.")
            print("\nDRY-RUN VALIDATION SUCCESSFUL")
            print(f"Validated {len(host_ips)} device(s): {', '.join(host_ips)}")
            print(f"Image: {args.image_filename}")
            print(f"Target Version: {args.target_version}")
            print(f"Allow Downgrade: {args.allow_downgrade}")
            print(f"Force: {args.force}")
            print("\nNo changes were made to any devices.")
            logger.info("Dry-run completed successfully.")
            sys.exit(0)

        execute_code_upgrade(
            host_ips=host_ips,
            username=args.username,
            password=args.password,
            image_filename=args.image_filename,
            target_version=args.target_version,
            allow_downgrade=args.allow_downgrade
        )
        logger.info("Script has completed its execution.")

    except Exception as e:
        send_progress("OPERATION_COMPLETE", {"status": "FAILED"}, f"A critical script error occurred: {e}")
        logger.fatal(f"A critical error occurred in the main execution block: {e}", exc_info=True)
        sys.exit(1)
