#!/usr/bin/env python3
"""
================================================================================
SCRIPT:             Juniper Device Code Upgrade - Enhanced Edition
ENTRY POINT:        main.py
VERSION:            1.0.8 - Fixed pre-check phase, event sending, and severity parsing
================================================================================
"""

import sys
import argparse
import time
import logging
import json
from datetime import datetime

from core.exceptions import UpgradeError
from upgrade.device_upgrader import DeviceUpgrader

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)-8s - [%(filename)s:%(lineno)d] - %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)


def parse_arguments():
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Juniper Device Code Upgrade - Enhanced Edition v1.0.8",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    # Phase argument
    parser.add_argument(
        "--phase",
        choices=["pre_check", "upgrade"],
        default="upgrade",
        help="Operation phase: pre_check (validation only) or upgrade (full upgrade)",
    )

    # Required arguments
    parser.add_argument("--hostname", help="Target device hostname or IP address")
    parser.add_argument("--username", help="Device authentication username")
    parser.add_argument("--password", help="Device authentication password")
    parser.add_argument("--target-version", help="Target software version")
    parser.add_argument("--image-filename", help="Upgrade image filename")

    # Optional arguments
    parser.add_argument("--vendor", default="juniper", help="Device vendor")
    parser.add_argument("--platform", default="srx", help="Device platform")
    parser.add_argument(
        "--skip-pre-check",
        action="store_true",
        help="Skip pre-upgrade validation checks",
    )
    parser.add_argument(
        "--force-upgrade", action="store_true", help="Force upgrade despite warnings"
    )

    return parser.parse_args()


def extract_pre_check_results(upgrader):
    """Extract pre-check results from upgrader status."""
    try:
        if hasattr(upgrader, "status") and hasattr(
            upgrader.status, "pre_check_summary"
        ):
            summary = upgrader.status.pre_check_summary
            if summary:
                # Extract individual check results
                results = []
                if hasattr(summary, "results"):
                    for result in summary.results:
                        # Handle severity - convert to string if needed
                        severity_value = getattr(result, "severity", "unknown")
                        # 🔑 FIX 1: Safely convert Enum members (which have a .value attribute) to their string value,
                        # and ensure the final output is lower-cased to match frontend expectations ('critical', 'warning', 'pass').
                        # This resolves the "Cannot access attribute 'value' for class 'str'" error.
                        severity_value = str(
                            getattr(severity_value, "value", severity_value)
                        ).lower()

                        results.append(
                            {
                                "check_name": getattr(result, "check_name", "Unknown"),
                                "severity": severity_value,
                                "passed": getattr(result, "passed", False),
                                "message": getattr(result, "message", ""),
                                "details": getattr(result, "details", {}),
                                "recommendation": getattr(result, "recommendation", ""),
                            }
                        )

                return {
                    "total_checks": getattr(summary, "total_checks", 0),
                    "passed": getattr(summary, "passed", 0),
                    "warnings": getattr(summary, "warnings", 0),
                    "critical_failures": getattr(summary, "critical_failures", 0),
                    "can_proceed": getattr(summary, "can_proceed", False),
                    "results": results,
                    "timestamp": getattr(
                        summary, "timestamp", datetime.utcnow().isoformat() + "Z"
                    ),
                }
    except Exception as e:
        logger.debug(f"⚠️ Could not extract pre-check results: {e}")

    return None


def print_pre_check_results(hostname: str, pre_check_results: dict):
    """Print pre-check results in a format that the frontend can parse."""
    try:
        # Create the exact structure the frontend expects
        event_data = {
            "event_type": "PRE_CHECK_COMPLETE",
            "timestamp": time.time(),
            "message": "Pre-check validation completed",
            "data": {
                "device": hostname,
                "pre_check_summary": pre_check_results,
                "can_proceed": pre_check_results.get("can_proceed", False),
                "total_checks": pre_check_results.get("total_checks", 0),
                "passed": pre_check_results.get("passed", 0),
                "warnings": pre_check_results.get("warnings", 0),
                "critical_failures": pre_check_results.get("critical_failures", 0),
            },
        }

        # Print as pure JSON - the worker will forward this to the frontend as proper event
        print(json.dumps(event_data))
        logger.info("✅ Pre-check results formatted for frontend")

    except Exception as e:
        logger.error(f"❌ Error formatting pre-check results: {e}")


# 🔑 FIX 2 & 3: Define the missing utility function to resolve NameError on lines 212 and 243.
def send_operation_complete(status, success: bool, message: str) -> None:
    """
    Sends a generic OPERATION_COMPLETE event to the worker output stream.
    Used for final status reporting when the full pre-check summary is not needed.
    """
    payload = {
        "level": "SUCCESS" if success else "ERROR",
        "event_type": "OPERATION_COMPLETE",
        "message": message,
        "data": {
            "status": "SUCCESS" if success else "FAILED",
            "returncode": 0 if success else 1,
        },
        "timestamp": datetime.utcnow().isoformat(),
    }
    print(json.dumps(payload))
    logger.info(f"✅ OPERATION_COMPLETE event sent.")


