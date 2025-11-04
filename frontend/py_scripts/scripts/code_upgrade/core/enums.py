"""
Application enumerations for type safety and clear intent definitions.

Centralized enum definitions for upgrade actions, phases, and status values
used throughout the upgrade automation system.
"""

from enum import Enum, auto


class UpgradePhase(Enum):
    """Phases of the upgrade process."""

    CONNECTING = "connecting"
    PRE_CHECK = "pre_check"
    INSTALLING = "installing"
    REBOOTING = "rebooting"
    VERIFYING = "verifying"
    COMPLETED = "completed"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"


class VersionAction(Enum):
    """Types of version changes."""

    SAME_VERSION = "same_version"
    SERVICE_UPGRADE = "service_upgrade"
    SERVICE_DOWNGRADE = "service_downgrade"
    BUILD_UPGRADE = "build_upgrade"
    BUILD_DOWNGRADE = "build_downgrade"
    MINOR_UPGRADE = "minor_upgrade"
    MINOR_DOWNGRADE = "minor_downgrade"
    MAJOR_UPGRADE = "major_upgrade"
    MAJOR_DOWNGRADE = "major_downgrade"
    UNKNOWN = "unknown"


class CheckSeverity(Enum):  # This is the correct name - was PreCheckSeverity
    """Severity levels for validation checks."""

    PASS = "pass"
    WARNING = "warning"
    CRITICAL = "critical"


class OperationStatus(Enum):
    """Status of operations and steps."""

    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"
    WARNING = "warning"


class ConnectionState(Enum):
    """Device connection states."""

    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    AUTHENTICATED = "authenticated"
    FAILED = "failed"


class PlatformType(Enum):
    """Supported device platforms."""

    SRX = "srx"
    MX = "mx"
    EX = "ex"
    QFX = "qfx"
    PTX = "ptx"


class VendorType(Enum):
    """Supported device vendors."""

    JUNIPER = "juniper"
