"""
Device connection management and session lifecycle.

Provides context managers for device connections and handles
connection setup/teardown with proper error handling.
"""

import logging
from contextlib import contextmanager
from typing import Generator

from jnpr.junos import Device
from jnpr.junos.utils.sw import SW
from jnpr.junos.exception import ConnectError

from core.constants import DEFAULT_CONNECTION_TIMEOUT
from core.exceptions import ConnectionError

logger = logging.getLogger(__name__)


class DeviceConnector:
    """
    Manages device connections and session lifecycle.

    Provides context managers for device connections with proper
    setup and teardown, including SW utility initialization.
    """

    def __init__(
        self,
        hostname: str,
        username: str,
        password: str,
        timeout: int = DEFAULT_CONNECTION_TIMEOUT,
    ):
        """
        Initialize device connector.

        Args:
            hostname: Device hostname or IP address
            username: Authentication username
            password: Authentication password
            timeout: Connection timeout in seconds
        """
        self.hostname = hostname
        self.username = username
        self.password = password
        self.timeout = timeout
        self.device = None
        self.sw = None

    @contextmanager
    def connect(self) -> Generator[Device, None, None]:
        """
        Context manager for device connection lifecycle.

        Yields:
            Connected Device instance

        Raises:
            ConnectionError: If connection fails
        """
        try:
            self.device = Device(
                host=self.hostname,
                user=self.username,
                password=self.password,
                timeout=self.timeout,
                normalize=True,
            )
            self.device.open()
            self.sw = SW(self.device)
            logger.info(f"[{self.hostname}] ✅ Connected to device successfully")
            yield self.device
        except ConnectError as e:
            error_msg = f"Connection failed to {self.hostname}: {str(e)}"
            logger.error(f"[{self.hostname}] ❌ {error_msg}")
            raise ConnectionError(
                error_msg, "Verify network connectivity and credentials"
            )
        except Exception as e:
            error_msg = f"Unexpected connection error to {self.hostname}: {str(e)}"
            logger.error(f"[{self.hostname}] ❌ {error_msg}")
            raise ConnectionError(
                error_msg, "Check device accessibility and configuration"
            )
        finally:
            self._close_connection()

    def _close_connection(self):
        """Safely close device connection."""
        if self.device:
            try:
                self.device.close()
                logger.info(f"[{self.hostname}] 🔌 Device connection closed")
            except Exception as e:
                logger.warning(f"[{self.hostname}] Error closing connection: {e}")

    def get_software_utility(self) -> SW:
        """
        Get SW utility instance for software operations.

        Returns:
            SW utility instance

        Raises:
            ConnectionError: If device is not connected
        """
        if not self.sw:
            raise ConnectionError("Device not connected", "Call connect() first")
        return self.sw

    def get_device_facts(self) -> dict:
        """
        Get device facts from connected device.

        Returns:
            Dictionary of device facts

        Raises:
            ConnectionError: If device is not connected
        """
        if not self.device:
            raise ConnectionError("Device not connected", "Call connect() first")

        try:
            return self.device.facts
        except Exception as e:
            error_msg = f"Failed to get device facts: {str(e)}"
            logger.error(f"[{self.hostname}] ❌ {error_msg}")
            raise ConnectionError(
                error_msg, "Verify device accessibility and permissions"
            )
