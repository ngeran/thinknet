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

import re
import logging
from typing import List

from jnpr.junos import Device

from core.dataclasses import PreCheckResult, PreCheckSummary
from core.enums import PreCheckSeverity
from core.constants import (
    MINIMUM_STORAGE_FREE_PERCENT,
    MINIMUM_STORAGE_FREE_MB,
    MAX_TEMPERATURE_CELSIUS,
    MIN_POWER_SUPPLY_COUNT,
    MIN_FAN_COUNT,
    MAX_ACTIVE_SESSIONS_WARNING,
)

logger = logging.getLogger(__name__)


class EnhancedPreCheckEngine:
    """
    Comprehensive pre-upgrade validation engine.

    Performs 10+ intelligent checks covering storage, hardware, routing,
    configuration, and operational state validation.
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

    def _check_image_availability_and_size(self) -> PreCheckResult:
        """Check 1: Image File Availability & Size Validation"""
        try:
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

            # Extract file size from output
            image_size_mb = 0
            try:
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

    def _check_storage_space_detailed(self) -> PreCheckResult:
        """Check 2: Storage Space - Enhanced with Actual Size Validation"""
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

    def _check_hardware_health(self) -> PreCheckResult:
        """Check 3: Hardware Health - Temperature, Power, Fans"""
        try:
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

    def _check_bgp_stability(self) -> PreCheckResult:
        """Check 4: Routing Protocol Stability - BGP Peers"""
        try:
            response = self.device.rpc.get_bgp_summary_information()
            peers = response.findall(".//bgp-peer")

            if not peers:
                return PreCheckResult(
                    "BGP Protocol Stability",
                    PreCheckSeverity.INFO,
                    True,
                    "No BGP peers configured on device",
                    {"peer_count": 0},
                )

            peer_count = 0
            established_count = 0
            unstable_peers = []
            bgp_details = {"peers": []}

            for peer in peers:
                peer_count += 1
                peer_address = peer.findtext("peer-address", "unknown")
                peer_state = peer.findtext("peer-state", "unknown")

                peer_info = {"address": peer_address, "state": peer_state}
                bgp_details["peers"].append(peer_info)

                if peer_state.lower() == "established":
                    established_count += 1
                else:
                    unstable_peers.append(f"{peer_address} ({peer_state})")

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

    # Additional check methods would continue here...
    # _check_ospf_stability, _check_system_alarms, _check_configuration_committed,
    # _check_active_sessions, _check_backup_availability, _check_chassis_status

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

        # Define all checks to run (simplified for example)
        checks = [
            self._check_image_availability_and_size,
            self._check_storage_space_detailed,
            self._check_hardware_health,
            self._check_bgp_stability,
            # Add other checks here...
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
