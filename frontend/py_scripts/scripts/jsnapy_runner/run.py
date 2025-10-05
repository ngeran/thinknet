#!/usr/bin/env python3
# ====================================================================================
#
# FILE:               jsnapy_runner/run.py (v3.20 - Advanced Inventory Parsing)
#
# ROLE:               A comprehensive, asynchronous JSNAPy test runner.
#
# DESCRIPTION:
#   This script serves as the backend engine for the JSNAPy Auditing Tool. It has been
#   engineered for flexibility, allowing it to be targeted at a single device via the
#   --hostname flag or at multiple devices defined in a complex, nested YAML inventory
#   file via the --inventory_file flag.
#
#   It emits structured JSON progress updates to stdout, which are captured by the
#   Node.js backend and relayed to the frontend for a real-time execution view.
#
# KEY FEATURES:
#   - Real-Time Progress: Emits JSON objects to stdout for live progress tracking.
#   - Dual Targeting Mode: Supports both direct `--hostname` targeting and `--inventory_file`
#     targeting with complex, nested YAML structures.
#   - Dynamic Test Discovery: Can list all available tests from a definitions file
#     using the `--list_tests` flag.
#   - Parallel Execution: Uses Python's asyncio library to run tests on multiple hosts
#     concurrently, significantly reducing total execution time.
#   - Formatted Reporting: Can generate and save a human-readable text report summarizing
#     the test results.
#   - Robust Error Handling: Captures and reports errors gracefully, from connection
#     failures to script-level exceptions, ensuring the frontend always receives a
#     structured JSON response.
#
# HOW-TO GUIDE (COMMAND-LINE USAGE):
#
#   1. Run tests against a single host:
#      python3 run.py --hostname 172.27.200.200 --username admin --password your_pass --tests test_bgp_summary
#
#   2. Run tests using a structured inventory file:
#      python3 run.py --inventory_file ../../data/inventory.yml --username admin --password your_pass --tests test_bgp_summary
#
#   3. Discover all available tests and output as JSON:
#      python3 run.py --list_tests
#
# DEPENDENCIES (Python Libraries):
#   - juniper-eznc: For connecting to and managing Junos devices.
#   - PyYAML: For parsing YAML configuration and inventory files.
#   - tabulate: For formatting the final text report.
#
# ====================================================================================


# ====================================================================================
# SECTION 1: IMPORTS & INITIAL SETUP
# ====================================================================================
import argparse
import sys
import json
import asyncio
from pathlib import Path
from datetime import datetime
import traceback


# ====================================================================================
# SECTION 2: REAL-TIME PROGRESS REPORTING
# ====================================================================================
def send_progress(event_type, data, message=""):
    """
    @description Formats a progress update as a JSON object and prints it to stdout.
                 The Node.js backend listens on the child process's stdout stream
                 to parse and forward these messages to the frontend via WebSocket.
    @param {str} event_type - The type of event (e.g., 'OPERATION_START', 'STEP_COMPLETE').
    @param {dict} data - A dictionary containing event-specific data (e.g., step number).
    @param {str} message - An optional human-readable message describing the event.
    """
    progress_update = {
        "type": "progress",  # Standard key for the frontend hook to identify progress messages.
        "event_type": event_type,
        "message": message,
        "data": data
    }
    # flush=True is critical to ensure the message is sent immediately.
    print(f"{json.dumps(progress_update)}", file=sys.stdout, flush=True)


# ====================================================================================
# SECTION 3: CORE TEST EXECUTION LOGIC
# ====================================================================================

def run_single_test(device, test_definition):
    """
    Executes a single, defined test against an already-connected PyEZ device object.
    """
    rpc_to_call_name = test_definition['rpc'].replace('-', '_')
    rpc_to_call = getattr(device.rpc, rpc_to_call_name)
    rpc_args = test_definition.get('rpc_args', {})
    xml_data = rpc_to_call(**rpc_args)

    table_data = []
    headers = list(test_definition['fields'].keys())
    for item in xml_data.findall(test_definition['xpath']):
        row = {header: item.findtext(xml_tag, "N/A") for header, xml_tag in zip(headers, test_definition['fields'].values())}
        table_data.append(row)

    title = f"{test_definition.get('title', 'Untitled Test')} for {device.hostname}"
    return {"title": title, "headers": headers, "data": table_data, "error": None}


