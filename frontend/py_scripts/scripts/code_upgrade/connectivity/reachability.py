"""
Network reachability testing and device recovery monitoring.

Provides multi-layer network reachability testing including basic TCP
connectivity and Junos NETCONF service validation with adaptive polling
strategies optimized for SRX device reboots.
"""

import socket
import time
import logging
from typing import Tuple

from jnpr.junos import Device
from jnpr.junos.exception import ProbeError, ConnectError

from core.constants import (
    MAX_REBOOT_WAIT_TIME,
    POLLING_INTERVAL,
    ADAPTIVE_POLLING_THRESHOLD,
    RECOVERY_STABILIZATION_TIME,
)

logger = logging.getLogger(__name__)


def test_basic_reachability(host: str, port: int = 22, timeout: int = 10) -> bool:
    """
    Test basic TCP connectivity to device on specified port.

    Performs low-level socket connection test without protocol negotiation.
    This is the first stage of device recovery detection.

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
    PyEZ operations. This is the second stage of device recovery detection.

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
    except ConnectError as e:
        return False, f"NETCONF connection failed for {host}: {str(e)}"
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

    Implements adaptive polling strategy with three-stage validation:
    1. Basic TCP connectivity on SSH port
    2. NETCONF service readiness
    3. Post-recovery stabilization period

    SRX devices typically take 5-10 minutes to reboot after major upgrades.
    This function provides extended patience for complete recovery.

    Args:
        hostname: Target device hostname
        username: Device authentication username
        password: Device authentication password
        max_wait_time: Maximum wait time in seconds (default: 900s/15min)
        polling_interval: Initial polling interval in seconds (default: 30s)

    Returns:
        Tuple of (success: bool, message: str)
    """
    logger.info(
        f"[{hostname}] 🔄 Waiting for device recovery after reboot (max: {max_wait_time}s)"
    )
    logger.info(
        f"[{hostname}] 💡 SRX devices typically take 5-10 minutes for major version upgrades"
    )

    start_time = time.time()
    last_status_time = start_time
    status_interval = 60  # Report status every 60 seconds

    # Stage tracking
    basic_reachability_achieved = False
    basic_reachability_time = 0
    junos_reachability_achieved = False
    junos_reachability_time = 0

    # Adaptive polling - start slow, speed up after basic connectivity
    current_polling_interval = polling_interval

    while time.time() - start_time < max_wait_time:
        elapsed = time.time() - start_time
        remaining = max_wait_time - elapsed

        # Adaptive polling: switch to faster polling after basic connectivity
        if basic_reachability_achieved and current_polling_interval > 10:
            current_polling_interval = 10
            logger.info(
                f"[{hostname}] ⚡ Switching to faster polling (10s intervals) - basic connectivity achieved"
            )

        # Report status periodically
        if time.time() - last_status_time >= status_interval:
            status_msg = f"[{hostname}] ⏳ Recovery: {elapsed:.0f}s elapsed, {remaining:.0f}s remaining"
            if basic_reachability_achieved:
                status_msg += " | ✅ TCP connected"
                if junos_reachability_achieved:
                    status_msg += " | ✅ NETCONF ready"
                else:
                    status_msg += " | 🔄 Waiting for NETCONF"
            else:
                status_msg += " | 🔄 Waiting for TCP connectivity"

            logger.info(status_msg)
            last_status_time = time.time()

        # Stage 1: Check basic TCP connectivity
        if not basic_reachability_achieved:
            if test_basic_reachability(hostname):
                basic_reachability_achieved = True
                basic_reachability_time = time.time()
                stage1_elapsed = basic_reachability_time - start_time
                logger.info(
                    f"[{hostname}] ✅ Stage 1: Basic TCP connectivity restored after {stage1_elapsed:.1f}s"
                )
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
                junos_reachability_time = time.time()
                stage2_elapsed = junos_reachability_time - basic_reachability_time
                total_elapsed = junos_reachability_time - start_time
                logger.info(
                    f"[{hostname}] ✅ Stage 2: Junos NETCONF service restored after {stage2_elapsed:.1f}s (total: {total_elapsed:.1f}s)"
                )

                # Stage 3: Give device additional time to stabilize services
                logger.info(
                    f"[{hostname}] 🔄 Stage 3: Allowing {RECOVERY_STABILIZATION_TIME}s for service stabilization"
                )
                time.sleep(RECOVERY_STABILIZATION_TIME)

                total_recovery_time = time.time() - start_time
                success_msg = f"Device fully recovered in {total_recovery_time:.1f}s"
                logger.info(f"[{hostname}] 🎉 {success_msg}")
                return True, success_msg
            else:
                logger.debug(
                    f"[{hostname}] 🔄 Waiting for NETCONF service... ({elapsed:.0f}s): {junos_message}"
                )
                time.sleep(current_polling_interval)
                continue

    # Timeout reached - provide detailed diagnostic information
    elapsed = time.time() - start_time
    status_summary = []

    if not basic_reachability_achieved:
        status_summary.append("no TCP connectivity - device may still be booting")
    elif not junos_reachability_achieved:
        tcp_time = basic_reachability_time - start_time
        status_summary.append(
            f"TCP connected after {tcp_time:.1f}s but NETCONF never became available"
        )

    error_msg = (
        f"Device recovery timeout after {elapsed:.1f}s: {', '.join(status_summary)}. "
        f"Device may need manual intervention or longer reboot time."
    )
    logger.error(f"[{hostname}] ❌ {error_msg}")

    # Additional diagnostic suggestion
    logger.info(
        f"[{hostname}] 💡 Recommendation: Wait additional 5-10 minutes and check device manually: "
        f"ssh {username}@{hostname}"
    )

    return False, error_msg


def quick_reachability_check(hostname: str, username: str, password: str) -> bool:
    """
    Perform quick reachability check for operational monitoring.

    Uses shorter timeouts for rapid health checking during normal operations.

    Args:
        hostname: Target device hostname
        username: Device authentication username
        password: Device authentication password

    Returns:
        True if device is reachable, False otherwise
    """
    try:
        # Quick TCP check first
        if not test_basic_reachability(hostname, timeout=5):
            return False

        # Quick NETCONF check
        reachable, _ = test_junos_reachability(hostname, username, password, timeout=10)
        return reachable

    except Exception:
        return False
