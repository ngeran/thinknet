#!/usr/bin/env python3
# ====================================================================================
# FILE: jsnapy_runner/run.py (v4.1 - Stable Production)
# DESCRIPTION:
#   - Executed by JSNAPyService via subprocess.
#   - Performs PyEZ connections, RPC execution, and Snapshotting.
#   - Outputs strictly JSON events to STDOUT for WebSocket streaming.
#
# USAGE:
#   python3 run.py --hostname 1.1.1.1 --username admin --password ... --tests test_storage_check
# ====================================================================================

import sys
import json
import time
import os

# ------------------------------------------------------------------------------------
# 1. IMMEDIATE BOOT MESSAGE
# ------------------------------------------------------------------------------------
# This is CRITICAL. It tells the UI that the subprocess started successfully
# before we even attempt heavy imports (which can take 1-2 seconds).
print(
    json.dumps(
        {
            "type": "progress",
            "event_type": "SCRIPT_BOOT",
            "message": "Worker script initialized...",
            "data": {},
        }
    ),
    file=sys.stdout,
    flush=True,
)


# ------------------------------------------------------------------------------------
# 2. SAFE IMPORTS
# ------------------------------------------------------------------------------------
try:
    import argparse
    import asyncio
    from pathlib import Path
    import yaml

    # Third-party Network Libraries
    from lxml import etree
    from jnpr.junos import Device
    from jnpr.junos.exception import ConnectError, ConnectAuthError

except ImportError as e:
    # If libraries are missing in the Docker container, report it as a JSON error
    # so the UI shows a readable error message instead of a silent crash.
    print(
        json.dumps(
            {
                "type": "error",
                "message": f"Python Import Error: {str(e)}. Please check 'requirements.txt'.",
            }
        ),
        file=sys.stdout,
        flush=True,
    )
    sys.exit(1)


# ====================================================================================
# CONSTANTS & CONFIGURATION
# ====================================================================================
# Paths where data is stored. These must match your Docker volume mounts.
SNAPSHOT_DIR = Path("/app/shared/data/jsnapy/snapshots")
TESTS_ROOT = Path("/app/shared/data/tests")

# Ensure snapshot directory exists. If we can't create it, fail early.
try:
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
except Exception as e:
    print(
        json.dumps(
            {
                "type": "error",
                "message": f"Filesystem Error: Could not create {SNAPSHOT_DIR} - {e}",
            }
        ),
        file=sys.stdout,
        flush=True,
    )
    sys.exit(1)


# ====================================================================================
# HELPER: EVENT EMISSION
# ====================================================================================
def send_event(event_type, data, message=""):
    """
    Emits a structured JSON event to stdout.
    The Service Layer captures this and forwards it to the WebSocket.
    """
    payload = {
        "type": "progress",
        "event_type": event_type,
        "message": message,
        "data": data,
    }
    # flush=True is required for real-time streaming in Python subprocesses
    print(f"{json.dumps(payload)}", file=sys.stdout, flush=True)


# ====================================================================================
# CORE LOGIC: SNAPSHOTS
# ====================================================================================
def save_snapshot(hostname, test_name, tag, xml_data):
    """
    Saves the raw XML RPC response to the shared storage volume.
    Returns the file path if successful.
    """
    timestamp = int(time.time())
    filename = f"{hostname}_{test_name}_{tag}_{timestamp}.xml"
    file_path = SNAPSHOT_DIR / filename

    try:
        # Convert lxml object to string
        xml_str = etree.tostring(xml_data, pretty_print=True, encoding="unicode")
        with open(file_path, "w") as f:
            f.write(xml_str)
        return str(file_path)
    except Exception as e:
        send_event("ERROR", {}, f"Failed to save snapshot: {e}")
        return None


