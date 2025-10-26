import logging
from jnpr.junos import Device
from jnpr.junos.exception import ConnectError
from typing import List, Union

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    filename="network_automation.log",
)
logger = logging.getLogger(__name__)


def connect_to_hosts(
    host: Union[str, List[str]], username: str, password: str
) -> List[Device]:
    """Connect to one or more Juniper devices and return the connection objects."""
    # Ensure host is a list
    hosts = [host] if isinstance(host, str) else host
    connections = []
    for h in hosts:
        try:
            logger.info(f"Connecting to host {h} with username {username}")
            print(
                f"DEBUG (connect): Attempting to connect to: {h} with user: {username}"
            )
            dev = Device(host=h, user=username, password=password)
            dev.open()
            logger.info(f"Connected to {h}")
            print(f"DEBUG (connect): Successfully connected to {h}")
            connections.append(dev)
        except ConnectError as e:
            logger.error(f"Failed to connect to {h}: {str(e)}")
            print(f"ERROR (connect): Failed to connect to {h}: {str(e)}")
            continue  # Continue to next host instead of raising
        except Exception as e:
            logger.error(f"Unexpected error connecting to {h}: {str(e)}")
            print(f"ERROR (connect): Unexpected error connecting to {h}: {str(e)}")
            continue
    if not connections:
        logger.error("No connections established to any hosts")
        print("ERROR (connect): No connections established to any hosts")
    return connections


def disconnect_from_hosts(connections: list):
    """Disconnect from all hosts."""
    logger.info(f"Disconnecting from {len(connections)} connections")
    for dev in connections:
        try:
            ip = dev.hostname
            dev.close()
            logger.info(f"Disconnected from {ip}")
            print(f"DEBUG (disconnect): Disconnected from {ip}")
        except Exception as e:
            logger.error(f"Failed to disconnect from {ip}: {str(e)}")
            print(f"ERROR (disconnect): Failed to disconnect from {ip}: {str(e)}")
