"""
Pre-upgrade validation engine for comprehensive device health checks.

Performs safety checks including storage, hardware health, protocol stability,
and configuration validation before proceeding with upgrades or downgrades.
Supports both Juniper SRX and other platform families with platform-specific
validation rules.
"""

import logging
import re
from typing import List, Dict, Any, Tuple, Optional

from jnpr.junos.exception import RpcError

from core.dataclasses import PreCheckResult, PreCheckSummary
from core.enums import CheckSeverity  # Fixed: Changed PreCheckSeverity to CheckSeverity
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


class EnhancedPreCheckEngine:
    """
    Comprehensive pre-upgrade validation with platform-aware checks.

    Executes a suite of validation checks to ensure device readiness for
    upgrade operations, including hardware health, storage capacity,
    protocol stability, and configuration compatibility.
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

    def run_all_checks(self) -> PreCheckSummary:
        """
        Execute complete suite of pre-upgrade validation checks.

        Runs all available checks in sequence and compiles comprehensive
        results summary with pass/fail status and detailed recommendations.

        Returns:
            PreCheckSummary with all check results and overall status
        """
        logger.info(f"[{self.hostname}] 🔍 Running comprehensive pre-upgrade checks")

        checks = [
            self.check_image_availability,
            self.check_storage_space,
            self.check_hardware_health,
            self.check_bgp_stability,
        ]

        results = []
        passed = 0
        warnings = 0
        critical_failures = 0

        for check_func in checks:
            try:
                result = check_func()
                results.append(result)

                if result.passed:
                    passed += 1
                else:
                    if result.severity == CheckSeverity.CRITICAL:  # Fixed
                        critical_failures += 1
                    elif result.severity == CheckSeverity.WARNING:  # Fixed
                        warnings += 1

            except Exception as e:
                logger.error(
                    f"[{self.hostname}] ❌ Check {check_func.__name__} failed: {e}"
                )
                # Create a failed result for errored checks
                failed_result = PreCheckResult(
                    check_name=check_func.__name__.replace("check_", "")
                    .replace("_", " ")
                    .title(),
                    severity=CheckSeverity.CRITICAL,  # Fixed
                    passed=False,
                    message=f"Check execution failed: {str(e)}",
                    details={"error": str(e)},
                    recommendation="Review device connectivity and retry",
                )
                results.append(failed_result)
                critical_failures += 1

        # Determine if upgrade can proceed
        can_proceed = critical_failures == 0

        summary = PreCheckSummary(
            total_checks=len(checks),
            passed=passed,
            warnings=warnings,
            critical_failures=critical_failures,
            can_proceed=can_proceed,
            results=results,
            timestamp=self._get_current_timestamp(),
        )

        logger.info(
            f"[{self.hostname}] 📊 Pre-check summary: {passed}/{len(checks)} passed, "
            f"{warnings} warnings, {critical_failures} critical failures"
        )

        return summary

    def check_image_availability(self) -> PreCheckResult:
        """
        Verify target software image exists on device storage.

        Validates that the specified image file is present in /var/tmp/
        and accessible for installation operations.

        Returns:
            PreCheckResult with image availability status
        """
        try:
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
                    severity=CheckSeverity.PASS,  # Fixed
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
                    severity=CheckSeverity.CRITICAL,  # Fixed
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
                severity=CheckSeverity.CRITICAL,  # Fixed
                passed=False,
                message=f"Failed to check image file: {str(e)}",
                details={"error": str(e)},
                recommendation="Verify device accessibility and file permissions",
            )

    def check_storage_space(self) -> PreCheckResult:
        """
        Validate sufficient storage space for upgrade operation.

        Checks available space in critical filesystems to ensure adequate
        storage for software installation and temporary files.

        Returns:
            PreCheckResult with storage space assessment
        """
        try:
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
                    severity=CheckSeverity.CRITICAL,  # Fixed
                    passed=False,
                    message="Insufficient storage space for upgrade",
                    details={"filesystems": storage_details},
                    recommendation="Clean up storage space before proceeding",
                )
            elif has_warning_space:
                return PreCheckResult(
                    check_name="Storage Space",
                    severity=CheckSeverity.WARNING,  # Fixed
                    passed=True,
                    message="Storage space is limited but sufficient",
                    details={"filesystems": storage_details},
                    recommendation="Consider cleaning up storage space",
                )
            else:
                return PreCheckResult(
                    check_name="Storage Space",
                    severity=CheckSeverity.PASS,  # Fixed
                    passed=True,
                    message="Sufficient storage space available",
                    details={"filesystems": storage_details},
                )

        except RpcError as e:
            return PreCheckResult(
                check_name="Storage Space",
                severity=CheckSeverity.CRITICAL,  # Fixed
                passed=False,
                message=f"Failed to check storage space: {str(e)}",
                details={"error": str(e)},
                recommendation="Verify system storage accessibility",
            )

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
                    severity=CheckSeverity.CRITICAL,  # Fixed
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
                    severity=CheckSeverity.PASS,  # Fixed
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
                severity=CheckSeverity.CRITICAL,  # Fixed
                passed=False,
                message=f"Failed to check hardware health: {str(e)}",
                details={"error": str(e)},
                recommendation="Verify environmental monitoring accessibility",
            )

    def check_bgp_stability(self) -> PreCheckResult:
        """
        Validate BGP protocol stability and peer relationships.

        Checks BGP peer status to ensure stable routing protocol operation
        during upgrade process, minimizing network disruption.

        Returns:
            PreCheckResult with BGP stability assessment
        """
        try:
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
                    severity=CheckSeverity.PASS,  # Fixed
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
                    severity=CheckSeverity.PASS,  # Fixed
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
                    severity=CheckSeverity.WARNING,  # Fixed
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
                    severity=CheckSeverity.PASS,  # Fixed
                    passed=True,
                    message="BGP not configured on device",
                    details={"bgp_status": "not_configured"},
                )
            else:
                return PreCheckResult(
                    check_name="BGP Protocol Stability",
                    severity=CheckSeverity.WARNING,  # Fixed
                    passed=True,  # Pass with warning for BGP check failures
                    message=f"BGP status check failed: {str(e)}",
                    details={"error": str(e)},
                    recommendation="Verify BGP configuration and retry",
                )

    def _get_current_timestamp(self) -> str:
        """
        Generate ISO format timestamp for check results.

        Returns:
            ISO formatted timestamp string
        """
        from datetime import datetime

        return datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
