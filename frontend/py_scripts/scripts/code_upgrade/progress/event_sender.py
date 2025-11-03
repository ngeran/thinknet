"""
Real-time progress event emission for frontend integration.

Provides JSON-formatted structured events sent via stderr for
ReactJS frontend integration with reliable delivery.
"""

import sys
import json
import time
import logging
from typing import Dict, Any, Optional

from utils.json_utils import safe_json_serialize
from core.constants import EVENT_DELIVERY_DELAY, EVENT_FLUSH_DELAY, EVENT_RETRY_COUNT
from core.dataclasses import DeviceStatus

logger = logging.getLogger(__name__)


def debug_event_flow(event_type: str, data: Dict[str, Any], stage: str = "SENDING"):
    """
    Debug helper for monitoring event flow to frontend.

    Logs detailed event information for troubleshooting frontend integration
    and event delivery issues.

    Args:
        event_type: Type of event being sent
        data: Event payload data
        stage: Event flow stage (SENDING, DELIVERED, etc.)
    """
    debug_message = f"🔍 [EVENT_FLOW] {stage} {event_type}"

    if event_type == "PRE_CHECK_COMPLETE":
        if "pre_check_summary" in data:
            summary = data["pre_check_summary"]
            debug_message += f" | Checks: {summary.get('total_checks', 'N/A')}"
            debug_message += f" | Can proceed: {summary.get('can_proceed', 'N/A')}"
    elif event_type == "OPERATION_COMPLETE":
        if "success" in data:
            debug_message += f" | Success: {data.get('success', 'N/A')}"
    elif event_type == "ROLLBACK_INITIATED":
        if "reason" in data:
            debug_message += f" | Reason: {data.get('reason', 'N/A')}"

    print(debug_message, file=sys.stderr, flush=True)
    logger.debug(f"[EVENT_FLOW] {event_type} {stage} - Data keys: {list(data.keys())}")


def send_progress(event_type: str, data: Dict[str, Any], message: str = ""):
    """
    Send progress event to frontend via stderr in JSON format.

    Events are structured JSON objects containing event type, timestamp,
    message, and data payload. Multiple delivery attempts ensure reliability.

    Args:
        event_type: Type of event (e.g., DEVICE_PROGRESS, PRE_CHECK_COMPLETE)
        data: Event-specific data payload
        message: Human-readable message describing event
    """
    event = {
        "event_type": event_type,
        "timestamp": time.time(),
        "message": message,
        "data": safe_json_serialize(data),
    }

    debug_event_flow(event_type, data, "SENDING")

    # Critical events get retry logic
    max_attempts = (
        EVENT_RETRY_COUNT
        if event_type
        in ["PRE_CHECK_COMPLETE", "OPERATION_COMPLETE", "ROLLBACK_COMPLETE"]
        else 1
    )

    for attempt in range(max_attempts):
        try:
            event_json = json.dumps(event, ensure_ascii=False)
            print(event_json, file=sys.stderr, flush=True)
            try:
                sys.stderr.flush()
            except Exception:
                pass
            if attempt > 0:
                logger.info(
                    f"📤 [{event_type}] Retry {attempt + 1}/{max_attempts} successful"
                )
            break
        except Exception as e:
            logger.error(
                f"❌ [{event_type}] Failed to send event (attempt {attempt + 1}): {e}"
            )
            if attempt == max_attempts - 1:
                logger.critical(f"💥 [{event_type}] ALL DELIVERY ATTEMPTS FAILED!")
            if attempt < max_attempts - 1:
                time.sleep(0.2)


def send_device_progress(
    device_status: DeviceStatus,
    step: int,
    total_steps: int,
    message: str = "",
    extra_data: Optional[Dict[str, Any]] = None,
):
    """
    Send device-specific progress update.

    Args:
        device_status: Current device status object
        step: Current step number (1-based)
        total_steps: Total number of steps in process
        message: Progress message
        extra_data: Additional data to include in event
    """
    data = {
        "device": device_status.hostname,
        "phase": device_status.phase.value,
        "step": step,
        "total_steps": total_steps,
        "message": message or device_status.message,
        "initial_version": device_status.current_version,
        "target_version": device_status.target_version,
        "version_action": device_status.version_action.value,
        "success": device_status.success,
        "warnings": device_status.warnings,
    }
    if extra_data:
        data.update(extra_data)
    send_progress("DEVICE_PROGRESS", data, message)


def send_upgrade_progress(
    device_status: DeviceStatus,
    step_name: str,
    status: str,
    progress: int = 0,
    message: str = "",
):
    """
    Send upgrade operation progress update.

    Args:
        device_status: Current device status
        step_name: Name of current upgrade step
        status: Step status (in_progress, completed, failed)
        progress: Progress percentage (0-100)
        message: Detailed progress message
    """
    data = {
        "device": device_status.hostname,
        "step": step_name,
        "status": status,
        "progress": progress,
        "message": message,
        "current_version": device_status.current_version,
        "target_version": device_status.target_version,
        "phase": device_status.phase.value,
    }
    send_progress("UPGRADE_PROGRESS", data, message)


def send_pre_check_results(device_status: DeviceStatus):
    """
    Send pre-check validation results to frontend.

    Args:
        device_status: Device status containing pre-check summary
    """
    if not device_status.pre_check_summary:
        logger.error(f"[{device_status.hostname}] ❌ No pre-check results to send")
        return

    summary = device_status.pre_check_summary.to_dict()
    data = {
        "device": device_status.hostname,
        "pre_check_summary": summary,
        "can_proceed": summary["can_proceed"],
        "total_checks": summary["total_checks"],
        "passed": summary["passed"],
        "warnings": summary["warnings"],
        "critical_failures": summary["critical_failures"],
    }

    logger.info(f"[{device_status.hostname}] 🎯 Sending PRE_CHECK_COMPLETE event")
    send_progress("PRE_CHECK_COMPLETE", data, "Pre-check validation completed")

    # Ensure delivery with multiple flushes
    for i in range(3):
        try:
            sys.stderr.flush()
        except Exception:
            pass
        time.sleep(EVENT_FLUSH_DELAY / 3)

    logger.info(
        f"[{device_status.hostname}] ✅ PRE_CHECK_COMPLETE events delivered successfully"
    )


def send_operation_complete(
    device_status: DeviceStatus, success: bool, message: str = ""
):
    """
    Send final operation completion event.

    Args:
        device_status: Final device status
        success: Whether operation succeeded
        message: Completion message
    """
    data = {
        "device": device_status.hostname,
        "success": success,
        "message": message or device_status.message,
        "initial_version": device_status.current_version,
        "final_version": device_status.final_version,
        "version_action": device_status.version_action.value,
        "warnings": device_status.warnings,
        "duration": device_status.get_duration(),
    }

    if device_status.pre_check_summary:
        data["pre_check_summary"] = device_status.pre_check_summary.to_dict()
    if device_status.upgrade_result:
        data["upgrade_result"] = device_status.upgrade_result.to_dict()

    logger.info(f"[{device_status.hostname}] 🎯 Sending OPERATION_COMPLETE event")
    send_progress("OPERATION_COMPLETE", data, message)
    try:
        sys.stderr.flush()
    except Exception:
        pass
    time.sleep(EVENT_DELIVERY_DELAY)
    logger.info(
        f"[{device_status.hostname}] ✅ OPERATION_COMPLETE delivered: success={success}"
    )
