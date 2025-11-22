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

UPDATES:
- Added upgrade router for device software upgrades (2025-11-18 16:47:45 UTC)
- Maintains separation between pre-check (code_upgrade.py) and upgrade (upgrade.py)
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
import sys

# Import all API routers from their respective files.
# Each router handles a specific functional domain of the application.
from app_gateway.api.routers import (
    automation,
    code_upgrade,
    configuration_deployment,
    configuration_templates,
    device_storage,
    file_uploader,
    inventory,
    jsnapy_runner,  # JSNapy validation runner
    jsnapy_tests,  # JSNapy test discovery and execution
    operations,  # Backup and restore operations
    pre_checks,  # PreChecks for code upgrade validation
    proxy,  # Navigation proxy to Rust backend
    restore,
    sidebar_metadata,
    software_images,
    test_redis,  # Redis testing endpoint
    upgrade,
)

from .core.config import settings

# =============================================================================
# DEBUG: VERIFY MODULE IMPORTS AND ROUTER AVAILABILITY
# =============================================================================
logger.info("🔧 [DEBUG] Starting application initialization...")
logger.info(f"🔧 [DEBUG] Python path: {sys.path}")

# Verify code_upgrade module (pre-check endpoint)
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
        logger.info("✅ [DEBUG] 'code_upgrade_router' found!")
        logger.info(
            f"🛣️  [DEBUG] Router prefix: {code_upgrade.code_upgrade_router.prefix}"
        )
    else:
        logger.warning("⚠️ [DEBUG] 'code_upgrade_router' NOT found!")

    if hasattr(code_upgrade, "router"):
        logger.info("✅ [DEBUG] 'router' alias found!")
    else:
        logger.warning("⚠️ [DEBUG] 'router' alias NOT found!")

except ImportError as e:
    logger.error(f"❌ [DEBUG] Failed to import code_upgrade module: {e}")
except Exception as e:
    logger.error(f"❌ [DEBUG] Unexpected error during import: {e}")

# Verify upgrade module (upgrade execution endpoint) - NEW 2025-11-18 16:47:45 UTC
try:
    from app_gateway.api.routers import upgrade

    logger.info("✅ [DEBUG] Successfully imported upgrade module")
    logger.info(f"📁 [DEBUG] Module file location: {upgrade.__file__}")

    # Inspect what router objects are available
    available_routers = [
        attr
        for attr in dir(upgrade)
        if not attr.startswith("_") and "router" in attr.lower()
    ]
    logger.info(f"🔍 [DEBUG] Available routers in upgrade module: {available_routers}")

    # Check for specific router instances
    if hasattr(upgrade, "upgrade_router"):
        logger.info("✅ [DEBUG] 'upgrade_router' found!")
        logger.info(f"🛣️  [DEBUG] Router prefix: {upgrade.upgrade_router.prefix}")
    else:
        logger.warning("⚠️ [DEBUG] 'upgrade_router' NOT found!")

    if hasattr(upgrade, "router"):
        logger.info("✅ [DEBUG] 'router' alias found!")
    else:
        logger.warning("⚠️ [DEBUG] 'router' alias NOT found!")

except ImportError as e:
    logger.error(f"❌ [DEBUG] Failed to import upgrade module: {e}")
except Exception as e:
    logger.error(f"❌ [DEBUG] Unexpected error during upgrade import: {e}")

# =============================================================================
# FASTAPI APPLICATION INITIALIZATION
# =============================================================================
app = FastAPI(
    title=settings.APP_TITLE,  # Application title from configuration
    version="1.0.0",  # API version
    description="Centralized API Gateway for network automation services.",
    # OpenAPI documentation will be available at /docs and /redoc by default.
)

# =============================================================================
# CORS MIDDLEWARE CONFIGURATION
# =============================================================================
# CORS (Cross-Origin Resource Sharing) allows the frontend (React/Vite)
# running on a different origin (e.g., different port) to communicate
# securely with this FastAPI API Gateway.
app.add_middleware(
    CORSMiddleware,
    # Configure allowed origins for frontend communication.
    # The frontend is running on http://localhost:5173 (as per docker-compose.yml).
    # When allow_credentials is True, 'allow_origins' CANNOT be ["*"].
    # It must explicitly list the allowed origins.
    allow_origins=[
        "http://localhost:5173",  # Your React/Vite development server
        # Add other specific origins for production environments here, e.g.:
        # "https://your-production-frontend.com",
        # "http://localhost", # If testing directly from localhost without a specific port
    ],
    allow_credentials=True,  # Allow cookies and HTTP authentication headers to be sent.
    allow_methods=[
        "*"
    ],  # Allow all HTTP methods (GET, POST, PUT, DELETE, OPTIONS, etc.).
    allow_headers=["*"],  # Allow all request headers.
)

