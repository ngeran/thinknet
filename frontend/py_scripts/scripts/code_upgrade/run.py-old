#!/usr/bin/env python3
"""
================================================================================
SCRIPT:             Device Code Upgrade
FILENAME:           run.py
VERSION:            5.2 (No Rich Dependency)
AUTHOR:             Network Infrastructure Team
LAST UPDATED:       2025-07-25
================================================================================

DESCRIPTION:
    This script provides a robust, automated solution for upgrading the firmware
    on network devices. It is designed for UI-driven execution and provides
    real-time progress updates to the frontend.

KEY FEATURES:
    - Real-Time Progress: Emits structured JSON events to stderr, allowing the
      frontend to display live progress bars and status messages.
    - Concurrent Upgrades: Utilizes a thread pool to upgrade multiple devices
      simultaneously, significantly reducing total maintenance time.
    - Pre-emptive Validation: Verifies that the specified software image file
      exists on the device before starting the upgrade.
    - Post-Reboot Monitoring & Verification: Actively probes the device after a
      reboot and verifies the final software version.
    - Actionable Reporting: Prints a clear, final summary to stdout.

HOW TO GUIDE:
    This script is intended to be run by the vlabs automation backend. It receives
    all parameters via command-line arguments and communicates its progress
    back to the UI via structured JSON messages printed to stderr.
================================================================================
"""

# ================================================================================
# SECTION 1: IMPORTS AND CONFIGURATION
# ================================================================================
import argparse
import logging
import sys
import time
import subprocess
import concurrent.futures
import json
from typing import List, Optional
from enum import Enum
from dataclasses import dataclass

# Third-party libraries
from jnpr.junos import Device
from jnpr.junos.utils.sw import SW

# Configure a logger that prints to standard output for backend capture.
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)-8s - %(message)s',
    stream=sys.stdout
)
logger = logging.getLogger(__name__)

# Define the number of steps in the workflow for a single device.
STEPS_PER_DEVICE = 6 # 1.Connect, 2.Check Image, 3.Check Version, 4.Install, 5.Probe, 6.Verify


# ================================================================================
# SECTION 2: REAL-TIME PROGRESS REPORTING
# ================================================================================

def send_progress(event_type: str, data: dict, message: str = ""):
    """
    Formats a progress update as JSON and prints it to stderr for the backend.
    """
    progress_update = {"event_type": event_type, "message": message, "data": data}
    print(f"JSON_PROGRESS: {json.dumps(progress_update)}", file=sys.stderr, flush=True)


# ================================================================================
# SECTION 3: DATA STRUCTURES
# ================================================================================

class UpgradePhase(Enum):
    PENDING="pending"; CONNECTING="connecting"; CHECKING_IMAGE="checking_image"; CHECKING_VERSION="checking_version"; INSTALLING="installing"; REBOOTING="rebooting"; PROBING="probing"; VERIFYING="verifying"; COMPLETED="completed"; FAILED="failed"; SKIPPED="skipped"

@dataclass
class DeviceStatus:
    hostname: str; target_version: str; phase: UpgradePhase = UpgradePhase.PENDING; message: str = "Waiting to start"; initial_version: Optional[str] = None; final_version: Optional[str] = None; error: Optional[str] = None; success: bool = False
    def update_phase(self, phase: UpgradePhase, message: str = ""):
        self.phase = phase; self.message = message or phase.value.replace("_", " ").title(); logger.info(f"[{self.hostname}] STATUS: {self.phase.name} - {self.message}")


# ================================================================================
# SECTION 4: DEVICE UPGRADE WORKFLOW
# ================================================================================

