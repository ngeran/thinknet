import yaml
import os
from typing import Dict, List, Optional
import logging
from jnpr.junos import Device

# V1
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def load_yaml_file(file_path: str) -> Optional[Dict]:
    """Load a YAML file and return its contents as a Python dict or list."""
    try:
        with open(file_path, "r") as file:
            return yaml.safe_load(file)
    except FileNotFoundError:
        logger.error(f"File not found at {file_path}")
        return None
    except yaml.YAMLError as error:
        logger.error(f"Error parsing YAML file {file_path}: {error}")
        return None
    except Exception as error:
        logger.error(f"Unexpected error loading {file_path}: {error}")
        return None


def save_yaml_file(file_path: str, data: dict) -> None:
    """Save data to a YAML file."""
    try:
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        with open(file_path, "w") as f:
            yaml.safe_dump(data, f, default_flow_style=False)
    except Exception as e:
        raise Exception(f"Error saving {file_path}: {e}")


def flatten_inventory(inventory: List[Dict]) -> List[Dict]:
    """Flatten inventory.yml into a list of hosts from switches, routers, and firewalls."""
    flat_hosts = []
    for location in inventory:
        for category in ["switches", "routers", "firewalls"]:
            if category in location:
                for host in location[category]:
                    host["location"] = location["location"]
                    flat_hosts.append(host)
    return flat_hosts


def merge_host_data(inventory_file: str, hosts_data_file: str) -> Optional[Dict]:
    """Merge data from inventory.yml and hosts_data.yml, matching hosts by IP or hostname."""
    inventory = load_yaml_file(inventory_file)
    hosts_data = load_yaml_file(hosts_data_file)

    if not inventory or not hosts_data:
        return None

    merged = {
        "username": hosts_data.get("username", "admin"),
        "password": hosts_data.get("password", ""),
        "interval": hosts_data.get("interval", 300),
        "tables": hosts_data.get("tables", ["inet.0"]),
    }

    inventory_hosts = flatten_inventory(inventory)
    inventory_lookup = {host["ip_address"]: host for host in inventory_hosts}

    merged_hosts = []
    for host in hosts_data.get("hosts", []):
        ip = host.get("ip_address")
        if ip in inventory_lookup:
            merged_host = inventory_lookup[ip].copy()
            merged_host.update(host)
            merged_hosts.append(merged_host)
        else:
            logger.warning(
                f"Host '{host.get('host_name', ip)}' in hosts_data.yml not found in inventory.yml"
            )
            merged_hosts.append(host)

    for ip, inv_host in inventory_lookup.items():
        if not any(h["ip_address"] == ip for h in merged_hosts):
            logger.warning(
                f"Host '{inv_host['host_name']}' in inventory.yml not found in hosts_data.yml"
            )
            merged_hosts.append(inv_host)

    merged["hosts"] = merged_hosts
    return merged


def capture_device_state(dev: Device, hostname: str) -> Dict:
    """Capture device state: interfaces, BGP, OSPF, and routing table."""
    state = {}
    try:
        # Interface status
        with dev:
            interfaces = dev.cli("show interfaces terse", warning=False)
            state["interfaces"] = interfaces.strip()
            logger.info(f"Captured interface status for {hostname}")

        # BGP summary (if configured)
        try:
            bgp_summary = dev.cli("show bgp summary", warning=False)
            state["bgp_summary"] = (
                bgp_summary.strip()
                if "Groups:" in bgp_summary
                else "BGP not configured"
            )
            logger.info(f"Captured BGP summary for {hostname}")
        except Exception:
            state["bgp_summary"] = "BGP not configured"
            logger.info(f"BGP not configured on {hostname}")

        # OSPF neighbors (if configured)
        try:
            ospf_neighbors = dev.cli("show ospf neighbor", warning=False)
            state["ospf_neighbors"] = (
                ospf_neighbors.strip()
                if "Neighbor" in ospf_neighbors
                else "OSPF not configured"
            )
            logger.info(f"Captured OSPF neighbors for {hostname}")
        except Exception:
            state["ospf_neighbors"] = "OSPF not configured"
            logger.info(f"OSPF not configured on {hostname}")

        # Routing table summary
        routing_summary = dev.cli("show route summary", warning=False)
        state["routing_summary"] = routing_summary.strip()
        logger.info(f"Captured routing table summary for {hostname}")

    except Exception as e:
        logger.error(f"Error capturing state for {hostname}: {e}")
        state["error"] = str(e)

    return state


def compare_states(pre_state: Dict, post_state: Dict) -> Dict:
    """Compare pre- and post-states and return differences."""
    differences = {}

    # Compare interfaces
    if pre_state.get("interfaces") != post_state.get("interfaces"):
        differences["interfaces"] = {
            "pre": pre_state.get("interfaces", "N/A"),
            "post": post_state.get("interfaces", "N/A"),
            "note": "Interface status changed",
        }

    # Compare BGP summary
    if pre_state.get("bgp_summary") != post_state.get("bgp_summary"):
        differences["bgp_summary"] = {
            "pre": pre_state.get("bgp_summary", "N/A"),
            "post": post_state.get("bgp_summary", "N/A"),
            "note": "BGP summary changed",
        }

    # Compare OSPF neighbors
    if pre_state.get("ospf_neighbors") != post_state.get("ospf_neighbors"):
        differences["ospf_neighbors"] = {
            "pre": pre_state.get("ospf_neighbors", "N/A"),
            "post": post_state.get("ospf_neighbors", "N/A"),
            "note": "OSPF neighbors changed",
        }

    # Compare routing summary
    if pre_state.get("routing_summary") != post_state.get("routing_summary"):
        differences["routing_summary"] = {
            "pre": pre_state.get("routing_summary", "N/A"),
            "post": post_state.get("routing_summary", "N/A"),
            "note": "Routing table summary changed",
        }

    return differences