async def run_tests_on_host(hostname, username, password, tests_to_run, host_index):
    """
    An asynchronous worker that connects to a single host, runs a list of tests,
    and sends real-time progress updates throughout the process.
    """
    from jnpr.junos import Device
    from jnpr.junos.exception import ConnectTimeoutError, ConnectAuthError

    connection_step = (host_index * 2) - 1
    execution_step = host_index * 2

    send_progress("STEP_START", {"step": connection_step, "name": f"Connect to {hostname}", "status": "IN_PROGRESS"}, f"Connecting to {hostname}...")
    try:
        with Device(host=hostname, user=username, passwd=password, timeout=20) as dev:
            send_progress("STEP_COMPLETE", {"step": connection_step, "duration": dev.timeout, "status": "COMPLETED"}, f"Successfully connected to {hostname}.")
            send_progress("STEP_START", {"step": execution_step, "name": f"Run Tests on {hostname}", "status": "IN_PROGRESS"}, f"Executing {len(tests_to_run)} tests on {hostname}...")

            host_results = []
            for test_name, test_def in tests_to_run.items():
                try:
                    test_result = run_single_test(dev, test_def)
                    host_results.append(test_result)
                except Exception as e:
                    print(f"\n[ERROR] Test '{test_name}' failed on {hostname}: {e}\n", file=sys.stderr, flush=True)
                    host_results.append({"title": test_def.get('title', test_name), "error": str(e), "headers": [], "data": []})

            send_progress("STEP_COMPLETE", {"step": execution_step, "status": "COMPLETED"}, f"Finished all tests on {hostname}.")
            return {"hostname": hostname, "status": "success", "test_results": host_results}

    except (ConnectTimeoutError, ConnectAuthError, Exception) as e:
        error_message = f"An error occurred with host {hostname}: {e}"
        if isinstance(e, ConnectTimeoutError): error_message = f"Connection Timed Out for {hostname}."
        elif isinstance(e, ConnectAuthError): error_message = f"Authentication Failed for {hostname}."
        send_progress("STEP_COMPLETE", {"step": connection_step, "status": "FAILED"}, error_message)
        print(f"[ERROR] {error_message}", file=sys.stderr, flush=True)
        return {"hostname": hostname, "status": "error", "message": error_message}


# ====================================================================================
# SECTION 4: REPORT FORMATTING
# ====================================================================================

def format_results_to_text(final_results):
    """
    Converts the final JSON result object into a formatted, human-readable string.
    """
    from tabulate import tabulate
    report_parts = []
    generation_time = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')
    report_parts.append("==================================================\n           JSNAPy Test Results Report\n==================================================")
    report_parts.append(f"Generated on: {generation_time}\n")

    for host_result in final_results.get("results_by_host", []):
        hostname = host_result.get('hostname', 'Unknown Host')
        report_parts.append(f"\n{'='*60}\n  DEVICE: {hostname}\n{'='*60}\n")
        if host_result.get("status") == "error":
            report_parts.append(f"  [ERROR] Could not run tests on this host.\n  Reason: {host_result.get('message')}\n")
            continue
        if not host_result.get("test_results"):
             report_parts.append("  [INFO] No test results returned for this host.\n")
             continue
        for test_result in host_result.get("test_results", []):
            report_parts.append(f"--- TEST: {test_result.get('title', 'Untitled Test')} ---\n")
            if test_result.get("error"):
                report_parts.append(f"  [FAILED] Test execution failed: {test_result['error']}\n")
            elif not test_result.get("data"):
                report_parts.append("  [INFO] No data returned for this check.\n")
            else:
                report_parts.append(tabulate(test_result["data"], headers="keys", tablefmt="grid", showindex=False) + "\n")
    return "\n".join(report_parts)


# ====================================================================================
# SECTION 5: MAIN ASYNCHRONOUS ORCHESTRATOR
# ====================================================================================

