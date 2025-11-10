# File: app_gateway/api/routers/pre_checks.py
"""
=============================================================================
PRE-CHECK CONFIGURATION API ROUTER
=============================================================================

Provides available pre-check options to frontend for user selection.
Reads configuration from shared/data/pre-checks/pre-checks.yaml

AUTHOR: nikos-geranios_vgi
DATE: 2025-11-10
LAST UPDATED: 2025-11-10 15:23:08 UTC
VERSION: 1.0.0
=============================================================================
"""

import logging
from pathlib import Path
from typing import Dict, Any, List, Optional

import yaml
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# =============================================================================
# SECTION 1: CONFIGURATION
# =============================================================================

# Path relative to project root where FastAPI server is run
PRE_CHECKS_FILE = Path("shared/data/pre-checks/pre-checks.yaml")

router = APIRouter()

# =============================================================================
# SECTION 2: PYDANTIC MODELS (SCHEMAS)
# =============================================================================


class PreCheckOption(BaseModel):
    """Schema for individual pre-check option."""

    id: str = Field(..., description="Unique check identifier")
    name: str = Field(..., description="Human-readable check name")
    description: str = Field(..., description="Detailed description")
    category: str = Field(..., description="Check category")
    severity: str = Field(..., description="Check severity level")
    required: bool = Field(..., description="Whether check is mandatory")
    enabled_by_default: bool = Field(..., description="Default enabled state")
    estimated_duration_seconds: int = Field(..., description="Estimated runtime")
    tooltip: str = Field(..., description="Help text for UI")
    available: bool = Field(default=True, description="Whether check is implemented")


class CategoryInfo(BaseModel):
    """Schema for check category metadata."""

    display_name: str = Field(..., description="Category display name")
    icon: str = Field(..., description="Icon identifier")
    order: int = Field(..., description="Display order")


class PreCheckConfigResponse(BaseModel):
    """Schema for the complete pre-check configuration response."""

    version: str = Field(..., description="Configuration version")
    last_updated: str = Field(..., description="Last update timestamp")
    checks: List[PreCheckOption] = Field(..., description="Available checks")
    categories: Dict[str, CategoryInfo] = Field(..., description="Category metadata")
    metadata: Dict[str, Any] = Field(..., description="Additional metadata")
    count: int = Field(..., description="Total number of checks")
    message: str = Field(..., description="Response message")


class PreCheckReloadResponse(BaseModel):
    """Schema for configuration reload response."""

    success: bool = Field(..., description="Whether reload was successful")
    message: str = Field(..., description="Status message")
    version: str = Field(..., description="Configuration version")
    total_checks: int = Field(..., description="Number of checks loaded")
    last_updated: str = Field(..., description="Configuration timestamp")


# =============================================================================
# SECTION 3: DEPENDENCY (UTILITY FOR CHECKING FILE)
# =============================================================================


def get_precheck_config_file():
    """
    Checks pre-check configuration file existence and raises 404 if not found.

    Returns:
        Path: Absolute path to configuration file

    Raises:
        HTTPException: If file not found
    """
    absolute_path = PRE_CHECKS_FILE.resolve()

    if not PRE_CHECKS_FILE.is_file():
        logger.error(f"Pre-check config file not found: {absolute_path}")
        raise HTTPException(
            status_code=404,
            detail=f"Pre-check configuration file not found: {absolute_path}",
        )

    return absolute_path


# =============================================================================
# SECTION 4: CONFIGURATION LOADER UTILITY
# =============================================================================


class PreCheckConfigLoader:
    """
    Utility class for loading and parsing pre-check configuration.

    Handles YAML parsing, validation, and caching of configuration data.
    """

    _cached_config: Optional[Dict[str, Any]] = None

    @classmethod
    def load_config(cls, config_path: Path, force_reload: bool = False) -> Dict[str, Any]:
        """
        Load and parse pre-check configuration from YAML file.

        Args:
            config_path: Path to pre-checks.yaml file
            force_reload: Force reload from disk (ignore cache)

        Returns:
            Dictionary containing parsed configuration

        Raises:
            HTTPException: If file cannot be loaded or parsed
        """
        # Return cached config if available and not forcing reload
        if cls._cached_config is not None and not force_reload:
            logger.debug("Returning cached pre-check configuration")
            return cls._cached_config

        try:
            logger.info(f"Loading pre-check configuration from: {config_path}")

            with open(config_path, "r") as f:
                config = yaml.safe_load(f)

            # Validate basic structure
            if not config or "checks" not in config:
                raise ValueError("Invalid configuration structure: missing 'checks' key")

            if not isinstance(config["checks"], list):
                raise ValueError("Invalid configuration: 'checks' must be a list")

            # Add 'available' flag to checks if not present
            for check in config.get("checks", []):
                if "available" not in check:
                    check["available"] = True

            # Add default categories if missing
            if "categories" not in config:
                config["categories"] = {}

            # Add default metadata if missing
            if "metadata" not in config:
                config["metadata"] = {}

            # Cache the configuration
            cls._cached_config = config

            logger.info(
                f"✅ Pre-check configuration loaded successfully: "
                f"{len(config.get('checks', []))} checks available"
            )

            return config

        except yaml.YAMLError as e:
            logger.error(f"Failed to parse YAML configuration: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Configuration file parsing error: {str(e)}",
            )
        except FileNotFoundError as e:
            logger.error(f"Configuration file not found: {e}")
            raise HTTPException(
                status_code=404,
                detail=f"Configuration file not found: {str(e)}",
            )
        except Exception as e:
            logger.error(f"Failed to load pre-check configuration: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to load configuration: {str(e)}",
            )

    @classmethod
    def clear_cache(cls):
        """Clear cached configuration to force reload on next access."""
        cls._cached_config = None
        logger.debug("Pre-check configuration cache cleared")

    @classmethod
    def get_check_by_id(cls, config: Dict[str, Any], check_id: str) -> Optional[Dict[str, Any]]:
        """
        Get specific check configuration by ID.

        Args:
            config: Loaded configuration dictionary
            check_id: Check identifier

        Returns:
            Check configuration dict or None if not found
        """
        for check in config.get("checks", []):
            if check.get("id") == check_id:
                return check
        return None


