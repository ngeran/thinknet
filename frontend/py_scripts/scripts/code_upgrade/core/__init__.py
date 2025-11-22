"""
Core package for Juniper upgrade automation system.

Contains fundamental data structures, constants, enumerations, and exceptions
used throughout the upgrade automation framework.
"""

from .dataclasses import (
    DeviceStatus,
    UpgradeResult,
    PreCheckResult,
    UpgradeStep,
    EventData,
)
from .enums import (
    UpgradePhase,
    CheckSeverity,  # Fixed: Changed from PreCheckSeverity to CheckSeverity
    VersionAction,
    OperationStatus,
    PlatformType,
    VendorType,
)
from .exceptions import (
    UpgradeError,
    PreCheckFailure,
    InstallationFailure,
    RebootTimeoutError,
    ValidationError,
    RollbackError,
)
from .constants import (
    DEFAULT_CONNECT_TIMEOUT,
    DEFAULT_OPERATION_TIMEOUT,
    MAX_REBOOT_WAIT_TIME,
    POLLING_INTERVAL,
    STEPS_PER_DEVICE,
    STORAGE_WARNING_THRESHOLD,
    STORAGE_CRITICAL_THRESHOLD,
)

__all__ = [
    # Data classes
    "DeviceStatus",
    "UpgradeResult",
    "PreCheckResult",
    "UpgradeStep",
    "EventData",
    # Enums
    "UpgradePhase",
    "CheckSeverity",  # Fixed
    "VersionAction",
    "OperationStatus",
    "PlatformType",
    "VendorType",
    # Exceptions
    "UpgradeError",
    "PreCheckFailure",
    "InstallationFailure",
    "RebootTimeoutError",
    "ValidationError",
    "RollbackError",
    # Constants
    "DEFAULT_CONNECT_TIMEOUT",
    "DEFAULT_OPERATION_TIMEOUT",
    "MAX_REBOOT_WAIT_TIME",
    "POLLING_INTERVAL",
    "STEPS_PER_DEVICE",
    "STORAGE_WARNING_THRESHOLD",
    "STORAGE_CRITICAL_THRESHOLD",
]
