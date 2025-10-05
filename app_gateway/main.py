# File Path: fastapi_automation/main.py (UPDATED ENTRY POINT)
"""
FastAPI Application Entry Point
Initializes the application, applies middleware, and includes all necessary routers.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

# ❌ OLD: from .api.routers import automation, proxy, test_redis, inventory, sidebar_metadata
# ✅ FIX: Changed to absolute import to ensure correct loading within Docker/Uvicorn
from app_gateway.api.routers import automation, proxy, test_redis, inventory, sidebar_metadata

from .core.config import settings

# --- FastAPI Setup ---
# Description: Initializes the main FastAPI application instance.
app = FastAPI(title=settings.APP_TITLE)

# Configure CORS (essential for local development)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Should be restricted in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Router Inclusion ---
# Description: Includes the API routers with a common prefix.
# NOTE: The prefix "/api" ensures that /api/automation/run/{device} works.
app.include_router(automation.router, prefix="/api")
app.include_router(proxy.router, prefix="/api")
app.include_router(test_redis.router, prefix="/api")
# NEW LINE: Include the inventory router
app.include_router(inventory.router, prefix="/api") 
# Update this line to include the sidebar_metadata router
app.include_router(sidebar_metadata.router, prefix="/api") # Now includes sidebar_metadata
# --- Root Health Check ---
# Description: Simple health check for the application root.
@app.get("/")
def root_health_check():
    return {"status": "ok", "message": "FastAPI Gateway is operational"}

# (The previous standalone health_check and run_juniper_script were moved to api/routers/automation.py)
