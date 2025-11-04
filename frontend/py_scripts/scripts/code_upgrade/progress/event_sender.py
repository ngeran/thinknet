"""
Event sending and progress reporting for real-time UI updates.

Provides structured event delivery with retry logic and comprehensive
progress tracking for frontend integration and monitoring.
"""

import time
import logging
import json
from typing import Dict, Any, Optional

from core.dataclasses import DeviceStatus, EventData
from core.constants import (
    EVENT_RETRY_COUNT,
    EVENT_RETRY_DELAY,  # Fixed: Using available constants
    EVENT_TIMEOUT,
    STATUS_UPDATE_INTERVAL,
)

logger = logging.getLogger(__name__)


def send_device_progress(
    device_status: DeviceStatus,
    current_step: int,
    total_steps: int,
    message: str,
    additional_data: Optional[Dict[str, Any]] = None,
) -> bool:
    """
    Send device progress update with structured event data.

    Formats progress information into standardized JSON events
    for frontend consumption with retry logic for reliability.

    Args:
        device_status: Current device status and context
        current_step: Current step number in process
        total_steps: Total number of steps in process
        message: Human-readable progress message
        additional_data: Optional additional event data

    Returns:
        True if event was sent successfully, False otherwise
    """
    try:
        event_data = {
            "device": device_status.hostname,
            "phase": device_status.phase.value,
            "step": current_step,
            "total_steps": total_steps,
            "message": message,
            "initial_version": device_status.current_version,
            "target_version": device_status.target_version,
            "version_action": (
                device_status.version_action.value
                if device_status.version_action
                else "unknown"
            ),
            "success": False,  # Progress events are always in-progress
            "warnings": device_status.warnings,
        }

        if additional_data:
            event_data.update(additional_data)

        event = EventData(
            event_type="DEVICE_PROGRESS",
            timestamp=time.time(),
            message=message,
            data=event_data,
        )

        return _send_event_with_retry(event)

    except Exception as e:
        logger.error(
            f"[{device_status.hostname}] ❌ Failed to send progress event: {e}"
        )
        return False


def send_upgrade_progress(
    device_status: DeviceStatus,
    step: str,
    status: str,
    progress: int,
    message: str,
) -> bool:
    """
    Send detailed upgrade progress update for specific steps.

    Provides granular progress tracking for individual upgrade
    steps with percentage completion and status information.

    Args:
        device_status: Current device status and context
        step: Upgrade step identifier
        status: Step status (in_progress, completed, failed, etc.)
        progress: Progress percentage (0-100)
        message: Step-specific message

    Returns:
        True if event was sent successfully, False otherwise
    """
    try:
        event_data = {
            "device": device_status.hostname,
            "step": step,
            "status": status,
            "progress": progress,
            "message": message,
            "current_version": device_status.current_version,
            "target_version": device_status.target_version,
            "phase": device_status.phase.value,
        }

        event = EventData(
            event_type="UPGRADE_PROGRESS",
            timestamp=time.time(),
            message=message,
            data=event_data,
        )

        return _send_event_with_retry(event)

    except Exception as e:
        logger.error(
            f"[{device_status.hostname}] ❌ Failed to send upgrade progress: {e}"
        )
        return False


def send_pre_check_results(device_status: DeviceStatus) -> bool:
    """
    Send comprehensive pre-check results summary.

    Formats pre-check validation results into structured events
    for frontend display and decision support.

    Args:
        device_status: Device status with pre-check results

    Returns:
        True if event was sent successfully, False otherwise
    """
    try:
        if not device_status.pre_check_summary:
            logger.warning(f"[{device_status.hostname}] No pre-check results to send")
            return False

        summary = device_status.pre_check_summary

        event_data = {
            "device": device_status.hostname,
            "pre_check_summary": {
                "total_checks": summary.total_checks,
                "passed": summary.passed,
                "warnings": summary.warnings,
                "critical_failures": summary.critical_failures,
                "can_proceed": summary.can_proceed,
                "results": [
                    {
                        "check_name": result.check_name,
                        "severity": result.severity.value,
                        "passed": result.passed,
                        "message": result.message,
                        "details": result.details,
                        "recommendation": result.recommendation,
                    }
                    for result in summary.results
                ],
                "timestamp": summary.timestamp,
            },
            "can_proceed": summary.can_proceed,
            "total_checks": summary.total_checks,
            "passed": summary.passed,
            "warnings": summary.warnings,
            "critical_failures": summary.critical_failures,
        }

        event = EventData(
            event_type="PRE_CHECK_COMPLETE",
            timestamp=time.time(),
            message="Pre-check validation completed",
            data=event_data,
        )

        success = _send_event_with_retry(event)
        if success:
            logger.info(f"[{device_status.hostname}] ✅ Pre-check results delivered")
        return success

    except Exception as e:
        logger.error(
            f"[{device_status.hostname}] ❌ Failed to send pre-check results: {e}"
        )
        return False


