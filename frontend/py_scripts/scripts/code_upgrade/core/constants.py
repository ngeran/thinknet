"""
Application-wide constants and configuration parameters.

Centralized configuration for timeouts, retries, and operational parameters
to ensure consistency across the upgrade automation system.
"""

import os
from typing import Final

# ==============================================================================
# NETWORK AND CONNECTION CONSTANTS
# ==============================================================================

# Connection timeouts
DEFAULT_CONNECT_TIMEOUT: Final[int] = 30  # seconds
DEFAULT_OPERATION_TIMEOUT: Final[int] = 300  # seconds (5 minutes)
SSH_CONNECTION_TIMEOUT: Final[int] = 30  # seconds

# Reboot and recovery timeouts - INCREASED FOR SRX DEVICES
MAX_REBOOT_WAIT_TIME: Final[int] = 900  # 15 minutes (increased from 10)
RECOVERY_STABILIZATION_TIME: Final[int] = 30  # seconds after NETCONF is available
POLLING_INTERVAL: Final[int] = 30  # seconds between reachability checks
ADAPTIVE_POLLING_THRESHOLD: Final[int] = 300  # 5 minutes - switch to faster polling

# ==============================================================================
# UPGRADE PROCESS CONSTANTS
# ==============================================================================

# Progress tracking
STEPS_PER_DEVICE: Final[int] = 12
PROGRESS_UPDATE_INTERVAL: Final[int] = 5  # seconds

# Validation thresholds
STORAGE_WARNING_THRESHOLD: Final[int] = 85  # percentage
STORAGE_CRITICAL_THRESHOLD: Final[int] = 95  # percentage
MINIMUM_STORAGE_MB: Final[int] = 500  # MB

# Hardware health thresholds
MINIMUM_POWER_SUPPLIES: Final[int] = 1
MINIMUM_FANS: Final[int] = 1
MAX_TEMPERATURE_WARNING: Final[int] = 70  # degrees Celsius
MAX_TEMPERATURE_CRITICAL: Final[int] = 85  # degrees Celsius

# ==============================================================================
# FILE AND PATH CONSTANTS
# ==============================================================================

# Default image locations
DEFAULT_IMAGE_PATH: Final[str] = "/var/tmp/"
BACKUP_IMAGE_PATH: Final[str] = "/var/tmp/backup/"

# Logging configuration
LOG_FORMAT: Final[str] = (
    "%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s"
)
LOG_DATE_FORMAT: Final[str] = "%Y-%m-%d %H:%M:%S"

# ==============================================================================
# RETRY AND RESILIENCE CONSTANTS
# ==============================================================================

MAX_RETRY_ATTEMPTS: Final[int] = 3
RETRY_BACKOFF_FACTOR: Final[float] = 2.0  # Exponential backoff
INITIAL_RETRY_DELAY: Final[int] = 5  # seconds

# ==============================================================================
# EVENT AND NOTIFICATION CONSTANTS
# ==============================================================================

EVENT_RETRY_COUNT: Final[int] = 3
EVENT_RETRY_DELAY: Final[int] = 2  # seconds
EVENT_TIMEOUT: Final[int] = 10  # seconds

# Webhook endpoints (if configured)
DEFAULT_WEBHOOK_URL: Final[str] = os.getenv("UPGRADE_WEBHOOK_URL", "")
STATUS_UPDATE_INTERVAL: Final[int] = 60  # seconds for status reports

# ==============================================================================
# VERSION AND COMPATIBILITY CONSTANTS
# ==============================================================================

SUPPORTED_PLATFORMS: Final[list] = ["srx", "mx", "ex", "qfx", "ptx"]
SUPPORTED_VENDORS: Final[list] = ["juniper"]

# Major version upgrade paths
MAJOR_UPGRADE_PATHS: Final[dict] = {
    "24.4": ["25.1", "25.2", "25.3"],
    "25.1": ["25.2", "25.3"],
    "25.2": ["25.3"],
}
