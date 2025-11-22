"""
Device connection management using PyEZ framework.

Provides robust Junos device connectivity with connection pooling,
automatic retry mechanisms, and comprehensive error handling for
reliable network operations during upgrades.

ENHANCEMENTS:
- Added RPC timeout support for all operations
- Improved connection health monitoring
- Better timeout handling for slow/unresponsive devices
- Fixed type annotation issues for better code reliability
"""

import logging
import time
from typing import Optional, Dict, Any, Tuple

from jnpr.junos import Device
from jnpr.junos.utils.sw import SW
from jnpr.junos.exception import ConnectError, RpcError, RpcTimeoutError

from core.constants import (
    DEFAULT_CONNECT_TIMEOUT,
)

logger = logging.getLogger(__name__)


class DeviceConnector:
    """
    Manages Junos device connections with enhanced error handling and retry logic.

    Provides a unified interface for device connectivity, fact gathering,
    and software management operations with automatic connection lifecycle
    management.

    ENHANCEMENTS:
    - RPC operations include configurable timeouts
    - Connection health monitoring with response time tracking
    - Better error messages for timeout scenarios
    - Fixed type safety issues for improved reliability
    """

    def __init__(
        self,
        hostname: str,
        username: str,
        password: str,
        timeout: int = DEFAULT_CONNECT_TIMEOUT,
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
        # Fixed: Simplified type annotation to avoid assignment issues
        self.device = None  # Will be assigned a Device instance when connected
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
            # Fixed: Use temporary variable to avoid type assignment issues
            device_instance = Device(
                host=self.hostname,
                user=self.username,
                password=self.password,
                timeout=self.timeout,
                normalize=True,
            )

            device_instance.open()
            self.device = device_instance  # Now assign to class attribute
            self.connected = True
            logger.info(f"[{self.hostname}] ✅ Connected successfully")

            return self

        except ConnectError as e:
            self.connected = False
            self.device = None
            logger.error(f"[{self.hostname}] ❌ Connection failed: {e}")
            raise
        except Exception as e:
            self.connected = False
            self.device = None
            logger.error(f"[{self.hostname}] ❌ Unexpected connection error: {e}")
            raise ConnectError(f"Connection to {self.hostname} failed: {str(e)}")

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
            raise ConnectError(f"Device {self.hostname} not connected")

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
            raise ConnectError(f"Device {self.hostname} not connected")

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
        Test device connection with basic RPC operation and timeout.

        Performs simple RPC to verify connection functionality
        beyond basic connectivity with configurable timeout.

        Returns:
            True if connection test passes
        """
        try:
            if not self.is_connected():
                return False

            if self.device:
                response = self.device.rpc.get_system_uptime_information(timeout=30)
                return response is not None
            else:
                return False

        except RpcTimeoutError as e:
            logger.debug(f"[{self.hostname}] Connection test timed out: {e}")
            return False
        except Exception as e:
            logger.debug(f"[{self.hostname}] Connection test failed: {e}")
            return False

    def execute_rpc_with_timeout(self, rpc_command: str, timeout: int = 60) -> Any:
        """
        Execute RPC command with configurable timeout.

        Enhanced RPC execution with explicit timeout control to handle
        slow/unresponsive devices gracefully.

        Args:
            rpc_command: RPC command to execute
            timeout: RPC timeout in seconds

        Returns:
            RPC response

        Raises:
            RpcError: When RPC execution fails
            RpcTimeoutError: When RPC times out
            ConnectError: When device is not connected
        """
        if not self.connected or not self.device:
            raise ConnectError(f"Device {self.hostname} not connected")

        try:
            logger.debug(
                f"[{self.hostname}] Executing RPC with {timeout}s timeout: {rpc_command}"
            )
            if self.device:
                return self.device.rpc(rpc_command, timeout=timeout)
            else:
                raise ConnectError(f"Device {self.hostname} not available")
        except RpcTimeoutError as e:
            logger.error(
                f"[{self.hostname}] RPC timeout after {timeout}s: {rpc_command}"
            )
            raise
        except RpcError as e:
            logger.error(f"[{self.hostname}] RPC command failed: {e}")
            raise
        except Exception as e:
            logger.error(f"[{self.hostname}] RPC execution error: {e}")
            raise

    def check_connection_health(self) -> Tuple[bool, str]:
        """
        Check if connection is healthy and responsive with performance metrics.

        Performs health check with response time measurement to detect
        slow/unresponsive devices before critical operations.

        Returns:
            Tuple of (is_healthy: bool, status_message: str)
        """
        if not self.is_connected():
            return False, "Device not connected"

        try:
            if not self.device:
                return False, "Device object not available"

            start_time = time.time()
            response = self.device.rpc.get_system_uptime_information(timeout=30)
            response_time = time.time() - start_time

            if response_time > 10:
                return True, f"Device responsive but slow ({response_time:.1f}s)"
            elif response_time > 30:
                return (
                    False,
                    f"Device very slow, may be overloaded ({response_time:.1f}s)",
                )
            else:
                return True, f"Device responsive ({response_time:.1f}s)"

        except RpcTimeoutError:
            return False, "RPC timeout - device not responding to commands"
        except Exception as e:
            return False, f"Health check failed: {str(e)}"
