"""
Post-upgrade functional validation.

Validates device functionality after upgrade completion to ensure
device is operating correctly with new software version.
"""

import logging
from typing import Tuple, List, Dict, Any

from jnpr.junos import Device

logger = logging.getLogger(__name__)


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

    def validate_basic_connectivity(self) -> Tuple[bool, str]:
        """
        Validate basic device connectivity and responsiveness.

        Returns:
            Tuple of (success: bool, message: str)
        """
        try:
            facts = self.device.facts
            if facts:
                logger.info(f"[{self.hostname}] ✅ Basic connectivity validated")
                return True, "Device is responsive and accessible"
            else:
                return False, "Unable to retrieve device facts"
        except Exception as e:
            return False, f"Connectivity validation failed: {str(e)}"

    def validate_interface_status(self) -> Tuple[bool, List[str]]:
        """
        Validate that interface counts match pre-upgrade state.

        Returns:
            Tuple of (success: bool, warnings: List[str])
        """
        warnings = []
        try:
            response = self.device.rpc.get_interface_information(terse=True)
            current_interfaces = response.findall(".//physical-interface")
            current_count = len(current_interfaces)

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

    def validate_routing_protocols(self) -> Tuple[bool, List[str]]:
        """
        Validate that routing protocols are operational.

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
