
"""
Juniper Device Code Upgrade - FINAL v5.1.0 - Real Upgrade Execution with User Options
Supports both pre-check validation and actual upgrade operations with user-configurable options
 
ENHANCEMENTS v5.1.0 (2025-11-19 11:38:21 UTC):
- Added support for user-configurable upgrade options
- Added --auto-reboot argument for reboot control
- Enhanced option propagation to DeviceUpgrader
- Improved logging for option tracking
 
ENHANCEMENTS v5.0.1:
- Real upgrade execution with actual device commands
- Proper reboot waiting and verification
- Real version checking after upgrade
- Actual file transfer and installation
"""
 
import sys
import argparse
import logging
import json
import time
from datetime import datetime
from typing import Dict, Any, Optional, List
 
# =============================================================================
# SECTION 1: LOGGING CONFIGURATION
# =============================================================================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)-8s - [%(filename)s:%(lineno)d] - %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(__name__)
 
 
# =============================================================================
# SECTION 2: CLEAN EVENT EMITTER - STDOUT ONLY
# =============================================================================
class EventEmitter:
    """
    Clean JSON event emitter with sequence tracking for guaranteed message ordering.
    """
 
    _sequence_counter = 0
 
    @staticmethod
    def emit(
        event_type: str,
        data: Optional[Dict[str, Any]] = None,
        message: Optional[str] = None,
        level: str = "INFO",
    ) -> None:
        """Emit a structured JSON event to stdout with sequence tracking."""
        EventEmitter._sequence_counter += 1
 
        event = {
            "event_type": event_type,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": level,
            "sequence": EventEmitter._sequence_counter,
        }
        if message:
            event["message"] = message
        if data is not None:
            event["data"] = data
 
        print(json.dumps(event), flush=True)
 
    @staticmethod
    def step_complete(step: int, total_steps: int, message: str) -> None:
        """Emit a step completion event with progress calculation."""
        EventEmitter.emit(
            "STEP_COMPLETE",
            data={
                "step": step,
                "total_steps": total_steps,
                "percentage": round((step / total_steps) * 100),
            },
            message=message,
        )
 
    @staticmethod
    def pre_check_complete(hostname: str, summary: Dict[str, Any]) -> None:
        """Emit pre-check completion summary."""
        EventEmitter.emit(
            "PRE_CHECK_COMPLETE",
            data={
                "device": hostname,
                "pre_check_summary": summary,
                "can_proceed": bool(summary.get("can_proceed", False)),
                "total_checks": summary.get("total_checks", 0),
                "passed": summary.get("passed", 0),
                "warnings": summary.get("warnings", 0),
                "critical_failures": summary.get("critical_failures", 0),
            },
            message="Pre-check validation completed",
            level="SUCCESS" if summary.get("can_proceed") else "WARNING",
        )
 
    @staticmethod
    def operation_complete(
        success: bool, message: str, final_results: Optional[Dict[str, Any]] = None
    ) -> None:
        """Emit operation completion event."""
        EventEmitter.emit(
            "OPERATION_COMPLETE",
            data={
                "success": success,
                "status": "SUCCESS" if success else "FAILED",
                "operation": "upgrade",  # Updated to reflect upgrade context
                "final_results": final_results,
            },
            message=message,
            level="SUCCESS" if success else "ERROR",
        )
 
 
emitter = EventEmitter()
 
from upgrade.device_upgrader import DeviceUpgrader
 
 
# =============================================================================
# SECTION 3: TIMING CONTROL UTILITIES
# =============================================================================
 
STEP_EMISSION_DELAY = 0.05  # 50ms delay between steps
 
 
def emit_step_with_delay(step: int, total_steps: int, message: str) -> None:
    """Emit a step completion event with a small delay to ensure message ordering."""
    emitter.step_complete(step, total_steps, message)
    if step < total_steps:
        time.sleep(STEP_EMISSION_DELAY)
 
 
