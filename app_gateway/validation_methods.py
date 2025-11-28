# =============================================================================
# FILE LOCATION: app_gateway/validation_methods.py
# DESCRIPTION:   Phase 2 Event Validation Methods for Template Deployments
# VERSION:       1.0.0 - Template Deployment Validation
# AUTHOR:        Claude Code Assistant
# DATE:          2025-11-28
# =============================================================================

"""
PHASE 2 ENHANCEMENT: Event Validation System

This module provides comprehensive validation for all event types flowing
through the ThinkNet system. It ensures message integrity, structure compliance,
and prevents malformed events from reaching the frontend.

The validation system follows the schema definitions defined in:
- frontend/src/schemas/messageSchemas.js
"""

import logging
from datetime import datetime
from typing import Dict, Any, Set, List, Optional

# Configure validation logger
validation_logger = logging.getLogger("EVENT_VALIDATION")
validation_logger.setLevel(logging.DEBUG)

# Event types that are recognized by the system
RECOGNIZED_EVENT_TYPES: Set[str] = {
    "PRE_CHECK_COMPLETE",
    "PRE_CHECK_RESULT",
    "OPERATION_COMPLETE",
    "OPERATION_START",
    "STEP_COMPLETE",
    "STEP_PROGRESS",
    "DEVICE_PROGRESS",
    "UPGRADE_PROGRESS",
    "PROGRESS_UPDATE",
    "UPLOAD_COMPLETE",
    "UPLOAD_START",
    # TEMPLATE DEPLOYMENT EVENTS - Phase 2 Architecture
    "TEMPLATE_DEPLOY_START",
    "TEMPLATE_DEPLOY_PROGRESS",
    "TEMPLATE_DEPLOY_COMPLETE",
    "TEMPLATE_VALIDATION_RESULT",
    "TEMPLATE_DIFF_GENERATED",
    "LOG_MESSAGE",
}

