"""
MAIN FASTAPI APPLICATION ENTRY POINT
====================================
This module initializes and configures the FastAPI application,
including all API routers, middleware, and health checks.

Architecture:
- FastAPI Gateway serves as the central API entry point
- Routes requests to appropriate backend services
- Handles CORS for frontend communication
- Manages service health monitoring
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
import sys

# Import all API routers from their respective files.
# Each router handles a specific functional domain of the application.
from app_gateway.api.routers import (
    automation,  # Automation workflow endpoints
    proxy,  # Proxy requests to backend services
    test_redis,  # Redis connection testing
    inventory,  # Device inventory management
    sidebar_metadata,  # Navigation and UI metadata
    restore,  # Configuration restore operations
    operations,  # Generic operations endpoint
    software_images,  # Software image management
    configuration_templates,  # Configuration template management
    jsnapy_tests,  # JSNapy test execution
    configuration_deployment,  # Configuration deployment
    jsnapy_runner,  # Dedicated JSNapy job runner
    file_uploader,  # File upload handling
    code_upgrade,  # Device code upgrade operations with pre-check
)

from .core.config import settings

# =============================================================================
# DEBUG: VERIFY MODULE IMPORTS AND ROUTER AVAILABILITY
# =============================================================================
logger.info("🔧 [DEBUG] Starting application initialization...")
logger.info(f"🔧 [DEBUG] Python path: {sys.path}")

try:
    from app_gateway.api.routers import code_upgrade

    logger.info("✅ [DEBUG] Successfully imported code_upgrade module")
    logger.info(f"📁 [DEBUG] Module file location: {code_upgrade.__file__}")

    # Inspect what router objects are available in the module
    available_routers = [
        attr
        for attr in dir(code_upgrade)
        if not attr.startswith("_") and "router" in attr.lower()
    ]
    logger.info(f"🔍 [DEBUG] Available routers in module: {available_routers}")

    # Check for specific router instances
    if hasattr(code_upgrade, "code_upgrade_router"):
        logger.info("✅ [DEBUG] code_upgrade_router found!")
        logger.info(
            f"🛣️  [DEBUG] Router prefix: {code_upgrade.code_upgrade_router.prefix}"
        )
    else:
        logger.warning("⚠️ [DEBUG] code_upgrade_router NOT found!")

    if hasattr(code_upgrade, "router"):
        logger.info("✅ [DEBUG] router alias found!")
    else:
        logger.warning("⚠️ [DEBUG] router alias NOT found!")

except ImportError as e:
    logger.error(f"❌ [DEBUG] Failed to import code_upgrade module: {e}")
    # Don't exit - continue without this module
except Exception as e:
    logger.error(f"❌ [DEBUG] Unexpected error during import: {e}")

# =============================================================================
# FASTAPI APPLICATION INITIALIZATION
# =============================================================================
app = FastAPI(
    title=settings.APP_TITLE,  # Application title from configuration
    version="1.0.0",  # API version
    description="Centralized API Gateway for network automation services.",
    # OpenAPI documentation will be available at /docs and /redoc
)

# =============================================================================
# CORS MIDDLEWARE CONFIGURATION
# =============================================================================
# CORS (Cross-Origin Resource Sharing) allows the frontend (React/Vite)
# running on a different port to communicate with this API.
app.add_middleware(
    CORSMiddleware,
    # WARNING: In production, replace "*" with specific frontend origins
    allow_origins=["*"],  # Allow all origins (development only)
    allow_credentials=True,  # Allow cookies and authentication
    allow_methods=["*"],  # Allow all HTTP methods
    allow_headers=["*"],  # Allow all headers
)

# =============================================================================
# ROUTER REGISTRATION WITH PRIORITY ORDERING
# =============================================================================
# The order of router inclusion matters when multiple routers define
# the same path. The first matching route takes precedence.

# 🥇 HIGH PRIORITY: JSNapy runner takes precedence for /api/operations/execute
app.include_router(jsnapy_runner.router, prefix="/api")
logger.info("✅ Registered jsnapy_runner router")

# 🥈 MEDIUM PRIORITY: Other JSNapy and operations endpoints
app.include_router(jsnapy_tests.router, prefix="/api")
logger.info("✅ Registered jsnapy_tests router")

app.include_router(operations.router, prefix="/api")
logger.info("✅ Registered operations router")

# 🥈 MEDIUM PRIORITY: Code upgrade operations
# IMPORTANT: The code_upgrade_router already has prefix="/api/operations"
# so we don't add an additional prefix to avoid double /api/api/operations
try:
    if hasattr(code_upgrade, "code_upgrade_router"):
        # Router defines its own prefix: /api/operations
        # Final paths: /api/operations/health, /api/operations/pre-check, etc.
        app.include_router(code_upgrade.code_upgrade_router)
        logger.info("✅ Registered code_upgrade_router WITHOUT additional prefix")
    elif hasattr(code_upgrade, "router"):
        # Fallback to router alias if available
        app.include_router(code_upgrade.router)
        logger.info("✅ Registered router alias WITHOUT additional prefix")
    else:
        logger.warning("⚠️ No code upgrade router available for registration")
except Exception as e:
    logger.error(f"❌ Failed to register code upgrade router: {e}")

# 🥈 MEDIUM PRIORITY: Core application routers
app.include_router(automation.router, prefix="/api")
logger.info("✅ Registered automation router")

app.include_router(proxy.router, prefix="/api")
logger.info("✅ Registered proxy router")

app.include_router(test_redis.router, prefix="/api")
logger.info("✅ Registered test_redis router")

app.include_router(inventory.router, prefix="/api")
logger.info("✅ Registered inventory router")

app.include_router(sidebar_metadata.router, prefix="/api")
logger.info("✅ Registered sidebar_metadata router")

app.include_router(restore.router, prefix="/api")
logger.info("✅ Registered restore router")

app.include_router(software_images.router, prefix="/api")
logger.info("✅ Registered software_images router")

app.include_router(configuration_templates.router, prefix="/api")
logger.info("✅ Registered configuration_templates router")

app.include_router(configuration_deployment.router, prefix="/api")
logger.info("✅ Registered configuration_deployment router")

app.include_router(file_uploader.router, prefix="/api")
logger.info("✅ Registered file_uploader router")

logger.info("🎉 All routers registered successfully")


# =============================================================================
# DEBUG ENDPOINT: ROUTE INSPECTION
# =============================================================================
@app.get("/debug/routes")
async def debug_routes():
    """
    🔧 DEBUG ENDPOINT: Inspect all registered routes

    Returns:
        JSON with all registered routes, their methods, and paths
        Useful for debugging route conflicts or missing routes
    """
    routes = []
    for route in app.routes:
        route_info = {
            "path": getattr(route, "path", None),
            "name": getattr(route, "name", None),
            "methods": getattr(route, "methods", None),
        }
        routes.append(route_info)

    # Sort routes by path for easier reading
    routes.sort(key=lambda x: x["path"] or "")

    return {"total_routes": len(routes), "routes": routes}


# =============================================================================
# HEALTH CHECK ENDPOINTS
# =============================================================================
@app.get("/")
def root_health_check():
    """
    🏠 ROOT ENDPOINT: Basic service status

    Returns:
        Simple status indicating the API gateway is operational
        Used for basic connectivity testing
    """
    return {
        "status": "ok",
        "message": "FastAPI Gateway is operational",
        "version": "1.0.0",
    }


@app.get("/health")
def health_check():
    """
    ❤️ HEALTH CHECK: Comprehensive service health status

    Returns:
        Detailed health information including service name and version
        Used by monitoring systems and load balancers
    """
    return {
        "status": "healthy",
        "service": "FastAPI Gateway",
        "version": "1.0.0",
        "timestamp": __import__("datetime").datetime.utcnow().isoformat() + "Z",
    }


# =============================================================================
# APPLICATION STARTUP COMPLETE
# =============================================================================
logger.info("🚀 FastAPI application initialization complete")
logger.info("📚 API Documentation available at: http://localhost:8000/docs")
logger.info("🔧 Debug routes available at: http://localhost:8000/debug/routes")

# =============================================================================
# APPLICATION SHUTDOWN HANDLING (Optional)
# =============================================================================
# @app.on_event("shutdown")
# async def shutdown_event():
#     """Cleanup tasks when application is shutting down"""
#     logger.info("🛑 FastAPI application shutting down...")
#     # Add any cleanup tasks here (database connections, etc.)
