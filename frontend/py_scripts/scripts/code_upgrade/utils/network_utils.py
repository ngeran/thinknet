"""
Network utility functions.

Provides common network operations and connectivity testing helpers.
"""

import socket
import logging
from typing import Optional

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


def resolve_hostname(hostname: str) -> Optional[str]:
    """
    Resolve hostname to IP address.

    Args:
        hostname: Hostname to resolve

    Returns:
        IP address string or None if resolution fails
    """
    try:
        return socket.gethostbyname(hostname)
    except socket.gaierror as e:
        logger.warning(f"Failed to resolve hostname {hostname}: {e}")
        return None