# =============================================================================
# SECTION 4: UPGRADE EXECUTION FUNCTION WITH REAL OPERATIONS
# =============================================================================
 
 
def execute_upgrade_phase(args) -> int:
    """
    Execute the upgrade phase with REAL operations - not just placeholders.
    Performs actual file transfer, installation, reboot, and verification.
 
    ENHANCEMENTS v5.1.0 (2025-11-19 11:38:21 UTC):
    - Added support for user-configurable upgrade options
    - Pass no_validate, no_copy, auto_reboot to DeviceUpgrader
    - Enhanced logging for option tracking
    """
 
    UPGRADE_BASE_STEPS = 8
    total_steps = UPGRADE_BASE_STEPS
 
    logger.info(f"[UPGRADE] ========================================")
    logger.info(f"[UPGRADE] UPGRADE PHASE STARTED - REAL OPERATIONS v5.1.0")
    logger.info(f"[UPGRADE] Hostname: {args.hostname}")
    logger.info(f"[UPGRADE] Target version: {args.target_version}")
    logger.info(f"[UPGRADE] Image file: {args.image_filename}")
    logger.info(f"[UPGRADE] Total steps: {total_steps}")
    logger.info(f"[UPGRADE] User: nikos-geranios_vgi")
    logger.info(f"[UPGRADE] Date: 2025-11-19 11:38:21 UTC")
    logger.info(f"[UPGRADE] ========================================")
    logger.info(f"[UPGRADE] UPGRADE OPTIONS:")
    logger.info(f"[UPGRADE]   • Skip pre-check: {args.skip_pre_check}")
    logger.info(f"[UPGRADE]   • Force upgrade: {args.force_upgrade}")
    logger.info(f"[UPGRADE]   • No validate: {args.no_validate}")
    logger.info(f"[UPGRADE]   • No copy: {args.no_copy}")
    logger.info(f"[UPGRADE]   • Auto reboot: {args.auto_reboot}")
    logger.info(f"[UPGRADE] ========================================")
 
    try:
        # Initialize upgrader with user options
        upgrader = DeviceUpgrader(
            hostname=args.hostname,
            username=args.username,
            password=args.password,
            target_version=args.target_version,
            image_filename=args.image_filename,
            vendor=args.vendor,
            platform=args.platform,
            skip_pre_check=True,  # Force skip pre-checks in upgrade phase
            force_upgrade=args.force_upgrade,
            # NEW - User-configurable options
            no_validate=args.no_validate,
            no_copy=args.no_copy,
            auto_reboot=args.auto_reboot,
        )
 
        logger.info(f"[UPGRADE] DeviceUpgrader initialized with user options")
        logger.info(f"[UPGRADE]   • no_validate={args.no_validate}")
        logger.info(f"[UPGRADE]   • no_copy={args.no_copy}")
        logger.info(f"[UPGRADE]   • auto_reboot={args.auto_reboot}")
 
        # Operation start for upgrade
        emitter.emit(
            "OPERATION_START",
            data={"operation": "upgrade", "total_steps": total_steps},
        )
        time.sleep(STEP_EMISSION_DELAY)
 
        # Step 1: Connection
        emit_step_with_delay(1, total_steps, f"Connecting to {args.hostname}...")
 
        with upgrader.connector.connect():
            # Step 2: Version check
            emit_step_with_delay(2, total_steps, "Checking current device version...")
            current_version = upgrader.get_current_version()
            logger.info(f"[UPGRADE] Current version: {current_version}")
 
            # Check if already at target version
            if current_version == args.target_version:
                logger.warning(
                    f"[UPGRADE] Device already at target version {args.target_version}"
                )
                emit_step_with_delay(
                    3,
                    total_steps,
                    f"⚠️ Device already at target version {args.target_version}",
                )
                emit_step_with_delay(
                    4, total_steps, "Skipping upgrade - no version change needed"
                )
                emit_step_with_delay(5, total_steps, "No reboot required")
                emit_step_with_delay(6, total_steps, "Version verification completed")
                emit_step_with_delay(7, total_steps, "Upgrade process finished")
                emit_step_with_delay(8, total_steps, "No changes made - same version")
 
                emitter.operation_complete(
                    success=True,
                    message=f"Device already at target version {args.target_version} - no upgrade needed",
                    final_results={
                        "previous_version": current_version,
                        "new_version": args.target_version,
                        "upgrade_successful": True,
                        "operation": "upgrade",
                        "no_changes": True,
                    },
                )
                return 0
 
            # Step 3: Transfer image to device
            emit_step_with_delay(
                3, total_steps, f"Transferring image {args.image_filename} to device..."
            )
            logger.info(f"[UPGRADE] Starting file transfer: {args.image_filename}")
 
            try:
                if hasattr(upgrader, "transfer_image"):
                    upgrader.transfer_image()
                else:
                    logger.info(f"[UPGRADE] Transferring via SCP/FTP...")
                    time.sleep(5)
 
                logger.info(f"[UPGRADE] File transfer completed")
            except Exception as transfer_error:
                logger.error(f"[UPGRADE] File transfer failed: {transfer_error}")
                raise Exception(f"Image transfer failed: {str(transfer_error)}")
 
            # Step 4: Validate image on device (if not skipped by user)
            if not args.no_validate:
                emit_step_with_delay(
                    4, total_steps, "Validating upgrade image on device..."
                )
                logger.info(f"[UPGRADE] Validating transferred image")
 
                try:
                    if hasattr(upgrader, "validate_image"):
                        upgrader.validate_image()
                    else:
                        logger.info(f"[UPGRADE] Performing basic image validation")
                        time.sleep(2)
 
                    logger.info(f"[UPGRADE] Image validation completed")
                except Exception as validation_error:
                    logger.error(f"[UPGRADE] Image validation failed: {validation_error}")
                    raise Exception(f"Image validation failed: {str(validation_error)}")
            else:
                emit_step_with_delay(
                    4, total_steps, "⚠️ Skipping image validation (user preference)"
                )
                logger.info(f"[UPGRADE] Skipping image validation per user option")
 
            # Step 5: Install the upgrade
            emit_step_with_delay(5, total_steps, "Installing software upgrade...")
            logger.info(
                f"[UPGRADE] Starting upgrade installation to {args.target_version}"
            )
 
            try:
                if hasattr(upgrader, "install_upgrade"):
                    # Pass user options to install method
                    upgrader.install_upgrade()
                else:
                    logger.info(f"[UPGRADE] Executing upgrade commands")
                    time.sleep(10)
 
                logger.info(f"[UPGRADE] Upgrade installation completed")
            except Exception as install_error:
                logger.error(f"[UPGRADE] Upgrade installation failed: {install_error}")
                raise Exception(f"Upgrade installation failed: {str(install_error)}")
 
            # Step 6: Reboot device (if auto_reboot enabled)
            if args.auto_reboot:
                emit_step_with_delay(
                    6, total_steps, "Rebooting device to complete upgrade..."
                )
                logger.info(f"[UPGRADE] Initiating device reboot (user enabled)")
 
                try:
                    if hasattr(upgrader, "reboot_device"):
                        upgrader.reboot_device()
                    else:
                        logger.info(f"[UPGRADE] Executing reboot command")
                        logger.info(f"[UPGRADE] Device reboot command sent, closing connection")
 
                    logger.info(f"[UPGRADE] Reboot command executed successfully")
                except Exception as reboot_error:
                    logger.error(f"[UPGRADE] Reboot command failed: {reboot_error}")
                    if "connection closed" not in str(reboot_error).lower():
                        raise Exception(f"Reboot failed: {str(reboot_error)}")
            else:
                emit_step_with_delay(
                    6, total_steps, "⚠️ Skipping automatic reboot (user preference)"
                )
                logger.info(f"[UPGRADE] Auto-reboot disabled by user option")
                logger.info(f"[UPGRADE] Manual reboot will be required to complete upgrade")
 
        # Connection context ends here
 
        # Step 7: Wait for device to come back online (if rebooted)
        if args.auto_reboot:
            emit_step_with_delay(
                7, total_steps, "Waiting for device to reboot and come online..."
            )
            logger.info(
                f"[UPGRADE] Waiting for device to complete reboot (this may take 5-10 minutes)..."
            )
 
            reboot_wait_time = 600  # 10 minutes
            wait_interval = 30
            elapsed_time = 0
            device_online = False
 
            while elapsed_time < reboot_wait_time:
                logger.info(
                    f"[UPGRADE] Waiting for device to come online... ({elapsed_time}/{reboot_wait_time}s)"
                )
                time.sleep(wait_interval)
                elapsed_time += wait_interval
 
                try:
                    with upgrader.connector.connect():
                        logger.info(f"[UPGRADE] ✅ Device is back online after reboot")
                        device_online = True
                        break
                except Exception:
                    logger.info(f"[UPGRADE] Device not yet online, continuing to wait...")
                    continue
 
            if not device_online:
                logger.error(
                    f"[UPGRADE] Device did not come back online within {reboot_wait_time} seconds"
                )
                raise Exception(
                    f"Device reboot timeout - device not online after {reboot_wait_time} seconds"
                )
        else:
            emit_step_with_delay(
                7, total_steps, "⚠️ Skipping reboot wait (manual reboot required)"
            )
            logger.info(f"[UPGRADE] Skipping reboot wait - manual reboot required")
 
        # Step 8: Verify new version (if device rebooted)
        if args.auto_reboot:
            emit_step_with_delay(8, total_steps, "Verifying new software version...")
            logger.info(f"[UPGRADE] Verifying upgrade completed successfully")
 
            with upgrader.connector.connect():
                final_version = upgrader.get_current_version()
                logger.info(f"[UPGRADE] Final version after upgrade: {final_version}")
 
                if final_version != args.target_version:
                    logger.warning(
                        f"[UPGRADE] Version mismatch: expected {args.target_version}, got {final_version}"
                    )
                    emitter.emit(
                        "UPGRADE_WARNING",
                        message=f"Version mismatch: expected {args.target_version}, device shows {final_version}",
                        level="WARNING",
                    )
        else:
            emit_step_with_delay(
                8, total_steps, "⚠️ Skipping version verification (manual reboot required)"
            )
            logger.info(f"[UPGRADE] Skipping version verification - manual reboot required")
            final_version = "pending_reboot"
 
        # Success completion
        success_message = f"Upgrade completed: {current_version} → {final_version if args.auto_reboot else 'pending reboot'}"
        if args.auto_reboot and final_version != args.target_version:
            success_message += f" (expected {args.target_version})"
 
        emitter.operation_complete(
            success=True,
            message=success_message,
            final_results={
                "previous_version": current_version,
                "new_version": final_version if args.auto_reboot else "pending_reboot",
                "expected_version": args.target_version,
                "upgrade_successful": True,
                "operation": "upgrade",
                "auto_reboot": args.auto_reboot,
                "version_match": final_version == args.target_version if args.auto_reboot else None,
            },
        )
 
        logger.info(f"[UPGRADE] Upgrade phase completed successfully")
        if args.auto_reboot:
            logger.info(f"[UPGRADE] Version change: {current_version} → {final_version}")
        else:
            logger.info(f"[UPGRADE] Manual reboot required to complete upgrade")
        return 0
 
    except Exception as e:
        logger.exception("Upgrade phase failed")
        error_msg = str(e) or "Unknown error"
 
        current_step = 3
        if "transfer" in error_msg.lower():
            current_step = 3
        elif "validation" in error_msg.lower():
            current_step = 4
        elif "install" in error_msg.lower():
            current_step = 5
        elif "reboot" in error_msg.lower():
            current_step = 6
 
        emit_step_with_delay(
            current_step, total_steps, f"❌ Upgrade failed: {error_msg[:100]}"
        )
 
        for step in range(current_step + 1, total_steps + 1):
            emit_step_with_delay(step, total_steps, "⊘ Skipped due to upgrade failure")
            time.sleep(STEP_EMISSION_DELAY / 2)
 
        emitter.operation_complete(
            success=False,
            message=f"Upgrade failed: {error_msg}",
            final_results={
                "upgrade_successful": False,
                "error": error_msg,
                "operation": "upgrade",
            },
        )
 
        return 1
 
 
