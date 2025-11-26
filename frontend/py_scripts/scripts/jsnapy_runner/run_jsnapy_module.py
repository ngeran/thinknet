#!/usr/bin/env python3
# =============================================================================
# FILE LOCATION: app_gateway/py_scripts/scripts/jsnapy_runner/run_jsnapy_module. py
# DESCRIPTION:   Enhanced JSNAPy Module Runner with Storage Validation
# VERSION:       2.0.0 - Storage Validation with File Size Comparison
# AUTHOR:        nikos
# DATE:          2025-11-26
# =============================================================================
#
# OVERVIEW:
#   This script executes JSNAPy tests on Juniper devices and validates storage
#   availability against actual file size requirements.  Unlike the original
#   version, this script now:
#   - Accepts file size as a parameter
#   - Calculates required space with 20% safety margin
#   - Compares available space vs required space
#   - Returns explicit validation_passed boolean
#   - Emits structured events for frontend consumption
#
# ARCHITECTURE FLOW:
#   1. Frontend sends POST /api/operations/validation/execute-v2
#      with file_size in bytes
#   2. operations.py queues job with --file-size argument
#   3. fastapi_worker.py executes this script as subprocess
#   4. Script runs JSNAPy snapcheck on device
#   5. Script parses XML snapshot for filesystem data
#   6. Script calculates if available space >= required space
#   7. Script emits validation result via stdout (JSON)
#   8. fastapi_worker.py publishes to Redis channel
#   9.  Rust Hub relays to frontend WebSocket
#   10. Frontend updates UI with pass/fail status
#
# COMMAND-LINE ARGUMENTS:
#   --hostname      Target Juniper device IP/hostname (required)
#   --username      Device authentication username (required)
#   --password      Device authentication password (required)
#   --tests         Comma-separated list of test names (required)
#   --mode          JSNAPy mode: "check" or "enforce" (default: "check")
#   --tag           JSNAPy snapshot tag (default: "snap")
#   --file-size     File size in bytes for validation (optional)
#
# OUTPUT FORMAT:
#   All output is emitted to stdout as JSON events in this format:
#   {
#       "type": "progress" | "result",
#       "event_type": "SCRIPT_BOOT" | "STEP_START" | "PRE_CHECK_COMPLETE",
#       "message": "Human-readable message",
#       "data": { ...  event-specific data ... }
#   }
#
# INTEGRATION POINTS:
#   - Called by: fastapi_worker.py (subprocess execution)
#   - Publishes to: Redis Pub/Sub channel ws_channel:job:{job_id}
#   - Consumed by: Frontend via Rust Hub WebSocket relay
#   - Configuration: /etc/jsnapy/jsnapy.cfg (auto-created)
#   - Test files: /app/shared/data/tests/*. yml
#   - Snapshots: /usr/local/share/jsnapy/snapshots/*. xml
#
# =============================================================================
 
# =============================================================================
# SECTION 1: INITIALIZATION AND BOOT MESSAGE
# =============================================================================
 
import sys
import json
 
# Emit boot message BEFORE any imports that might fail
# This ensures frontend knows the script started even if dependencies are missing
print(
    json.dumps(
        {
            "type": "progress",
            "event_type": "SCRIPT_BOOT",
            "message": "JSNAPy Module initialized - Version 2.0.0",
            "data": {"version": "2.0.0", "features": ["storage_validation", "file_size_comparison"]},
        }
    ),
    file=sys.stdout,
    flush=True,
)
 
# =============================================================================
# SECTION 2: ENVIRONMENT AUTO-CONFIGURATION
# =============================================================================
#
# JSNAPy requires specific configuration files to operate correctly.
# This section creates them dynamically if they don't exist, ensuring
# the script can run in a fresh container environment without manual setup.
#
# Files created:
#   1. /etc/jsnapy/logging.yml - Suppresses JSNAPy's internal logging
#   2. /etc/jsnapy/jsnapy.cfg - Points to snapshot and test directories
#
# Why this is necessary:
#   - JSNAPy looks for config in /etc/jsnapy by default
#   - Docker containers may not have these files pre-configured
#   - Creating them on-the-fly ensures script portability
#   - Silent logging prevents pollution of stdout (we need clean JSON output)
#
# =============================================================================
 
