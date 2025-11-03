"""
Version management and comparison utilities.

Provides Junos version string parsing and intelligent version comparison
logic for determining upgrade/downgrade actions and risk assessment.
"""

import re
import logging
from typing import Tuple

from core.enums import VersionAction

logger = logging.getLogger(__name__)


def parse_junos_version(version_string: str) -> Tuple[int, ...]:
    """
    Parse Junos version string into comparable tuple.

    Handles various Junos version formats including:
    - 21.4R3.15
    - 20.4R3-S1.4
    - 19.4R1
    - 21.1X46-D10.2

    Args:
        version_string: Junos version string

    Returns:
        Tuple of (major, minor, release_flag, build, service, patch)
    """
    try:
        # Remove common suffixes and extract base version
        base_version = version_string.split("-")[0]

        # Handle service pack notation (e.g., 20.4R3-S1)
        service_pack = 0
        patch_level = 0
        if "-S" in version_string:
            parts = version_string.split("-S")
            base_version = parts[0]
            if len(parts) > 1:
                sp_parts = parts[1].split(".")
                service_pack = int(sp_parts[0]) if sp_parts[0].isdigit() else 0
                patch_level = (
                    int(sp_parts[1])
                    if len(sp_parts) > 1 and sp_parts[1].isdigit()
                    else 0
                )

        # Handle X-series special versions (e.g., 21.1X46-D10)
        if "X" in base_version:
            match = re.match(r"(\d+)\.(\d+)X(\d+)", base_version)
            if match:
                major = int(match.group(1))
                minor = int(match.group(2))
                x_version = int(match.group(3))
                return (major, minor, 1, 0, x_version, 0)

        # Standard version format
        match = re.match(r"(\d+)\.(\d+)([Rr]?)(\d*)", base_version)
        if not match:
            raise ValueError(f"Unsupported version format: {version_string}")

        major = int(match.group(1))
        minor = int(match.group(2))
        release_code = 1 if match.group(3).upper() == "R" else 0
        build = int(match.group(4)) if match.group(4) else 0

        return (major, minor, release_code, build, service_pack, patch_level)

    except Exception as e:
        logger.error(f"Version parsing error for '{version_string}': {e}")
        return (0, 0, 0, 0, 0, 0)


def compare_versions(current: str, target: str) -> VersionAction:
    """
    Compare current and target versions to determine upgrade action.

    Args:
        current: Current device version string
        target: Target version string for upgrade

    Returns:
        VersionAction enum indicating type of version change
    """
    try:
        current_parts = parse_junos_version(current)
        target_parts = parse_junos_version(target)

        if current_parts == target_parts:
            return VersionAction.SAME_VERSION

        # Compare major version
        if target_parts[0] > current_parts[0]:
            return VersionAction.MAJOR_UPGRADE
        elif target_parts[0] < current_parts[0]:
            return VersionAction.MAJOR_DOWNGRADE

        # Compare minor version
        if target_parts[1] > current_parts[1]:
            return VersionAction.MINOR_UPGRADE
        elif target_parts[1] < current_parts[1]:
            return VersionAction.MINOR_DOWNGRADE

        # Same major.minor, compare remaining components
        if target_parts > current_parts:
            return VersionAction.MINOR_UPGRADE
        elif target_parts < current_parts:
            return VersionAction.MINOR_DOWNGRADE

        return VersionAction.UNKNOWN

    except Exception as e:
        logger.warning(f"Version comparison failed: {e}, defaulting to UNKNOWN")
        return VersionAction.UNKNOWN


def get_version_change_risk(version_action: VersionAction) -> str:
    """
    Assess risk level of version change operation.

    Args:
        version_action: Type of version change

    Returns:
        Risk level string (LOW, MEDIUM, HIGH, NONE, UNKNOWN)
    """
    risk_mapping = {
        VersionAction.SAME_VERSION: "NONE",
        VersionAction.MINOR_UPGRADE: "LOW",
        VersionAction.MINOR_DOWNGRADE: "MEDIUM",
        VersionAction.MAJOR_UPGRADE: "MEDIUM",
        VersionAction.MAJOR_DOWNGRADE: "HIGH",
        VersionAction.UNKNOWN: "UNKNOWN",
    }
    return risk_mapping.get(version_action, "UNKNOWN")