# ====================================================================================
# CORE LOGIC: ACTION EXECUTION (Check vs Snapshot)
# ====================================================================================
def run_single_action(device, test_name, test_def, mode, tag):
    """
    Executes a single test definition against a connected device.

    Args:
        device: Connected jnpr.junos.Device object
        test_name: Name of the test file (e.g. 'test_storage_check')
        test_def: Parsed YAML content of the test
        mode: 'check' (extract fields) or 'snapshot' (save XML)
        tag: Snapshot tag (e.g., 'pre', 'post')
    """
    try:
        # 1. Validate Definition
        if "rpc" not in test_def:
            raise ValueError(f"Test '{test_name}' is missing 'rpc' key")

        # 2. Resolve RPC Method
        # Example: 'get-system-storage-information' -> 'get_system_storage_information'
        rpc_name = test_def["rpc"].replace("-", "_")

        if not hasattr(device.rpc, rpc_name):
            raise ValueError(f"RPC '{rpc_name}' not found on device model")

        rpc_func = getattr(device.rpc, rpc_name)
        rpc_args = test_def.get("rpc_args", {})

        # 3. Execute RPC (Network Call)
        xml_data = rpc_func(**rpc_args)

        # -------------------------------------------------------
        # MODE: SNAPSHOT
        # -------------------------------------------------------
        if mode == "snapshot":
            saved_path = save_snapshot(device.hostname, test_name, tag, xml_data)
            return {
                "title": test_name,
                "status": "success",
                "message": f"Snapshot saved to {saved_path}",
                "snapshot_path": saved_path,
            }

        # -------------------------------------------------------
        # MODE: CHECK (Validation)
        # -------------------------------------------------------
        table_data = []
        headers = list(test_def.get("fields", {}).keys())
        xpath = test_def.get("xpath")

        # Parse XML using XPath from definition
        if xpath:
            for item in xml_data.findall(xpath):
                row = {}
                for header, xml_tag in zip(headers, test_def["fields"].values()):
                    # Extract text safely, default to "N/A" if missing
                    val = item.findtext(xml_tag)

                    # Handling attributes if defined (e.g., @name)
                    if val is None and "@" in xml_tag:
                        attr_name = xml_tag.replace("@", "")
                        val = item.get(attr_name)

                    row[header] = val if val is not None else "N/A"

                table_data.append(row)

        return {
            "title": test_def.get("title", test_name),
            "headers": headers,
            "data": table_data,
            "error": None,
        }

    except Exception as e:
        # Return error structure rather than crashing
        return {"title": test_name, "error": str(e), "headers": [], "data": []}


# ====================================================================================
# WORKER: HOST PROCESSING
# ====================================================================================
async def process_host(hostname, username, password, tests_map, mode, tag, idx):
    """
    Manages the lifecycle of a single host connection:
    Connect -> Run All Tests -> Disconnect -> Return Results
    """
    # Calculate progress step numbers for UI
    step_connect = (idx * 2) - 1
    step_exec = idx * 2

    send_event(
        "STEP_START",
        {"step": step_connect, "name": f"Connect {hostname}"},
        f"Connecting to {hostname}...",
    )

    try:
        # TIMEOUT=10 is critical to prevent hanging on offline devices
        with Device(host=hostname, user=username, passwd=password, timeout=10) as dev:
            # Notify UI: Connected
            send_event(
                "STEP_COMPLETE",
                {
                    "step": step_connect,
                    "status": "COMPLETED",
                    "name": f"Connect {hostname}",
                },
                f"Connected to {hostname}",
            )

            # Notify UI: Starting Execution
            send_event(
                "STEP_START",
                {"step": step_exec, "name": f"Execute {mode}"},
                f"Running {len(tests_map)} operations...",
            )

            results = []

            # Iterate through requested tests
            for t_name, t_def in tests_map.items():
                res = run_single_action(dev, t_name, t_def, mode, tag)
                results.append(res)

            # Notify UI: Finished
            send_event(
                "STEP_COMPLETE",
                {"step": step_exec, "status": "COMPLETED", "name": f"Execute {mode}"},
                f"Completed operations on {hostname}",
            )

            return {"hostname": hostname, "status": "success", "results": results}

    except (ConnectError, ConnectAuthError) as e:
        # Handle Connection/Auth failures gracefully
        err_msg = f"Connection Failed: {str(e)}"
        send_event(
            "STEP_COMPLETE",
            {"step": step_connect, "status": "FAILED", "name": f"Connect {hostname}"},
            err_msg,
        )
        return {"hostname": hostname, "status": "error", "message": str(e)}

    except Exception as e:
        # Handle unexpected crashes
        err_msg = f"Unexpected Error: {str(e)}"
        send_event(
            "STEP_COMPLETE",
            {"step": step_connect, "status": "FAILED", "name": f"Connect {hostname}"},
            err_msg,
        )
        return {"hostname": hostname, "status": "error", "message": str(e)}


