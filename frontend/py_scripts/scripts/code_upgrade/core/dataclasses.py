"""
Data classes for upgrade automation system.

Defines structured data containers for upgrade state, results, and events
with type hints and validation for robust data handling.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
from datetime import datetime

from .enums import (
    CheckSeverity,
    VersionAction,
    UpgradePhase,
)  # Fixed: Changed PreCheckSeverity to CheckSeverity


@dataclass
class UpgradeStep:
    """Represents an individual step in the upgrade process."""

    step: str
    status: str
    message: str
    duration: float = 0.0
    timestamp: float = 0.0


@dataclass
class PreCheckResult:
    """Results from a single pre-upgrade validation check."""

    check_name: str
    severity: CheckSeverity  # Fixed: Changed from PreCheckSeverity to CheckSeverity
    passed: bool
    message: str
    details: Dict[str, Any] = field(default_factory=dict)
    recommendation: Optional[str] = None


@dataclass
class PreCheckSummary:
    """Summary of all pre-upgrade validation checks."""

    total_checks: int = 0
    passed: int = 0
    warnings: int = 0
    critical_failures: int = 0
    can_proceed: bool = False
    results: List[PreCheckResult] = field(default_factory=list)
    timestamp: str = ""


@dataclass
class UpgradeResult:
    """Comprehensive results of an upgrade operation."""

    success: bool = False
    start_time: float = 0.0
    end_time: float = 0.0
    upgrade_duration: float = 0.0
    initial_version: Optional[str] = None
    final_version: Optional[str] = None
    version_action: Optional[VersionAction] = None
    reboot_required: bool = False
    reboot_performed: bool = False
    reboot_wait_time: float = 0.0
    rollback_performed: bool = False
    rollback_reason: Optional[str] = None
    warnings: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    upgrade_steps: List[UpgradeStep] = field(default_factory=list)
    pre_check_summary: Optional[PreCheckSummary] = None

    def calculate_duration(self):
        """Calculate total upgrade duration."""
        if self.start_time and self.end_time:
            self.upgrade_duration = self.end_time - self.start_time

    def add_step(self, step: str, status: str, message: str):
        """Add a step to the upgrade process."""
        self.upgrade_steps.append(
            UpgradeStep(
                step=step,
                status=status,
                message=message,
                timestamp=datetime.now().timestamp(),
            )
        )


@dataclass
class DeviceStatus:
    """Current status and state of a device during upgrade."""

    hostname: str
    target_version: str
    current_version: Optional[str] = None
    version_action: Optional[VersionAction] = None
    phase: UpgradePhase = UpgradePhase.CONNECTING
    phase_message: str = ""
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    error: Optional[str] = None
    error_type: Optional[str] = None
    warnings: List[str] = field(default_factory=list)
    pre_check_summary: Optional[PreCheckSummary] = None
    upgrade_result: Optional[UpgradeResult] = None

    def update_phase(self, phase: UpgradePhase, message: str = ""):
        """Update the current upgrade phase."""
        self.phase = phase
        self.phase_message = message

    def add_warning(self, warning: str):
        """Add a warning message."""
        self.warnings.append(warning)

    def set_upgrade_result(self, upgrade_result: UpgradeResult):
        """Set the final upgrade result."""
        self.upgrade_result = upgrade_result
        self.end_time = upgrade_result.end_time


@dataclass
class EventData:
    """Data structure for upgrade events and progress updates."""

    event_type: str
    timestamp: float
    message: str
    data: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ConnectionParams:
    """Parameters for device connection and authentication."""

    hostname: str
    username: str
    password: str
    port: int = 22
    timeout: int = 30
    vendor: str = "juniper"


@dataclass
class UpgradeParams:
    """Parameters for upgrade operation."""

    target_version: str
    image_filename: str
    platform: str = "srx"
    skip_pre_check: bool = False
    force_upgrade: bool = False
    reboot: bool = True
    validate: bool = True