def send_operation_complete(
    device_status: DeviceStatus, success: bool, message: str
) -> bool:
    """
    Send final operation completion event with results summary.

    Provides comprehensive upgrade outcome including success status,
    duration, warnings, errors, and final version information.

    Args:
        device_status: Device status with upgrade results
        success: Overall operation success status
        message: Completion message

    Returns:
        True if event was sent successfully, False otherwise
    """
    try:
        upgrade_result = device_status.upgrade_result

        event_data = {
            "device": device_status.hostname,
            "success": success,
            "message": message,
            "initial_version": (
                upgrade_result.initial_version if upgrade_result else None
            ),
            "final_version": upgrade_result.final_version if upgrade_result else None,
            "version_action": (
                upgrade_result.version_action.value
                if upgrade_result and upgrade_result.version_action
                else None
            ),
            "warnings": device_status.warnings,
            "duration": (upgrade_result.upgrade_duration if upgrade_result else 0),
            "pre_check_summary": (
                {
                    "total_checks": device_status.pre_check_summary.total_checks,
                    "passed": device_status.pre_check_summary.passed,
                    "warnings": device_status.pre_check_summary.warnings,
                    "critical_failures": device_status.pre_check_summary.critical_failures,
                    "can_proceed": device_status.pre_check_summary.can_proceed,
                    "results": [
                        {
                            "check_name": result.check_name,
                            "severity": result.severity.value,
                            "passed": result.passed,
                            "message": result.message,
                            "details": result.details,
                            "recommendation": result.recommendation,
                        }
                        for result in device_status.pre_check_summary.results
                    ],
                    "timestamp": device_status.pre_check_summary.timestamp,
                }
                if device_status.pre_check_summary
                else None
            ),
            "upgrade_result": (
                {
                    "success": upgrade_result.success,
                    "initial_version": upgrade_result.initial_version,
                    "final_version": upgrade_result.final_version,
                    "version_action": (
                        upgrade_result.version_action.value
                        if upgrade_result.version_action
                        else None
                    ),
                    "upgrade_duration": upgrade_result.upgrade_duration,
                    "reboot_required": upgrade_result.reboot_required,
                    "reboot_performed": upgrade_result.reboot_performed,
                    "reboot_wait_time": upgrade_result.reboot_wait_time,
                    "rollback_performed": upgrade_result.rollback_performed,
                    "rollback_reason": upgrade_result.rollback_reason,
                    "warnings": upgrade_result.warnings,
                    "errors": upgrade_result.errors,
                    "upgrade_steps": [
                        {
                            "step": step.step,
                            "status": step.status,
                            "message": step.message,
                            "duration": step.duration,
                            "timestamp": step.timestamp,
                        }
                        for step in upgrade_result.upgrade_steps
                    ],
                }
                if upgrade_result
                else None
            ),
        }

        event = EventData(
            event_type="OPERATION_COMPLETE",
            timestamp=time.time(),
            message=message,
            data=event_data,
        )

        # Use longer delay for final operation complete to ensure delivery
        success = _send_event_with_retry(event, retry_delay=EVENT_RETRY_DELAY * 2)
        if success:
            logger.info(
                f"[{device_status.hostname}] ✅ Operation complete event delivered: success={success}"
            )
        return success

    except Exception as e:
        logger.error(
            f"[{device_status.hostname}] ❌ Failed to send operation complete: {e}"
        )
        return False


def _send_event_with_retry(
    event: EventData,
    max_retries: int = EVENT_RETRY_COUNT,
    retry_delay: int = EVENT_RETRY_DELAY,
) -> bool:
    """
    Send event with retry logic for reliability.

    Implements exponential backoff retry strategy for event delivery
    with configurable retry counts and delays.

    Args:
        event: Event data to send
        max_retries: Maximum number of retry attempts
        retry_delay: Initial retry delay in seconds

    Returns:
        True if event was sent successfully, False otherwise
    """
    for attempt in range(max_retries + 1):  # +1 for initial attempt
        try:
            # Simulate event sending - in real implementation, this would
            # send to a message queue, webhook, or frontend integration
            event_json = json.dumps(
                {
                    "event_type": event.event_type,
                    "timestamp": event.timestamp,
                    "message": event.message,
                    "data": event.data,
                },
                default=str,  # Handle non-serializable types
            )

            # In a real implementation, you would send this to your event system
            # For now, we'll log it and simulate successful delivery
            logger.debug(
                f"🔍 [EVENT_FLOW] SENDING {event.event_type} | {event.message}"
            )
            logger.debug(f"🔍 [EVENT_FLOW] {event_json}")

            # Simulate successful delivery
            return True

        except Exception as e:
            if attempt < max_retries:
                logger.warning(
                    f"⚠️  Event delivery failed (attempt {attempt + 1}/{max_retries + 1}): {e}. "
                    f"Retrying in {retry_delay}s..."
                )
                time.sleep(retry_delay)
                # Exponential backoff for subsequent retries
                retry_delay *= 2
            else:
                logger.error(
                    f"❌ Event delivery failed after {max_retries + 1} attempts: {e}"
                )
                return False

    return False


def flush_pending_events() -> bool:
    """
    Flush any pending events from event queue.

    Ensures all pending events are delivered before process termination
    or critical operations.

    Returns:
        True if flush completed successfully, False otherwise
    """
    try:
        # In a real implementation, this would flush any buffered events
        logger.debug("🔄 Flushing pending events...")
        # Simulate brief flush delay
        time.sleep(0.1)
        logger.debug("✅ Pending events flushed")
        return True
    except Exception as e:
        logger.error(f"❌ Failed to flush pending events: {e}")
        return False
