#!/usr/bin/env python3
"""
Juniper Device Code Upgrade - FINAL v3.1.0 - UI + Manual Compatible
Perfect 10 steps, clean events only
"""

import sys
import argparse
import logging
import json
from datetime import datetime
from typing import Dict, Any, Optional, List

# LOGGING TO STDERR ONLY
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)-8s - [%(filename)s:%(lineno)d] - %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(__name__)


# CLEAN EVENT EMITTER - STDOUT ONLY
class EventEmitter:
    @staticmethod
    def emit(
        event_type: str,
        data: Optional[Dict[str, Any]] = None,
        message: Optional[str] = None,
        level: str = "INFO",
    ) -> None:
        event = {
            "event_type": event_type,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": level,
        }
        if message:
            event["message"] = message
        if data is not None:
            event["data"] = data
        print(json.dumps(event), flush=True)

    @staticmethod
    def step_complete(step: int, total_steps: int, message: str) -> None:
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


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", required=True, choices=["pre_check", "upgrade"])
    parser.add_argument("--hostname", required=True)
    parser.add_argument("--username", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--target-version", dest="target_version", default="")
    parser.add_argument("--image-filename", dest="image_filename", default="")
    parser.add_argument("--pre-check-selection", dest="pre_check_selection", default="")
    # ← These two lines fix the UI crash
    parser.add_argument("--vendor", default="juniper")
    parser.add_argument("--platform", default="srx")
    parser.add_argument("--skip-pre-check", action="store_true")
    parser.add_argument("--force-upgrade", action="store_true")
    args = parser.parse_args()

    selected_checks = [
        c.strip() for c in args.pre_check_selection.split(",") if c.strip()
    ]

    TOTAL_STEPS = 10

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

        emitter.step_complete(
            1, TOTAL_STEPS, f"Pre-check validation started for {args.hostname}"
        )
        emitter.step_complete(
            2, TOTAL_STEPS, f"Checking reachability to {args.hostname}..."
        )

        with upgrader.connector.connect():
            emitter.step_complete(
                3, TOTAL_STEPS, f"✅ Device {args.hostname} is reachable and connected"
            )

            emitter.step_complete(
                4, TOTAL_STEPS, "Retrieving current device version..."
            )
            current_version = upgrader.get_current_version()
            emitter.step_complete(
                5, TOTAL_STEPS, f"✅ Current version: {current_version}"
            )

            emitter.step_complete(6, TOTAL_STEPS, "Validating version compatibility...")
            upgrader._validate_downgrade_scenario(current_version, args.target_version)
            emitter.step_complete(7, TOTAL_STEPS, "✅ Version compatibility validated")

            check_count = len(selected_checks) if selected_checks else "all"
            emitter.step_complete(
                8, TOTAL_STEPS, f"Running {check_count} validation checks..."
            )

            upgrader.run_pre_checks(selected_check_ids=selected_checks or None)

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
            emitter.step_complete(
                9,
                TOTAL_STEPS,
                f"✅ All validation checks completed: {passed_count}/{results_dict['total_checks']} passed",
            )
            emitter.step_complete(10, TOTAL_STEPS, "Finalizing validation results...")

        emitter.pre_check_complete(args.hostname, results_dict)
        emitter.operation_complete(
            success=True,
            message="Pre-check completed successfully",
            final_results=results_dict,
        )
        return 0

    except Exception as e:
        logger.exception("Pre-check failed")
        error_msg = str(e) or "Unknown error"
        emitter.step_complete(3, TOTAL_STEPS, f"❌ Failed: {error_msg[:100]}")
        for step in range(4, TOTAL_STEPS + 1):
            emitter.step_complete(step, TOTAL_STEPS, "⊘ Skipped due to error")

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
        emitter.operation_complete(
            success=False,
            message=f"Pre-check failed: {error_msg}",
            final_results=failure_summary,
        )
        return 1


if __name__ == "__main__":
    sys.exit(main())