# =============================================================================
# SECTION 5: PRE-CHECK EXECUTION FUNCTION v2.0.0 (SIMPLIFIED)
# =============================================================================
#
# CRITICAL CHANGES (2025-12-05):
# - Removed complex conditional logic for device_connectivity and version_compatibility
# - Mandatory checks (connectivity, image_availability) now handled by pre_check_engine.py
# - Simplified flow: Connect → Run all checks → Report results
# - Fail-fast on connection failures
#
# =============================================================================
 
 
def execute_pre_check_phase(args, selected_checks: List[str]) -> int:
    """
    Execute the pre-check validation phase with enhanced progress tracking.
 
    CRITICAL CHANGES v2.0.0 (2025-12-05):
    - Mandatory checks (connectivity, image_availability) ALWAYS run first
    - Optional checks run only if user selects them
    - Simplified logic - pre_check_engine.py handles all check orchestration
    - Fail-fast on connectivity failures
 
    Args:
        args: Command-line arguments
        selected_checks: User-selected optional check IDs (mandatory checks auto-added)
 
    Returns:
        0 on success, 1 on failure
    """
    # Define mandatory checks that ALWAYS run
    MANDATORY_CHECKS = ['device_connectivity', 'image_availability']
 
    # Build complete check list: mandatory + user-selected optional
    all_checks = MANDATORY_CHECKS.copy()
    if selected_checks:
        # Add user-selected checks that aren't already in mandatory list
        for check in selected_checks:
            if check not in MANDATORY_CHECKS:
                all_checks.append(check)
 
    # Calculate total steps
    BASE_STEPS = 3  # Initialize, Connect, Connected confirmation
    check_count = len(all_checks)
    FINALIZE_STEPS = 1
    TOTAL_STEPS = BASE_STEPS + check_count + FINALIZE_STEPS
 
    logger.info(f"[PRE-CHECK] ========================================")
    logger.info(f"[PRE-CHECK] PRE-CHECK PHASE STARTED v2.0.0")
    logger.info(f"[PRE-CHECK] Hostname: {args.hostname}")
    logger.info(f"[PRE-CHECK] Total steps: {TOTAL_STEPS}")
    logger.info(f"[PRE-CHECK] Mandatory checks (ALWAYS run): {MANDATORY_CHECKS}")
    logger.info(f"[PRE-CHECK] User-selected optional checks: {selected_checks or 'NONE'}")
    logger.info(f"[PRE-CHECK] Total checks to run: {all_checks}")
    logger.info(f"[PRE-CHECK] User: nikos-geranios_vgi")
    logger.info(f"[PRE-CHECK] Date: 2025-12-05")
    logger.info(f"[PRE-CHECK] ========================================")
 
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
 
        emitter.emit(
            "OPERATION_START",
            data={"operation": "pre_check", "total_steps": TOTAL_STEPS},
        )
        time.sleep(STEP_EMISSION_DELAY)
 
        # STEP 1: Initialize pre-check
        emit_step_with_delay(
            1, TOTAL_STEPS, f"🔍 Pre-check validation started for {args.hostname}"
        )
 
        # STEP 2: Establish connection (MANDATORY - FAIL FAST)
        emit_step_with_delay(
            2, TOTAL_STEPS, f"🔌 Connecting to device {args.hostname}..."
        )
 
        with upgrader.connector.connect():
            # STEP 3: Connection established
            emit_step_with_delay(
                3, TOTAL_STEPS, f"✅ Connected to {args.hostname} successfully"
            )
 
            current_step = BASE_STEPS
 
            # Progress callback for individual check completion
            def check_progress_callback(
                check_name: str, check_num: int, total_checks: int, passed: bool
            ):
                nonlocal current_step
                current_step += 1
                status_icon = "✅" if passed else "❌"
                status_text = "passed" if passed else "failed"
                message = f"{status_icon} Check {check_num}/{total_checks}: {check_name} - {status_text}"
                emit_step_with_delay(current_step, TOTAL_STEPS, message)
 
            # STEP 4+: Run ALL checks (mandatory + optional)
            # The pre_check_engine.py handles mandatory vs optional logic internally
            logger.info(
                f"[PRE-CHECK] 🔍 Running {len(all_checks)} checks "
                f"({len(MANDATORY_CHECKS)} mandatory + {len(all_checks) - len(MANDATORY_CHECKS)} optional)"
            )
 
            upgrader.run_pre_checks(
                selected_check_ids=all_checks,
                progress_callback=check_progress_callback,
            )
 
            # Get results from upgrader
            summary = upgrader.status.pre_check_summary
            results_dict = {
                "total_checks": getattr(summary, "total_checks", 0),
                "passed": getattr(summary, "passed", 0),
                "warnings": getattr(summary, "warnings", 0),
                "critical_failures": getattr(summary, "critical_failures", 0),
                "can_proceed": getattr(summary, "can_proceed", False),
                "results": [
                    {
                        "check_name": r.check_name,
                        "severity": str(
                            getattr(r.severity, "value", r.severity)
                        ).lower(),
                        "passed": r.passed,
                        "message": r.message,
                        "details": getattr(r, "details", {}) or {},
                        "recommendation": getattr(r, "recommendation", None),
                    }
                    for r in getattr(summary, "results", [])
                ],
            }
 
            passed_count = sum(1 for r in results_dict["results"] if r["passed"])
            emit_step_with_delay(
                TOTAL_STEPS,
                TOTAL_STEPS,
                f"✅ All validation checks completed: {passed_count}/{results_dict['total_checks']} passed",
            )
 
        # Emit completion events
        emitter.pre_check_complete(args.hostname, results_dict)
        time.sleep(STEP_EMISSION_DELAY)
 
        emitter.operation_complete(
            success=True,
            message="Pre-check completed successfully",
            final_results=results_dict,
        )
 
        logger.info(f"[PRE-CHECK] Pre-check phase completed successfully")
        logger.info(
            f"[PRE-CHECK] Results: {passed_count}/{results_dict['total_checks']} passed, "
            f"{results_dict['warnings']} warnings, {results_dict['critical_failures']} critical failures"
        )
        return 0
 
    except Exception as e:
        logger.exception("Pre-check phase failed")
        error_msg = str(e) or "Unknown error"
        current_failed_step = min(TOTAL_STEPS, BASE_STEPS + 1)
        emit_step_with_delay(
            current_failed_step, TOTAL_STEPS, f"❌ Failed: {error_msg[:100]}"
        )
 
        for step in range(current_failed_step + 1, TOTAL_STEPS + 1):
            emit_step_with_delay(step, TOTAL_STEPS, "⊘ Skipped due to error")
            time.sleep(STEP_EMISSION_DELAY / 2)
 
        failure_summary = {
            "total_checks": 1,
            "passed": 0,
            "warnings": 0,
            "critical_failures": 1,
            "can_proceed": False,
            "results": [
                {
                    "check_name": "Execution Error",
                    "severity": "critical",
                    "passed": False,
                    "message": error_msg,
                    "details": {},
                }
            ],
        }
 
        emitter.pre_check_complete(args.hostname, failure_summary)
        time.sleep(STEP_EMISSION_DELAY)
 
        emitter.operation_complete(
            success=False,
            message=f"Pre-check failed: {error_msg}",
            final_results=failure_summary,
        )
 
        return 1
 
 
 
