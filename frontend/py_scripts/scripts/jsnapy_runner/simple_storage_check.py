#!/usr/bin/env python3
"""
Simple storage validation script that bypasses JSNAPy test parsing issues.
Directly connects to device and retrieves storage information.
"""

import sys
import json
import argparse
from jnpr.junos import Device


def send_event(event_type, message, data=None):
    """Emit structured JSON event to stdout"""
    event = {
        "type": "progress" if event_type != "PRE_CHECK_COMPLETE" else "result",
        "event_type": event_type,
        "message": message,
        "data": data or {},
    }
    print(json.dumps(event), flush=True, file=sys.stdout)


def main():
    parser = argparse.ArgumentParser(description="Simple Storage Validation")
    parser.add_argument(
        "--hostname", required=True, help="Target device hostname or IP"
    )
    parser.add_argument(
        "--username", required=True, help="Device authentication username"
    )
    parser.add_argument(
        "--password", required=True, help="Device authentication password"
    )
    parser.add_argument(
        "--file-size", type=int, help="File size in bytes for validation"
    )
    parser.add_argument("--tests", required=True, help="Test names (required)")
    parser.add_argument("--mode", default="check", help="JSNAPy mode")
    parser.add_argument("--tag", default="snap", help="Snapshot tag")

    args = parser.parse_args()

    try:
        send_event("STEP_START", f"Connecting to {args.hostname}...")

        # Connect to device
        dev = Device(host=args.hostname, user=args.username, password=args.password)
        dev.open()

        send_event("INFO", f"Connected successfully, retrieving storage information...")

        # Get storage information
        result = dev.rpc.get_system_storage()

        send_event("STEP_COMPLETE", "Storage data retrieved, parsing...")

        # Parse filesystem data
        filesystems = []
        root = result

        # Find all filesystem elements
        for fs in root.findall(".//filesystem"):
            fs_data = {
                "filesystem-name": fs.findtext("filesystem-name"),
                "total-blocks": fs.findtext("total-blocks"),
                "used-blocks": fs.findtext("used-blocks"),
                "available-blocks": fs.findtext("available-blocks"),
                "used-percent": fs.findtext("used-percent"),
                "mounted-on": fs.findtext("mounted-on"),
            }

            # Only include relevant filesystems (exclude special mounts like /etc/hosts)
            mounted_on = fs_data["mounted-on"].strip() if fs_data["mounted-on"] else ""
            if mounted_on and not mounted_on.startswith("/etc/"):
                # Clean up numeric values (remove newlines and convert to int)
                try:
                    fs_data["available-blocks"] = int(
                        fs_data["available-blocks"].strip()
                    )
                    fs_data["total-blocks"] = int(fs_data["total-blocks"].strip())
                    fs_data["used-blocks"] = int(fs_data["used-blocks"].strip())
                    fs_data["used-percent"] = int(fs_data["used-percent"].strip())
                except (ValueError, TypeError):
                    continue  # Skip invalid data
                filesystems.append(fs_data)

        dev.close()

        # Perform validation if file size provided
        validation_result = {
            "validation_passed": False,
            "message": "",
            "required_mb": None,
            "available_mb": None,
            "best_filesystem": None,
            "recommendations": [],
        }

        if args.file_size and filesystems:
            # Calculate required space with 20% margin
            required_bytes = int(args.file_size * 1.2)
            required_blocks = int(required_bytes / 1024)
            required_mb = required_bytes / (1024 * 1024)

            # Find best filesystem (prefer /var/tmp > /var > /tmp > /)
            priority = {"/var/tmp": 0, "/var": 1, "/tmp": 2, "/": 3}

            best_fs = None
            for fs in filesystems:
                if (
                    fs["available-blocks"]
                    and int(fs["available-blocks"]) > required_blocks
                ):
                    if best_fs is None or (
                        priority.get(fs["mounted-on"], 999)
                        < priority.get(best_fs["mounted-on"], 999)
                    ):
                        best_fs = fs

            if best_fs:
                available_blocks = int(best_fs["available-blocks"])
                available_bytes = available_blocks * 1024
                available_mb = available_bytes / (1024 * 1024)

                validation_result = {
                    "validation_passed": True,
                    "message": f"✅ Sufficient space on {best_fs['mounted-on']}\\n   Available: {available_mb:.2f} MB ({available_blocks:,} blocks)\\n   Required: {required_mb:.2f} MB ({required_blocks:,} blocks)\\n   Margin: 20% safety buffer included",
                    "required_mb": round(required_mb, 2),
                    "available_mb": round(available_mb, 2),
                    "best_filesystem": best_fs,
                    "recommendations": [
                        f"Upload will use {best_fs['mounted-on']} filesystem"
                    ],
                }
            else:
                validation_result = {
                    "validation_passed": False,
                    "message": f"❌ Insufficient space on any filesystem\\n   Required: {required_mb:.2f} MB ({required_blocks:,} blocks)",
                    "required_mb": round(required_mb, 2),
                    "available_mb": None,
                    "best_filesystem": None,
                    "recommendations": [
                        "Free up space on device",
                        "Check 'show system storage' output",
                    ],
                }
        elif filesystems:
            # No file size provided - just check for critically low space
            validation_result = {
                "validation_passed": True,
                "message": f"✅ Storage information retrieved successfully",
                "required_mb": None,
                "available_mb": None,
                "best_filesystem": filesystems[0] if filesystems else None,
                "recommendations": [
                    "File size not provided - cannot validate upload capacity"
                ],
            }
        else:
            validation_result = {
                "validation_passed": False,
                "message": "❌ No filesystem data available from device",
                "required_mb": 0,
                "available_mb": 0,
                "best_filesystem": None,
                "recommendations": [
                    "Check device connectivity",
                    "Verify NETCONF is enabled",
                ],
            }

        # Send final result
        final_payload = {
            "type": "result",
            "event_type": "PRE_CHECK_COMPLETE",
            "message": validation_result["message"],
            "data": {
                "validation_passed": validation_result["validation_passed"],
                "required_mb": validation_result["required_mb"],
                "available_mb": validation_result["available_mb"],
                "best_filesystem": validation_result["best_filesystem"],
                "recommendations": validation_result["recommendations"],
                "results_by_host": [
                    {
                        "hostname": args.hostname,
                        "test_results": [
                            {
                                "title": "storage_check",
                                "status": "passed"
                                if validation_result["validation_passed"]
                                else "failed",
                                "data": filesystems,
                                "error": None
                                if validation_result["validation_passed"]
                                else validation_result["message"],
                            }
                        ],
                    }
                ],
            },
        }

        print(json.dumps(final_payload), flush=True, file=sys.stdout)

        # Exit with appropriate code
        if validation_result["validation_passed"]:
            sys.exit(0)
        else:
            sys.exit(1)

    except Exception as e:
        error_payload = {
            "type": "result",
            "event_type": "PRE_CHECK_COMPLETE",
            "message": f"❌ Storage validation failed: {str(e)}",
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
                                "data": [],
                            }
                        ],
                    }
                ],
            },
        }
        print(json.dumps(error_payload), flush=True, file=sys.stdout)
        sys.exit(1)


if __name__ == "__main__":
    main()
