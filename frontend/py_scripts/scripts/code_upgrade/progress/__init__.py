"""
Progress tracking and event reporting package.

Provides real-time progress updates and event delivery for frontend
integration and monitoring during upgrade operations.
"""

from .event_sender import (
    send_device_progress,  # This function exists
    send_upgrade_progress,  # This function exists
    send_pre_check_results,  # This function exists
    send_operation_complete,  # This function exists
    flush_pending_events,  # This function exists
    # send_progress does NOT exist - removed
)

__all__ = [
    "send_device_progress",
    "send_upgrade_progress",
    "send_pre_check_results",
    "send_operation_complete",
    "flush_pending_events",
]
