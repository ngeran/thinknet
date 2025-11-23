import logging
import socket
import sys
import json
from typing import List, Union, Optional
from jnpr.junos import Device
from jnpr.junos.exception import (
    ConnectAuthError,
    ConnectRefusedError,
    ConnectTimeoutError,
    ConnectError,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    filename="network_automation.log",
)
logger = logging.getLogger(__name__)


def check_reachability(host: str, port: int = 830, timeout: int = 3) -> bool:
    """
    Performs a raw TCP socket check to verify the device is reachable
    before attempting a heavy PyEZ connection.
    Checks NETCONF (830) by default, falls back to SSH (22) in logic below if needed.
    """
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False


def connect_to_host_single(host: str, username: str, password: str) -> Optional[Device]:
    """
    Connects to a single host with robust error handling and reachability checks.
    Returns the Device object on success, or raises a specific exception on failure.
    """
    # 1. Reachability Check (Fast Fail)
    # Try Port 830 (NETCONF) first, then Port 22 (SSH)
    if not check_reachability(host, 830) and not check_reachability(host, 22):
        msg = f"Device {host} is unreachable (Ports 830/22 closed or timeout)."
        logger.error(msg)
        raise ConnectionError(msg)

    # 2. Authenticated Connection Attempt
    try:
        logger.info(f"Initiating connection to {host}...")
        dev = Device(host=host, user=username, password=password, timeout=10)
        dev.open()

        logger.info(f"Successfully authenticated with {host}")
        return dev

    except ConnectAuthError:
        msg = f"Authentication failed for {host}. Check username/password."
        logger.error(msg)
        raise PermissionError(msg)

    except (ConnectRefusedError, ConnectTimeoutError) as e:
        msg = f"Connection refused/timed out for {host}: {str(e)}"
        logger.error(msg)
        raise ConnectionError(msg)

    except Exception as e:
        msg = f"General connection error for {host}: {str(e)}"
        logger.error(msg)
        raise Exception(msg)


def connect_to_hosts(
    hosts: Union[str, List[str]], username: str, password: str
) -> List[Device]:
    """
    Wrapper to connect to a list of hosts.
    Notes: In a production API context, it is often better to handle hosts one by one
    to report granular status back to the UI immediately.
    """
    target_hosts = [hosts] if isinstance(hosts, str) else hosts
    successful_connections = []

    for host in target_hosts:
        try:
            dev = connect_to_host_single(host, username, password)
            if dev:
                successful_connections.append(dev)
                # print(json.dumps({"type": "progress", "message": f"Connected to {host}"}))
        except Exception as e:
            # We catch here to allow other hosts in the list to attempt connection
            print(
                json.dumps({"type": "error", "host": host, "message": str(e)}),
                file=sys.stderr,
            )
            continue

    return successful_connections


def disconnect_from_hosts(connections: List[Device]):
    """Gracefully closes all connections."""
    for dev in connections:
        try:
            if dev.connected:
                dev.close()
                logger.info(f"Disconnected from {dev.hostname}")
        except Exception as e:
            logger.error(f"Error disconnecting from {dev.hostname}: {e}")