# =============================================================================
# ROUTER REGISTRATION WITH PRIORITY ORDERING
# =============================================================================
# The order of router inclusion matters when multiple routers define
# the same path or path prefixes. The first matching route takes precedence.

# 🥇 HIGH PRIORITY: JSNapy runner might define more specific or overarching routes
# that should be handled before more generic 'operations' routes.


# 🥈 MEDIUM PRIORITY: Other JSNapy and operations endpoints.
# Ensure that /operations routes are defined before very generic catch-alls.
app.include_router(jsnapy_runner.router, prefix="/api")
logger.info("✅ Registered jsnapy_runner router with prefix /api")

app.include_router(jsnapy_tests.router, prefix="/api")
logger.info("✅ Registered jsnapy_tests router with prefix /api")

app.include_router(operations.router, prefix="/api")
logger.info("✅ Registered operations router with prefix /api")

# 🥈 MEDIUM PRIORITY: Code upgrade operations (pre-check validation).
# IMPORTANT: The `code_upgrade_router` already defines its own prefix (e.g., "/api/operations").
# Do NOT add an additional prefix here to avoid duplicating it.
try:
    if hasattr(code_upgrade, "code_upgrade_router"):
        # Assuming code_upgrade_router defines its own /api/operations prefix internally.
        # Final paths will look like: /api/operations/health, /api/operations/pre-check, etc.
        app.include_router(code_upgrade.code_upgrade_router)
        logger.info("✅ Registered 'code_upgrade_router' (pre-check validation)")
    elif hasattr(code_upgrade, "router"):
        # Fallback to a generic 'router' alias if found, assuming it also defines its prefix.
        app.include_router(code_upgrade.router)
        logger.info("✅ Registered generic 'router' alias for code_upgrade")
    else:
        logger.warning(
            "⚠️ No specific code upgrade router ('code_upgrade_router' or 'router') found for registration."
        )
except Exception as e:
    logger.error(f"❌ Failed to register code upgrade router due to an exception: {e}")

# 🥈 MEDIUM PRIORITY: Device upgrade operations (upgrade execution) - NEW 2025-11-18 16:47:45 UTC
# IMPORTANT: The `upgrade_router` already defines its own prefix ("/api/operations").
# Do NOT add an additional prefix here to avoid path duplication.
try:
    if hasattr(upgrade, "upgrade_router"):
        # upgrade_router defines its own /api/operations prefix internally.
        # Final paths will look like: /api/operations/upgrade, /api/operations/upgrade/health, etc.
        app.include_router(upgrade.upgrade_router)
        logger.info(
            "✅ Registered 'upgrade_router' (device software upgrade execution)"
        )
        logger.info(
            "   📍 Endpoints: POST /api/operations/upgrade, GET /api/operations/upgrade/health"
        )
    elif hasattr(upgrade, "router"):
        # Fallback to generic 'router' alias if found
        app.include_router(upgrade.router)
        logger.info("✅ Registered generic 'router' alias for upgrade")
    else:
        logger.warning(
            "⚠️ No specific upgrade router ('upgrade_router' or 'router') found for registration."
        )
except Exception as e:
    logger.error(f"❌ Failed to register upgrade router due to an exception: {e}")

# 🥉 STANDARD PRIORITY: Remaining core application routers.
app.include_router(automation.router, prefix="/api")
logger.info("✅ Registered automation router with prefix /api")

app.include_router(proxy.router, prefix="/api")
logger.info("✅ Registered proxy router with prefix /api")

app.include_router(test_redis.router, prefix="/api")
logger.info("✅ Registered test_redis router with prefix /api")

app.include_router(device_storage.router, prefix="/api")
logger.info("✅ Registered device_storage router with prefix /api")

app.include_router(inventory.router, prefix="/api")
logger.info("✅ Registered inventory router with prefix /api")

app.include_router(sidebar_metadata.router, prefix="/api")
logger.info("✅ Registered sidebar_metadata router with prefix /api")

app.include_router(restore.router, prefix="/api")
logger.info("✅ Registered restore router with prefix /api")

app.include_router(software_images.router, prefix="/api")
logger.info("✅ Registered software_images router with prefix /api")

app.include_router(configuration_templates.router, prefix="/api")
logger.info("✅ Registered configuration_templates router with prefix /api")

app.include_router(upgrade.router, prefix="/api")
logger.info("✅ Registered upgrade router with prefix /api")