import os
 
def ensure_jsnapy_environment():
    """
    Creates necessary JSNAPy configuration files dynamically if missing.
 
    This function is called immediately on script startup to ensure the
    JSNAPy environment is properly configured before any tests are run.
 
    Configuration paths:
        - Config directory: /etc/jsnapy (mapped to ./shared/jsnapy/config on host)
        - Logging config: /etc/jsnapy/logging.yml
        - JSNAPy config: /etc/jsnapy/jsnapy. cfg
 
    Related files:
        - Test files: /app/shared/data/tests/*.yml
        - Snapshots: /usr/local/share/jsnapy/snapshots/*. xml
    """
    config_dir = "/etc/jsnapy"
    os.makedirs(config_dir, exist_ok=True)
 
    # =========================================================================
    # 1. CREATE LOGGING CONFIGURATION
    # =========================================================================
    # We configure JSNAPy to log at CRITICAL level only to stderr
    # This prevents JSNAPy's internal logs from mixing with our JSON events
 
    logging_path = os.path.join(config_dir, "logging.yml")
    if not os.path.exists(logging_path):
        logging_content = """
version: 1
disable_existing_loggers: False
formatters:
  simple:
    format: "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
handlers:
  console:
    class: logging.StreamHandler
    level: CRITICAL
    formatter: simple
    stream: ext://sys. stderr
root:
  level: CRITICAL
  handlers: [console]
"""
        with open(logging_path, "w") as f:
            f.write(logging_content. strip())
 
    # =========================================================================
    # 2. CREATE JSNAPY CONFIGURATION
    # =========================================================================
    # Points JSNAPy to correct paths for snapshots and test files
    # These paths are mapped via Docker volumes in docker-compose.yml
 
    cfg_path = os.path.join(config_dir, "jsnapy.cfg")
    if not os.path.exists(cfg_path):
        cfg_content = """
[DEFAULT]
snapshot_path = /usr/local/share/jsnapy/snapshots
test_file_path = /app/shared/data/tests
"""
        with open(cfg_path, "w") as f:
            f. write(cfg_content.strip())
 
 
# Execute environment check immediately
ensure_jsnapy_environment()
 
# =============================================================================
# SECTION 3: IMPORTS AND DEPENDENCIES
# =============================================================================
#
# Import order matters:
#   1. Standard library imports (argparse, glob, time)
#   2. Third-party imports (lxml)
#   3. JSNAPy imports (after environment is configured)
#
# Error handling:
#   If any import fails, we emit a structured error event and exit gracefully
#   This ensures frontend receives actionable error messages
#
# =============================================================================
 
import argparse
import glob
import time
from lxml import etree
 
try:
    from jnpr.jsnapy import SnapAdmin
    import logging
 
    # Force JSNAPy logger to CRITICAL to avoid polluting stdout
    logging.getLogger("jnpr.jsnapy"). setLevel(logging.CRITICAL)
except ImportError as e:
    # If JSNAPy is not installed, emit error and exit
    print(
        json.dumps({
            "type": "error",
            "event_type": "IMPORT_ERROR",
            "message": f"Missing required library: {e}",
            "data": {"library": "jnpr.jsnapy", "error": str(e)}
        }),
        file=sys.stdout,
        flush=True,
    )
    sys. exit(1)
 
# =============================================================================
# SECTION 4: CONSTANTS AND CONFIGURATION
# =============================================================================
 
# Directory where JSNAPy saves XML snapshot files
# Pattern: {hostname}_{test}_{tag}.xml
SNAPSHOT_DIR = "/usr/local/share/jsnapy/snapshots"
 
