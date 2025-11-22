"""
Custom exception classes for upgrade operations.

Provides hierarchical exception handling for granular error categorization
and specific failure scenarios during device upgrades.
"""


class UpgradeError(Exception):
    """Base exception for all upgrade-related errors"""

    def __init__(self, message: str, remediation: str = None):
        self.message = message
        self.remediation = remediation
        super().__init__(self.message)


class PreCheckFailure(UpgradeError):
    """Raised when pre-upgrade validation checks fail critically"""

    pass


class InstallationFailure(UpgradeError):
    """Raised when software installation process fails"""

    pass


class RebootTimeoutError(UpgradeError):
    """Raised when device fails to recover within timeout after reboot"""

    pass


class ValidationError(UpgradeError):
    """Raised when post-upgrade validation fails"""

    pass


class RollbackError(UpgradeError):
    """Raised when automatic rollback process fails"""

    pass


class ConnectionError(UpgradeError):
    """Raised when device connection fails"""

    pass


class ConfigurationError(UpgradeError):
    """Raised when configuration operations fail"""

    pass
