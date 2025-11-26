#!/usr/bin/env python3
import sys
import json
import os
import argparse
import glob
import time
import subprocess
import tempfile
from lxml import etree

# ------------------------------------------------------------------------------------
# 1. BOOT MESSAGE
# ------------------------------------------------------------------------------------
print(
    json.dumps(
        {
            "type": "progress",
            "event_type": "SCRIPT_BOOT",
            "message": "JSNAPy Module initialized...",
            "data": {},
        }
    ),
    file=sys.stdout,
    flush=True,
)


# ------------------------------------------------------------------------------------
# 2. AUTO-CONFIGURATION ("On the Fly" Creation)
# ------------------------------------------------------------------------------------
def ensure_jsnapy_environment():
    """
    Creates necessary JSNAPy configuration files dynamically if they are missing.
    This writes to /etc/jsnapy, which is mapped to ./shared/jsnapy/config on your host.
    """
    config_dir = "/etc/jsnapy"
    os.makedirs(config_dir, exist_ok=True)

    # 1. Create logging.yml dynamically
    logging_path = os.path.join(config_dir, "logging.yml")
    if not os.path.exists(logging_path):
        # We generate a silent logger so it doesn't mess up our JSON output
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
    stream: ext://sys.stderr
root:
  level: CRITICAL
  handlers: [console]
"""
        with open(logging_path, "w") as f:
            f.write(logging_content.strip())

    # 2. Create jsnapy.cfg dynamically
    cfg_path = os.path.join(config_dir, "jsnapy.cfg")
    if not os.path.exists(cfg_path):
        # Points to the internal docker paths which are mapped to your host
        cfg_content = """