# Default safety margin: 20% extra space required beyond file size
# This matches the safety margin used in run. py for consistency
SAFETY_MARGIN_MULTIPLIER = 1.2
 
# Juniper devices typically use 1KB blocks for filesystem reporting
BLOCK_SIZE_BYTES = 1024
 
# =============================================================================
# SECTION 5: EVENT EMISSION HELPER
# =============================================================================
#
# All communication with the frontend happens through structured JSON events
# emitted to stdout. The fastapi_worker.py reads stdout, parses these events,
# and publishes them to Redis Pub/Sub for WebSocket relay.
#
# Event structure:
#   {
#       "type": "progress" | "result",
#       "event_type": "STEP_START" | "PRE_CHECK_COMPLETE" | etc.,
#       "message": "Human-readable description",
#       "data": { key-value pairs with event details }
#   }
#
# Why this pattern:
#   - Structured: Easy to parse and route by downstream systems
#   - Flexible: Can add new event types without breaking existing code
#   - Debuggable: Each event is a complete, self-contained message
#
# =============================================================================
 
def send_event(event_type, message, data=None):
    """
    Emits a structured JSON event to stdout for consumption by fastapi_worker.
 
    This is the ONLY way this script communicates with the outside world.
    All events are sent to stdout, while debug logs go to stderr.
 
    Event flow:
        1. This function prints JSON to stdout
        2. fastapi_worker.py reads stdout line-by-line
        3. StreamProcessor parses JSON and validates event_type
        4. Worker publishes to Redis channel: ws_channel:job:{job_id}
        5. Rust Hub receives via pattern subscription: ws_channel:job:*
        6.  Rust Hub relays to subscribed WebSocket client
        7. Frontend processes event via logProcessor. js
        8. LiveLogViewer displays formatted message in terminal
 
    Args:
        event_type (str): Event type constant (e.g., "STEP_START", "PRE_CHECK_COMPLETE")
        message (str): Human-readable message for display
        data (dict, optional): Additional structured data for the event
 
    Related files:
        - fastapi_worker.py: StreamProcessor. process_stdout_line()
        - logProcessor.js: processLogMessage()
        - LiveLogViewer.jsx: LogLine component
    """
    event = {
        "type": "progress",
        "event_type": event_type,
        "message": message,
        "data": data or {},
    }
    print(json.dumps(event), flush=True, file=sys.stdout)
 
 
# =============================================================================
# SECTION 6: STORAGE VALIDATION LOGIC
# =============================================================================
#
# This is the core validation logic that determines if the device has
# sufficient space to receive the uploaded file.  It performs these steps:
#
#   1. Calculate required space (file_size * safety_margin)
#   2. Find the filesystem with the most available space
#   3. Compare available blocks vs required blocks
#   4.  Return validation result with detailed information
#
# This logic mirrors the validation performed by run.py to ensure consistency
# between pre-upload validation and actual upload validation.
#
# =============================================================================
 