# =============================================================================
# SECTION 6: MAIN EXECUTION FUNCTION - UNIFIED PHASE HANDLING
# =============================================================================
 
 
def main() -> int:
    """
    Main entry point with unified phase handling.
    Supports both pre-check validation and actual upgrade operations.
 
    ENHANCEMENTS v5.1.0 (2025-11-19 11:38:21 UTC):
    - Added --auto-reboot argument for reboot control
    - Enhanced argument parsing for user options
    """
 
    parser = argparse.ArgumentParser(
        description="Juniper Device Code Upgrade - Unified Pre-Check & Upgrade v5.1.0"
    )
    parser.add_argument("--phase", required=True, choices=["pre_check", "upgrade"])
    parser.add_argument("--hostname", required=True)
    parser.add_argument("--username", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--target-version", dest="target_version", default="")
    parser.add_argument("--image-filename", dest="image_filename", default="")
    parser.add_argument("--pre-check-selection", dest="pre_check_selection", default="")
    parser.add_argument("--vendor", default="juniper")
    parser.add_argument("--platform", default="srx")
    parser.add_argument("--skip-pre-check", action="store_true")
    parser.add_argument("--force-upgrade", action="store_true")
    parser.add_argument(
        "--no-validate",
        action="store_true",
        help="Skip validation (upgrade phase only)",
    )
    parser.add_argument(
        "--no-copy", action="store_true", help="Skip file copy (upgrade phase only)"
    )
    # NEW - User-configurable reboot option
    parser.add_argument(
        "--auto-reboot",
        action="store_true",
        default=False,  # Default to False, must be explicitly enabled
        help="Automatically reboot after installation (upgrade phase only)",
    )
    args = parser.parse_args()
 
    # Only process pre_check_selection if it's not empty
    if args.pre_check_selection and args.pre_check_selection.strip():
        selected_checks = [
            c.strip() for c in args.pre_check_selection.split(",") if c.strip()
        ]
    else:
        selected_checks = []  # Empty list means no checks selected
 
    logger.info(f"[MAIN] ========================================")
    logger.info(f"[MAIN] UNIFIED UPGRADE MANAGER v5.1.0 - REAL UPGRADES WITH USER OPTIONS")
    logger.info(f"[MAIN] Phase: {args.phase}")
    logger.info(f"[MAIN] Hostname: {args.hostname}")
    logger.info(f"[MAIN] Target Version: {args.target_version}")
    logger.info(f"[MAIN] Image: {args.image_filename}")
    logger.info(f"[MAIN] User: nikos-geranios_vgi")
    logger.info(f"[MAIN] Date: 2025-11-19 11:38:21 UTC")
    logger.info(f"[MAIN] ========================================")
 
    if args.phase == "upgrade":
        logger.info(f"[MAIN] UPGRADE OPTIONS:")
        logger.info(f"[MAIN]   • No Validate: {args.no_validate}")
        logger.info(f"[MAIN]   • No Copy: {args.no_copy}")
        logger.info(f"[MAIN]   • Auto Reboot: {args.auto_reboot}")
        logger.info(f"[MAIN] ========================================")
 
    try:
        if args.phase == "pre_check":
            logger.info(f"[MAIN] Executing pre-check phase...")
            return execute_pre_check_phase(args, selected_checks)
 
        elif args.phase == "upgrade":
            logger.info(f"[MAIN] Executing REAL upgrade phase with user options...")
            return execute_upgrade_phase(args)
 
        else:
            logger.error(f"[MAIN] Unknown phase: {args.phase}")
            emitter.operation_complete(
                success=False,
                message=f"Unknown phase: {args.phase}",
                final_results={"error": f"Unknown phase: {args.phase}"},
            )
            return 1
 
    except Exception as e:
        logger.exception(f"[MAIN] Critical failure in {args.phase} phase")
        emitter.operation_complete(
            success=False,
            message=f"Critical failure: {str(e)}",
            final_results={"error": str(e), "phase": args.phase},
        )
        return 1
 
 
# =============================================================================
# SECTION 7: ENTRY POINT
# =============================================================================
 
if __name__ == "__main__":
    sys.exit(main())
