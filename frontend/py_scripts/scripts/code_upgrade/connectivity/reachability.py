"""
Network reachability testing and device recovery monitoring.

Provides multi-layer network reachability testing including basic TCP
connectivity and Junos NETCONF service validation with adaptive polling.
"""

import socket
import time
import logging
from typing import Tuple

from jnpr.junos import Device
from jnpr.junos.exception import ProbeError

from core.constants import (
    MAX_REBOOT_WAIT_TIME,
    POLLING_INTERVAL,
    ADAPTIVE_POLLING_THRESHOLD,
)

logger = logging.getLogger(__name__)


def test_basic_reachability(host: str, port: int = 22, timeout: int = 10) -> bool:
    """
    Test basic TCP connectivity to device on specified port.

    Performs low-level socket connection test without protocol negotiation.

    Args:
        host: Target hostname or IP address
        port: TCP port to test (default: 22 for SSH)
        timeout: Connection timeout in seconds

    Returns:
        True if TCP connection succeeds, False otherwise
    """
    try:
        socket.setdefaulttimeout(timeout)
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            result = sock.connect_ex((host, port))
            reachable = result == 0
            if reachable:
                logger.debug(f"✅ Basic reachability confirmed for {host}:{port}")
            else:
                logger.debug(
                    f"❌ Basic reachability failed for {host}:{port} (error: {result})"
                )
            return reachable
    except Exception as e:
        logger.debug(f"❌ Basic reachability exception for {host}:{port}: {e}")
        return False


def test_junos_reachability(
    host: str, username: str, password: str, timeout: int = 30
) -> Tuple[bool, str]:
    """
    Test Junos device reachability using PyEZ NETCONF probe.

    Validates that NETCONF service is responding and device is ready for
    PyEZ operations.

    Args:
        host: Target hostname or IP address
        username: Device authentication username
        password: Device authentication password
        timeout: Probe timeout in seconds

    Returns:
        Tuple of (success: bool, message: str)
    """
    try:
        with Device(
            host=host,
            user=username,
            password=password,
            connect_timeout=timeout,
            normalize=True,
        ) as dev:
            if dev.probe(timeout=timeout):
                return True, f"Device {host} is reachable and responsive via NETCONF"
            else:
                return False, f"Device {host} is not responding to NETCONF probe"
    except ProbeError as e:
        return False, f"NETCONF probe failed for {host}: {str(e)}"
    except Exception as e:
        return False, f"Connection test failed for {host}: {str(e)}"


def wait_for_device_recovery(
    hostname: str,
    username: str,
    password: str,
    max_wait_time: int = MAX_REBOOT_WAIT_TIME,
    polling_interval: int = POLLING_INTERVAL,
) -> Tuple[bool, str]:
    """
    Wait for device to fully recover after reboot with multi-stage validation.

    Implements adaptive polling strategy with two-stage validation:
    1. Basic TCP connectivity on SSH port
    2. NETCONF service readiness

    Args:
        hostname: Target device hostname
        username: Device authentication username
        password: Device authentication password
        max_wait_time: Maximum wait time in seconds
        polling_interval: Initial polling interval in seconds

    Returns:
        Tuple of (success: bool, message: str)
    """
    logger.info(f"[{hostname}] 🔄 Waiting for device recovery (max: {max_wait_time}s)")

    start_time = time.time()
    last_status_time = start_time
    status_interval = 60

    # Stage tracking
    basic_reachability_achieved = False
    junos_reachability_achieved = False

    # Adaptive polling - start slow, speed up after threshold
    current_polling_interval = polling_interval

    while time.time() - start_time < max_wait_time:
        elapsed = time.time() - start_time
        remaining = max_wait_time - elapsed

        # Adaptive polling: switch to faster polling after initial wait
        if elapsed > ADAPTIVE_POLLING_THRESHOLD and current_polling_interval > 15:
            current_polling_interval = 15
            logger.info(f"[{hostname}] ⚡ Switching to faster polling (15s intervals)")

        # Report status periodically
        if time.time() - last_status_time >= status_interval:
            logger.info(
                f"[{hostname}] ⏳ Recovery status: {elapsed:.0f}s elapsed, {remaining:.0f}s remaining"
            )
            last_status_time = time.time()

        # Stage 1: Check basic TCP connectivity
        if not basic_reachability_achieved:
            if test_basic_reachability(hostname):
                basic_reachability_achieved = True
                logger.info(f"[{hostname}] ✅ Stage 1: Basic TCP connectivity restored")
                # Don't wait full interval, quickly proceed to stage 2
                time.sleep(5)
                continue
            else:
                logger.debug(
                    f"[{hostname}] 🔄 Waiting for basic connectivity... ({elapsed:.0f}s)"
                )
                time.sleep(current_polling_interval)
                continue

        # Stage 2: Check Junos NETCONF service
        if basic_reachability_achieved and not junos_reachability_achieved:
            junos_reachable, junos_message = test_junos_reachability(
                hostname, username, password, timeout=30
            )
            if junos_reachable:
                junos_reachability_achieved = True
                logger.info(f"[{hostname}] ✅ Stage 2: Junos NETCONF service restored")
                # Give device a few more seconds to stabilize
                time.sleep(10)
                return True, f"Device fully recovered in {elapsed:.1f}s"
            else:
                logger.debug(
                    f"[{hostname}] 🔄 Waiting for NETCONF service... ({elapsed:.0f}s): {junos_message}"
                )
                time.sleep(current_polling_interval)
                continue

    # Timeout reached
    elapsed = time.time() - start_time
    status_summary = []
    if not basic_reachability_achieved:
        status_summary.append("no TCP connectivity")
    elif not junos_reachability_achieved:
        status_summary.append("TCP connected but NETCONF unavailable")

    error_msg = (
        f"Device recovery timeout after {elapsed:.1f}s: {', '.join(status_summary)}"
    )
    logger.error(f"[{hostname}] ❌ {error_msg}")
    return False, error_msg