def validate_storage_sufficiency(filesystem_data, file_size_bytes):
    """
    Validates if device has sufficient storage for the file upload.
 
    This function implements the actual business logic for storage validation.
    It calculates required space with a safety margin and compares against
    available space on the device's filesystems.
 
    Algorithm:
        1. Calculate required space: file_size * 1.2 (20% margin)
        2. Convert to blocks: required_bytes / 1024
        3. Find filesystem with most available space (prefer /var/tmp, /var, /tmp, /)
        4. Compare: available_blocks >= required_blocks
        5. Return detailed result with recommendations
 
    Args:
        filesystem_data (list): List of filesystem dictionaries with keys:
            - filesystem-name: Device name (e.g., /dev/gpt/junos)
            - mounted-on: Mount point (e.g., /var/tmp)
            - available-blocks: Free space in 1KB blocks
            - total-blocks: Total space in 1KB blocks
            - used-blocks: Used space in 1KB blocks
            - used-percent: Usage percentage string (e.g., "45%")
 
        file_size_bytes (int): Size of file to upload in bytes
 
    Returns:
        dict: Validation result with structure:
            {
                "validation_passed": bool,
                "message": str,
                "required_blocks": int,
                "required_bytes": int,
                "required_mb": float,
                "best_filesystem": dict or None,
                "all_filesystems": list,
                "recommendations": list of str
            }
 
    Related functions:
        - run. py: perform_enhanced_pre_flight_checks() (similar logic)
        - run.py: find_best_upload_filesystem() (filesystem selection)
    """
    if not filesystem_data:
        return {
            "validation_passed": False,
            "message": "❌ No filesystem data available from device",
            "required_blocks": 0,
            "required_bytes": 0,
            "required_mb": 0.0,
            "best_filesystem": None,
            "all_filesystems": [],
            "recommendations": [
                "Check device connectivity",
                "Verify NETCONF is enabled",
                "Ensure user has permissions to view system storage"
            ]
        }
 
    # =========================================================================
    # STEP 1: Calculate required space with safety margin
    # =========================================================================
    required_bytes = int(file_size_bytes * SAFETY_MARGIN_MULTIPLIER)
    required_blocks = int(required_bytes / BLOCK_SIZE_BYTES)
    required_mb = required_bytes / (1024 * 1024)
 
    # =========================================================================
    # STEP 2: Find filesystem with most available space
    # =========================================================================
    # Prefer filesystems in this order: /var/tmp > /var > /tmp > /
    # This matches Juniper best practices for temporary file storage
 
    filesystem_priority = {
        "/var/tmp": 0,
        "/var": 1,
        "/tmp": 2,
        "/": 3
    }
 
    # Sort filesystems by priority (lower number = higher priority)
    # Then by available space (more space = higher priority)
    sorted_filesystems = sorted(
        filesystem_data,
        key=lambda fs: (
            filesystem_priority. get(fs. get("mounted-on"), 999),
            -int(fs.get("available-blocks", 0))
        )
    )
 
    best_filesystem = sorted_filesystems[0] if sorted_filesystems else None
 
    if not best_filesystem:
        return {
            "validation_passed": False,
            "message": "❌ No suitable filesystem found on device",
            "required_blocks": required_blocks,
            "required_bytes": required_bytes,
            "required_mb": round(required_mb, 2),
            "best_filesystem": None,
            "all_filesystems": filesystem_data,
            "recommendations": [
                "Check 'show system storage' output on device",
                "Verify filesystems are mounted correctly"
            ]
        }
 
    # =========================================================================
    # STEP 3: Compare available vs required space
    # =========================================================================
    available_blocks = int(best_filesystem.get("available-blocks", 0))
    available_bytes = available_blocks * BLOCK_SIZE_BYTES
    available_mb = available_bytes / (1024 * 1024)
 
    validation_passed = available_blocks >= required_blocks
 
    # =========================================================================
    # STEP 4: Build result with recommendations
    # =========================================================================
    if validation_passed:
        message = (
            f"✅ Sufficient space on {best_filesystem['mounted-on']}\n"
            f"   Available: {available_mb:.2f} MB ({available_blocks:,} blocks)\n"
            f"   Required: {required_mb:.2f} MB ({required_blocks:,} blocks)\n"
            f"   Margin: {int((SAFETY_MARGIN_MULTIPLIER - 1) * 100)}% safety buffer included"
        )
        recommendations = [
            f"Upload will use {best_filesystem['mounted-on']} filesystem",
            f"Space remaining after upload: {(available_mb - required_mb):.2f} MB"
        ]
    else:
        shortage_mb = required_mb - available_mb
        message = (
            f"❌ Insufficient space on {best_filesystem['mounted-on']}\n"
            f"   Available: {available_mb:.2f} MB ({available_blocks:,} blocks)\n"
            f"   Required: {required_mb:.2f} MB ({required_blocks:,} blocks)\n"
            f"   Shortage: {shortage_mb:.2f} MB"
        )
        recommendations = [
            "Run 'request system storage cleanup' on device",
            "Delete old log files: 'delete log files'",
            "Remove unused files from /var/tmp/",
            f"Free up at least {shortage_mb:.2f} MB before uploading"
        ]
 
    return {
        "validation_passed": validation_passed,
        "message": message,
        "required_blocks": required_blocks,
        "required_bytes": required_bytes,
        "required_mb": round(required_mb, 2),
        "available_blocks": available_blocks,
        "available_bytes": available_bytes,
        "available_mb": round(available_mb, 2),
        "best_filesystem": best_filesystem,
        "all_filesystems": filesystem_data,
        "recommendations": recommendations
    }
 
 
