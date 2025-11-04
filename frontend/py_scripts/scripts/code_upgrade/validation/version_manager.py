"""
Version comparison and compatibility validation.

Handles version string parsing, comparison, and upgrade/downgrade path validation
with comprehensive risk assessment for both upgrade and downgrade scenarios.
"""

import re
import logging
from typing import Tuple, Optional
from enum import Enum

from core.enums import VersionAction

logger = logging.getLogger(__name__)


class VersionChangeRisk(Enum):
    """Risk levels for version changes."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


def parse_version(version_str: str) -> Tuple[int, int, str, str, str]:
    """
    Parse Junos version string into comparable components.

    Supports formats like:
    - 24.4R2-S1.7
    - 25.2R1-S1.4
    - 21.4R3
    - 20.2R3-S2

    Args:
        version_str: Junos version string

    Returns:
        Tuple of (major, minor, release_type, build, service_release)
    """
    # Basic cleanup
    version_str = version_str.strip()

    # Match patterns like: 24.4R2-S1.7, 25.2R1-S1.4, etc.
    pattern = r"(\d+)\.(\d+)([R])(\d+)(?:-S(\d+)\.(\d+))?"
    match = re.match(pattern, version_str)

    if not match:
        logger.warning(f"Could not parse version string: {version_str}")
        return (0, 0, "R", "0", "0")  # Default fallback

    major = int(match.group(1))
    minor = int(match.group(2))
    release_type = match.group(3)  # R
    build = match.group(4)  # R1, R2, etc.

    # Handle service release (S1.4, S1.7, etc.)
    service_release = "0"
    service_build = "0"
    if match.group(5) and match.group(6):
        service_release = match.group(5)
        service_build = match.group(6)

    return (major, minor, release_type, build, f"{service_release}.{service_build}")


def compare_versions(current_version: str, target_version: str) -> VersionAction:
    """
    Compare current and target versions to determine upgrade action.

    Now supports both upgrades and downgrades with proper detection.

    Args:
        current_version: Current device version
        target_version: Target version for upgrade/downgrade

    Returns:
        VersionAction indicating the type of version change
    """
    try:
        if current_version == target_version:
            return VersionAction.SAME_VERSION

        current = parse_version(current_version)
        target = parse_version(target_version)

        # Compare major versions
        if current[0] > target[0]:
            return VersionAction.MAJOR_DOWNGRADE
        elif current[0] < target[0]:
            return VersionAction.MAJOR_UPGRADE

        # Same major version, compare minor versions
        if current[1] > target[1]:
            return VersionAction.MINOR_DOWNGRADE
        elif current[1] < target[1]:
            return VersionAction.MINOR_UPGRADE

        # Same major.minor, compare build numbers
        if current[3] > target[3]:
            return VersionAction.BUILD_DOWNGRADE
        elif current[3] < target[3]:
            return VersionAction.BUILD_UPGRADE

        # Same build, compare service releases
        if current[4] > target[4]:
            return VersionAction.SERVICE_DOWNGRADE
        elif current[4] < target[4]:
            return VersionAction.SERVICE_UPGRADE

        # If we get here, versions are the same
        return VersionAction.SAME_VERSION

    except Exception as e:
        logger.error(f"Version comparison failed: {e}")
        return VersionAction.UNKNOWN


def get_version_change_risk(version_action: VersionAction) -> VersionChangeRisk:
    """
    Determine risk level for different version change types.

    Includes risk assessment for both upgrades and downgrades.

    Args:
        version_action: Type of version change

    Returns:
        VersionChangeRisk indicating the risk level
    """
    risk_mapping = {
        VersionAction.SAME_VERSION: VersionChangeRisk.LOW,
        VersionAction.SERVICE_UPGRADE: VersionChangeRisk.LOW,
        VersionAction.SERVICE_DOWNGRADE: VersionChangeRisk.LOW,
        VersionAction.BUILD_UPGRADE: VersionChangeRisk.LOW,
        VersionAction.BUILD_DOWNGRADE: VersionChangeRisk.MEDIUM,
        VersionAction.MINOR_UPGRADE: VersionChangeRisk.MEDIUM,
        VersionAction.MINOR_DOWNGRADE: VersionChangeRisk.HIGH,
        VersionAction.MAJOR_UPGRADE: VersionChangeRisk.HIGH,
        VersionAction.MAJOR_DOWNGRADE: VersionChangeRisk.CRITICAL,
        VersionAction.UNKNOWN: VersionChangeRisk.HIGH,
    }

    return risk_mapping.get(version_action, VersionChangeRisk.HIGH)


def is_downgrade_supported(
    current_version: str, target_version: str
) -> Tuple[bool, str]:
    """
    Check if downgrade is supported and safe.

    Validates downgrade paths and provides reasoning.

    Args:
        current_version: Current device version
        target_version: Target downgrade version

    Returns:
        Tuple of (is_supported: bool, reason: str)
    """
    version_action = compare_versions(current_version, target_version)

    # All downgrades are potentially risky but technically possible
    if version_action in [
        VersionAction.MAJOR_DOWNGRADE,
        VersionAction.MINOR_DOWNGRADE,
        VersionAction.BUILD_DOWNGRADE,
        VersionAction.SERVICE_DOWNGRADE,
    ]:
        risk = get_version_change_risk(version_action)

        if risk == VersionChangeRisk.CRITICAL:
            return (
                False,
                f"Major version downgrades are high risk and require manual intervention",
            )
        elif risk == VersionChangeRisk.HIGH:
            return (
                True,
                f"Minor version downgrade - high risk but supported with force flag",
            )
        else:
            return True, f"Downgrade supported but verify configuration compatibility"

    return True, "Version change is not a downgrade"


def validate_downgrade_compatibility(
    current_version: str, target_version: str
) -> Tuple[bool, str]:
    """
    Validate configuration and feature compatibility for downgrades.

    Args:
        current_version: Current device version
        target_version: Target downgrade version

    Returns:
        Tuple of (is_compatible: bool, warning: str)
    """
    # Add specific downgrade compatibility checks here
    # For now, return True with a warning
    return (
        True,
        "⚠️  Downgrade: Verify configuration compatibility and backup config before proceeding",
    )
