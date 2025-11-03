#!/usr/bin/env python3
"""
================================================================================
SCRIPT:             Juniper Device Code Upgrade - Enhanced Edition
ENTRY POINT:        main.py
VERSION:            1.0.0
RELEASE DATE:       2025-11-03
AUTHOR:             Network Automation Team
MAINTAINER:         nikos-geranios_vgi
================================================================================

Main entry point for Juniper device upgrade automation.
Orchestrates the complete upgrade process using modular components.
"""

import sys
import argparse
import time
import logging

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
        description="Juniper Device Code Upgrade - Enhanced Edition v1.0.0",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  Basic upgrade:
    python run.py --hostname 192.168.1.1 --username admin --password secret \\
                   --target-version 21.4R3.15 --image-filename junos-srx-21.4R3.15.tgz

  Force upgrade despite warnings:
    python run.py --hostname firewall-01 --username admin --password secret \\
                   --target-version 21.4R3.15 --image-filename junos-srx-21.4R3.15.tgz \\
                   --force-upgrade

  Skip pre-checks:
    python run.py --hostname 192.168.1.1 --username admin --password secret \\
                   --target-version 21.4R3.15 --image-filename junos-srx-21.4R3.15.tgz \\
                   --skip-pre-check
        """,
    )

    # Required arguments
    parser.add_argument(
        "--hostname", required=True, help="Target device hostname or IP address"
    )
    parser.add_argument(
        "--username", required=True, help="Device authentication username"
    )
    parser.add_argument(
        "--password", required=True, help="Device authentication password"
    )
    parser.add_argument(
        "--target-version",
        required=True,
        help="Target software version (e.g., 21.4R3.15)",
    )
    parser.add_argument(
        "--image-filename", required=True, help="Upgrade image filename"
    )

    # Optional arguments
    parser.add_argument(
        "--vendor", default="juniper", help="Device vendor (default: juniper)"
    )
    parser.add_argument(
        "--platform", default="srx", help="Device platform (default: srx)"
    )
    parser.add_argument(
        "--skip-pre-check",
        action="store_true",
        help="Skip pre-upgrade validation checks",
    )
    parser.add_argument(
        "--force-upgrade",
        action="store_true",
        help="Force upgrade despite warnings or version mismatch",
    )
    parser.add_argument(
        "--connection-timeout",
        type=int,
        default=30,
        help="Connection timeout in seconds (default: 30)",
    )
    parser.add_argument(
        "--operation-timeout",
        type=int,
        default=1800,
        help="Operation timeout in seconds (default: 1800)",
    )
    parser.add_argument(
        "--reboot-timeout",
        type=int,
        default=900,
        help="Reboot recovery timeout in seconds (default: 900)",
    )

    return parser.parse_args()


def main():
    """Main execution function."""
    args = parse_arguments()

    # Log startup information
    logger.info("=" * 80)
    logger.info("🚀 Juniper Device Upgrade Script v1.0.0 - Starting")
    logger.info("=" * 80)
    logger.info(
        f"📅 Started at: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}"
    )
    logger.info(f"👤 Executed by: nikos-geranios_vgi")
    logger.info(f"🎯 Target device: {args.hostname}")
    logger.info(f"📦 Target version: {args.target_version}")
    logger.info(f"🖼️  Image file: {args.image_filename}")
    logger.info(f"🔧 Platform: {args.platform}")
    logger.info("=" * 80)

    # Create and run upgrader
    upgrader = DeviceUpgrader(
        hostname=args.hostname,
        username=args.username,
        password=args.password,
        target_version=args.target_version,
        image_filename=args.image_filename,
        vendor=args.vendor,
        platform=args.platform,
        skip_pre_check=args.skip_pre_check,
        force_upgrade=args.force_upgrade,
    )

    # Execute upgrade
    success = upgrader.run_upgrade()

    # Final summary
    logger.info("=" * 80)
    if success:
        logger.info("✅ UPGRADE COMPLETED SUCCESSFULLY")
        logger.info(
            f"📅 Completed at: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}"
        )
        logger.info("=" * 80)
        return 0
    else:
        logger.error("❌ UPGRADE FAILED")
        logger.info(
            f"📅 Failed at: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}"
        )
        logger.info("=" * 80)

        # Determine appropriate exit code based on failure type
        if upgrader.status.phase.value == "pre_check":
            return 2  # Pre-check failure
        elif upgrader.status.error_type == "ConnectionError":
            return 3  # Connection error
        elif (
            upgrader.status.upgrade_result
            and upgrader.status.upgrade_result.rollback_performed
        ):
            return 4  # Rollback performed
        else:
            return 1  # General failure


if __name__ == "__main__":
    try:
        exit_code = main()
        sys.exit(exit_code)
    except KeyboardInterrupt:
        logger.warning("\n⚠️  Upgrade interrupted by user (Ctrl+C)")
        print("\n⚠️  UPGRADE INTERRUPTED - Exiting...\n", file=sys.stderr)
        sys.exit(130)
    except Exception as e:
        logger.critical(f"💥 CRITICAL ERROR: {e}", exc_info=True)
        print(f"\n💥 CRITICAL ERROR: {e}\n", file=sys.stderr)
        sys.exit(1)