# =============================================================================
# SECTION 7: MAIN EXECUTION LOGIC
# =============================================================================
 
def main():
    """
    Main entry point for JSNAPy storage validation script.
 
    Execution flow:
        1. Parse command-line arguments
        2. Validate required parameters
        3. Resolve test file paths
        4. Build JSNAPy configuration YAML
        5. Execute JSNAPy snapcheck
        6. Parse XML snapshot output
        7. Extract filesystem data
        8. Validate storage sufficiency (if file_size provided)
        9. Emit final result event
 
    Exit codes:
        0: Success (validation passed or completed successfully)
        1: Error (validation failed or execution error)
 
    Event emission timeline:
        1.  SCRIPT_BOOT: Script started (emitted in Section 1)
        2.  STEP_START: Initializing JSNAPy
        3. INFO: Running snapshot and analysis
        4.  STEP_COMPLETE: JSNAPy execution finished
        5. VALIDATION_RESULT: Storage validation result
        6. PRE_CHECK_COMPLETE: Final result with all data
 
    Related files:
        - operations.py: build_jsnapy_v2_cmd_args() builds the command
        - fastapi_worker.py: run_script_and_stream_to_redis() executes this script
        - test_storage_check.yml: JSNAPy test definition
    """
    # =========================================================================
    # ARGUMENT PARSING
    # =========================================================================
    parser = argparse.ArgumentParser(
        description="Enhanced JSNAPy Runner with Storage Validation",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--hostname", required=True, help="Target device hostname or IP")
    parser.add_argument("--username", required=True, help="Device authentication username")
    parser.add_argument("--password", required=True, help="Device authentication password")
    parser.add_argument("--tests", required=True, help="Comma-separated list of test names")
    parser.add_argument("--mode", default="check", help="JSNAPy mode: check or enforce")
    parser.add_argument("--tag", default="snap", help="Snapshot tag for identification")
    parser.add_argument("--file-size", type=int, help="File size in bytes for validation (optional)")
 
    args = parser.parse_args()
 
    try:
        # =====================================================================
        # STEP 1: Resolve Test File Paths
        # =====================================================================
        # Test files can be in base directory or 'system/' subdirectory
        # Example: "test_storage_check" might be "system/test_storage_check. yml"
 
        test_arg_list = args.tests.split(",")
        resolved_tests = []
        base_test_path = "/app/shared/data/tests"
 
        for test_name in test_arg_list:
            test_name_clean = test_name.strip()
 
            # Add . yml extension if not present
            if not test_name_clean.endswith(".yml"):
                test_name_clean += ".yml"
 
            # Check if test exists in base path
            if not os.path. exists(f"{base_test_path}/{test_name_clean}"):
                # Try system/ subdirectory
                if os.path.exists(f"{base_test_path}/system/{test_name_clean}"):
                    test_name_clean = f"system/{test_name_clean}"
 
            resolved_tests.append(test_name_clean)
 
        # Build JSNAPy configuration YAML
        formatted_tests = "\n".join([f"      - {t}" for t in resolved_tests])
        config_yaml = f"""
        hosts:
          - device: {args.hostname}
            username: {args.username}
            passwd: {args.password}
        tests:
        {formatted_tests}
        """
 
        # =====================================================================
        # STEP 2: Initialize JSNAPy
        # =====================================================================
        send_event(
            "STEP_START",
            f"Initializing JSNAPy SnapAdmin for {args.hostname}.. .",
            {"hostname": args. hostname, "tests": resolved_tests}
        )
 
        js = SnapAdmin()
        unique_tag = f"pre_upload_{int(time.time())}"
 
        send_event(
            "INFO",
            f"Running snapshot and analysis with tag: {unique_tag}",
            {"tag": unique_tag, "mode": args.mode}
        )
 
        # =====================================================================
        # STEP 3: Execute JSNAPy Snapcheck
        # =====================================================================
        # Flush stdout before calling JSNAPy (C-based library)
        # This ensures all previous events are sent before JSNAPy output
        sys.stdout.flush()
 
        # Run JSNAPy snapcheck - this creates XML snapshot files
        js.snapcheck(config_yaml, unique_tag)
 
        send_event(
            "STEP_COMPLETE",
            "JSNAPy execution finished.  Parsing storage data...",
            {"snapshot_dir": SNAPSHOT_DIR}
        )
 
        # =====================================================================
        # STEP 4: Parse XML Snapshot and Extract Filesystem Data
        # =====================================================================
        # JSNAPy saves snapshots as: {hostname}_{test}_{tag}.xml
        # We search for files matching our hostname and tag
 
        search_pattern = f"*{args.hostname}*{unique_tag}*. xml"
        potential_files = glob.glob(f"{SNAPSHOT_DIR}/{search_pattern}")
 
        extracted_filesystems = []
 
        if potential_files:
            # Use most recent file if multiple matches
            latest_file = max(potential_files, key=os.path.getctime)
 
            with open(latest_file, "r") as f:
                xml_content = f.read()
                root = etree.fromstring(bytes(xml_content, encoding="utf-8"))
 
                # Extract filesystem data from XML
                # XML structure: <root><filesystem><mounted-on>...</mounted-on>...</filesystem></root>
                for filesystem in root.findall(". //filesystem"):
                    mount_point = filesystem.findtext("mounted-on")
 
                    # Filter for relevant mount points
                    # We only care about /var, /tmp, and root filesystem
                    if mount_point and ("/var" in mount_point or mount_point == "/" or mount_point == "/tmp"):
                        filesystem_data = {
                            "filesystem-name": filesystem.findtext("filesystem-name"),
                            "total-blocks": filesystem.findtext("total-blocks"),
                            "used-blocks": filesystem.findtext("used-blocks"),
                            "available-blocks": filesystem.findtext("available-blocks"),
                            "used-percent": filesystem.findtext("used-percent"),
                            "mounted-on": mount_point,
                        }
                        extracted_filesystems.append(filesystem_data)
        else:
            send_event(
                "WARN",
                f"No snapshot XML files found in {SNAPSHOT_DIR}",
                {"pattern": search_pattern}
            )
 
        # =====================================================================
        # STEP 5: Validate Storage Sufficiency
        # =====================================================================
        validation_result = None
 
        if args.file_size and extracted_filesystems:
            # Perform validation with file size comparison
            validation_result = validate_storage_sufficiency(
                extracted_filesystems,
                args.file_size
            )
 
            send_event(
                "VALIDATION_RESULT",
                validation_result["message"],
                {
                    "validation_passed": validation_result["validation_passed"],
                    "required_mb": validation_result["required_mb"],
                    "available_mb": validation_result. get("available_mb"),
                    "best_filesystem": validation_result["best_filesystem"]["mounted-on"] if validation_result["best_filesystem"] else None
                }
            )
        elif args.file_size and not extracted_filesystems:
            # File size provided but no filesystem data
            validation_result = {
                "validation_passed": False,
                "message": "❌ No filesystem data available for validation",
                "required_blocks": int((args.file_size * SAFETY_MARGIN_MULTIPLIER) / BLOCK_SIZE_BYTES),
                "required_bytes": int(args.file_size * SAFETY_MARGIN_MULTIPLIER),
                "required_mb": (args.file_size * SAFETY_MARGIN_MULTIPLIER) / (1024 * 1024),
                "best_filesystem": None,
                "all_filesystems": [],
                "recommendations": ["Check device connectivity and permissions"]
            }
        elif extracted_filesystems and not args.file_size:
            # No file size provided - just check for critically low space
            critical_threshold_blocks = 500000
            critical_filesystems = [
                fs for fs in extracted_filesystems
                if int(fs. get("available-blocks", 0)) < critical_threshold_blocks
            ]
 
            validation_passed = len(critical_filesystems) == 0
 
            if validation_passed:
                message = f"✅ No filesystems critically low (threshold: {critical_threshold_blocks} blocks)"
            else:
                critical_mounts = [fs["mounted-on"] for fs in critical_filesystems]
                message = f"⚠️ Low space detected on: {', '.join(critical_mounts)}"
 
            validation_result = {
                "validation_passed": validation_passed,
                "message": message,
                "required_blocks": None,
                "required_bytes": None,
                "required_mb": None,
                "best_filesystem": extracted_filesystems[0] if extracted_filesystems else None,
                "all_filesystems": extracted_filesystems,
                "recommendations": [
                    "File size not provided - cannot validate upload capacity",
                    "Run 'request system storage cleanup' if space is low"
                ]
            }
        else:
            # No file size and no filesystem data
            validation_result = {
                "validation_passed": False,
                "message": "❌ Cannot validate: No filesystem data and no file size provided",
                "required_blocks": None,
                "required_bytes": None,
                "required_mb": None,
                "best_filesystem": None,
                "all_filesystems": [],
                "recommendations": ["Provide file size for accurate validation"]
            }
 
        # =====================================================================
        # STEP 6: Emit Final Result
        # =====================================================================
        # This is the event the frontend is waiting for
        # Event type PRE_CHECK_COMPLETE is recognized by logProcessor. js
 
        final_payload = {
            "type": "result",
            "event_type": "PRE_CHECK_COMPLETE",
            "message": validation_result["message"] if validation_result else "Storage check completed",
            "data": {
                "validation_passed": validation_result["validation_passed"] if validation_result else False,
                "required_mb": validation_result. get("required_mb"),
                "available_mb": validation_result.get("available_mb"),
                "best_filesystem": validation_result.get("best_filesystem"),
                "recommendations": validation_result.get("recommendations", []),
                "results_by_host": [
                    {
                        "hostname": args.hostname,
                        "test_results": [
                            {
                                "title": "storage_check",
                                "status": "passed" if (validation_result and validation_result["validation_passed"]) else "failed",
                                "data": extracted_filesystems,
                                "error": None if (validation_result and validation_result["validation_passed"]) else validation_result.get("message") if validation_result else "Unknown error",
                            }
                        ],
                    }
                ],
            },
        }
 
        print(json.dumps(final_payload), file=sys.stdout, flush=True)
 
        # Exit with appropriate code
        if validation_result and validation_result["validation_passed"]:
            sys.exit(0)
        else:
            sys.exit(1)
 
    except Exception as e:
        # =====================================================================
        # ERROR HANDLING
        # =====================================================================
        # Any unhandled exception is caught here and emitted as structured error
 
        error_payload = {
            "type": "result",
            "event_type": "PRE_CHECK_COMPLETE",
            "message": f"❌ JSNAPy execution failed: {str(e)}",
            "data": {
                "validation_passed": False,
                "results_by_host": [
                    {
                        "hostname": args.hostname,
                        "test_results": [
                            {
                                "title": "Error",
                                "status": "failed",
                                "error": str(e),
                                "data": []
                            }
                        ],
                    }
                ],
            },
        }
        print(json.dumps(error_payload), file=sys.stdout, flush=True)
        sys.exit(1)
 
 
if __name__ == "__main__":
    main()
