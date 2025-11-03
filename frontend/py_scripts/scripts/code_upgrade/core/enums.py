"""
Enumerated type definitions for categorical state representation.

Enumerated types for upgrade phases, check severity levels,
version actions, and other categorical state representations.
"""

from enum import Enum


class UpgradePhase(Enum):
    """Upgrade process phase tracking"""

    PENDING = "pending"
    PRE_CHECK = "pre_check"
    BACKUP = "backup"
    CONNECTING = "connecting"
    VALIDATING = "validating"
    INSTALLING = "installing"
    REBOOTING = "rebooting"
    VERIFYING = "verifying"
    COMPLETED = "completed"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"


class PreCheckSeverity(Enum):
    """Pre-check result severity levels"""

    PASS = "pass"
    WARNING = "warning"
    CRITICAL = "critical"
    INFO = "info"


class VersionAction(Enum):
    """Version change action classification"""

    MAJOR_UPGRADE = "major_upgrade"
    MINOR_UPGRADE = "minor_upgrade"
    MAJOR_DOWNGRADE = "major_downgrade"
    MINOR_DOWNGRADE = "minor_downgrade"
    SAME_VERSION = "same_version"
    UNKNOWN = "unknown"


class RollbackStrategy(Enum):
    """Rollback strategy options"""

    AUTOMATIC = "automatic"
    MANUAL = "manual"
    NONE = "none"
