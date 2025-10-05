import sys
from getpass import getpass
from pathlib import Path

import yaml
from jnpr.junos.utils.config import Config
from lxml import etree
from tabulate import (
    tabulate,  # Ensure you have tabulate installed: pip install tabulate
)

from scripts.connect_to_hosts import (
    connect_to_hosts,  # Ensure this is in your PYTHONPATH or same directory
)


def extract_juniper_ips(inventory_path):
    try:
        with open(inventory_path, "r") as f:
            data = yaml.safe_load(f)
        devices = []
        for location in data.get("inventory", []):
            # Routers
            for router in location.get("routers", []):
                if router.get("vendor", "").upper() == "JUNIPER" and router.get(
                    "ip_address"
                ):
                    devices.append(router["ip_address"])
            # Switches
            for switch in location.get("switches", []):
                if switch.get("vendor", "").upper() == "JUNIPER" and switch.get(
                    "ip_address"
                ):
                    devices.append(switch["ip_address"])
        return devices
    except Exception as e:
        print(f"ERROR: Failed to parse inventory file: {e}")
        return []


def backup_configuration(devices, username, password):
    backup_dir = Path("backups")
    backup_dir.mkdir(exist_ok=True)

    succeeded = []
    failed = []

    for device_ip in devices:
        print(f"\nConnecting to {device_ip}...")
        connections = connect_to_hosts(device_ip, username, password)
        if not connections:
            print(f"Failed to connect to {device_ip}.")
            failed.append(device_ip)
            continue
        dev = connections[0]
        try:
            print(f"Retrieving configuration from {device_ip}...")

            # XML backup
            config_xml = dev.rpc.get_config()
            backup_file_xml = backup_dir / f"{device_ip}_config.xml"
            with open(backup_file_xml, "w") as f:
                f.write(etree.tostring(config_xml, pretty_print=True).decode())

            # set format backup
            config_set = dev.rpc.get_config(options={"format": "set"})
            backup_file_set = backup_dir / f"{device_ip}_config.set"
            with open(backup_file_set, "w") as f:
                if isinstance(config_set, dict):
                    f.write(config_set.get("output", ""))
                else:
                    f.write(config_set.text)

            # JSON backup
            config_json = dev.rpc.get_config(options={"format": "json"})
            backup_file_json = backup_dir / f"{device_ip}_config.json"
            with open(backup_file_json, "w") as f:
                if isinstance(config_json, dict):
                    import json

                    f.write(json.dumps(config_json, indent=4))
                else:
                    f.write(config_json.text)

            print(
                f"Backup successful: {backup_file_xml}, {backup_file_set}, {
                    backup_file_json
                }"
            )
            succeeded.append(device_ip)
        except Exception as e:
            print(f"Failed to backup config for {device_ip}: {e}")
            failed.append(device_ip)
        finally:
            try:
                dev.close()
            except Exception:
                pass

    # Display backup report
    print("\nBackup Report:")
    device_status = []
    for ip in succeeded:
        device_status.append([ip, "Succeeded"])
    for ip in failed:
        device_status.append([ip, "Failed"])
    print(
        tabulate(
            device_status, headers=["Device IP", "Backup Status"], tablefmt="github"
        )
    )


def restore_configuration():
    print("\nRestore Configuration")
    device_ip = input("Enter the device IP to restore configuration: ").strip()
    username = input("Enter Juniper username: ")
    password = getpass("Enter Juniper password: ")

    backup_dir = Path("backups")
    if not backup_dir.exists():
        print("ERROR: Backup directory does not exist.")
        return

    # Check for backup files
    backup_file_xml = backup_dir / f"{device_ip}_config.xml"
    if not backup_file_xml.exists():
        print(f"ERROR: No backup file found for {device_ip}.")
        return

    print(f"\nConnecting to {device_ip}...")
    connections = connect_to_hosts(device_ip, username, password)
    if not connections:
        print(f"Failed to connect to {device_ip}.")
        return

    dev = connections[0]
    try:
        print(f"Restoring configuration to {device_ip}...")
        with open(backup_file_xml, "r") as f:
            config_xml = f.read()

        # Load configuration to the device
        cu = Config(dev)
        cu.load(config_xml, format="xml", overwrite=True)
        cu.commit()
        print(f"Configuration restored successfully to {device_ip}.")
    except Exception as e:
        print(f"Failed to restore configuration for {device_ip}: {e}")
    finally:
        try:
            dev.close()
        except Exception:
            pass


def main():
    print("Juniper Config Utility")
    menu = [["1", "Backup Configuration"], ["2", "Restore Configuration"]]
    print(tabulate(menu, headers=["Option", "Action"], tablefmt="grid"))

    choice = input("Select an option (1/2): ").strip()
    if choice == "1":
        print("\nBackup Configuration")
        choice = (
            input("Use inventory file (data/inventory.yml)? (y/n): ").strip().lower()
        )
        if choice == "y":
            inventory_path = (
                Path(__file__).resolve().parent.parent / "data" / "inventory.yml"
            )
            if not inventory_path.exists():
                print("ERROR: data/inventory.yml not found.")
                sys.exit(1)
            devices = extract_juniper_ips(inventory_path)
        else:
            ips = input("Enter device IPs (comma separated): ").strip()
            devices = [ip.strip() for ip in ips.split(",") if ip.strip()]

        if not devices:
            print("No devices specified. Exiting.")
            sys.exit(1)

        username = input("Enter Juniper username: ")
        password = getpass("Enter Juniper password: ")

        backup_configuration(devices, username, password)
    elif choice == "2":
        restore_configuration()
    else:
        print("Invalid option. Exiting.")


if __name__ == "__main__":
    main()