app.include_router(configuration_deployment.router, prefix="/api")
logger.info("✅ Registered configuration_deployment router with prefix /api")

app.include_router(file_uploader.router, prefix="/api")
logger.info("✅ Registered file_uploader router with prefix /api")

app.include_router(pre_checks.router, prefix="/api")
logger.info("✅ Registered pre_checks router with prefix /api")

logger.info("🎉 All specified routers have been processed for registration.")


# =============================================================================
# DEBUG ENDPOINT: ROUTE INSPECTION
# =============================================================================
@app.get("/debug/routes")
async def debug_routes():
    """
    🔧 DEBUG ENDPOINT: Inspect all registered routes within the FastAPI application.

    Provides a comprehensive list of all API endpoints, their HTTP methods,
    and their internal names. This is invaluable for debugging routing conflicts,
    verifying router inclusions, and understanding the API's surface area.

    Returns:
        JSON: A dictionary containing the total number of registered routes
              and a sorted list of route details (path, name, allowed methods).
    """
    routes = []
    for route in app.routes:
        # FastAPI route objects might have different attributes depending on their type.
        # We try to extract common ones like path, name, and methods.
        route_info = {
            "path": getattr(route, "path", None),
            "name": getattr(route, "name", None),
            "methods": list(getattr(route, "methods", []))
            if hasattr(route, "methods")
            else None,
        }
        if (
            route_info["path"] is not None
        ):  # Filter out non-endpoint routes like Swagger UI assets
            routes.append(route_info)

    # Sort routes by path for easier readability and debugging.
    routes.sort(key=lambda x: x["path"] or "")

    logger.info(f"🔎 Accessed debug/routes endpoint. Total routes: {len(routes)}")
    return {"total_routes": len(routes), "routes": routes}


# =============================================================================
# HEALTH CHECK ENDPOINTS
# =============================================================================
@app.get("/")
def root_health_check():
    """
    🏠 ROOT ENDPOINT: Basic service status for fundamental connectivity checks.

    This endpoint provides a minimal response to confirm the API gateway is
    running and accessible. It's often used by load balancers or orchestrators
    for a quick 'liveness' probe.

    Returns:
        dict: A simple status object indicating the gateway is operational.
    """
    logger.debug("Received request to root health check '/'")
    return {
        "status": "ok",
        "message": "FastAPI Gateway is operational",
        "version": "1.0.0",
    }


@app.get("/health")
def health_check():
    """
    ❤️ HEALTH CHECK: Comprehensive service health status.

    Provides more detailed health information, including the service name,
    version, and a UTC timestamp. This is suitable for more robust monitoring
    systems and 'readiness' probes, ensuring the service is not only alive
    but also ready to process requests.

    Returns:
        dict: A detailed health report for the FastAPI Gateway.
    """
    logger.debug("Received request to comprehensive health check '/health'")
    return {
        "status": "healthy",
        "service": "FastAPI Gateway",
        "version": "1.0.0",
        "timestamp": __import__("datetime").datetime.utcnow().isoformat() + "Z",
    }


# =============================================================================
# APPLICATION STARTUP COMPLETE
# =============================================================================
logger.info(
    "🚀 FastAPI application initialization complete. Gateway is ready to serve requests."
)
logger.info("📚 API Documentation available at: http://localhost:8000/docs")
logger.info(
    "💡 Interactive API Explorer (ReDoc) available at: http://localhost:8000/redoc"
)
logger.info("🔧 Debug routes endpoint available at: http://localhost:8000/debug/routes")
logger.info("=" * 80)
logger.info("🎯 UPGRADE SYSTEM ENDPOINTS:")
logger.info("  ✅ POST /api/operations/pre-check - Pre-check validation")
logger.info("  ✅ POST /api/operations/upgrade - Device software upgrade")
logger.info("  ✅ GET  /api/operations/health - Pre-check health")
logger.info("  ✅ GET  /api/operations/upgrade/health - Upgrade health")
logger.info("=" * 80)

# =============================================================================
# APPLICATION SHUTDOWN HANDLING (Optional)
# =============================================================================
# @app.on_event("shutdown")
# async def shutdown_event():
#     """
#     Callback function executed when the FastAPI application is shutting down.
#     Use this for any necessary cleanup tasks, such as closing database connections,
#     releasing resources, or gracefully shutting down background tasks.
#     """
#     logger.info("🛑 FastAPI application is initiating shutdown procedures...")
#     # Example: Close a database connection pool
#     # if db_connection_pool:
#     #     await db_connection_pool.close()
#     logger.info("🛑 All shutdown tasks completed.")
