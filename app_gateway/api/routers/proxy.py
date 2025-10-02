# File Path: fastapi_automation/api/routers/proxy.py (NEW FILE)
"""
Proxy Router
Handles requests that need to be forwarded to the Rust backend.
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
import httpx
from loguru import logger
from ...core.config import settings

router = APIRouter()
RUST_BACKEND_URL = "http://rust_ws_hub:3100" # Internal Docker service address

# --- Navigation Proxy Endpoint ---
# Description: Proxies the navigation request to the Rust backend.
@router.get("/navigation")
async def proxy_navigation():
    """Proxies the /api/navigation request to the Rust backend."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            rust_url = f"{RUST_BACKEND_URL}/api/navigation"
            
            logger.info(f"Proxying request to Rust: {rust_url}")
            response = await client.get(rust_url)
            response.raise_for_status()

            return JSONResponse(content=response.json())

    except httpx.ConnectError:
        logger.error(f"Connection refused to Rust backend at {RUST_BACKEND_URL}")
        raise HTTPException(
            status_code=503, 
            detail="Cannot connect to Rust backend service (http://rust_ws_hub:3100)."
        )
    except httpx.HTTPStatusError as e:
        logger.warning(f"Rust backend returned error {e.response.status_code}: {e.response.text}")
        raise HTTPException(
            status_code=e.response.status_code, 
            detail=f"Error from Rust backend: {e.response.text}"
        )
    except Exception as e:
        logger.error(f"Unexpected error during proxy: {e}")
        raise HTTPException(status_code=500, detail="Internal proxy error.")
