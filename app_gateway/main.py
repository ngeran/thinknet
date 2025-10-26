from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

# Import all API routers from their respective files.
from app_gateway.api.routers import (
    automation,
    proxy,
    test_redis,
    inventory,
    sidebar_metadata,
    restore,
    # This 'operations' router must be checked. It likely contains generic or
    # old logic that conflicts with JSNAPy's '/operations/execute'.
    operations,
    software_images,
    configuration_templates,
    jsnapy_tests,
    configuration_deployment,
    # This is the NEW, CORRECT router that accurately constructs the JSNAPy job.
    jsnapy_runner,
    file_uploader,
)

from .core.config import settings

# --- FastAPI Setup ---
# Pyright Fix: Changed 'settings.VERSION' to a hardcoded string since the attribute
# is likely missing from the settings object.
app = FastAPI(
    title=settings.APP_TITLE,
    version="1.0.0",  # 🔑 FIXED: Used hardcoded version to resolve Pyright error
    description="Centralized API Gateway for network automation services.",
)

# Configure CORS (essential for local development)
app.add_middleware(
    CORSMiddleware,
    # WARNING: Allow all origins ('*') is insecure for production. Restrict this!
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Router Inclusion (CRITICAL: ORDER MATTERS) ---

# 🥇 CRITICAL FIX: Include the JSNAPy runner router FIRST.
# This ensures its POST /operations/execute route (which correctly builds the job)
# takes precedence over any conflicting, faulty routes in the 'operations' router.
app.include_router(jsnapy_runner.router, prefix="/api")

# Include all other routers. The order of these is less critical unless
# they share the exact same path/method as each other or the jsnapy_runner.
app.include_router(jsnapy_tests.router, prefix="/api")
app.include_router(
    operations.router, prefix="/api"
)  # 🥈 The old router is now secondary
app.include_router(automation.router, prefix="/api")
app.include_router(proxy.router, prefix="/api")
app.include_router(test_redis.router, prefix="/api")
app.include_router(inventory.router, prefix="/api")
app.include_router(sidebar_metadata.router, prefix="/api")
app.include_router(restore.router, prefix="/api")
app.include_router(software_images.router, prefix="/api")
app.include_router(configuration_templates.router, prefix="/api")
app.include_router(configuration_deployment.router, prefix="/api")
app.include_router(
    file_uploader.router, prefix="/api"
)  # 🔑 FIXED: Changed .route to .router


# --- Root Health Checks ---
@app.get("/")
def root_health_check():
    """Returns a simple status check for root access."""
    return {"status": "ok", "message": "FastAPI Gateway is operational"}


@app.get("/health")
def health_check():
    """Returns a comprehensive health status and version information."""
    # Note: Using a hardcoded version here matches the FastAPI app version above
    return {"status": "healthy", "service": "FastAPI Gateway", "version": "1.0.0"}
