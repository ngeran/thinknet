#!/usr/bin/env python3
"""
================================================================================
SCRIPT:             Juniper Device Code Upgrade - Enhanced Edition
ENTRY POINT:        main.py
VERSION:            1.0.6 - Simple pre-check results fix
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
        description="Juniper Device Code Upgrade - Enhanced Edition v1.0.6",
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
                        if hasattr(severity_value, "value"):
                            severity_value = severity_value.value

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

        # Print as JSON - the worker will forward this to the frontend
        print(f"PRE_CHECK_EVENT:{json.dumps(event_data)}")
        logger.info("✅ Pre-check results formatted for frontend")

    except Exception as e:
        logger.error(f"❌ Error formatting pre-check results: {e}")


def main():
    """Main execution function."""
    args = parse_arguments()

    # Log startup information
    logger.info("=" * 80)
    logger.info("🚀 Juniper Device Upgrade Script v1.0.6 - Starting")
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

    # Create and run upgrader
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
        pre_check_results = None
        if args.phase == "pre_check":
            logger.info("🎯 Starting pre-check validation...")

            try:
                success = upgrader.run_upgrade()
            except AttributeError as e:
                if "'NoneType' object has no attribute 'value'" in str(e):
                    logger.warning("⚠️  Internal error in DeviceUpgrader (known issue)")
                    logger.info("🔄 Extracting pre-check results despite the error...")

                    # Extract pre-check results despite the error
                    pre_check_results = extract_pre_check_results(upgrader)
                    if pre_check_results:
                        logger.info(
                            f"📊 Pre-check completed: {pre_check_results['passed']}/{pre_check_results['total_checks']} passed"
                        )
                        logger.info(
                            f"⚠️  Critical failures: {pre_check_results['critical_failures']}"
                        )

                        # Determine success based on pre-check results
                        success = pre_check_results["can_proceed"]

                        if success:
                            logger.info(
                                "✅ Pre-check validation completed successfully"
                            )
                            logger.info("📋 Device is ready for upgrade")
                        else:
                            logger.error(
                                "❌ Pre-check validation failed - critical issues found"
                            )
                            logger.info("🔧 Review the validation results above")

                        # PRINT PRE-CHECK RESULTS FOR FRONTEND
                        print_pre_check_results(args.hostname, pre_check_results)
                    else:
                        logger.error("❌ Could not extract pre-check results")
                        success = False
                else:
                    raise
            except Exception as e:
                logger.error(f"❌ Error during pre-check: {e}")
                success = False

        else:  # upgrade phase
            logger.info("🚀 Starting upgrade execution...")
            success = upgrader.run_upgrade()

        # Final summary
        logger.info("=" * 80)
        if success:
            if args.phase == "pre_check":
                logger.info("✅ PRE-CHECK COMPLETED SUCCESSFULLY")
                logger.info("📋 Device meets requirements for upgrade")
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

                # Try to extract and log detailed pre-check results
                if not pre_check_results:
                    pre_check_results = extract_pre_check_results(upgrader)

                if pre_check_results:
                    logger.info(
                        f"📊 Pre-check summary: {pre_check_results['passed']}/{pre_check_results['total_checks']} passed, "
                        f"{pre_check_results['warnings']} warnings, {pre_check_results['critical_failures']} critical failures"
                    )

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

                    # PRINT PRE-CHECK RESULTS FOR FRONTEND (even on failure)
                    print_pre_check_results(args.hostname, pre_check_results)
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
