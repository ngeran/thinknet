#!/usr/bin/env python3
"""
================================================================================
SCRIPT:             Juniper Device Code Upgrade - Clean Event Architecture
ENTRY POINT:        main.py
VERSION:            2.1.0 - Structured Step Reporting
AUTHOR:             nikos-geranios_vgi
DATE:               2025-11-07
LAST UPDATED:       2025-11-07 15:13:11 UTC
================================================================================

ARCHITECTURE CHANGES:
- All events go to STDOUT as clean JSON
- All logs go to STDERR for debugging
- Structured step-by-step reporting for user-friendly display
- Clear progress tracking with meaningful messages

MESSAGE FLOW:
1. Script emits step event → print(json.dumps(event)) to stdout
2. Worker reads stdout → detects JSON → forwards as-is
3. Frontend receives clean event → displays user-friendly step

ENHANCEMENTS:
- Added support for selective pre-check execution
- Improved error handling for RPC timeouts
- Better user feedback for device responsiveness issues
================================================================================
"""

import sys
import argparse
import time
import logging
import json
from datetime import datetime
from typing import Dict, Any, Optional, List

# =============================================================================
# SECTION 1: LOGGING CONFIGURATION
# =============================================================================
# CRITICAL: All logging goes to STDERR to keep STDOUT clean for events

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)-8s - [%(filename)s:%(lineno)d] - %(message)s",
    stream=sys.stderr,  # ← Logs to stderr only
)
logger = logging.getLogger(__name__)

# =============================================================================
# SECTION 2: CLEAN EVENT EMITTER
# =============================================================================


