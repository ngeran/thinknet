"""
Rollback management for failed upgrade operations.

Provides automatic rollback capabilities with comprehensive recovery
monitoring and progress tracking for failed upgrade scenarios.
"""

import time
import logging
from typing import Tuple

from jnpr.junos.utils.config import Config
from jnpr.junos.exception import ConfigLoadError, CommitError, RpcError

from connectivity.reachability import wait_for_device_recovery
from progress.event_sender import (
    send_device_progress,
)  # Fixed: Changed send_progress to send_device_progress
from core.dataclasses import DeviceStatus
from core.constants import MAX_REBOOT_WAIT_TIME
from core.exceptions import RollbackError

logger = logging.getLogger(__name__)


class RollbackManager:
    """
    Manages automatic rollback operations for failed upgrades.

    Provides rollback to previous software version with comprehensive
    recovery monitoring and progress tracking.
    """

    def __init__(self, device, hostname: str, device_status: DeviceStatus):
        """
        Initialize rollback manager with device context.

        Args:
            device: PyEZ device instance
            hostname: Device hostname for logging
            device_status: Current device status for progress tracking
        """
        self.device = device
        self.hostname = hostname
        self.device_status = device_status
        self.config = Config(self.device)

    def perform_rollback(self, reason: str) -> Tuple[bool, str]:
        """
        Execute rollback to previous software version.

        Performs rollback operation with comprehensive error handling
        and progress tracking.

        Args:
            reason: Reason for rollback operation

        Returns:
            Tuple of (success: bool, message: str)
        """
        try:
            logger.warning(f"[{self.hostname}] 🔙 Starting rollback: {reason}")

            # Send rollback progress update
            send_device_progress(  # Fixed: Using send_device_progress instead of send_progress
                self.device_status,
                1,  # current_step
                3,  # total_steps (connect, rollback, reboot)
                "Initiating rollback procedure",
            )

            # Step 1: Request system rollback
            logger.info(f"[{self.hostname}] 🔄 Requesting software rollback")
            try:
                # Use request system rollback for software
                response = self.device.rpc.request_system_software_rollback()
                if response is not None:
                    logger.info(f"[{self.hostname}] ✅ Rollback request accepted")
                else:
                    logger.warning(f"[{self.hostname}] ⚠️  Rollback response empty")

            except RpcError as e:
                # If software rollback fails, try configuration rollback as fallback
                logger.warning(
                    f"[{self.hostname}] ⚠️  Software rollback failed, trying configuration rollback: {e}"
                )
                return self._perform_config_rollback(reason)

            # Step 2: Reboot device to complete rollback
            send_device_progress(  # Fixed
                self.device_status,
                2,  # current_step
                3,  # total_steps
                "Rollback prepared, rebooting device",
            )

            logger.info(f"[{self.hostname}] 🔄 Rebooting to complete rollback")
            try:
                reboot_response = self.device.rpc.request_reboot()
                if reboot_response is not None:
                    logger.info(f"[{self.hostname}] ✅ Reboot requested for rollback")
                    return True, "Rollback initiated successfully, device rebooting"
                else:
                    return False, "Rollback prepared but reboot request failed"

            except RpcError as e:
                logger.error(f"[{self.hostname}] ❌ Reboot request failed: {e}")
                return False, f"Rollback prepared but reboot failed: {str(e)}"

        except Exception as e:
            error_msg = f"Rollback procedure failed: {str(e)}"
            logger.error(f"[{self.hostname}] ❌ {error_msg}")
            return False, error_msg

    def _perform_config_rollback(self, reason: str) -> Tuple[bool, str]:
        """
        Perform configuration rollback as fallback option.

        Used when software rollback fails, attempts to rollback
        configuration to previous state.

        Args:
            reason: Reason for rollback operation

        Returns:
            Tuple of (success: bool, message: str)
        """
        try:
            logger.info(f"[{self.hostname}] 🔧 Attempting configuration rollback")

            send_device_progress(  # Fixed
                self.device_status,
                2,  # current_step
                3,  # total_steps
                "Performing configuration rollback",
            )

            # Rollback to previous configuration
            self.config.rollback(1)  # Rollback 1 generation
            self.config.commit()

            logger.info(f"[{self.hostname}] ✅ Configuration rollback completed")
            return True, "Configuration rollback completed successfully"

        except ConfigLoadError as e:
            error_msg = f"Configuration rollback load failed: {str(e)}"
            logger.error(f"[{self.hostname}] ❌ {error_msg}")
            return False, error_msg

        except CommitError as e:
            error_msg = f"Configuration rollback commit failed: {str(e)}"
            logger.error(f"[{self.hostname}] ❌ {error_msg}")
            return False, error_msg

        except Exception as e:
            error_msg = f"Configuration rollback failed: {str(e)}"
            logger.error(f"[{self.hostname}] ❌ {error_msg}")
            return False, error_msg

    def wait_for_rollback_recovery(
        self, username: str, password: str
    ) -> Tuple[bool, str]:
        """
        Wait for device recovery after rollback reboot.

        Monitors device reachability and validates successful recovery
        after rollback operation.

        Args:
            username: Device authentication username
            password: Device authentication password

        Returns:
            Tuple of (success: bool, message: str)
        """
        try:
            logger.info(f"[{self.hostname}] 🔄 Waiting for rollback recovery")

            send_device_progress(  # Fixed
                self.device_status,
                3,  # current_step
                3,  # total_steps
                "Waiting for device recovery after rollback",
            )

            # Use the same recovery logic as upgrade
            recovery_success, recovery_message = wait_for_device_recovery(
                self.hostname, username, password, MAX_REBOOT_WAIT_TIME
            )

            if recovery_success:
                logger.info(f"[{self.hostname}] ✅ Rollback recovery successful")
                return True, "Device recovered successfully after rollback"
            else:
                logger.error(
                    f"[{self.hostname}] ❌ Rollback recovery failed: {recovery_message}"
                )
                return False, f"Rollback recovery failed: {recovery_message}"

        except Exception as e:
            error_msg = f"Rollback recovery monitoring failed: {str(e)}"
            logger.error(f"[{self.hostname}] ❌ {error_msg}")
            return False, error_msg

    def validate_rollback_success(self) -> Tuple[bool, str]:
        """
        Validate successful rollback operation.

        Verifies that rollback completed successfully by checking
        system status and configuration.

        Returns:
            Tuple of (success: bool, message: str)
        """
        try:
            logger.info(f"[{self.hostname}] 🔍 Validating rollback success")

            # Check system stability
            system_checks = [
                self._check_system_uptime,
                self._check_interface_status,
                self._check_routing_protocols,
            ]

            failed_checks = []
            for check_func in system_checks:
                try:
                    success, message = check_func()
                    if not success:
                        failed_checks.append(message)
                except Exception as e:
                    failed_checks.append(
                        f"Check {check_func.__name__} failed: {str(e)}"
                    )

            if failed_checks:
                error_msg = f"Rollback validation failed: {', '.join(failed_checks)}"
                logger.warning(f"[{self.hostname}] ⚠️  {error_msg}")
                return False, error_msg
            else:
                logger.info(f"[{self.hostname}] ✅ Rollback validation successful")
                return True, "Rollback completed and validated successfully"

        except Exception as e:
            error_msg = f"Rollback validation failed: {str(e)}"
            logger.error(f"[{self.hostname}] ❌ {error_msg}")
            return False, error_msg

    def _check_system_uptime(self) -> Tuple[bool, str]:
        """Check system uptime and stability."""
        try:
            response = self.device.rpc.get_system_uptime_information()
            if response is not None:
                return True, "System uptime check passed"
            else:
                return False, "System uptime check failed"
        except Exception as e:
            return False, f"System uptime check error: {str(e)}"

    def _check_interface_status(self) -> Tuple[bool, str]:
        """Check critical interface status."""
        try:
            response = self.device.rpc.get_interface_information(terse=True)
            interfaces = response.xpath(".//physical-interface")

            down_interfaces = []
            for interface in interfaces:
                name = interface.findtext("name", "")
                admin_status = interface.findtext("admin-status", "down")
                oper_status = interface.findtext("oper-status", "down")

                if admin_status == "up" and oper_status != "up":
                    down_interfaces.append(name)

            if down_interfaces:
                return False, f"Interfaces down: {', '.join(down_interfaces)}"
            else:
                return True, "Interface status check passed"

        except Exception as e:
            return False, f"Interface status check error: {str(e)}"

    def _check_routing_protocols(self) -> Tuple[bool, str]:
        """Check routing protocol stability."""
        try:
            # Check BGP if configured
            try:
                bgp_response = self.device.rpc.get_bgp_summary_information()
                peers = bgp_response.xpath(".//bgp-peer")

                down_peers = []
                for peer in peers:
                    peer_state = peer.findtext("peer-state", "")
                    peer_address = peer.findtext("peer-address", "unknown")

                    if peer_state.lower() != "established":
                        down_peers.append(peer_address)

                if down_peers:
                    return False, f"BGP peers down: {', '.join(down_peers)}"

            except RpcError:
                # BGP not configured is acceptable
                pass

            return True, "Routing protocols check passed"

        except Exception as e:
            return False, f"Routing protocols check error: {str(e)}"