class EventValidator:
    """
    Phase 2 Event Validation System

    Validates event structure, field types, and business logic compliance
    according to standardized message schemas.
    """

    def __init__(self):
        self.validation_stats = {
            "total_validated": 0,
            "validation_passed": 0,
            "validation_failed": 0,
            "errors_by_type": {}
        }

    def validate_event_structure(self, event_data: Dict[str, Any]) -> bool:
        """
        Validate event structure according to Phase 2 message schemas.

        PHASE 2 ENHANCEMENT:
        Ensures all events have required fields and valid structure before publishing.
        This prevents malformed messages from reaching the frontend.

        Args:
            event_data: Event dictionary to validate

        Returns:
            bool: True if event is valid, False otherwise
        """
        self.validation_stats["total_validated"] += 1

        try:
            # Basic structure validation
            if not isinstance(event_data, dict):
                validation_logger.debug(f"[VALIDATION] Event is not a dict: {type(event_data)}")
                self._record_validation_error("not_dict")
                return False

            # Required fields for all events
            required_fields = ["event_type", "timestamp", "job_id"]
            for field in required_fields:
                if field not in event_data:
                    validation_logger.debug(f"[VALIDATION] Missing required field: {field}")
                    self._record_validation_error(f"missing_{field}")
                    return False

            # Validate event_type
            event_type = event_data["event_type"]
            if not isinstance(event_type, str) or event_type not in RECOGNIZED_EVENT_TYPES:
                validation_logger.debug(f"[VALIDATION] Invalid event_type: {event_type}")
                self._record_validation_error("invalid_event_type")
                return False

            # Validate timestamp (basic ISO format check)
            timestamp = event_data["timestamp"]
            if not isinstance(timestamp, str) or not timestamp.startswith(("202", "201", "200")):
                validation_logger.debug(f"[VALIDATION] Invalid timestamp: {timestamp}")
                self._record_validation_error("invalid_timestamp")
                return False

            # Validate job_id
            job_id = event_data["job_id"]
            if not isinstance(job_id, str) or len(job_id) < 5:
                validation_logger.debug(f"[VALIDATION] Invalid job_id: {job_id}")
                self._record_validation_error("invalid_job_id")
                return False

            # Event-specific validation based on type
            return self.validate_event_specific_fields(event_data, event_type)

        except Exception as e:
            validation_logger.debug(f"[VALIDATION] Exception during validation: {e}")
            self._record_validation_error("validation_exception")
            return False

    def validate_event_specific_fields(self, event_data: Dict[str, Any], event_type: str) -> bool:
        """
        Validate event-specific fields according to message schema.

        Args:
            event_data: Event dictionary to validate
            event_type: Event type for schema lookup

        Returns:
            bool: True if event-specific validation passes
        """
        try:
            if event_type == "PROGRESS_UPDATE":
                return self._validate_progress_update(event_data)

            elif event_type in ["UPLOAD_COMPLETE", "OPERATION_COMPLETE", "TEMPLATE_DEPLOY_COMPLETE"]:
                return self._validate_completion_event(event_data)

            elif event_type == "TEMPLATE_DEPLOY_START":
                return self._validate_template_deploy_start(event_data)

            elif event_type == "TEMPLATE_DEPLOY_PROGRESS":
                return self._validate_template_deploy_progress(event_data)

            elif event_type == "TEMPLATE_VALIDATION_RESULT":
                return self._validate_template_validation_result(event_data)

            elif event_type == "TEMPLATE_DIFF_GENERATED":
                return self._validate_template_diff_generated(event_data)

            elif event_type == "LOG_MESSAGE":
                return self._validate_log_message(event_data)

            elif event_type in ["STEP_COMPLETE", "STEP_PROGRESS", "DEVICE_PROGRESS", "UPGRADE_PROGRESS"]:
                return self._validate_step_event(event_data)

            # For other event types, perform basic validation only
            return True

        except Exception as e:
            validation_logger.debug(f"[VALIDATION] Event-specific validation error: {e}")
            self._record_validation_error(f"specific_validation_{event_type}")
            return False

    def _validate_progress_update(self, event_data: Dict[str, Any]) -> bool:
        """Validate PROGRESS_UPDATE event structure."""
        if "data" not in event_data:
            self._record_validation_error("progress_missing_data")
            return False

        data = event_data["data"]
        if not isinstance(data, dict) or "progress" not in data:
            self._record_validation_error("progress_invalid_data")
            return False

        progress = data["progress"]
        if not isinstance(progress, (int, float)) or not (0 <= progress <= 100):
            validation_logger.debug(f"[VALIDATION] Invalid progress value: {progress}")
            self._record_validation_error("progress_invalid_value")
            return False

        return True

    def _validate_completion_event(self, event_data: Dict[str, Any]) -> bool:
        """Validate completion event structure."""
        if "success" not in event_data:
            self._record_validation_error("completion_missing_success")
            return False

        success = event_data["success"]
        if not isinstance(success, bool):
            validation_logger.debug(f"[VALIDATION] Invalid success value: {success}")
            self._record_validation_error("completion_invalid_success")
            return False

        return True

    def _validate_template_deploy_start(self, event_data: Dict[str, Any]) -> bool:
        """Validate TEMPLATE_DEPLOY_START event structure."""
        if "data" not in event_data:
            self._record_validation_error("template_start_missing_data")
            return False

        data = event_data["data"]
        required_fields = ["template_name", "template_path", "target_device"]

        for field in required_fields:
            if field not in data:
                validation_logger.debug(f"[VALIDATION] Template start missing {field}")
                self._record_validation_error(f"template_start_missing_{field}")
                return False

        # Validate template name and path are strings
        if not isinstance(data["template_name"], str) or not isinstance(data["template_path"], str):
            self._record_validation_error("template_start_invalid_strings")
            return False

        return True

    def _validate_template_deploy_progress(self, event_data: Dict[str, Any]) -> bool:
        """Validate TEMPLATE_DEPLOY_PROGRESS event structure."""
        if "data" not in event_data:
            self._record_validation_error("template_progress_missing_data")
            return False

        data = event_data["data"]
        if "step_name" not in data or "progress" not in data:
            self._record_validation_error("template_progress_missing_fields")
            return False

        progress = data["progress"]
        if not isinstance(progress, (int, float)) or not (0 <= progress <= 100):
            validation_logger.debug(f"[VALIDATION] Invalid template progress: {progress}")
            self._record_validation_error("template_progress_invalid_value")
            return False

        return True

    def _validate_template_validation_result(self, event_data: Dict[str, Any]) -> bool:
        """Validate TEMPLATE_VALIDATION_RESULT event structure."""
        if "data" not in event_data:
            self._record_validation_error("template_validation_missing_data")
            return False

        data = event_data["data"]
        if "validation_passed" not in data:
            self._record_validation_error("template_validation_missing_passed")
            return False

        validation_passed = data["validation_passed"]
        if not isinstance(validation_passed, bool):
            validation_logger.debug(f"[VALIDATION] Invalid validation_passed: {validation_passed}")
            self._record_validation_error("template_validation_invalid_passed")
            return False

        return True

    def _validate_template_diff_generated(self, event_data: Dict[str, Any]) -> bool:
        """Validate TEMPLATE_DIFF_GENERATED event structure."""
        if "data" not in event_data:
            self._record_validation_error("template_diff_missing_data")
            return False

        data = event_data["data"]
        if "diff_available" not in data:
            self._record_validation_error("template_diff_missing_available")
            return False

        diff_available = data["diff_available"]
        if not isinstance(diff_available, bool):
            validation_logger.debug(f"[VALIDATION] Invalid diff_available: {diff_available}")
            self._record_validation_error("template_diff_invalid_available")
            return False

        return True

    def _validate_log_message(self, event_data: Dict[str, Any]) -> bool:
        """Validate LOG_MESSAGE event structure."""
        if "level" not in event_data or "message" not in event_data:
            self._record_validation_error("log_message_missing_fields")
            return False

        level = event_data["level"]
        valid_levels = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
        if level not in valid_levels:
            validation_logger.debug(f"[VALIDATION] Invalid log level: {level}")
            self._record_validation_error("log_message_invalid_level")
            return False

        if not isinstance(event_data["message"], str):
            self._record_validation_error("log_message_invalid_message")
            return False

        return True

    def _validate_step_event(self, event_data: Dict[str, Any]) -> bool:
        """Validate step-based event structure."""
        if "data" not in event_data:
            self._record_validation_error("step_event_missing_data")
            return False

        # Basic validation for step events
        data = event_data["data"]
        if not isinstance(data, dict):
            self._record_validation_error("step_event_invalid_data")
            return False

        return True

    def _record_validation_error(self, error_type: str) -> None:
        """Record validation error for statistics."""
        self.validation_stats["validation_failed"] += 1
        if error_type not in self.validation_stats["errors_by_type"]:
            self.validation_stats["errors_by_type"][error_type] = 0
        self.validation_stats["errors_by_type"][error_type] += 1

    def get_validation_stats(self) -> Dict[str, Any]:
        """Get current validation statistics."""
        return self.validation_stats.copy()

# Global validator instance for use throughout the application
event_validator = EventValidator()