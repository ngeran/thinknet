"""
Core module for Juniper device upgrade automation.

Contains base classes, exceptions, constants, and data structures
used throughout the upgrade process.
"""

from .exceptions import (
    UpgradeError,
    PreCheckFailure,
    InstallationFailure,
    RebootTimeoutError,
    ValidationError,
    RollbackError,
)

from .enums import UpgradePhase, PreCheckSeverity, VersionAction, RollbackStrategy

from .dataclasses import PreCheckResult, PreCheckSummary, UpgradeResult, DeviceStatus

from .constants import (
    DEFAULT_CONNECTION_TIMEOUT,
    DEFAULT_OPERATION_TIMEOUT,
    DEFAULT_REBOOT_TIMEOUT,
    MINIMUM_STORAGE_FREE_PERCENT,
    MINIMUM_STORAGE_FREE_MB,
    STORAGE_SAFETY_MULTIPLIER,
    STEPS_PER_DEVICE,
    MAX_TEMPERATURE_CELSIUS,
    MIN_POWER_SUPPLY_COUNT,
    MIN_FAN_COUNT,
    MAX_ACTIVE_SESSIONS_WARNING,
)

__all__ = [
    # Exceptions
    "UpgradeError",
    "PreCheckFailure",
    "InstallationFailure",
    "RebootTimeoutError",
    "ValidationError",
    "RollbackError",
    # Enums
    "UpgradePhase",
    "PreCheckSeverity",
    "VersionAction",
    "RollbackStrategy",
    # Data classes
    "PreCheckResult",
    "PreCheckSummary",
    "UpgradeResult",
    "DeviceStatus",
    # Constants
    "DEFAULT_CONNECTION_TIMEOUT",
    "DEFAULT_OPERATION_TIMEOUT",
    "DEFAULT_REBOOT_TIMEOUT",
    "MINIMUM_STORAGE_FREE_PERCENT",
    "MINIMUM_STORAGE_FREE_MB",
    "STORAGE_SAFETY_MULTIPLIER",
    "STEPS_PER_DEVICE",
    "MAX_TEMPERATURE_CELSIUS",
    "MIN_POWER_SUPPLY_COUNT",
    "MIN_FAN_COUNT",
    "MAX_ACTIVE_SESSIONS_WARNING",
]
