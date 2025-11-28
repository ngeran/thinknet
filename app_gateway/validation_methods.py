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
        try:
            # Basic structure validation
            if not isinstance(event_data, dict):
                logger.debug(f"[VALIDATION] Event is not a dict: {type(event_data)}")
                return False

            # Required fields for all events
            required_fields = ["event_type", "timestamp", "job_id"]
            for field in required_fields:
                if field not in event_data:
                    logger.debug(f"[VALIDATION] Missing required field: {field}")
                    return False

            # Validate event_type
            event_type = event_data["event_type"]
            if not isinstance(event_type, str) or event_type not in RECOGNIZED_EVENT_TYPES:
                logger.debug(f"[VALIDATION] Invalid event_type: {event_type}")
                return False

            # Validate timestamp (basic ISO format check)
            timestamp = event_data["timestamp"]
            if not isinstance(timestamp, str) or not timestamp.startswith(("202", "201", "200")):
                logger.debug(f"[VALIDATION] Invalid timestamp: {timestamp}")
                return False

            # Validate job_id
            job_id = event_data["job_id"]
            if not isinstance(job_id, str) or len(job_id) < 5:
                logger.debug(f"[VALIDATION] Invalid job_id: {job_id}")
                return False

            # Event-specific validation based on type
            return self.validate_event_specific_fields(event_data, event_type)

        except Exception as e:
            logger.debug(f"[VALIDATION] Exception during validation: {e}")
            return False

    def validate_event_specific_fields(self, event_data: Dict[str, Any], event_type: str) -> bool:
        """
        Validate event-specific fields according to message schema.

        Args:
            event_data: Event dictionary to validate
            field: Event type for schema lookup

        Returns:
            bool: True if event-specific validation passes
        """
        try:
            if event_type == "PROGRESS_UPDATE":
                # Validate progress data structure
                if "data" not in event_data:
                    return False

                data = event_data["data"]
                if not isinstance(data, dict) or "progress" not in data:
                    return False

                progress = data["progress"]
                if not isinstance(progress, (int, float)) or not (0 <= progress <= 100):
                    logger.debug(f"[VALIDATION] Invalid progress value: {progress}")
                    return False

            elif event_type in ["UPLOAD_COMPLETE", "OPERATION_COMPLETE"]:
                # Validate success field for completion events
                if "success" not in event_data:
                    return False

                success = event_data["success"]
                if not isinstance(success, bool):
                    logger.debug(f"[VALIDATION] Invalid success value: {success}")
                    return False

            elif event_type == "LOG_MESSAGE":
                # Validate log level and message
                if "level" not in event_data or "message" not in event_data:
                    return False

                level = event_data["level"]
                valid_levels = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
                if level not in valid_levels:
                    logger.debug(f"[VALIDATION] Invalid log level: {level}")
                    return False

                if not isinstance(event_data["message"], str):
                    return False

            elif event_type == "PRE_CHECK_COMPLETE":
                # Validate validation_passed field
                if "data" not in event_data:
                    return False

                data = event_data["data"]
                if not isinstance(data, dict) or "validation_passed" not in data:
                    return False

                validation_passed = data["validation_passed"]
                if not isinstance(validation_passed, bool):
                    return False

            return True

        except Exception as e:
            logger.debug(f"[VALIDATION] Event-specific validation error: {e}")
            return False