async def main_async(args):
    """
    The main asynchronous orchestrator. It handles test discovery, target selection
    from either hostname or a complex inventory file, parallel test execution, and
    saving results.
    """
    import yaml

    script_dir = Path(__file__).parent
    test_definitions_path = script_dir / "tests.yaml"

    if not test_definitions_path.exists():
        raise FileNotFoundError(f"tests.yaml definition file not found in {script_dir}")
    with open(test_definitions_path, 'r') as f:
        all_tests = yaml.safe_load(f)

    if args.list_tests:
        categorized_tests = {}
        for test_name, test_def in all_tests.items():
            category = test_def.get("category", "General")
            if category not in categorized_tests: categorized_tests[category] = []
            categorized_tests[category].append({"id": test_name, "description": test_def.get("title", "No description.")})
        return {"success": True, "discovered_tests": categorized_tests}

    # --- (FIX) ADVANCED TARGET SELECTION LOGIC ---
    # This block now correctly parses the nested inventory.yml structure.
    hostnames = []
    if args.inventory_file:
        inventory_path = Path(args.inventory_file)
        if not inventory_path.is_file():
            raise FileNotFoundError(f"Inventory file not found: {args.inventory_file}")
        with open(inventory_path, 'r') as f:
            inventory_data = yaml.safe_load(f)

            if isinstance(inventory_data, list):
                for location_item in inventory_data:
                    if 'routers' in location_item and isinstance(location_item['routers'], list):
                        for router in location_item['routers']:
                            if 'ip_address' in router:
                                hostnames.append(router['ip_address'])
            else:
                raise ValueError("Inventory file format is not a list of locations as expected.")

    elif args.hostname:
        hostnames = [h.strip() for h in args.hostname.split(',')]

    if not hostnames:
        raise ValueError("No target hosts could be parsed from the inventory file or hostname argument.")
    # --- END FIX ---

    tests_to_run = all_tests
    if args.tests:
        test_names_to_run = [t.strip() for t in args.tests.split(',')]
        tests_to_run = {name: all_tests[name] for name in test_names_to_run if name in all_tests}
        if not tests_to_run: raise ValueError(f"None of the requested tests found: {test_names_to_run}")

    send_progress("OPERATION_START", {"total_steps": len(hostnames) * 2}, f"Starting JSNAPy run for {len(hostnames)} host(s).")
    tasks = [asyncio.create_task(run_tests_on_host(host, args.username, args.password, tests_to_run, i + 1)) for i, host in enumerate(hostnames)]
    results_from_all_hosts = await asyncio.gather(*tasks)
    final_results = {"results_by_host": results_from_all_hosts}
    send_progress("OPERATION_COMPLETE", {"status": "SUCCESS"}, "All operations completed.")

    if args.save_path:
        print("--- Save path provided. Attempting to save report... ---", file=sys.stderr, flush=True)
        try:
            report_content = format_results_to_text(final_results)
            pipeline_root_in_container = script_dir.parent.parent
            output_dir = pipeline_root_in_container / args.save_path
            output_dir.mkdir(parents=True, exist_ok=True)
            timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
            hostname_part = hostnames[0] if len(hostnames) == 1 else 'multiple-hosts'
            filename = f"jsnapy_report_{hostname_part}_{timestamp}.txt"
            filepath = output_dir / filename
            with open(filepath, 'w', encoding='utf-8') as f: f.write(report_content)
            print(f"--- Report successfully saved to {filepath} ---", file=sys.stderr, flush=True)
        except Exception as e:
            print(f"[ERROR] Could not save report file: {e}", file=sys.stderr, flush=True)

    return {"type": "result", "data": final_results}


# ====================================================================================
# SECTION 6: MAIN ENTRY POINT & ARGUMENT PARSING
# ====================================================================================
def main():
    """
    The main synchronous entry point. It parses command-line arguments, validates
    them, and runs the main_async orchestrator. It handles all top-level exceptions
    and ensures a structured JSON output is always printed.
    """
    try:
        parser = argparse.ArgumentParser(description="Parallel, Multi-Test Network Reporter")
        parser.add_argument("--hostname", help="Comma-separated list of target hostnames/IPs.")
        parser.add_argument("--inventory_file", help="Path to a YAML inventory file with a list of hosts.")
        parser.add_argument("--username", help="Username for device access.")
        parser.add_argument("--password", help="Password for device access.")
        parser.add_argument("--tests", help="Optional: Comma-separated list of tests to run.")
        parser.add_argument("--list_tests", action="store_true", help="List available tests in JSON format and exit.")
        parser.add_argument("--save_path", help="Optional: Path to save the final results as a formatted text file.")
        parser.add_argument("--environment", default="development", help="Execution environment context.")
        args = parser.parse_args()

        if not args.list_tests and not args.hostname and not args.inventory_file:
            raise ValueError("A target hostname or an inventory file is required for test execution.")
        if not args.list_tests and (not args.username or not args.password):
            raise ValueError("Username and password are required for test execution.")

        final_output = asyncio.run(main_async(args))
        print(json.dumps(final_output))

    except Exception as e:
        error_message = f"A critical script error occurred: {str(e)}"
        send_progress("OPERATION_COMPLETE", {"status": "FAILED"}, error_message)
        error_output = {"type": "error", "message": error_message}
        print(json.dumps(error_output))
        print(f"CRITICAL ERROR: {traceback.format_exc()}", file=sys.stderr, flush=True)
        # Exit with a non-zero code to indicate failure, but after sending the clean JSON error.
        sys.exit(1)

if __name__ == "__main__":
    main()