def upgrade_device(hostname: str, username: str, password: str, image_filename: str, target_version: str, start_step: int) -> DeviceStatus:
    """
    Performs the entire upgrade workflow for a single device, emitting real-time
    progress updates along the way.
    """
    status = DeviceStatus(hostname=hostname, target_version=target_version)
    dev = None
    full_image_path_on_device = f"/var/tmp/{image_filename}"
    current_step = start_step

    try:
        # STEP 1: Connect
        send_progress("STEP_START", {"step": current_step, "name": f"Connect to {hostname}"}, f"Connecting to {hostname}...")
        dev = Device(host=hostname, user=username, password=password, auto_probe=True, timeout=30)
        dev.open(); dev.timeout = 720
        status.initial_version = dev.facts.get("version", "Unknown"); status.final_version = status.initial_version
        send_progress("STEP_COMPLETE", {"step": current_step, "status": "COMPLETED"}, f"Connected to {hostname}.")
        current_step += 1

        # STEP 2: Check Image
        send_progress("STEP_START", {"step": current_step, "name": f"Verify Image on {hostname}"}, f"Checking for {image_filename}...")
        if image_filename not in dev.cli("file list /var/tmp/", warning=False):
            raise Exception(f"Image '{image_filename}' not found. Please upload it to /var/tmp/ on the device.")
        send_progress("STEP_COMPLETE", {"step": current_step, "status": "COMPLETED"}, "Image found.")
        current_step += 1

        # STEP 3: Check Version
        send_progress("STEP_START", {"step": current_step, "name": f"Check Version on {hostname}"}, f"Current version is {status.initial_version}.")
        if status.initial_version == target_version:
            status.update_phase(UpgradePhase.SKIPPED, "Device is already on the target version."); status.success = True
            send_progress("STEP_COMPLETE", {"step": current_step, "status": "COMPLETED"}, "Skipping, already on target version.")
            for i in range(STEPS_PER_DEVICE - 3): send_progress("STEP_COMPLETE", {"step": current_step + i + 1, "status": "COMPLETED"}, "Skipped.")
            return status
        send_progress("STEP_COMPLETE", {"step": current_step, "status": "COMPLETED"}, "Upgrade required.")
        current_step += 1

        # STEP 4: Install
        send_progress("STEP_START", {"step": current_step, "name": f"Install Software on {hostname}"}, "Starting installation...")
        sw = SW(dev)
        if not sw.install(package=full_image_path_on_device, validate=True, no_copy=True, progress=False):
            raise Exception("The sw.install command returned False. Check device logs.")
        status.update_phase(UpgradePhase.REBOOTING, "Installation successful. Initiating device reboot...")
        sw.reboot()
        send_progress("STEP_COMPLETE", {"step": current_step, "status": "COMPLETED"}, "Installation finished, reboot initiated.")
        current_step += 1

    except Exception as e:
        status.update_phase(UpgradePhase.FAILED, "Process stopped due to an error."); status.error = str(e)
        send_progress("STEP_COMPLETE", {"step": current_step, "status": "FAILED"}, str(e))
        return status
    finally:
        if dev and dev.connected: dev.close()

    # STEP 5: Probe
    send_progress("STEP_START", {"step": current_step, "name": f"Wait for Reboot on {hostname}"}, "Probing device for availability...")
    time.sleep(60)
    max_wait, interval, start_time, device_online = 900, 30, time.time(), False
    while time.time() - start_time < max_wait:
        try:
            if subprocess.run(["ping", "-c", "1", "-W", "2", hostname], check=True, capture_output=True).returncode == 0:
                with Device(host=hostname, user=username, password=password, auto_probe=True, timeout=20): device_online = True; break
        except Exception: time.sleep(interval)
    if not device_online:
        status.update_phase(UpgradePhase.FAILED, "Device did not become reachable after reboot.")
        status.error = "Device was unreachable after the 15-minute timeout period."
        send_progress("STEP_COMPLETE", {"step": current_step, "status": "FAILED"}, status.error)
        return status
    send_progress("STEP_COMPLETE", {"step": current_step, "status": "COMPLETED"}, "Device is back online.")
    current_step += 1

    # STEP 6: Verify
    send_progress("STEP_START", {"step": current_step, "name": f"Verify Final Version on {hostname}"}, "Connecting to verify...")
    try:
        with Device(host=hostname, user=username, password=password, auto_probe=True) as final_dev:
            final_ver = final_dev.facts.get("version")
            status.final_version = final_ver
            if final_ver == target_version:
                status.update_phase(UpgradePhase.COMPLETED, f"Upgrade successful. Final version: {final_ver}"); status.success = True
                send_progress("STEP_COMPLETE", {"step": current_step, "status": "COMPLETED"}, f"Version {final_ver} confirmed.")
            else: raise Exception(f"Version mismatch! Expected '{target_version}', but found '{final_ver}'.")
    except Exception as e:
        status.update_phase(UpgradePhase.FAILED, "Could not verify final version."); status.error = str(e)
        send_progress("STEP_COMPLETE", {"step": current_step, "status": "FAILED"}, str(e))
    return status

