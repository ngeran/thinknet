#!/usr/bin/env python3
"""
Juniper Device Code Upgrade - FINAL v4.0.2 - Enhanced Progress & Debug Logging
Perfect step progression with sequence numbers, timing control, and callback debugging
 
ENHANCEMENTS v4.0.2:
- Added comprehensive callback debugging logs
- Enhanced visibility into callback invocation
- Detailed logging at each step of check execution
- Explicit verification that messages are emitted
 
ENHANCEMENTS v4.0.1:
- More descriptive check status messages
- User-friendly check names in progress updates
 
ENHANCEMENTS v4.0.0:
- Added sequence numbers to all events for guaranteed ordering
- Implemented small delays between rapid step emissions
- Dynamic total steps calculation based on selected checks
- Per-check progress callbacks for granular visibility
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
# LOGGING TO STDERR ONLY - keeps stdout clean for event stream
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
 
    _sequence_counter = 0  # Class-level counter for unique sequence numbers
 
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
                "operation": "pre_check",
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
# SECTION 4: MAIN EXECUTION FUNCTION
# =============================================================================
 
def main() -> int:
    """Main entry point for pre-check validation with enhanced progress tracking."""
 
    # =========================================================================
    # SUBSECTION 4.1: ARGUMENT PARSING
    # =========================================================================
    parser = argparse.ArgumentParser()
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
    args = parser.parse_args()
 
    # Parse selected checks from comma-separated string
    selected_checks = [
        c.strip() for c in args.pre_check_selection.split(",") if c.strip()
    ]
 
    # =========================================================================
    # SUBSECTION 4.2: DYNAMIC STEP CALCULATION
    # =========================================================================
    BASE_STEPS = 7
    check_count = len(selected_checks) if selected_checks else 4
    FINALIZE_STEPS = 1
    TOTAL_STEPS = BASE_STEPS + check_count + FINALIZE_STEPS
 
    logger.info(f"[MAIN] ========================================")
    logger.info(f"[MAIN] MAIN FUNCTION STARTED")
    logger.info(f"[MAIN] Date: 2025-11-18 14:34:41 UTC")
    logger.info(f"[MAIN] User: nikos-geranios_vgi")
    logger.info(f"[MAIN] Total steps calculated: {TOTAL_STEPS}")
    logger.info(f"[MAIN] Base steps: {BASE_STEPS}")
    logger.info(f"[MAIN] Check steps: {check_count}")
    logger.info(f"[MAIN] Finalize steps: {FINALIZE_STEPS}")
    logger.info(f"[MAIN] Selected checks: {selected_checks or 'ALL'}")
    logger.info(f"[MAIN] ========================================")
 
    try:
        # =====================================================================
        # SUBSECTION 4.3: DEVICE UPGRADER INITIALIZATION
        # =====================================================================
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
 
        # =====================================================================
        # SUBSECTION 4.4: OPERATION START
        # =====================================================================
        emitter.emit(
            "OPERATION_START",
            data={"operation": "pre_check", "total_steps": TOTAL_STEPS},
        )
        time.sleep(STEP_EMISSION_DELAY)
 
        # =====================================================================
        # SUBSECTION 4.5: STEPS 1-2 - INITIALIZATION
        # =====================================================================
        emit_step_with_delay(
            1, TOTAL_STEPS, f"Pre-check validation started for {args.hostname}"
        )
 
        emit_step_with_delay(
            2, TOTAL_STEPS, f"Checking reachability to {args.hostname}..."
        )
 
        # =====================================================================
        # SUBSECTION 4.6: STEP 3 - DEVICE CONNECTION
        # =====================================================================
        with upgrader.connector.connect():
            emit_step_with_delay(
                3, TOTAL_STEPS, f"✅ Device {args.hostname} is reachable and connected"
            )
 
            # =================================================================
            # SUBSECTION 4.7: STEPS 4-5 - VERSION RETRIEVAL
            # =================================================================
            emit_step_with_delay(
                4, TOTAL_STEPS, "Retrieving current device version..."
            )
 
            current_version = upgrader.get_current_version()
 
            emit_step_with_delay(
                5, TOTAL_STEPS, f"✅ Current version: {current_version}"
            )
 
            # =================================================================
            # SUBSECTION 4.8: STEPS 6-7 - VERSION VALIDATION
            # =================================================================
            emit_step_with_delay(
                6, TOTAL_STEPS, "Validating version compatibility..."
            )
 
            upgrader._validate_downgrade_scenario(current_version, args.target_version)
 
            emit_step_with_delay(
                7, TOTAL_STEPS, "✅ Version compatibility validated"
            )
 
            # =================================================================
            # SUBSECTION 4.9: STEPS 8-N - PRE-CHECK WITH ENHANCED CALLBACK
            # =================================================================
 
            logger.info(f"[PRE-CHECK] ========================================")
            logger.info(f"[PRE-CHECK] PREPARING TO RUN PRE-CHECKS")
            logger.info(f"[PRE-CHECK] Date: 2025-11-18 14:34:41 UTC")
            logger.info(f"[PRE-CHECK] User: nikos-geranios_vgi")
            logger.info(f"[PRE-CHECK] Check count: {check_count}")
            logger.info(f"[PRE-CHECK] Selected checks: {selected_checks or 'ALL'}")
            logger.info(f"[PRE-CHECK] Base steps completed: {BASE_STEPS}")
            logger.info(f"[PRE-CHECK] Total steps: {TOTAL_STEPS}")
            logger.info(f"[PRE-CHECK] ========================================")
 
            current_step = BASE_STEPS
 
            def check_progress_callback(check_name: str, check_num: int, total_checks: int, passed: bool):
                """
                Callback invoked after each pre-check completes.
 
                ENHANCEMENT v4.0.2:
                - Comprehensive logging to verify callback invocation
                - Explicit message emission tracking
                """
                nonlocal current_step
                current_step += 1
 
                # COMPREHENSIVE LOGGING
                logger.info(f"[PRE-CHECK] ========================================")
                logger.info(f"[PRE-CHECK] ⭐ CALLBACK INVOKED")
                logger.info(f"[PRE-CHECK] Function: check_progress_callback")
                logger.info(f"[PRE-CHECK] Check name: {check_name}")
                logger.info(f"[PRE-CHECK] Check number: {check_num}/{total_checks}")
                logger.info(f"[PRE-CHECK] Passed: {passed}")
                logger.info(f"[PRE-CHECK] Current step: {current_step}/{TOTAL_STEPS}")
                logger.info(f"[PRE-CHECK] Timestamp: {datetime.utcnow().isoformat()}Z")
                logger.info(f"[PRE-CHECK] ========================================")
 
                # Prepare message
                status_icon = "✅" if passed else "❌"
                status_text = "passed" if passed else "failed"
                message = f"{status_icon} Check {check_num}/{total_checks}: {check_name} - {status_text}"
 
                logger.info(f"[PRE-CHECK] 📤 About to emit message to stdout:")
                logger.info(f"[PRE-CHECK]    Message: {message}")
                logger.info(f"[PRE-CHECK]    Step: {current_step}/{TOTAL_STEPS}")
                logger.info(f"[PRE-CHECK]    Percentage: {round((current_step / TOTAL_STEPS) * 100)}%")
 
                # Emit to stdout (this goes to frontend)
                try:
                    emit_step_with_delay(current_step, TOTAL_STEPS, message)
                    logger.info(f"[PRE-CHECK] ✅ Message emitted successfully")
                except Exception as emit_error:
                    logger.error(f"[PRE-CHECK] ❌ EMIT FAILED: {emit_error}")
                    logger.exception(emit_error)
 
                logger.info(f"[PRE-CHECK] 📝 Status: {status_icon} {check_name} {status_text}")
                logger.info(f"[PRE-CHECK] ========================================")
 
            # Emit header message
            logger.info(f"[PRE-CHECK] Emitting header message for checks section...")
            emit_step_with_delay(
                BASE_STEPS + 1,
                TOTAL_STEPS,
                f"🔍 Starting {check_count} validation check{'s' if check_count > 1 else ''}..."
            )
            current_step = BASE_STEPS + 1
            logger.info(f"[PRE-CHECK] Header message emitted, current_step now: {current_step}")
 
            # Verify callback before passing
            logger.info(f"[PRE-CHECK] ========================================")
            logger.info(f"[PRE-CHECK] CALLBACK VERIFICATION:")
            logger.info(f"[PRE-CHECK] Callback function: {check_progress_callback}")
            logger.info(f"[PRE-CHECK] Callback is callable: {callable(check_progress_callback)}")
            logger.info(f"[PRE-CHECK] Callback type: {type(check_progress_callback)}")
            logger.info(f"[PRE-CHECK] ========================================")
 
            # CRITICAL: Run pre-checks with callback
            logger.info(f"[PRE-CHECK] 🚀 Calling upgrader.run_pre_checks...")
            logger.info(f"[PRE-CHECK]    with selected_check_ids: {selected_checks or None}")
            logger.info(f"[PRE-CHECK]    with progress_callback: {check_progress_callback}")
 
            try:
                upgrader.run_pre_checks(
                    selected_check_ids=selected_checks or None,
                    progress_callback=check_progress_callback
                )
                logger.info(f"[PRE-CHECK] ✅ upgrader.run_pre_checks returned successfully")
            except Exception as pre_check_error:
                logger.error(f"[PRE-CHECK] ❌ upgrader.run_pre_checks FAILED: {pre_check_error}")
                logger.exception(pre_check_error)
                raise
 
            logger.info(f"[PRE-CHECK] Final current_step: {current_step}")
            logger.info(f"[PRE-CHECK] Expected final step: {BASE_STEPS + check_count + 1}")
            logger.info(f"[PRE-CHECK] ========================================")
 
            # =================================================================
            # SUBSECTION 4.10: FINAL STEP - SUMMARY
            # =================================================================
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
                        "severity": str(getattr(r.severity, "value", r.severity)).lower(),
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
                f"✅ All validation checks completed: {passed_count}/{results_dict['total_checks']} passed"
            )
 
        # =====================================================================
        # SUBSECTION 4.11: EMIT COMPLETION EVENTS
        # =====================================================================
        emitter.pre_check_complete(args.hostname, results_dict)
        time.sleep(STEP_EMISSION_DELAY)
 
        emitter.operation_complete(
            success=True,
            message="Pre-check completed successfully",
            final_results=results_dict,
        )
 
        logger.info(f"[MAIN] ========================================")
        logger.info(f"[MAIN] MAIN FUNCTION COMPLETED SUCCESSFULLY")
        logger.info(f"[MAIN] ========================================")
 
        return 0
 
    except Exception as e:
        # =====================================================================
        # SUBSECTION 4.12: ERROR HANDLING
        # =====================================================================
        logger.exception("Pre-check failed")
        error_msg = str(e) or "Unknown error"
 
        emitter.step_complete(
            min(TOTAL_STEPS, BASE_STEPS + 1),
            TOTAL_STEPS,
            f"❌ Failed: {error_msg[:100]}"
        )
        time.sleep(STEP_EMISSION_DELAY)
 
        for step in range(BASE_STEPS + 2, TOTAL_STEPS + 1):
            emitter.step_complete(step, TOTAL_STEPS, "⊘ Skipped due to error")
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
# SECTION 5: ENTRY POINT
# =============================================================================
 
if __name__ == "__main__":
    sys.exit(main())
