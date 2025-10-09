# File Path: fastapi_automation/core/config.py
"""
Configuration Module
Defines application-wide settings and environment variables.
"""

import os

# --- Environment Configuration Guide ---
# RUST_WS_URL: This variable is crucial for the FastAPI-to-Rust communication.
# In a Docker environment, 'rust_ws_hub' is the service name defined in docker-compose.yml,
# and it is resolvable as a hostname on the Docker internal network.

RUST_WS_URL: str = os.getenv("RUST_WS_URL", "ws://localhost:3100/ws")
# Note: Using 'rust_ws_hub' ensures inter-container communication works correctly.
# The default 'ws://localhost:3100/ws' is a fallback for local testing outside Docker.

class Settings:
    """Base application settings class."""
    APP_TITLE: str = "FastAPI Automation Gateway"
    RUST_WS_URL: str = RUST_WS_URL

# Instantiate settings
settings = Settings()