# ================================================================================
# SECTION 5: MAIN ORCHESTRATION LOGIC
# ================================================================================

def code_upgrade(host_ips: List[str], username: str, password: str, image_filename: str, target_version: str):
    logger.info(f"Starting upgrade process for hosts: {', '.join(host_ips)}")
    final_statuses = []

    total_steps = len(host_ips) * STEPS_PER_DEVICE
    send_progress("OPERATION_START", {"total_steps": total_steps}, f"Starting code upgrade for {len(host_ips)} device(s).")

    with concurrent.futures.ThreadPoolExecutor(max_workers=min(5, len(host_ips))) as executor:
        future_to_hostname = {
            executor.submit(upgrade_device, host_ips[i], username, password, image_filename, target_version, start_step=(i * STEPS_PER_DEVICE) + 1): host_ips[i]
            for i in range(len(host_ips))
        }
        for future in concurrent.futures.as_completed(future_to_hostname):
            try: final_statuses.append(future.result())
            except Exception as e:
                hostname = future_to_hostname[future]
                error_status = DeviceStatus(hostname=hostname, target_version=target_version, phase=UpgradePhase.FAILED, error=str(e))
                final_statuses.append(error_status)

    send_progress("OPERATION_COMPLETE", {"status": "SUCCESS"}, "All upgrade tasks have finished.")

    # The final summary is printed to stdout for the backend to capture as the "final result".
    # This uses simple print statements for maximum compatibility.
    print("\n\n" + "="*80)
    print("FINAL UPGRADE SUMMARY".center(80))
    print("="*80)
    # Print header
    print(f"{'Hostname':<25}{'Final Status':<15}{'Initial Version':<25}{'Final Version':<25}{'Details'}")
    print("-" * 120)
    for status in sorted(final_statuses, key=lambda s: s.hostname):
        details = status.error or status.message
        print(f"{status.hostname:<25}{status.phase.name:<15}{status.initial_version or 'N/A':<25}{status.final_version or 'N/A':<25}{details}")
    print("\n")


# ================================================================================
# SECTION 6: SCRIPT ENTRY POINT
# ================================================================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Juniper Device Upgrade Automation Script", formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("--hostname", required=True, help="Comma-separated list of target device hostnames or IPs.")
    parser.add_argument("--username", required=True, help="The username for device authentication.")
    parser.add_argument("--password", required=True, help="The password for device authentication.")
    parser.add_argument("--image_filename", required=True, help="The exact FILENAME of the software image.\n(e.g., 'junos-vmx-x86-64-21.4R1.12.tgz')")
    parser.add_argument("--target_version", required=True, help="The target Junos version string to verify against after upgrade.\n(e.g., '21.4R1.12')")
    parser.add_argument("-v", "--verbose", action="store_true", help="Enable verbose DEBUG-level logging.")
    args = parser.parse_args()

    if args.verbose: logger.setLevel(logging.DEBUG)

    try:
        logger.info("Script execution started with validated arguments.")
        host_ips = [ip.strip() for ip in args.hostname.split(",") if ip.strip()]
        if not host_ips: raise ValueError("The --hostname argument cannot be empty.")
        code_upgrade(
            host_ips=host_ips,
            username=args.username,
            password=args.password,
            image_filename=args.image_filename,
            target_version=args.target_version
        )
        logger.info("Script has completed its execution.")
    except Exception as e:
        send_progress("OPERATION_COMPLETE", {"status": "FAILED"}, f"A critical script error occurred: {e}")
        logger.fatal(f"A critical error occurred in the main execution block: {e}", exc_info=True)
        # We exit with 1 to clearly signal a crash to the backend.
        sys.exit(1)