# =============================================================================
# SECTION 5: API ENDPOINTS
# =============================================================================


@router.get(
    "/pre-checks/config",
    response_model=PreCheckConfigResponse,
    tags=["Pre-Checks"],
    summary="Get Pre-Check Configuration",
    description="Retrieve available pre-check options and metadata for UI display",
)
def get_precheck_config(
    config_path: Path = Depends(get_precheck_config_file),
) -> PreCheckConfigResponse:
    """
    Get complete pre-check configuration.

    Returns configuration including available checks, categories,
    and metadata for frontend display and selection.

    Args:
        config_path: Path to configuration file (injected by dependency)

    Returns:
        PreCheckConfigResponse with all configuration data

    Raises:
        HTTPException: If configuration cannot be loaded
    """
    try:
        # Load configuration
        config = PreCheckConfigLoader.load_config(config_path)

        # Parse checks into Pydantic models
        checks = []
        for check_data in config.get("checks", []):
            try:
                checks.append(PreCheckOption(**check_data))
            except Exception as e:
                logger.warning(f"Skipping invalid check: {e}")
                continue

        # Parse categories into Pydantic models
        categories = {}
        for key, value in config.get("categories", {}).items():
            try:
                categories[key] = CategoryInfo(**value)
            except Exception as e:
                logger.warning(f"Skipping invalid category {key}: {e}")
                continue

        # Build response
        return PreCheckConfigResponse(
            version=config.get("version", "1.0"),
            last_updated=config.get("last_updated", "unknown"),
            checks=checks,
            categories=categories,
            metadata=config.get("metadata", {}),
            count=len(checks),
            message="Successfully retrieved pre-check configuration",
        )

    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        logger.error(f"Failed to get pre-check config: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve configuration: {str(e)}",
        )


@router.get(
    "/pre-checks/check/{check_id}",
    response_model=PreCheckOption,
    tags=["Pre-Checks"],
    summary="Get Specific Check Info",
    description="Retrieve details for a specific pre-check by ID",
)
def get_check_info(
    check_id: str,
    config_path: Path = Depends(get_precheck_config_file),
) -> PreCheckOption:
    """
    Get information about a specific pre-check.

    Args:
        check_id: Check identifier
        config_path: Path to configuration file (injected by dependency)

    Returns:
        PreCheckOption with check details

    Raises:
        HTTPException: If check not found or config cannot be loaded
    """
    try:
        # Load configuration
        config = PreCheckConfigLoader.load_config(config_path)

        # Find check by ID
        check = PreCheckConfigLoader.get_check_by_id(config, check_id)

        if check is None:
            raise HTTPException(
                status_code=404,
                detail=f"Pre-check not found: {check_id}",
            )

        return PreCheckOption(**check)

    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        logger.error(f"Failed to get check info for {check_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve check information: {str(e)}",
        )


@router.post(
    "/pre-checks/reload",
    response_model=PreCheckReloadResponse,
    tags=["Pre-Checks"],
    summary="Reload Configuration",
    description="Force reload of pre-check configuration from disk",
)
def reload_config(
    config_path: Path = Depends(get_precheck_config_file),
) -> PreCheckReloadResponse:
    """
    Force reload of pre-check configuration.

    Useful for development or when configuration file is updated
    without restarting the server.

    Args:
        config_path: Path to configuration file (injected by dependency)

    Returns:
        PreCheckReloadResponse with reload status

    Raises:
        HTTPException: If reload fails
    """
    try:
        # Clear cache and force reload
        PreCheckConfigLoader.clear_cache()
        config = PreCheckConfigLoader.load_config(config_path, force_reload=True)

        logger.info("✅ Pre-check configuration reloaded successfully")

        return PreCheckReloadResponse(
            success=True,
            message="Configuration reloaded successfully",
            version=config.get("version", "unknown"),
            total_checks=len(config.get("checks", [])),
            last_updated=config.get("last_updated", "unknown"),
        )

    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        logger.error(f"Failed to reload config: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to reload configuration: {str(e)}",
        )


# =============================================================================
# SECTION 6: HEALTH CHECK (OPTIONAL)
# =============================================================================


@router.get(
    "/pre-checks/health",
    tags=["Pre-Checks"],
    summary="Health Check",
    description="Verify pre-check configuration is accessible and valid",
)
def health_check(
    config_path: Path = Depends(get_precheck_config_file),
) -> Dict[str, Any]:
    """
    Health check endpoint to verify configuration accessibility.

    Args:
        config_path: Path to configuration file (injected by dependency)

    Returns:
        Health status information

    Raises:
        HTTPException: If health check fails
    """
    try:
        config = PreCheckConfigLoader.load_config(config_path)

        return {
            "status": "healthy",
            "config_file": str(config_path),
            "version": config.get("version", "unknown"),
            "total_checks": len(config.get("checks", [])),
            "last_updated": config.get("last_updated", "unknown"),
        }

    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(
            status_code=503,
            detail=f"Pre-check configuration is not healthy: {str(e)}",
        )