def main():
    """Main execution function."""
    args = parse_arguments()

    # Log startup information
    logger.info("=" * 80)
    logger.info("🚀 Juniper Device Upgrade Script v1.0.8 - Starting")
    logger.info("=" * 80)
    logger.info(
        f"📅 Started at: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}"
    )
    logger.info(f"👤 Executed by: nikos-geranios_vgi")

    if args.hostname:
        logger.info(f"🎯 Target device: {args.hostname}")

    logger.info(f"📦 Target version: {args.target_version}")
    logger.info(f"🖼️  Image file: {args.image_filename}")
    logger.info(f"🔧 Platform: {args.platform}")
    logger.info(f"📋 Phase: {args.phase.upper()}")

    if args.phase == "pre_check":
        logger.info("🔍 PRE-CHECK MODE: Validation only - no upgrade will be performed")

    logger.info("=" * 80)

    # Validate required arguments
    required_args = ["username", "password", "target_version", "image_filename"]
    missing_args = []
    for arg in required_args:
        if not getattr(args, arg.replace("-", "_")):
            missing_args.append(f"--{arg}")

    if missing_args:
        logger.error(f"❌ Missing required arguments: {', '.join(missing_args)}")
        return 2

    if not args.hostname:
        logger.error("❌ Must specify --hostname")
        return 2

    # Create upgrader
    try:
        upgrader_kwargs = {
            "hostname": args.hostname,
            "username": args.username,
            "password": args.password,
            "target_version": args.target_version,
            "image_filename": args.image_filename,
            "vendor": args.vendor,
            "platform": args.platform,
            "skip_pre_check": args.skip_pre_check,
            "force_upgrade": args.force_upgrade,
        }

        logger.debug(
            f"🛠️ Creating DeviceUpgrader with arguments: {list(upgrader_kwargs.keys())}"
        )

        upgrader = DeviceUpgrader(**upgrader_kwargs)

        # Execute based on phase
        if args.phase == "pre_check":
            logger.info("🎯 Starting pre-check validation...")

            try:
                with upgrader.connector.connect():
                    upgrader.status.current_version = upgrader.get_current_version()
                    upgrader._validate_downgrade_scenario(
                        upgrader.status.current_version, args.target_version
                    )
                    success = upgrader.run_pre_checks()

                # Send final operation complete for pre-check
                send_operation_complete(
                    upgrader.status,
                    success,
                    "Pre-check completed successfully"
                    if success
                    else "Pre-check failed with critical issues",
                )

                pre_check_results = extract_pre_check_results(upgrader)
                if pre_check_results:
                    logger.info(
                        f"📊 Pre-check summary: {pre_check_results['passed']}/{pre_check_results['total_checks']} passed, "
                        f"{pre_check_results['warnings']} warnings, {pre_check_results['critical_failures']} critical failures"
                    )

                    # CRITICAL STEP: Print the pre-check results payload to be picked up by the worker
                    print_pre_check_results(args.hostname, pre_check_results)

                    # Log individual failed checks
                    failed_checks = [
                        r for r in pre_check_results["results"] if not r["passed"]
                    ]
                    if failed_checks:
                        logger.info("🔍 Failed checks:")
                        for result in failed_checks:
                            logger.info(
                                f"   ❌ {result['check_name']}: {result['message']}"
                            )
                            if result["recommendation"]:
                                logger.info(f"      💡 {result['recommendation']}")

            except Exception as e:
                logger.error(f"❌ Error during pre-check: {e}")
                success = False
                send_operation_complete(upgrader.status, False, str(e))

        else:  # upgrade phase
            logger.info("🚀 Starting upgrade execution...")
            success = upgrader.run_upgrade()

        # Final summary
        logger.info("=" * 80)
        if success:
            if args.phase == "pre_check":
                logger.info("✅ PRE-CHECK COMPLETED SUCCESSFULLY")
                logger.info("📋 Device is ready for upgrade")
            else:
                logger.info("✅ UPGRADE COMPLETED SUCCESSFULLY")

            logger.info(
                f"📅 Completed at: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}"
            )
            logger.info("=" * 80)
            return 0
        else:
            if args.phase == "pre_check":
                logger.error("❌ PRE-CHECK FAILED")
                logger.info(
                    "🔧 Critical issues detected - review results before proceeding"
                )
            else:
                logger.error("❌ UPGRADE FAILED")

            logger.info(
                f"📅 Failed at: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}"
            )
            logger.info("=" * 80)
            return 1

    except Exception as e:
        logger.critical(f"💥 CRITICAL ERROR during {args.phase}: {e}")
        return 1


if __name__ == "__main__":
    try:
        exit_code = main()
        sys.exit(exit_code)
    except KeyboardInterrupt:
        logger.warning("\n⚠️  Operation interrupted by user (Ctrl+C)")
        sys.exit(130)
    except Exception as e:
        logger.critical(f"💥 CRITICAL ERROR: {e}")
        sys.exit(1)
