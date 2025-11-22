#!/usr/bin/env python3
# ====================================================================================
# FILE: jsnapy_runner/run.py (v3.24 - Data Consistency Fix)
# DESCRIPTION: Scans /app/shared/data/tests for .yml files matching test names.
#              FIXED: Added 'name' to STEP_COMPLETE events to fix UI 'undefined' msgs.
# ====================================================================================

import argparse
import sys
import json
import asyncio
from pathlib import Path
from datetime import datetime
import traceback
import yaml
import socket


# ====================================================================================
# HELPER: PROGRESS REPORTING
# ====================================================================================
def send_progress(event_type, data, message=""):
    progress_update = {
        "type": "progress",
        "event_type": event_type,
        "message": message,
        "data": data,
    }
    print(f"{json.dumps(progress_update)}", file=sys.stdout, flush=True)


# ====================================================================================
# CORE LOGIC
# ====================================================================================


def run_single_test(device, test_definition):
    """Executes one test definition against a device."""
    try:
        if "rpc" not in test_definition:
            raise ValueError("Invalid test definition: Missing 'rpc' key")

        rpc_to_call_name = test_definition["rpc"].replace("-", "_")
        if not hasattr(device.rpc, rpc_to_call_name):
            raise ValueError(f"RPC '{rpc_to_call_name}' not found on device")

        rpc_to_call = getattr(device.rpc, rpc_to_call_name)
        rpc_args = test_definition.get("rpc_args", {})
        xml_data = rpc_to_call(**rpc_args)

        table_data = []
        headers = list(test_definition.get("fields", {}).keys())

        xpath = test_definition.get("xpath")
        if xpath:
            for item in xml_data.findall(xpath):
                row = {
                    header: item.findtext(xml_tag, "N/A")
                    for header, xml_tag in zip(
                        headers, test_definition["fields"].values()
                    )
                }
                table_data.append(row)

        title = f"{test_definition.get('title', 'Untitled Test')}"
        return {"title": title, "headers": headers, "data": table_data, "error": None}

    except Exception as e:
        # Return a clean error object instead of crashing
        return {
            "title": test_definition.get("title", "Unknown Test"),
            "headers": [],
            "data": [],
            "error": str(e),
        }


async def run_tests_on_host(hostname, username, password, tests_to_run, host_index):
    """Async worker for a single host."""
    from jnpr.junos import Device

    connection_step = (host_index * 2) - 1
    execution_step = host_index * 2

    send_progress(
        "STEP_START",
        {"step": connection_step, "name": f"Connect to {hostname}"},
        f"Connecting to {hostname}...",
    )

    try:
        with Device(host=hostname, user=username, passwd=password, timeout=10) as dev:
            # FIXED: Added 'name' to data payload
            send_progress(
                "STEP_COMPLETE",
                {
                    "step": connection_step,
                    "status": "COMPLETED",
                    "name": f"Connect to {hostname}",
                },
                f"Connected to {hostname}",
            )

            send_progress(
                "STEP_START",
                {"step": execution_step, "name": f"Run Tests on {hostname}"},
                f"Running {len(tests_to_run)} tests...",
            )

            host_results = []
            for test_name, test_def in tests_to_run.items():
                try:
                    result = run_single_test(dev, test_def)
                    host_results.append(result)
                except Exception as e:
                    host_results.append({"title": test_name, "error": str(e)})

            # FIXED: Added 'name' to data payload
            send_progress(
                "STEP_COMPLETE",
                {
                    "step": execution_step,
                    "status": "COMPLETED",
                    "name": f"Run Tests on {hostname}",
                },
                f"Tests finished on {hostname}",
            )

            return {
                "hostname": hostname,
                "status": "success",
                "test_results": host_results,
            }

    except Exception as e:
        send_progress(
            "STEP_COMPLETE",
            {
                "step": connection_step,
                "status": "FAILED",
                "name": f"Connect to {hostname}",
            },
            str(e),
        )
        return {"hostname": hostname, "status": "error", "message": str(e)}


# ====================================================================================
# MAIN ORCHESTRATOR
# ====================================================================================


async def main_async(args):
    TESTS_ROOT = Path("/app/shared/data/tests")

    if not TESTS_ROOT.exists():
        raise FileNotFoundError(f"Tests directory not found at {TESTS_ROOT}")

    # 1. Find requested tests
    tests_to_run = {}
    if args.tests:
        requested_stems = {Path(t.strip()).stem for t in args.tests.split(",")}
        for yml_file in TESTS_ROOT.rglob("*.yml"):
            if yml_file.stem in requested_stems:
                try:
                    with open(yml_file, "r") as f:
                        tests_to_run[yml_file.stem] = yaml.safe_load(f)
                except Exception as e:
                    print(f"[WARN] Failed to load {yml_file}: {e}", file=sys.stderr)

        if not tests_to_run:
            raise ValueError(f"No matching test files found.")

    # 2. Parse Targets
    hostnames = []
    if args.hostname:
        hostnames = [h.strip() for h in args.hostname.split(",")]
    elif args.inventory_file:
        with open(args.inventory_file, "r") as f:
            inv = yaml.safe_load(f)

            def find_ips(data):
                if isinstance(data, dict):
                    for k, v in data.items():
                        if k == "ip_address":
                            hostnames.append(v)
                        else:
                            find_ips(v)
                elif isinstance(data, list):
                    for item in data:
                        find_ips(item)

            find_ips(inv)

    if not hostnames:
        raise ValueError("No target hosts found.")

    # 3. Execute
    send_progress(
        "OPERATION_START",
        {"total_steps": len(hostnames) * 2},
        f"Starting validation on {len(hostnames)} hosts",
    )

    tasks = [
        asyncio.create_task(
            run_tests_on_host(h, args.username, args.password, tests_to_run, i + 1)
        )
        for i, h in enumerate(hostnames)
    ]

    results = await asyncio.gather(*tasks)

    final_data = {"results_by_host": results}
    send_progress("OPERATION_COMPLETE", {"status": "SUCCESS"}, "Validation completed")

    return {"type": "result", "data": final_data}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--hostname")
    parser.add_argument("--inventory_file")
    parser.add_argument("--username")
    parser.add_argument("--password")
    parser.add_argument("--tests")
    parser.add_argument("--list_tests", action="store_true")
    args = parser.parse_args()

    try:
        if args.list_tests:
            tests = []
            for f in Path("/app/shared/data/tests").rglob("*.yml"):
                tests.append({"id": f.stem, "path": str(f)})
            print(json.dumps({"discovered_tests": tests}))
            return

        final = asyncio.run(main_async(args))
        print(json.dumps(final))
    except Exception as e:
        err = {"type": "error", "message": str(e)}
        send_progress("OPERATION_COMPLETE", {"status": "FAILED"}, str(e))
        print(json.dumps(err))
        sys.exit(0)


if __name__ == "__main__":
    main()