# ====================================================================================
# MAIN ORCHESTRATOR
# ====================================================================================
async def main_async(args):
    """
    Main Async Entry Point.
    1. Loads Test Definitions
    2. Launches Host Tasks
    3. Gathers Results
    4. Prints Final JSON
    """

    # --- 1. LOAD TESTS ---
    loaded_tests = {}
    requested_tests = [t.strip() for t in args.tests.split(",")] if args.tests else []

    # Recursive glob to find .yml files in subdirectories
    for yml_file in TESTS_ROOT.rglob("*.yml"):
        # If specific tests requested, filter. Otherwise load all (risky, but allowed).
        if not requested_tests or yml_file.stem in requested_tests:
            try:
                with open(yml_file) as f:
                    loaded_tests[yml_file.stem] = yaml.safe_load(f)
            except Exception as e:
                send_event("WARN", {}, f"Failed to load test {yml_file.name}: {e}")

    # Critical Check: Did we find what the user asked for?
    if not loaded_tests:
        print(
            json.dumps(
                {
                    "type": "error",
                    "message": f"No matching test files found. Searched for: {requested_tests} in {TESTS_ROOT}",
                }
            ),
            file=sys.stdout,
            flush=True,
        )
        return

    # --- 2. TARGET RESOLUTION ---
    # Currently supports single hostname via args.
    # TODO: Add inventory file parsing logic here if needed.
    hosts = [args.hostname] if args.hostname else []

    if not hosts:
        print(
            json.dumps({"type": "error", "message": "No hostname provided."}),
            file=sys.stdout,
            flush=True,
        )
        return

    # --- 3. EXECUTION ---
    # Create a task for each host (allows parallel execution)
    tasks = [
        process_host(
            hostname=h,
            username=args.username,
            password=args.password,
            tests_map=loaded_tests,
            mode=args.mode,
            tag=args.tag,
            idx=i + 1,
        )
        for i, h in enumerate(hosts)
    ]

    # Wait for all hosts to finish
    results = await asyncio.gather(*tasks)

    # --- 4. FINAL OUTPUT ---
    # This specific structure is what Validation.jsx and ImageUploads.jsx look for
    final_payload = {
        "type": "result",
        "data": {
            "results_by_host": [
                {"hostname": r["hostname"], "test_results": r.get("results", [])}
                for r in results
            ]
        },
    }
    print(json.dumps(final_payload), file=sys.stdout, flush=True)


# ====================================================================================
# DISCOVERY MODE (For UI Dropdowns)
# ====================================================================================
def list_tests():
    """
    Scans the tests directory and returns a JSON list of available tests.
    Used by the frontend 'TestSelectionPanel'.
    """
    tests = []
    for f in TESTS_ROOT.rglob("*.yml"):
        tests.append(
            {
                "id": f.stem,
                "path": str(f),
                "group": f.parent.name,
                "description": f"Test from {f.parent.name}",  # Placeholder description
            }
        )
    print(json.dumps({"discovered_tests": tests}), file=sys.stdout, flush=True)


# ====================================================================================
# ENTRY POINT
# ====================================================================================
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--hostname")
    parser.add_argument("--username")
    parser.add_argument("--password")
    parser.add_argument("--tests")
    parser.add_argument("--mode", default="check", choices=["check", "snapshot"])
    parser.add_argument("--tag", default="snap")
    parser.add_argument("--list_tests", action="store_true")

    args = parser.parse_args()

    try:
        if args.list_tests:
            list_tests()
        else:
            asyncio.run(main_async(args))
    except Exception as e:
        # Global Catch-All
        print(
            json.dumps(
                {"type": "error", "message": f"Critical Script Failure: {str(e)}"}
            ),
            file=sys.stdout,
            flush=True,
        )
        sys.exit(1)
