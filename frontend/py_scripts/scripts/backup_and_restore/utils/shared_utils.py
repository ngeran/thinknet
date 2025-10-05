# python_pipeline/utils/shared_utils.py

import json
import logging
import sys
import time
from datetime import datetime
from enum import Enum
from typing import Dict, Any, Optional

class NotificationLevel(Enum):
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    SUCCESS = "SUCCESS"

class ProgressTracker:
    """A class to manage and broadcast the progress of a multi-step operation."""
    
    def __init__(self):
        self.steps = []
        self.current_step_index = -1
        self.start_time = None
        self.step_start_time = None
        self.current_operation = None
        self.operation_name = None
        
    def start_operation(self, operation_name: str):
        self.start_time = time.time()
        self.operation_name = operation_name
        self.current_operation = operation_name
        self._notify(
            level=NotificationLevel.INFO,
            message=f"Starting: {operation_name}",
            event_type="OPERATION_START",
            data={"operation": operation_name}
        )
        
    def start_step(self, step_name: str, description: str = ""):
        """Starts a new step in the operation."""
        self.current_step_index += 1
        self.step_start_time = time.time()
        step_info = {
            "step": self.current_step_index + 1,
            "name": step_name,
            "description": description,
            "status": "IN_PROGRESS",
            "start_time": datetime.now().isoformat(),
            "duration": None,
            "details": {}
        }
        self.steps.append(step_info)
        self._notify(
            level=NotificationLevel.INFO,
            message=f"Step {step_info['step']}: {step_name}",
            event_type="STEP_START",
            data=step_info
        )
            
    def update_step(self, details: Optional[Dict] = None, message: Optional[str] = None):
        """Updates the current step with new information."""
        if self.current_step_index < 0: return
        current = self.steps[self.current_step_index]
        if details:
            current["details"].update(details)
        self._notify(
            level=NotificationLevel.INFO,
            message=message or f"Updating: {current['name']}",
            event_type="STEP_UPDATE",
            data=current
        )
                
    def complete_step(self, status: str = "COMPLETED", details: Optional[Dict] = None):
        """Completes the current step."""
        if self.current_step_index < 0: return
        current = self.steps[self.current_step_index]
        current["status"] = status
        current["duration"] = time.time() - self.step_start_time
        current["end_time"] = datetime.now().isoformat()
        if details:
            current["details"].update(details)
            
        level = NotificationLevel.SUCCESS if status == "COMPLETED" else NotificationLevel.ERROR
        message = f"Step {current['step']} {status.lower()}: {current['name']} ({current['duration']:.2f}s)"
        if details and 'message' in details:
            message = details['message'] # Allow custom message for simple completions

        self._notify(
            level=level,
            message=message,
            event_type="STEP_COMPLETE",
            data=current
        )
            
    def complete_operation(self, status: str = "SUCCESS"):
        """Completes the entire operation."""
        if not self.current_operation: return
        
        total_duration = time.time() - self.start_time if self.start_time else 0
        level = NotificationLevel.SUCCESS if status == "SUCCESS" else NotificationLevel.ERROR
        self._notify(
            level=level,
            message=f"Operation '{self.operation_name}' completed in {total_duration:.2f}s with status: {status}",
            event_type="OPERATION_COMPLETE",
            data={
                "operation": self.operation_name,
                "status": status,
                "total_duration": total_duration
            }
        )
        self.current_operation = None

    def _notify(self, level: NotificationLevel, message: str, event_type: str, data: Dict[Any, Any] = None):
        notification_data = {
            "timestamp": datetime.now().isoformat(),
            "level": level.value,
            "message": message,
            "event_type": event_type,
            "data": data or {}
        }
        print(f"JSON_PROGRESS: {json.dumps(notification_data)}", file=sys.stderr, flush=True)

    def get_summary(self):
        return {"operation": self.operation_name, "steps": self.steps}

def setup_logging(level=logging.INFO):
    """Sets up a basic logger that prints to stderr."""
    logger = logging.getLogger()
    if not logger.handlers:
        logger.setLevel(level)
        handler = logging.StreamHandler(sys.stderr)
        formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s', '%Y-%m-%d %H:%M:%S')
        handler.setFormatter(formatter)
        logger.addHandler(handler)
    return logger
