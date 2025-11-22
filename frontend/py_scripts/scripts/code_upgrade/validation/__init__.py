"""
Validation package for upgrade automation system.

Contains version comparison, pre-upgrade checks, and post-upgrade validation
components to ensure safe and reliable upgrade operations.
"""

from .pre_check_engine import EnhancedPreCheckEngine
from .post_upgrade_validator import PostUpgradeValidator
from .version_manager import (
    compare_versions,
    parse_version,  # Fixed: Changed parse_junos_version to parse_version
    get_version_change_risk,
    is_downgrade_supported,
    validate_downgrade_compatibility,
)

__all__ = [
    "EnhancedPreCheckEngine",
    "PostUpgradeValidator",
    "compare_versions",
    "parse_version",  # Fixed
    "get_version_change_risk",
    "is_downgrade_supported",
    "validate_downgrade_compatibility",
]
