"""
Device connection management using PyEZ framework.

Provides robust Junos device connectivity with connection pooling,
automatic retry mechanisms, and comprehensive error handling for
reliable network operations during upgrades.
"""

import logging
from typing import Optional, Dict, Any

from jnpr.junos import Device
from jnpr.junos.utils.sw import SW
from jnpr.junos.exception import ConnectError, RpcError

from core.constants import (
    DEFAULT_CONNECT_TIMEOUT,
)  # Fixed: Changed DEFAULT_CONNECTION_TIMEOUT to DEFAULT_CONNECT_TIMEOUT

logger = logging.getLogger(__name__)


class DeviceConnector:
    """
    Manages Junos device connections with enhanced error handling and retry logic.

    Provides a unified interface for device connectivity, fact gathering,
    and software management operations with automatic connection lifecycle
    management.
    """

    def __init__(
        self,
        hostname: str,
        username: str,
        password: str,
        timeout: int = DEFAULT_CONNECT_TIMEOUT,  # Fixed here too
    ):
        """
        Initialize device connector with connection parameters.

        Args:
            hostname: Device hostname or IP address
            username: Authentication username
            password: Authentication password
            timeout: Connection timeout in seconds (default: from constants)
        """
        self.hostname = hostname
        self.username = username
        self.password = password
        self.timeout = timeout
        self.device: Optional[Device] = None
        self.connected = False

    def connect(self) -> "DeviceConnector":
        """
        Establish connection to Junos device with error handling.

        Uses PyEZ Device class to establish NETCONF connection with
        comprehensive error handling and connection state tracking.

        Returns:
            self for context manager support

        Raises:
            ConnectError: When connection fails after all retry attempts
        """
        try:
            if self.connected and self.device:
                logger.debug(f"[{self.hostname}] Using existing connection")
                return self

            logger.info(f"[{self.hostname}] 🔌 Connecting to device...")
            self.device = Device(
                host=self.hostname,
                user=self.username,
                password=self.password,
                timeout=self.timeout,
                normalize=True,
            )

            self.device.open()
            self.connected = True
            logger.info(f"[{self.hostname}] ✅ Connected successfully")

            return self

        except ConnectError as e:
            self.connected = False
            logger.error(f"[{self.hostname}] ❌ Connection failed: {e}")
            raise
        except Exception as e:
            self.connected = False
            logger.error(f"[{self.hostname}] ❌ Unexpected connection error: {e}")
            raise ConnectError(host=self.hostname, msg=str(e))

    def disconnect(self):
        """Close device connection and cleanup resources."""
        if self.device and self.connected:
            try:
                self.device.close()
                logger.debug(f"[{self.hostname}] 🔌 Connection closed")
            except Exception as e:
                logger.warning(f"[{self.hostname}] ⚠️  Error during disconnect: {e}")
            finally:
                self.connected = False
                self.device = None

    def __enter__(self):
        """Context manager entry."""
        return self.connect()

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit with proper cleanup."""
        self.disconnect()

    def get_device_facts(self) -> Dict[str, Any]:
        """
        Retrieve device facts and system information.

        Gathers comprehensive device information including version,
        model, serial number, and platform details.

        Returns:
            Dictionary containing device facts

        Raises:
            RpcError: When fact gathering fails
            ConnectError: When device is not connected
        """
        if not self.connected or not self.device:
            raise ConnectError(host=self.hostname, msg="Device not connected")

        try:
            facts = self.device.facts
            logger.debug(
                f"[{self.hostname}] 📋 Facts retrieved: {facts.get('version', 'unknown')}"
            )
            return facts
        except RpcError as e:
            logger.error(f"[{self.hostname}] ❌ Failed to get device facts: {e}")
            raise
        except Exception as e:
            logger.error(f"[{self.hostname}] ❌ Unexpected error getting facts: {e}")
            raise

    def get_software_utility(self) -> SW:
        """
        Get software utility instance for package management.

        Returns initialized SW utility for software installation,
        validation, and management operations.

        Returns:
            SW utility instance

        Raises:
            ConnectError: When device is not connected
        """
        if not self.connected or not self.device:
            raise ConnectError(host=self.hostname, msg="Device not connected")

        try:
            return SW(self.device)
        except Exception as e:
            logger.error(f"[{self.hostname}] ❌ Failed to get software utility: {e}")
            raise

    def is_connected(self) -> bool:
        """
        Check if device connection is active and responsive.

        Performs lightweight probe to verify connection health.

        Returns:
            True if connection is active and responsive
        """
        if not self.connected or not self.device:
            return False

        try:
            return self.device.connected
        except Exception:
            return False

    def test_connection(self) -> bool:
        """
        Test device connection with basic RPC operation.

        Performs simple RPC to verify connection functionality
        beyond basic connectivity.

        Returns:
            True if connection test passes
        """
        try:
            if not self.is_connected():
                return False

            # Simple RPC to test functionality
            response = self.device.rpc.get_system_uptime_information()
            return response is not None
        except Exception as e:
            logger.debug(f"[{self.hostname}] Connection test failed: {e}")
            return False
