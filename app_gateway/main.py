# File Path: fastapi_automation/main.py (UPDATED ENTRY POINT)
"""
FastAPI Application Entry Point
Initializes the application, applies middleware, and includes all necessary routers.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
from .api.routers import automation, proxy, test_redis # Import the new router file
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

# --- Root Health Check ---
# Description: Simple health check for the application root.
@app.get("/")
def root_health_check():
    return {"status": "ok", "message": "FastAPI Gateway is operational"}

# (The previous standalone health_check and run_juniper_script were moved to api/routers/automation.py)
