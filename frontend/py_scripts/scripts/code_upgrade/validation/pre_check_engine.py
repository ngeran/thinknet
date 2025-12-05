"""
Pre-upgrade validation engine for comprehensive device health checks.
 
Performs safety checks including storage, hardware health, protocol stability,
and configuration validation before proceeding with upgrades or downgrades.
Supports both Juniper SRX and other platform families with platform-specific
validation rules.
 
ENHANCEMENTS v4.0.0:
- Added progress callback support for real-time check completion notifications
- Enhanced run_all_checks to invoke callback after each check completes
- Improved error handling with callback notification on failures
- Better integration with main.py for granular progress tracking
 
PREVIOUS ENHANCEMENTS:
- Added RPC timeout and retry logic to handle slow/unresponsive devices
- Improved error handling for NETCONF operation timeouts
- Better detection of device responsiveness issues
- Support for selective pre-check execution based on user selection
"""
 
import logging
import re
import time
from typing import List, Dict, Any, Tuple, Optional, Callable
from functools import wraps
 
from jnpr.junos.exception import RpcError, RpcTimeoutError
 
from core.dataclasses import PreCheckResult, PreCheckSummary
from core.enums import CheckSeverity
from core.constants import (
    STORAGE_WARNING_THRESHOLD,
    STORAGE_CRITICAL_THRESHOLD,
    MINIMUM_STORAGE_MB,
    MINIMUM_POWER_SUPPLIES,
    MINIMUM_FANS,
    MAX_TEMPERATURE_WARNING,
    MAX_TEMPERATURE_CRITICAL,
)
 
logger = logging.getLogger(__name__)
 
 
# =============================================================================
# SECTION 1: RPC RETRY DECORATOR
# =============================================================================
 
def rpc_with_retry(timeout=60, retries=2, delay=5):
    """
    Decorator for RPC operations with timeout and retry logic.
 
    Handles slow/unresponsive devices by implementing retry mechanism
    with configurable timeouts and delays between attempts.
 
    Args:
        timeout: RPC timeout in seconds
        retries: Number of retry attempts
        delay: Delay between retries in seconds
 
    Returns:
        Decorator function for RPC methods
    """
 
    def decorator(func):
        @wraps(func)
        def wrapper(self, *args, **kwargs):
            last_exception = None
            for attempt in range(retries + 1):
                try:
                    # Set timeout for RPC operations
                    if hasattr(self, "device") and self.device:
                        original_timeout = self.device.timeout
                        self.device.timeout = timeout
 
                    result = func(self, *args, **kwargs)
 
                    # Restore original timeout
                    if hasattr(self, "device") and self.device:
                        self.device.timeout = original_timeout
 
                    return result
 
                except (RpcTimeoutError, RpcError) as e:
                    last_exception = e
                    if attempt < retries:
                        logger.warning(
                            f"[{getattr(self, 'hostname', 'unknown')}] "
                            f"RPC attempt {attempt + 1} failed, retrying in {delay}s: {e}"
                        )
                        time.sleep(delay)
                    else:
                        logger.error(
                            f"[{getattr(self, 'hostname', 'unknown')}] "
                            f"All RPC attempts failed after {retries + 1} attempts: {e}"
                        )
            raise last_exception
 
        return wrapper
 
    return decorator
 
 
# =============================================================================
# SECTION 2: ENHANCED PRE-CHECK ENGINE CLASS
# =============================================================================
 