class EventEmitter:
    """
    Clean event emission to stdout without any wrapping.

    Design:
    - Events are pure JSON objects
    - Printed directly to stdout
    - Worker forwards them without modification
    - Frontend receives them unchanged

    Author: nikos-geranios_vgi
    Date: 2025-11-07
    """

    @staticmethod
    def emit(
        event_type: str,
        data: Optional[Dict[str, Any]] = None,
        message: Optional[str] = None,
        level: str = "INFO",
    ) -> None:
        """
        Emit a clean event to stdout.

        Args:
            event_type: Event type (e.g., PRE_CHECK_COMPLETE)
            data: Event data payload
            message: Human-readable message
            level: Log level (INFO, WARNING, ERROR, SUCCESS)
        """
        event = {
            "event_type": event_type,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": level,
        }

        if message:
            event["message"] = message

        if data:
            event["data"] = data

        # Print to stdout - worker will forward this directly
        print(json.dumps(event), file=sys.stdout, flush=True)

        # Log to stderr for debugging (won't interfere with events)
        logger.debug(f"[EVENT] Emitted {event_type}")

    @staticmethod
    def pre_check_result(
        check_name: str,
        severity: str,
        passed: bool,
        message: str,
        recommendation: Optional[str] = None,
        details: Optional[Dict] = None,
    ) -> None:
        """Emit individual pre-check result."""
        EventEmitter.emit(
            "PRE_CHECK_RESULT",
            data={
                "check_name": check_name,
                "severity": severity,
                "passed": passed,
                "message": message,
                "recommendation": recommendation,
                "details": details or {},
            },
            message=f"{check_name}: {'PASS' if passed else 'FAIL'}",
            level="INFO"
            if passed
            else ("WARNING" if severity == "warning" else "ERROR"),
        )

    @staticmethod
    def pre_check_complete(hostname: str, summary: Dict[str, Any]) -> None:
        """
        Emit PRE_CHECK_COMPLETE event - CRITICAL for Review tab.

        Args:
            hostname: Device hostname
            summary: Complete pre-check summary
        """
        EventEmitter.emit(
            "PRE_CHECK_COMPLETE",
            data={
                "device": hostname,
                "pre_check_summary": summary,
                "can_proceed": summary.get("can_proceed", False),
                "total_checks": summary.get("total_checks", 0),
                "passed": summary.get("passed", 0),
                "warnings": summary.get("warnings", 0),
                "critical_failures": summary.get("critical_failures", 0),
            },
            message="Pre-check validation completed",
            level="SUCCESS" if summary.get("can_proceed") else "WARNING",
        )

        logger.info(f"[EVENT] PRE_CHECK_COMPLETE emitted for {hostname}")

    @staticmethod
    def operation_start(operation: str, total_steps: int) -> None:
        """Emit operation start event."""
        EventEmitter.emit(
            "OPERATION_START",
            data={"operation": operation, "total_steps": total_steps},
            message=f"Starting {operation} operation",
            level="INFO",
        )

    @staticmethod
    def step_complete(step: int, total_steps: int, message: str) -> None:
        """Emit step completion for progress tracking."""
        EventEmitter.emit(
            "STEP_COMPLETE",
            data={
                "step": step,
                "total_steps": total_steps,
                "percentage": round((step / total_steps) * 100)
                if total_steps > 0
                else 0,
            },
            message=message,
            level="INFO",
        )

    @staticmethod
    def operation_complete(
        success: bool,
        message: str,
        operation: Optional[str] = None,
        final_results: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Emit operation complete event."""
        EventEmitter.emit(
            "OPERATION_COMPLETE",
            data={
                "success": success,
                "status": "SUCCESS" if success else "FAILED",
                "operation": operation,
                "final_results": final_results,
            },
            message=message,
            level="SUCCESS" if success else "ERROR",
        )


# Global emitter instance
emitter = EventEmitter()

# =============================================================================
# SECTION 3: IMPORTS (After logging config to avoid conflicts)
# =============================================================================

from core.exceptions import UpgradeError
from upgrade.device_upgrader import DeviceUpgrader

# =============================================================================
# SECTION 4: ARGUMENT PARSING
# =============================================================================


def parse_arguments():
    """
    Parse command-line arguments with enhanced pre-check selection support.

    Now includes support for selective pre-check execution based on user
    selection from the frontend interface.
    """
    parser = argparse.ArgumentParser(
        description="Juniper Device Code Upgrade - Clean Architecture v2.1.0",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    parser.add_argument(
        "--phase",
        choices=["pre_check", "upgrade"],
        default="upgrade",
        help="Operation phase: pre_check (validation only) or upgrade (full upgrade)",
    )

    parser.add_argument("--hostname", help="Target device hostname or IP address")
    parser.add_argument("--username", help="Device authentication username")
    parser.add_argument("--password", help="Device authentication password")
    parser.add_argument("--target-version", help="Target software version")
    parser.add_argument("--image-filename", help="Upgrade image filename")

    # NEW: Add pre-check selection argument for selective validation
    parser.add_argument(
        "--pre-check-selection",
        help="Comma-separated list of pre-check IDs to run (e.g., storage_space,hardware_health)",
    )

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


# =============================================================================
# SECTION 5: PRE-CHECK RESULT EXTRACTION
# =============================================================================


def extract_pre_check_results(upgrader) -> Optional[Dict[str, Any]]:
    """
    Extract pre-check results from upgrader status.

    Args:
        upgrader: DeviceUpgrader instance

    Returns:
        Dict with pre-check summary or None
    """
    try:
        if hasattr(upgrader, "status") and hasattr(
            upgrader.status, "pre_check_summary"
        ):
            summary = upgrader.status.pre_check_summary
            if summary:
                results = []
                if hasattr(summary, "results"):
                    for result in summary.results:
                        # Safely convert severity enum to string
                        severity_value = getattr(result, "severity", "unknown")
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
        logger.debug(f"Could not extract pre-check results: {e}")

    return None


# =============================================================================
# SECTION 6: EARLY FAILURE HANDLER
# =============================================================================


def create_early_failure_summary(
    error_message: str, check_name: str = "Device Connectivity"
) -> Dict[str, Any]:
    """
    Create a pre-check summary for early failures (connectivity, auth, etc.).

    Args:
        error_message: The error message from the exception
        check_name: Name of the check that failed

    Returns:
        Pre-check summary dict with the failure
    """
    return {
        "total_checks": 1,
        "passed": 0,
        "warnings": 0,
        "critical_failures": 1,
        "can_proceed": False,
        "results": [
            {
                "check_name": check_name,
                "severity": "critical",
                "passed": False,
                "message": error_message,
                "details": {},
                "recommendation": get_recommendation_for_error(error_message),
            }
        ],
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }


def get_recommendation_for_error(error_message: str) -> str:
    """
    Generate helpful recommendation based on error message.

    Enhanced to distinguish between network timeouts and RPC timeouts
    for better user guidance.

    Args:
        error_message: The error message

    Returns:
        Recommendation string
    """
    error_lower = error_message.lower()

    if "timeout" in error_lower or "timed out" in error_lower:
        if "rpc" in error_lower or "operation" in error_lower:
            return "Device is slow/unresponsive to commands. Check device load, increase timeouts, or try during maintenance window."
        else:
            return "Check network connectivity, firewall rules, and ensure the device is powered on and reachable."
    elif (
        "authentication" in error_lower
        or "permission" in error_lower
        or "denied" in error_lower
    ):
        return "Verify username and password are correct. Check user permissions on the device."
    elif "connection refused" in error_lower:
        return "Ensure SSH/NETCONF service is running on the device and the correct port is accessible."
    elif "host" in error_lower and (
        "unreachable" in error_lower or "not found" in error_lower
    ):
        return "Verify the hostname/IP address is correct and the device is reachable on the network."
    else:
        return "Review the error message above and verify device accessibility, credentials, and network connectivity."


# =============================================================================
# SECTION 7: PRE-CHECK EXECUTION WITH STRUCTURED STEPS
# =============================================================================


def execute_pre_check_phase(args, upgrader) -> bool:
    """
    Execute pre-check phase with structured step-by-step reporting.

    IMPORTANT: This function ALWAYS emits PRE_CHECK_COMPLETE, even on failure.
    Each major action emits a clear step event for frontend display.

    ENHANCEMENTS:
    - Supports selective pre-check execution based on user selection
    - Improved error detection for RPC timeouts vs network timeouts
    - Better progress reporting for selected vs all checks

    Args:
        args: Parsed arguments
        upgrader: DeviceUpgrader instance

    Returns:
        bool: Success status
    """
    logger.info("=" * 80)
    logger.info("🎯 Starting Pre-Check Validation Phase")
    logger.info("=" * 80)

    # Parse pre-check selection if provided
    selected_checks = None
    if args.pre_check_selection:
        selected_checks = [
            check_id.strip() for check_id in args.pre_check_selection.split(",")
        ]
        logger.info(f"📋 Running selected pre-checks: {', '.join(selected_checks)}")
    else:
        logger.info("📋 Running all available pre-checks")

    # Total steps for pre-check phase
    TOTAL_STEPS = 10
    current_step = 0

    success = False
    pre_check_results = None

    # =================================================================
    # STEP 1: Initialize Pre-Check
    # =================================================================
    current_step += 1
    emitter.operation_start("pre_check", TOTAL_STEPS)
    emitter.step_complete(
        current_step, TOTAL_STEPS, f"Pre-check validation started for {args.hostname}"
    )
    logger.info(f"Step {current_step}/{TOTAL_STEPS}: Pre-check initialized")

    try:
        # =============================================================
        # STEP 2: Check Reachability
        # =============================================================
        current_step += 1
        emitter.step_complete(
            current_step, TOTAL_STEPS, f"Checking reachability to {args.hostname}..."
        )
        logger.info(f"Step {current_step}/{TOTAL_STEPS}: Testing reachability")

        try:
            with upgrader.connector.connect():
                # ==========================================================
                # STEP 3: Device Connected
                # ==========================================================
                current_step += 1
                emitter.step_complete(
                    current_step,
                    TOTAL_STEPS,
                    f"✅ Device {args.hostname} is reachable and connected",
                )
                logger.info(
                    f"Step {current_step}/{TOTAL_STEPS}: Device connected successfully"
                )

                # =======================================================
                # STEP 4: Retrieve Current Version
                # =======================================================
                current_step += 1
                emitter.step_complete(
                    current_step, TOTAL_STEPS, "Retrieving current device version..."
                )
                logger.info(
                    f"Step {current_step}/{TOTAL_STEPS}: Getting device version"
                )

                upgrader.status.current_version = upgrader.get_current_version()

                # =======================================================
                # STEP 5: Current Version Retrieved
                # =======================================================
                current_step += 1
                emitter.step_complete(
                    current_step,
                    TOTAL_STEPS,
                    f"✅ Current version: {upgrader.status.current_version}",
                )
                logger.info(
                    f"Step {current_step}/{TOTAL_STEPS}: Version: {upgrader.status.current_version}"
                )

                # =======================================================
                # STEP 6: Version Compatibility Check
                # =======================================================
                current_step += 1
                emitter.step_complete(
                    current_step,
                    TOTAL_STEPS,
                    f"Validating version compatibility: {upgrader.status.current_version} → {args.target_version}",
                )
                logger.info(
                    f"Step {current_step}/{TOTAL_STEPS}: Checking version compatibility"
                )

                upgrader._validate_downgrade_scenario(
                    upgrader.status.current_version, args.target_version
                )

                # =======================================================
                # STEP 7: Compatibility Validated
                # =======================================================
                current_step += 1
                emitter.step_complete(
                    current_step, TOTAL_STEPS, "✅ Version compatibility validated"
                )
                logger.info(
                    f"Step {current_step}/{TOTAL_STEPS}: Compatibility check passed"
                )

                # =======================================================
                # STEP 8: Running Selected Pre-Checks
                # =======================================================
                current_step += 1
                if selected_checks:
                    emitter.step_complete(
                        current_step,
                        TOTAL_STEPS,
                        f"Running {len(selected_checks)} selected validation checks...",
                    )
                    logger.info(
                        f"Step {current_step}/{TOTAL_STEPS}: Running selected validation checks: {selected_checks}"
                    )
                else:
                    emitter.step_complete(
                        current_step,
                        TOTAL_STEPS,
                        "Running comprehensive device validation checks...",
                    )
                    logger.info(
                        f"Step {current_step}/{TOTAL_STEPS}: Running all validation checks"
                    )

                # Pass selected checks to upgrader for selective execution
                success = upgrader.run_pre_checks(selected_check_ids=selected_checks)

                # =======================================================
                # STEP 9: Pre-Checks Completed
                # =======================================================
                current_step += 1
                if success:
                    emitter.step_complete(
                        current_step,
                        TOTAL_STEPS,
                        "✅ All validation checks completed successfully",
                    )
                    logger.info(f"Step {current_step}/{TOTAL_STEPS}: All checks passed")
                else:
                    emitter.step_complete(
                        current_step,
                        TOTAL_STEPS,
                        "⚠️ Validation checks completed with issues",
                    )
                    logger.warning(
                        f"Step {current_step}/{TOTAL_STEPS}: Some checks failed"
                    )

                # =======================================================
                # STEP 10: Finalizing Results
                # =======================================================
                current_step += 1
                emitter.step_complete(
                    current_step, TOTAL_STEPS, "Finalizing validation results..."
                )
                logger.info(f"Step {current_step}/{TOTAL_STEPS}: Extracting results")

                pre_check_results = extract_pre_check_results(upgrader)

        except Exception as conn_error:
            # ==========================================================
            # STEP 3 (FAILURE): Connection Failed
            # ==========================================================
            error_msg = str(conn_error)
            logger.error(f"Connection error: {error_msg}")

            # IMPROVED ERROR DETECTION WITH SPECIFIC RPC TIMEOUT HANDLING
            error_lower = error_msg.lower()

            if "timeout" in error_lower or "timed out" in error_lower:
                if "rpc" in error_lower or "operation" in error_lower:
                    emitter.step_complete(
                        current_step,
                        TOTAL_STEPS,
                        f"❌ Device {args.hostname} is slow/unresponsive to commands",
                    )
                    logger.error(
                        f"Step {current_step}/{TOTAL_STEPS}: RPC timeout - device is slow"
                    )
                else:
                    emitter.step_complete(
                        current_step,
                        TOTAL_STEPS,
                        f"❌ Device {args.hostname} is unreachable - Network timeout",
                    )
                    logger.error(f"Step {current_step}/{TOTAL_STEPS}: Network timeout")
            elif "authentication" in error_lower or "permission" in error_lower:
                emitter.step_complete(
                    current_step,
                    TOTAL_STEPS,
                    "❌ Authentication failed - Check username and password",
                )
                logger.error(
                    f"Step {current_step}/{TOTAL_STEPS}: Authentication failed"
                )
            elif "refused" in error_lower:
                emitter.step_complete(
                    current_step,
                    TOTAL_STEPS,
                    f"❌ Connection refused by {args.hostname} - Check SSH/NETCONF service",
                )
                logger.error(f"Step {current_step}/{TOTAL_STEPS}: Connection refused")
            else:
                emitter.step_complete(
                    current_step,
                    TOTAL_STEPS,
                    f"❌ Failed to connect to {args.hostname}: {error_msg[:100]}",
                )
                logger.error(f"Step {current_step}/{TOTAL_STEPS}: Connection failed")

            # Create early failure summary
            pre_check_results = create_early_failure_summary(
                error_msg, "Device Connectivity & Authentication"
            )
            success = False

            # Fill remaining steps as skipped
            for remaining_step in range(current_step + 1, TOTAL_STEPS + 1):
                emitter.step_complete(
                    remaining_step, TOTAL_STEPS, "⊘ Skipped due to connection failure"
                )
                logger.debug(f"Step {remaining_step}/{TOTAL_STEPS}: Skipped")

    except Exception as e:
        # Handle any other unexpected errors
        error_msg = str(e)
        logger.error(f"Unexpected error during pre-check: {error_msg}")

        emitter.step_complete(
            current_step, TOTAL_STEPS, f"❌ Pre-check error: {error_msg[:100]}"
        )

        pre_check_results = create_early_failure_summary(
            error_msg, "Pre-Check Execution"
        )
        success = False

        # Fill remaining steps as skipped
        for remaining_step in range(current_step + 1, TOTAL_STEPS + 1):
            emitter.step_complete(remaining_step, TOTAL_STEPS, "⊘ Skipped due to error")

    # =====================================================================
    # ALWAYS EMIT PRE_CHECK_COMPLETE (Success or Failure)
    # =====================================================================
    if pre_check_results:
        emitter.pre_check_complete(args.hostname, pre_check_results)

        # Log summary to stderr
        logger.info("=" * 80)
        logger.info("📊 PRE-CHECK SUMMARY")
        logger.info("=" * 80)
        logger.info(f"Total Checks: {pre_check_results['total_checks']}")
        logger.info(f"Passed: {pre_check_results['passed']}")
        logger.info(f"Warnings: {pre_check_results['warnings']}")
        logger.info(f"Critical Failures: {pre_check_results['critical_failures']}")
        logger.info(f"Can Proceed: {pre_check_results['can_proceed']}")
        logger.info("=" * 80)

        # Log failed checks
        failed_checks = [r for r in pre_check_results["results"] if not r["passed"]]
        if failed_checks:
            logger.info("❌ FAILED CHECKS:")
            for result in failed_checks:
                logger.info(f"   • {result['check_name']}: {result['message']}")
                if result["recommendation"]:
                    logger.info(f"     → {result['recommendation']}")
    else:
        logger.error("❌ No pre-check results available")
        pre_check_results = create_early_failure_summary(
            "Pre-check failed to generate results", "System Error"
        )
        emitter.pre_check_complete(args.hostname, pre_check_results)

    # =====================================================================
    # EMIT OPERATION_COMPLETE
    # =====================================================================
    emitter.operation_complete(
        success=success,
        message="Pre-check completed successfully" if success else "Pre-check failed",
        operation="pre_check",
        final_results=pre_check_results,
    )

    return success


# =============================================================================
# SECTION 8: UPGRADE EXECUTION
# =============================================================================


def execute_upgrade_phase(args, upgrader) -> bool:
    """
    Execute full upgrade phase.

    Args:
        args: Parsed arguments
        upgrader: DeviceUpgrader instance

    Returns:
        bool: Success status
    """
    logger.info("=" * 80)
    logger.info("🚀 Starting Upgrade Execution Phase")
    logger.info("=" * 80)

    emitter.operation_start("upgrade", 20)

    try:
        success = upgrader.run_upgrade()

        emitter.operation_complete(
            success=success,
            message="Upgrade completed successfully" if success else "Upgrade failed",
            operation="upgrade",
        )

        return success

    except Exception as e:
        logger.error(f"❌ Upgrade failed: {e}")
        emitter.operation_complete(
            success=False, message=f"Upgrade failed: {str(e)}", operation="upgrade"
        )
        return False


# =============================================================================
# SECTION 9: MAIN ENTRY POINT
# =============================================================================


def main():
    """Main execution function."""
    args = parse_arguments()

    # Startup logging
    logger.info("=" * 80)
    logger.info("🚀 Juniper Device Upgrade Script v2.1.0 - Starting")
    logger.info("=" * 80)
    logger.info(f"📅 Started: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}")
    logger.info(f"👤 User: nikos-geranios_vgi")
    logger.info(f"🎯 Device: {args.hostname}")
    logger.info(f"📦 Target Version: {args.target_version}")
    logger.info(f"🖼️  Image: {args.image_filename}")
    logger.info(f"📋 Phase: {args.phase.upper()}")
    if args.pre_check_selection:
        logger.info(f"🎯 Selected Checks: {args.pre_check_selection}")
    logger.info("=" * 80)

    # Validate arguments
    required_args = ["username", "password", "target_version", "image_filename"]
    missing_args = [
        f"--{arg}" for arg in required_args if not getattr(args, arg.replace("-", "_"))
    ]

    if missing_args:
        logger.error(f"❌ Missing required arguments: {', '.join(missing_args)}")
        return 2

    if not args.hostname:
        logger.error("❌ Must specify --hostname")
        return 2

    # Create upgrader
    try:
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

        # Execute phase
        if args.phase == "pre_check":
            success = execute_pre_check_phase(args, upgrader)
        else:
            success = execute_upgrade_phase(args, upgrader)

        # Final summary
        logger.info("=" * 80)
        if success:
            logger.info(f"✅ {args.phase.upper()} COMPLETED SUCCESSFULLY")
        else:
            logger.error(f"❌ {args.phase.upper()} FAILED")
        logger.info(
            f"📅 Completed: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}"
        )
        logger.info("=" * 80)

        return 0 if success else 1

    except Exception as e:
        logger.critical(f"💥 CRITICAL ERROR: {e}")

        # Emit failure event if in pre-check phase
        if args.phase == "pre_check":
            failure_summary = create_early_failure_summary(str(e), "System Error")
            emitter.pre_check_complete(args.hostname, failure_summary)
            emitter.operation_complete(False, f"Critical error: {str(e)}", "pre_check")

        return 1


# =============================================================================
# SECTION 10: SCRIPT EXECUTION
# =============================================================================

if __name__ == "__main__":
    try:
        exit_code = main()
        sys.exit(exit_code)
    except KeyboardInterrupt:
        logger.warning("\n⚠️  Operation cancelled by user")
        emitter.operation_complete(False, "Cancelled by user", "unknown")
        sys.exit(130)
    except Exception as e:
        logger.critical(f"💥 CRITICAL ERROR: {e}")
        sys.exit(1)
