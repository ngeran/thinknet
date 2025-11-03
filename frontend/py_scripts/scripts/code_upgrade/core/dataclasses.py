"""
Data structure definitions for state tracking.

Core data classes for representing pre-check results, upgrade summaries,
device status, and operational state tracking.
"""

import time
from typing import List, Optional, Tuple, Dict, Any
from dataclasses import dataclass, field

from .enums import PreCheckSeverity, VersionAction, UpgradePhase


@dataclass
class PreCheckResult:
    """
    Represents the result of a single pre-upgrade validation check.

    Attributes:
        check_name: Human-readable name of the check
        severity: Severity level (PASS, WARNING, CRITICAL, INFO)
        passed: Boolean indicating if check passed
        message: Detailed message about check result
        details: Optional dictionary with additional check details
        recommendation: Optional remediation guidance
    """

    check_name: str
    severity: PreCheckSeverity
    passed: bool
    message: str
    details: Optional[Dict[str, Any]] = None
    recommendation: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to JSON-serializable dictionary"""
        return {
            "check_name": self.check_name,
            "severity": self.severity.value,
            "passed": self.passed,
            "message": self.message,
            "details": self._safe_serialize(self.details),
            "recommendation": self.recommendation,
        }

    @staticmethod
    def _safe_serialize(obj: Any) -> Any:
        """Helper for safe serialization"""
        if obj is None:
            return None
        elif isinstance(obj, dict):
            return {k: PreCheckResult._safe_serialize(v) for k, v in obj.items()}
        elif isinstance(obj, (list, tuple)):
            return [PreCheckResult._safe_serialize(item) for item in obj]
        elif isinstance(obj, (str, int, float, bool)):
            return obj
        else:
            return str(obj)


@dataclass
class PreCheckSummary:
    """
    Aggregated summary of all pre-upgrade validation checks.

    Provides statistical analysis and overall upgrade readiness determination.
    """

    results: List[PreCheckResult] = field(default_factory=list)
    timestamp: str = field(
        default_factory=lambda: time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
    )

    @property
    def total_checks(self) -> int:
        """Total number of checks performed"""
        return len(self.results)

    @property
    def passed(self) -> int:
        """Number of checks that passed"""
        return sum(1 for r in self.results if r.passed)

    @property
    def warnings(self) -> int:
        """Number of warning-level checks"""
        return sum(1 for r in self.results if r.severity == PreCheckSeverity.WARNING)

    @property
    def critical_failures(self) -> int:
        """Number of critical failures"""
        return sum(
            1
            for r in self.results
            if not r.passed and r.severity == PreCheckSeverity.CRITICAL
        )

    @property
    def can_proceed(self) -> bool:
        """Determine if upgrade can proceed based on critical failures"""
        return self.critical_failures == 0

    def get_failed_checks(self) -> List[PreCheckResult]:
        """Return list of failed checks"""
        return [r for r in self.results if not r.passed]

    def get_recommendations(self) -> List[str]:
        """Return all remediation recommendations"""
        return [r.recommendation for r in self.results if r.recommendation]

    def to_dict(self) -> Dict[str, Any]:
        """Convert to JSON-serializable dictionary"""
        return {
            "total_checks": self.total_checks,
            "passed": self.passed,
            "warnings": self.warnings,
            "critical_failures": self.critical_failures,
            "can_proceed": self.can_proceed,
            "results": [r.to_dict() for r in self.results],
            "timestamp": self.timestamp,
        }


@dataclass
class UpgradeResult:
    """
    Comprehensive result tracking for upgrade operation.

    Captures timing, version changes, errors, warnings, and detailed step execution.
    """

    success: bool
    start_time: float
    end_time: float
    initial_version: str
    final_version: Optional[str] = None
    version_action: VersionAction = VersionAction.UNKNOWN
    upgrade_duration: float = 0.0
    reboot_required: bool = False
    reboot_performed: bool = False
    reboot_wait_time: float = 0.0
    rollback_performed: bool = False
    rollback_reason: Optional[str] = None
    warnings: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    upgrade_steps: List[Dict[str, Any]] = field(default_factory=list)

    def add_step(
        self, step_name: str, status: str, message: str, duration: float = 0.0
    ):
        """Add a step to upgrade execution tracking"""
        self.upgrade_steps.append(
            {
                "step": step_name,
                "status": status,
                "message": message,
                "duration": duration,
                "timestamp": time.time(),
            }
        )

    def calculate_duration(self) -> float:
        """Calculate total upgrade duration"""
        if self.start_time and self.end_time:
            self.upgrade_duration = self.end_time - self.start_time
        return self.upgrade_duration

    def to_dict(self) -> Dict[str, Any]:
        """Convert to JSON-serializable dictionary"""
        return {
            "success": self.success,
            "initial_version": self.initial_version,
            "final_version": self.final_version,
            "version_action": self.version_action.value,
            "upgrade_duration": self.calculate_duration(),
            "reboot_required": self.reboot_required,
            "reboot_performed": self.reboot_performed,
            "reboot_wait_time": self.reboot_wait_time,
            "rollback_performed": self.rollback_performed,
            "rollback_reason": self.rollback_reason,
            "warnings": self.warnings,
            "errors": self.errors,
            "upgrade_steps": self.upgrade_steps,
        }


@dataclass
class DeviceStatus:
    """
    Central state tracking for device upgrade process.

    Maintains current phase, version info, errors, warnings, and aggregated results.
    """

    hostname: str
    target_version: str
    phase: UpgradePhase = UpgradePhase.PENDING
    message: str = "Initializing upgrade process"
    current_version: Optional[str] = None
    final_version: Optional[str] = None
    version_action: VersionAction = VersionAction.UNKNOWN
    error: Optional[str] = None
    error_type: Optional[str] = None
    success: bool = False
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    warnings: List[str] = field(default_factory=list)
    pre_check_summary: Optional[PreCheckSummary] = None
    upgrade_result: Optional[UpgradeResult] = None
    backup_created: bool = False
    backup_path: Optional[str] = None

    def update_phase(self, phase: UpgradePhase, message: str = ""):
        """Update current upgrade phase with optional message"""
        self.phase = phase
        self.message = message or phase.value.replace("_", " ").title()

    def add_warning(self, warning: str):
        """Add a warning message to tracking"""
        self.warnings.append(warning)

    def get_duration(self) -> float:
        """Calculate elapsed time since upgrade start"""
        if self.start_time and self.end_time:
            return self.end_time - self.start_time
        elif self.start_time:
            return time.time() - self.start_time
        return 0.0

    def set_upgrade_result(self, upgrade_result: UpgradeResult):
        """Assign upgrade result and propagate key fields"""
        self.upgrade_result = upgrade_result
        self.final_version = upgrade_result.final_version
        self.success = upgrade_result.success
        if upgrade_result.errors:
            self.error = "; ".join(upgrade_result.errors)
        self.warnings.extend(upgrade_result.warnings)