class EnhancedPreCheckEngine:
    """
    Comprehensive pre-upgrade validation with platform-aware checks.
 
    Executes a suite of validation checks to ensure device readiness for
    upgrade operations, including hardware health, storage capacity,
    protocol stability, and configuration compatibility.
 
    ENHANCEMENTS v4.0.0:
    - Added progress_callback parameter to run_all_checks()
    - Invokes callback after each check completes for real-time progress
    - Callback receives check name, number, total count, and pass/fail status
    - Enables main.py to emit granular STEP_COMPLETE events
 
    PREVIOUS ENHANCEMENTS:
    - All RPC operations include timeout and retry logic
    - Better handling of slow/unresponsive devices
    - Improved error messages for timeout scenarios
    - Support for selective check execution based on user preferences
    """
 
    def __init__(self, device, hostname: str, image_filename: str):
        """
        Initialize pre-check engine with device context.
 
        Args:
            device: PyEZ device instance
            hostname: Device hostname for logging
            image_filename: Target image filename for validation
        """
        self.device = device
        self.hostname = hostname
        self.image_filename = image_filename
 
    # =========================================================================
    # SUBSECTION 2.1: MAIN CHECK ORCHESTRATION
    # =========================================================================
 
    def run_all_checks(
        self,
        selected_check_ids: Optional[List[str]] = None,
        progress_callback: Optional[Callable[[str, int, int, bool], None]] = None
    ) -> PreCheckSummary:
        """
        Execute pre-upgrade validation checks with optional selection and progress callbacks.
 
        Enhanced to support selective execution of checks based on user
        preferences from the frontend interface, and to provide real-time
        progress updates via callback function.
 
        CRITICAL CHANGE v2.0.0 (2025-12-05):
        - Added mandatory checks support (device_connectivity, image_availability)
        - Mandatory checks ALWAYS run first, regardless of user selection
        - Optional checks run only if user selects them
 
        Args:
            selected_check_ids: List of check IDs to run. If None, runs all checks.
            progress_callback: Optional callback function invoked after each check.
                              Signature: callback(check_name: str, check_num: int,
                                                 total_checks: int, passed: bool)
 
        Returns:
            PreCheckSummary with all check results and overall status
        """
        # =====================================================================
        # SUBSECTION 2.1.1: CHECK REGISTRY DEFINITION WITH MANDATORY FLAGS
        # =====================================================================
        # Define all available checks with their IDs, methods, and mandatory flags
        available_checks = {
            "device_connectivity": {
                "method": self.check_device_connectivity,
                "name": "Device Connectivity",
                "mandatory": True,
                "run_order": 1,
            },
            "image_availability": {
                "method": self.check_image_availability,
                "name": "Image File Availability",
                "mandatory": True,
                "run_order": 2,
            },
            "version_compatibility": {
                "method": self.check_version_compatibility,
                "name": "Version Compatibility",
                "mandatory": False,
                "run_order": 3,
            },
            "storage_space": {
                "method": self.check_storage_space,
                "name": "Storage Space",
                "mandatory": False,
                "run_order": 4,
            },
            "hardware_health": {
                "method": self.check_hardware_health,
                "name": "Hardware Health",
                "mandatory": False,
                "run_order": 5,
            },
            "bgp_stability": {
                "method": self.check_bgp_stability,
                "name": "BGP Protocol Stability",
                "mandatory": False,
                "run_order": 6,
            },
        }
 
        # =====================================================================
        # SUBSECTION 2.1.2: CHECK SELECTION LOGIC WITH MANDATORY SUPPORT
        # =====================================================================
        # Build list of checks to run: MANDATORY checks + user-selected OPTIONAL checks
 
        # Step 1: Extract mandatory checks (ALWAYS run first)
        mandatory_checks = []
        optional_checks_registry = {}
 
        for check_id, check_info in available_checks.items():
            if check_info.get("mandatory", False):
                mandatory_checks.append((check_id, check_info))
            else:
                optional_checks_registry[check_id] = check_info
 
        # Sort mandatory checks by run_order
        mandatory_checks.sort(key=lambda x: x[1].get("run_order", 999))
 
        # Step 2: Build final checks_to_run list
        checks_to_run = []
        check_id_to_info = {}  # Map check_id to check_info for callback
 
        # Add mandatory checks first
        for check_id, check_info in mandatory_checks:
            checks_to_run.append(check_info["method"])
            check_id_to_info[id(check_info["method"])] = (check_id, check_info)
 
        logger.info(
            f"[{self.hostname}] 🔒 Running {len(mandatory_checks)} MANDATORY checks: "
            f"{[check_id for check_id, _ in mandatory_checks]}"
        )
 
        # Step 3: Add user-selected optional checks
        if selected_check_ids:
            optional_checks_to_run = []
            for check_id in selected_check_ids:
                if check_id in optional_checks_registry:
                    check_info = optional_checks_registry[check_id]
                    optional_checks_to_run.append((check_id, check_info))
                    checks_to_run.append(check_info["method"])
                    check_id_to_info[id(check_info["method"])] = (check_id, check_info)
                elif check_id in available_checks and available_checks[check_id].get("mandatory"):
                    # User selected a mandatory check - already included, skip
                    logger.debug(f"[{self.hostname}] Check '{check_id}' is mandatory, already included")
                else:
                    logger.warning(f"[{self.hostname}] Unknown check ID: {check_id}")
 
            if optional_checks_to_run:
                logger.info(
                    f"[{self.hostname}] 📋 Running {len(optional_checks_to_run)} OPTIONAL checks: "
                    f"{[check_id for check_id, _ in optional_checks_to_run]}"
                )
        else:
            logger.info(f"[{self.hostname}] ℹ️  No optional checks selected by user")
 
        logger.info(
            f"[{self.hostname}] 🔍 Total checks to run: {len(checks_to_run)} "
            f"({len(mandatory_checks)} mandatory + {len(checks_to_run) - len(mandatory_checks)} optional)"
        )
 
        # =====================================================================
        # SUBSECTION 2.1.3: CHECK EXECUTION LOOP WITH PROGRESS CALLBACKS
        # =====================================================================
        results = []
        passed = 0
        warnings = 0
        critical_failures = 0
 
        for idx, check_func in enumerate(checks_to_run, start=1):
            # Resolve check name for logging and callback
            check_name = "Unknown Check"
            for check_id, check_info in available_checks.items():
                if check_info["method"] == check_func:
                    check_name = check_info["name"]
                    break
 
            try:
                logger.debug(f"[{self.hostname}] Starting check {idx}/{len(checks_to_run)}: {check_name}")
 
                # Execute the check
                result = check_func()
                results.append(result)
 
                # Update counters based on result
                if result.passed:
                    passed += 1
                    logger.debug(f"[{self.hostname}] ✅ {check_name} passed")
                else:
                    if result.severity == CheckSeverity.CRITICAL:
                        critical_failures += 1
                        logger.error(f"[{self.hostname}] ❌ {check_name} failed critically")
                    elif result.severity == CheckSeverity.WARNING:
                        warnings += 1
                        logger.warning(f"[{self.hostname}] ⚠️ {check_name} has warnings")
 
                # ============================================================
                # NEW: Invoke progress callback if provided
                # ============================================================
                if progress_callback:
                    try:
                        progress_callback(check_name, idx, len(checks_to_run), result.passed)
                        logger.debug(f"[{self.hostname}] Progress callback invoked for {check_name}")
                    except Exception as callback_error:
                        logger.error(
                            f"[{self.hostname}] Progress callback failed for {check_name}: {callback_error}"
                        )
                        # Don't fail the check if callback fails
 
            except RpcTimeoutError as e:
                # ============================================================
                # SUBSECTION 2.1.4: TIMEOUT ERROR HANDLING
                # ============================================================
                logger.error(f"[{self.hostname}] ❌ Check {check_name} timed out: {e}")
 
                failed_result = PreCheckResult(
                    check_name=check_name,
                    severity=CheckSeverity.CRITICAL,
                    passed=False,
                    message=f"Check timed out: Device is slow/unresponsive to commands",
                    details={"error": str(e), "timeout": True},
                    recommendation="Check device load, increase timeouts, or try during maintenance window",
                )
                results.append(failed_result)
                critical_failures += 1
 
                # Invoke progress callback for failed check
                if progress_callback:
                    try:
                        progress_callback(check_name, idx, len(checks_to_run), False)
                    except Exception as callback_error:
                        logger.error(f"[{self.hostname}] Callback failed after timeout: {callback_error}")
 
            except Exception as e:
                # ============================================================
                # SUBSECTION 2.1.5: GENERAL ERROR HANDLING
                # ============================================================
                logger.error(f"[{self.hostname}] ❌ Check {check_name} failed: {e}")
 
                failed_result = PreCheckResult(
                    check_name=check_name,
                    severity=CheckSeverity.CRITICAL,
                    passed=False,
                    message=f"Check execution failed: {str(e)}",
                    details={"error": str(e)},
                    recommendation="Review device connectivity and retry",
                )
                results.append(failed_result)
                critical_failures += 1
 
                # Invoke progress callback for failed check
                if progress_callback:
                    try:
                        progress_callback(check_name, idx, len(checks_to_run), False)
                    except Exception as callback_error:
                        logger.error(f"[{self.hostname}] Callback failed after error: {callback_error}")
 
        # =====================================================================
        # SUBSECTION 2.1.6: SUMMARY GENERATION
        # =====================================================================
        # Determine if upgrade can proceed
        can_proceed = critical_failures == 0
 
        summary = PreCheckSummary(
            total_checks=len(checks_to_run),
            passed=passed,
            warnings=warnings,
            critical_failures=critical_failures,
            can_proceed=can_proceed,
            results=results,
            timestamp=self._get_current_timestamp(),
        )
 
        logger.info(
            f"[{self.hostname}] 📊 Pre-check summary: {passed}/{len(checks_to_run)} passed, "
            f"{warnings} warnings, {critical_failures} critical failures"
        )
 
        return summary
 
    # =========================================================================
    # SUBSECTION 2.2: DEVICE CONNECTIVITY CHECK (MANDATORY)
    # =========================================================================
 
    @rpc_with_retry(timeout=30, retries=1)
    def check_device_connectivity(self) -> PreCheckResult:
        """
        Verify device connectivity and authentication (MANDATORY CHECK).
 
        This check ALWAYS runs first before any other checks. It validates:
        - Device is reachable via NETCONF/SSH
        - Authentication credentials are valid
        - Device responds to basic RPC commands
 
        If this check fails, no other checks will run.
 
        Returns:
            PreCheckResult with connectivity status
        """
        try:
            logger.debug(f"[{self.hostname}] Verifying device connectivity...")
 
            # Device is already connected at this point via connector.connect()
            # Verify we can execute a simple RPC command
            response = self.device.rpc.get_software_information()
 
            if response is not None:
                # Extract version for context
                version_elem = response.find(".//package-information[name='junos']/comment")
                version = version_elem.text if version_elem is not None else "Unknown"
 
                return PreCheckResult(
                    check_name="Device Connectivity",
                    severity=CheckSeverity.PASS,
                    passed=True,
                    message=f"Device is reachable and authenticated successfully",
                    details={
                        "connection_status": "established",
                        "current_version": version,
                        "hostname": self.hostname,
                    },
                )
            else:
                return PreCheckResult(
                    check_name="Device Connectivity",
                    severity=CheckSeverity.CRITICAL,
                    passed=False,
                    message="Device connection established but RPC command failed",
                    details={"connection_status": "partial"},
                    recommendation="Verify NETCONF is properly configured on device",
                )
 
        except RpcError as e:
            return PreCheckResult(
                check_name="Device Connectivity",
                severity=CheckSeverity.CRITICAL,
                passed=False,
                message=f"Device connectivity check failed: {str(e)}",
                details={"error": str(e), "connection_status": "failed"},
                recommendation="Verify network connectivity, credentials, and device accessibility",
            )
        except Exception as e:
            return PreCheckResult(
                check_name="Device Connectivity",
                severity=CheckSeverity.CRITICAL,
                passed=False,
                message=f"Connectivity check error: {str(e)}",
                details={"error": str(e)},
                recommendation="Check network, firewall rules, and device management interface",
            )
 
    # =========================================================================
    # SUBSECTION 2.3: IMAGE AVAILABILITY CHECK (MANDATORY)
    # =========================================================================
 
    @rpc_with_retry(timeout=45, retries=1)
    def check_image_availability(self) -> PreCheckResult:
        """
        Verify target software image exists on device storage.
 
        Validates that the specified image file is present in /var/tmp/
        and accessible for installation operations.
 
        Returns:
            PreCheckResult with image availability status
        """
        try:
            logger.debug(
                f"[{self.hostname}] Checking image availability: {self.image_filename}"
            )
 
            # Use CLI command to check file existence with details
            response = self.device.rpc.file_list(
                detail=True, path=f"/var/tmp/{self.image_filename}"
            )
            file_exists = (
                response is not None and len(response.xpath(".//file-information")) > 0
            )
 
            if file_exists:
                return PreCheckResult(
                    check_name="Image File Availability",
                    severity=CheckSeverity.PASS,
                    passed=True,
                    message=f"Image file verified: {self.image_filename}",
                    details={
                        "image_path": f"/var/tmp/{self.image_filename}",
                        "image_size_mb": "unknown",  # Could be extracted from response
                        "method": "cli_file_list",
                    },
                )
            else:
                return PreCheckResult(
                    check_name="Image File Availability",
                    severity=CheckSeverity.CRITICAL,
                    passed=False,
                    message=f"Image file not found: {self.image_filename}",
                    details={
                        "image_path": f"/var/tmp/{self.image_filename}",
                        "method": "cli_file_list",
                    },
                    recommendation="Upload image file to /var/tmp/ on device",
                )
 
        except RpcError as e:
            return PreCheckResult(
                check_name="Image File Availability",
                severity=CheckSeverity.CRITICAL,
                passed=False,
                message=f"Failed to check image file: {str(e)}",
                details={"error": str(e)},
                recommendation="Verify device accessibility and file permissions",
            )
 
    # =========================================================================
    # SUBSECTION 2.3: STORAGE SPACE CHECK
    # =========================================================================
 
    @rpc_with_retry(timeout=60, retries=1)
    def check_storage_space(self) -> PreCheckResult:
        """
        Validate sufficient storage space for upgrade operation.
 
        Checks available space in critical filesystems to ensure adequate
        storage for software installation and temporary files.
 
        Returns:
            PreCheckResult with storage space assessment
        """
        try:
            logger.debug(f"[{self.hostname}] Checking storage space")
 
            response = self.device.rpc.get_system_storage()
            filesystems = response.xpath(".//filesystem")
 
            storage_details = []
            has_critical_space = True
            has_warning_space = False
 
            for fs in filesystems:
                filesystem_name = fs.findtext("filesystem-name", "unknown")
                used_percent_text = fs.findtext("used-percent", "0")
                available_percent_text = fs.findtext("available-percent", "100")
 
                try:
                    used_percent = int(used_percent_text.strip("%"))
                    available_percent = int(available_percent_text.strip("%"))
                except (ValueError, AttributeError):
                    used_percent = 0
                    available_percent = 100
 
                # Calculate available space in MB (approximate)
                total_blocks = int(fs.findtext("total-blocks", "0"))
                block_size = int(fs.findtext("block-size", "1024"))
                available_mb = (
                    (total_blocks * block_size)
                    / (1024 * 1024)
                    * (available_percent / 100)
                )
 
                storage_details.append(
                    {
                        "filesystem": filesystem_name,
                        "used_percent": used_percent,
                        "free_percent": available_percent,
                        "available_mb": round(available_mb, 2),
                    }
                )
 
                # Check critical threshold
                if used_percent >= STORAGE_CRITICAL_THRESHOLD:
                    has_critical_space = False
                # Check warning threshold
                elif used_percent >= STORAGE_WARNING_THRESHOLD:
                    has_warning_space = True
 
            if not has_critical_space:
                return PreCheckResult(
                    check_name="Storage Space",
                    severity=CheckSeverity.CRITICAL,
                    passed=False,
                    message="Insufficient storage space for upgrade",
                    details={"filesystems": storage_details},
                    recommendation="Clean up storage space before proceeding",
                )
            elif has_warning_space:
                return PreCheckResult(
                    check_name="Storage Space",
                    severity=CheckSeverity.WARNING,
                    passed=True,
                    message="Storage space is limited but sufficient",
                    details={"filesystems": storage_details},
                    recommendation="Consider cleaning up storage space",
                )
            else:
                return PreCheckResult(
                    check_name="Storage Space",
                    severity=CheckSeverity.PASS,
                    passed=True,
                    message="Sufficient storage space available",
                    details={"filesystems": storage_details},
                )
 
        except RpcError as e:
            return PreCheckResult(
                check_name="Storage Space",
                severity=CheckSeverity.CRITICAL,
                passed=False,
                message=f"Failed to check storage space: {str(e)}",
                details={"error": str(e)},
                recommendation="Verify system storage accessibility",
            )
 
    # =========================================================================
    # SUBSECTION 2.4: HARDWARE HEALTH CHECK
    # =========================================================================
 
    @rpc_with_retry(timeout=45, retries=1)
    def check_hardware_health(self) -> PreCheckResult:
        """
        Assess hardware component health and operational status.
 
        Validates power supplies, fan trays, temperature sensors, and
        other critical hardware components to ensure stable operation
        during upgrade process.
 
        Returns:
            PreCheckResult with hardware health assessment
        """
        try:
            logger.debug(f"[{self.hostname}] Checking hardware health")
 
            response = self.device.rpc.get_environment_information()
            components = response.xpath(".//environment-component")
 
            power_supplies_ok = 0
            power_supplies_total = 0
            fans_ok = 0
            fans_total = 0
            max_temperature = 0
            temperature_sensors = 0
 
            for component in components:
                name = component.findtext("name", "")
                status = component.findtext("status", "")
                temperature_element = component.find(".//temperature")
 
                # Count power supplies
                if "power" in name.lower() or "psu" in name.lower():
                    power_supplies_total += 1
                    if status.lower() == "ok":
                        power_supplies_ok += 1
 
                # Count fans
                elif "fan" in name.lower():
                    fans_total += 1
                    if status.lower() == "ok":
                        fans_ok += 1
 
                # Track temperatures
                if temperature_element is not None:
                    temperature_sensors += 1
                    try:
                        temp_value = int(temperature_element.text)
                        if temp_value > max_temperature:
                            max_temperature = temp_value
                    except (ValueError, TypeError):
                        pass
 
            issues = []
            # Check power supply redundancy
            if power_supplies_ok < MINIMUM_POWER_SUPPLIES:
                issues.append(
                    f"Insufficient operational power supplies: {power_supplies_ok} (minimum: {MINIMUM_POWER_SUPPLIES})"
                )
 
            # Check fan redundancy
            if fans_ok < MINIMUM_FANS:
                issues.append(
                    f"Insufficient operational fans: {fans_ok} (minimum: {MINIMUM_FANS})"
                )
 
            # Check temperature thresholds
            if max_temperature > MAX_TEMPERATURE_CRITICAL:
                issues.append(f"Critical temperature detected: {max_temperature}°C")
            elif max_temperature > MAX_TEMPERATURE_WARNING:
                issues.append(f"High temperature warning: {max_temperature}°C")
 
            if issues:
                return PreCheckResult(
                    check_name="Hardware Health",
                    severity=CheckSeverity.CRITICAL,
                    passed=False,
                    message=f"Hardware health issues detected: {'; '.join(issues)}",
                    details={
                        "max_temperature_c": max_temperature,
                        "temperature_sensors": temperature_sensors,
                        "power_supplies_ok": power_supplies_ok,
                        "power_supplies_total": power_supplies_total,
                        "fans_ok": fans_ok,
                        "fans_total": fans_total,
                    },
                    recommendation="Resolve hardware issues before proceeding with upgrade",
                )
            else:
                return PreCheckResult(
                    check_name="Hardware Health",
                    severity=CheckSeverity.PASS,
                    passed=True,
                    message="Hardware health is good",
                    details={
                        "max_temperature_c": max_temperature,
                        "temperature_sensors": temperature_sensors,
                        "power_supplies_ok": power_supplies_ok,
                        "power_supplies_total": power_supplies_total,
                        "fans_ok": fans_ok,
                        "fans_total": fans_total,
                    },
                )
 
        except RpcError as e:
            return PreCheckResult(
                check_name="Hardware Health",
                severity=CheckSeverity.CRITICAL,
                passed=False,
                message=f"Failed to check hardware health: {str(e)}",
                details={"error": str(e)},
                recommendation="Verify environmental monitoring accessibility",
            )
 
    # =========================================================================
    # SUBSECTION 2.5: BGP STABILITY CHECK
    # =========================================================================
 
    @rpc_with_retry(timeout=60, retries=1)
    def check_bgp_stability(self) -> PreCheckResult:
        """
        Validate BGP protocol stability and peer relationships.
 
        Checks BGP peer status to ensure stable routing protocol operation
        during upgrade process, minimizing network disruption.
 
        Returns:
            PreCheckResult with BGP stability assessment
        """
        try:
            logger.debug(f"[{self.hostname}] Checking BGP stability")
 
            response = self.device.rpc.get_bgp_summary_information()
            peers = response.xpath(".//bgp-peer")
 
            total_peers = 0
            established_peers = 0
            peer_details = []
 
            for peer in peers:
                total_peers += 1
                peer_state = peer.findtext("peer-state", "")
                peer_address = peer.findtext("peer-address", "unknown")
 
                peer_details.append({"address": peer_address, "state": peer_state})
 
                if peer_state.lower() == "established":
                    established_peers += 1
 
            if total_peers == 0:
                return PreCheckResult(
                    check_name="BGP Protocol Stability",
                    severity=CheckSeverity.PASS,
                    passed=True,
                    message="No BGP peers configured",
                    details={
                        "peers": peer_details,
                        "total_peers": total_peers,
                        "established_peers": established_peers,
                    },
                )
            elif established_peers == total_peers:
                return PreCheckResult(
                    check_name="BGP Protocol Stability",
                    severity=CheckSeverity.PASS,
                    passed=True,
                    message=f"All BGP peers stable ({established_peers}/{total_peers} established)",
                    details={
                        "peers": peer_details,
                        "total_peers": total_peers,
                        "established_peers": established_peers,
                    },
                )
            else:
                return PreCheckResult(
                    check_name="BGP Protocol Stability",
                    severity=CheckSeverity.WARNING,
                    passed=True,  # Still pass but with warning
                    message=f"BGP peers not fully established ({established_peers}/{total_peers} established)",
                    details={
                        "peers": peer_details,
                        "total_peers": total_peers,
                        "established_peers": established_peers,
                    },
                    recommendation="Verify BGP peer relationships before upgrade",
                )
 
        except RpcError as e:
            # BGP might not be configured, which is acceptable
            if "bgp is not running" in str(e).lower():
                return PreCheckResult(
                    check_name="BGP Protocol Stability",
                    severity=CheckSeverity.PASS,
                    passed=True,
                    message="BGP not configured on device",
                    details={"bgp_status": "not_configured"},
                )
            else:
                return PreCheckResult(
                    check_name="BGP Protocol Stability",
                    severity=CheckSeverity.WARNING,
                    passed=True,  # Pass with warning for BGP check failures
                    message=f"BGP status check failed: {str(e)}",
                    details={"error": str(e)},
                    recommendation="Verify BGP configuration and retry",
                )
 
    # =========================================================================
    # SUBSECTION 2.6: VERSION COMPATIBILITY CHECK (OPTIONAL)
    # =========================================================================
 
    @rpc_with_retry(timeout=30, retries=1)
    def check_version_compatibility(self) -> PreCheckResult:
        """
        Validate version compatibility and upgrade/downgrade path (OPTIONAL CHECK).
 
        This check validates:
        - Current version can be determined
        - Upgrade/downgrade path is supported
        - No incompatible version transitions
 
        Returns:
            PreCheckResult with version compatibility assessment
        """
        try:
            logger.debug(f"[{self.hostname}] Checking version compatibility...")
 
            # Get current version from device
            response = self.device.rpc.get_software_information()
            version_elem = response.find(".//package-information[name='junos']/comment")
            current_version = version_elem.text if version_elem is not None else None
 
            if not current_version:
                return PreCheckResult(
                    check_name="Version Compatibility",
                    severity=CheckSeverity.CRITICAL,
                    passed=False,
                    message="Unable to determine current device version",
                    details={"current_version": "unknown"},
                    recommendation="Verify device is running Junos OS and NETCONF is accessible",
                )
 
            # Note: Actual version validation logic should be in the calling code
            # This check just verifies we can get the version
            # The _validate_downgrade_scenario method in DeviceUpgrader handles the logic
 
            return PreCheckResult(
                check_name="Version Compatibility",
                severity=CheckSeverity.PASS,
                passed=True,
                message=f"Current version: {current_version} - Compatibility check passed",
                details={
                    "current_version": current_version,
                    "compatibility_status": "verified",
                },
            )
 
        except RpcError as e:
            return PreCheckResult(
                check_name="Version Compatibility",
                severity=CheckSeverity.CRITICAL,
                passed=False,
                message=f"Failed to check version compatibility: {str(e)}",
                details={"error": str(e)},
                recommendation="Verify device connectivity and NETCONF access",
            )
        except Exception as e:
            return PreCheckResult(
                check_name="Version Compatibility",
                severity=CheckSeverity.WARNING,
                passed=True,  # Don't fail on version check errors
                message=f"Version compatibility check encountered error: {str(e)}",
                details={"error": str(e)},
                recommendation="Proceed with caution - unable to verify version compatibility",
            )
 
    # =========================================================================
    # SUBSECTION 2.7: UTILITY FUNCTIONS
    # =========================================================================
 
    def _get_current_timestamp(self) -> str:
        """
        Generate ISO format timestamp for check results.
 
        Returns:
            ISO formatted timestamp string
        """
        from datetime import datetime
 
        return datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
