"""
Configuration constants and operational parameters.

Centralized configuration values for timeouts, thresholds, and
operational parameters used throughout the upgrade process.
"""

# Connection & Operation Timeouts
DEFAULT_CONNECTION_TIMEOUT = 30
DEFAULT_OPERATION_TIMEOUT = 1800
DEFAULT_REBOOT_TIMEOUT = 900
DEFAULT_RETRY_ATTEMPTS = 3

# Storage & Resource Thresholds
MINIMUM_STORAGE_FREE_PERCENT = 20
MINIMUM_STORAGE_FREE_MB = 512
STORAGE_SAFETY_MULTIPLIER = 2.2  # Need 2.2x image size for safe install

# Progress Tracking
STEPS_PER_DEVICE = 12  # Number of steps in upgrade process

# Reboot & Recovery Parameters
INITIAL_REBOOT_WAIT = 60
POLLING_INTERVAL = 30
MAX_REBOOT_WAIT_TIME = 1200
ADAPTIVE_POLLING_THRESHOLD = 300  # Switch to faster polling after 5 minutes

# Event Delivery Optimization
EVENT_DELIVERY_DELAY = 1.0
EVENT_FLUSH_DELAY = 0.5
EVENT_RETRY_COUNT = 2

# Hardware Health Thresholds
MAX_TEMPERATURE_CELSIUS = 70
MIN_POWER_SUPPLY_COUNT = 1
MIN_FAN_COUNT = 1

# Routing Protocol Thresholds
MIN_BGP_PEER_UPTIME = 300  # 5 minutes
MIN_OSPF_NEIGHBOR_COUNT = 0  # Warning if no neighbors

# Active Session Thresholds
MAX_ACTIVE_SESSIONS_WARNING = 3  # Warn if more than 3 concurrent users

# Version Patterns
JUNOS_VERSION_PATTERN = r"(\d+)\.(\d+)([RrXx]?)(\d*)(?:-S(\d+))?(?:\.(\d+))?"
