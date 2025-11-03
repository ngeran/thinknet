"""
Validation module for pre/post-upgrade checks and version management.

Provides comprehensive validation engines for device health, configuration,
and version compatibility before and after upgrades.
"""

from .pre_check_engine import EnhancedPreCheckEngine
from .post_upgrade_validator import PostUpgradeValidator
from .version_manager import (
    parse_junos_version,
    compare_versions,
    get_version_change_risk,
)

__all__ = [
    "EnhancedPreCheckEngine",
    "PostUpgradeValidator",
    "parse_junos_version",
    "compare_versions",
    "get_version_change_risk",
]
