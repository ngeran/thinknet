"""
Upgrade orchestration and management module.

Provides main upgrade workflow management, rollback functionality,
and software installation operations.
"""

from .device_upgrader import DeviceUpgrader
from .rollback_manager import RollbackManager
from .software_installer import SoftwareInstaller

__all__ = ["DeviceUpgrader", "RollbackManager", "SoftwareInstaller"]