[DEFAULT]
snapshot_path = /usr/local/share/jsnapy/snapshots
test_file_path = /app/shared/data/tests
"""
        with open(cfg_path, "w") as f:
            f.write(cfg_content.strip())


# Execute environment check immediately
ensure_jsnapy_environment()

# ------------------------------------------------------------------------------------
# 3. IMPORTS
# ------------------------------------------------------------------------------------
try:
    from jnpr.jsnapy import SnapAdmin
    import logging

    # Force silence logging to avoid polluting stdout
    logging.getLogger("jnpr.jsnapy").setLevel(logging.CRITICAL)
except ImportError as e:
    print(
        json.dumps({"type": "error", "message": f"Import Error: {e}"}),
        file=sys.stdout,
        flush=True,
    )
    sys.exit(1)

# Constants
SNAPSHOT_DIR = "/usr/local/share/jsnapy/snapshots"


def send_event(event_type, message, data=None):
    print(
        json.dumps(
            {
                "type": "progress",
                "event_type": event_type,
                "message": message,
                "data": data or {},
            }
        ),
        file=sys.stdout,
        flush=True,
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--hostname", required=True)
    parser.add_argument("--username", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--tests", required=True)
    parser.add_argument("--mode", default="check")
    parser.add_argument("--tag", default="snap")
    args = parser.parse_args()

    try:
        # 1. Resolve Test Files
        # Your tree shows tests are in 'shared/data/tests/system/'
        # The frontend sends "test_storage_check", so we might need to handle the 'system/' folder
        # For now, we assume the frontend sends the correct path or we look recursively (simplified here)

        # NOTE: If your test file is inside a subfolder (system/), JSNAPy needs that in the name
        # We try to auto-detect if the simple name is passed but it lives in 'system/'
        test_arg_list = args.tests.split(",")
        resolved_tests = []

        for t in test_arg_list:
            t_clean = t.strip()
            if not t_clean.endswith(".yml"):
                t_clean += ".yml"

            # Check if it exists in base path, if not check 'system/'
            base_path = "/app/shared/data/tests"
            if not os.path.exists(f"{base_path}/{t_clean}"):
                if os.path.exists(f"{base_path}/system/{t_clean}"):
                    t_clean = f"system/{t_clean}"

            resolved_tests.append(t_clean)

        formatted_tests = "\n".join([f"      - {t}" for t in resolved_tests])

        config_yaml = f"""
        hosts:
          - device: {args.hostname}
            username: {args.username}
            passwd: {args.password}
        tests:
        {formatted_tests}
        """

        send_event(
            "STEP_START", f"Initializing JSNAPy SnapAdmin for {args.hostname}..."
        )

        # 2. Execute JSNAPy
        js = SnapAdmin()
        unique_tag = f"pre_upload_{int(time.time())}"

        send_event("INFO", "Running snapshot and analysis...")

        # Flush stdout before running C-based libraries to keep stream clean
        sys.stdout.flush()

        # Use command line JSNAPy instead of Python API for better reliability
        try:
            # Write config to temporary file
            with tempfile.NamedTemporaryFile(
                mode="w", suffix=".yml", delete=False
            ) as config_file:
                config_file.write(config_yaml)
                config_file_path = config_file.name

            send_event("INFO", "Creating snapshot using JSNAPy command line...")

            # Run JSNAPy snapcheck command (snapshot + check in one operation)
            cmd = ["jsnapy", "--snapcheck", unique_tag, "-f", config_file_path, "-v"]

            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)

            if result.returncode != 0:
                send_event("ERROR", f"JSNAPy command failed: {result.stderr}")
                raise Exception(
                    f"JSNAPy command failed with return code {result.returncode}"
                )

            send_event("INFO", f"JSNAPy snapcheck completed successfully")

            # Clean up temp file
            os.unlink(config_file_path)

        except Exception as e:
            error_msg = str(e)
            if "ConnectAuthError" in error_msg or "AuthenticationError" in error_msg:
                send_event(
                    "ERROR",
                    f"❌ Authentication failed for {args.hostname}. Please check username and password.",
                )
                send_event(
                    "ERROR",
                    f"💡 Correct credentials for this device are typically: admin/manolis1",
                )
            else:
                send_event("ERROR", f"JSNAPy operation failed: {e}")
            raise Exception(f"JSNAPy operation failed: {e}")

        send_event(
            "STEP_COMPLETE", "JSNAPy execution finished. Parsing storage data..."
        )

        # 3. Data Extraction
        # JSNAPy --snapcheck saves files with pattern: <hostname>_test_snapcheck_tag_show_system_storage.xml
        # Since we use --snapcheck, look for the specific file pattern it creates
        search_pattern = f"*{args.hostname}_test_snapcheck_tag_show_system_storage.xml"

        potential_files = glob.glob(f"{SNAPSHOT_DIR}/{search_pattern}")

        send_event("DEBUG", f"Looking for files with pattern: {search_pattern}")
        send_event("DEBUG", f"Found files: {potential_files}")

        extracted_rows = []

        if potential_files:
            latest_file = max(potential_files, key=os.path.getctime)

            with open(latest_file, "r") as f:
                xml_content = f.read()
                root = etree.fromstring(bytes(xml_content, encoding="utf-8"))

                for filesystem in root.findall(".//filesystem"):
                    mount_point = filesystem.findtext("mounted-on")
                    # Filter for /var, root, or /.mount (Juniper), which are usually relevant for uploads
                    if mount_point and (
                        "/var" in mount_point
                        or mount_point == "/"
                        or "/.mount" in mount_point
                    ):
                        row = {
                            "filesystem-name": (
                                filesystem.findtext("filesystem-name") or ""
                            ).strip(),
                            "total-blocks": (
                                filesystem.findtext("total-blocks") or ""
                            ).strip(),
                            "used-blocks": (
                                filesystem.findtext("used-blocks") or ""
                            ).strip(),
                            "available-blocks": (
                                filesystem.findtext("available-blocks") or ""
                            ).strip(),
                            "used-percent": (
                                filesystem.findtext("used-percent") or ""
                            ).strip(),
                            "mounted-on": mount_point,
                        }
                        extracted_rows.append(row)
        else:
            send_event("WARN", f"Snapshot XML not found in {SNAPSHOT_DIR}")

        # 4. Final Output
        final_payload = {
            "type": "result",
            "data": {
                "results_by_host": [
                    {
                        "hostname": args.hostname,
                        "test_results": [
                            {
                                "title": "storage_check",
                                "status": "success",
                                "data": extracted_rows,
                                "error": None,
                            }
                        ],
                    }
                ]
            },
        }
        print(json.dumps(final_payload), file=sys.stdout, flush=True)

    except Exception as e:
        err_payload = {
            "type": "result",
            "data": {
                "results_by_host": [
                    {
                        "hostname": args.hostname,
                        "test_results": [
                            {"title": "Error", "error": str(e), "data": []}
                        ],
                    }
                ]
            },
        }
        print(json.dumps(err_payload), file=sys.stdout, flush=True)


if __name__ == "__main__":
    main()
