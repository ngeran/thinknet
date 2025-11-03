"""
Automatic rollback management for failed upgrades.

Provides functionality to revert device to previous software version
and restore operational state after upgrade failures.
"""

import time
import logging
from typing import Tuple

from jnpr.junos import Device
from jnpr.junos.exception import RpcError

from connectivity.reachability import wait_for_device_recovery
from progress.event_sender import send_progress

from core.dataclasses import DeviceStatus
from core.constants import INITIAL_REBOOT_WAIT

logger = logging.getLogger(__name__)


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
