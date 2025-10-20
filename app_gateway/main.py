"""
FastAPI Application Entry Point
Initializes the application, applies middleware, and includes all necessary routers.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

# Import all routers
from app_gateway.api.routers import (
    automation,
    proxy,
    test_redis,
    inventory,
    sidebar_metadata,
    restore,
    operations,
    software_images,
    configuration_templates,  # NEW: Import configuration_templates router
)

from .core.config import settings

# --- FastAPI Setup ---
app = FastAPI(title=settings.APP_TITLE)

# Configure CORS (essential for local development)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Should be restricted in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Router Inclusion ---
app.include_router(automation.router, prefix="/api")
app.include_router(proxy.router, prefix="/api")
app.include_router(test_redis.router, prefix="/api")
app.include_router(inventory.router, prefix="/api")
app.include_router(sidebar_metadata.router, prefix="/api")
app.include_router(restore.router, prefix="/api")
app.include_router(operations.router, prefix="/api")
app.include_router(software_images.router, prefix="/api")
app.include_router(
    configuration_templates.router, prefix="/api"
)  # NEW: Include configuration_templates router


# --- Root Health Check ---
@app.get("/")
def root_health_check():
    return {"status": "ok", "message": "FastAPI Gateway is operational"}


@app.get("/health")
def health_check():
    """Comprehensive health check endpoint"""
    return {"status": "healthy", "service": "FastAPI Gateway", "version": "1.0.0"}
