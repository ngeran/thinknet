import uuid
from typing import List, Optional
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel

# Import services
from app_gateway.services.jsnapy_service import JSNAPyService
from app_gateway.services import websocket as websocket_service

router = APIRouter(prefix="/operations", tags=["JSNAPy Validation"])


# ==============================================================================
# 1. FIXED PYDANTIC MODEL (Resolves 422 Error)
# ==============================================================================
class ValidationReq(BaseModel):
    # Frontend sends "command", so we must accept it (even if optional)
    command: Optional[str] = "validation"

    # Frontend sends "inventory_file", accept it to prevent 422
    inventory_file: Optional[str] = None

    # Hostname might be empty if inventory_file is used, so make it Optional here
    hostname: Optional[str] = None

    username: str
    password: str
    tests: List[str]
    mode: Optional[str] = "check"
    tag: Optional[str] = "snap"


# ==============================================================================
# 2. ROUTES
# ==============================================================================


@router.get("/discover-tests")
async def get_tests():
    try:
        tests = await JSNAPyService.discover_tests()
        return {"success": True, "discovered_tests": tests}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/validation/execute")
async def execute_validation(req: ValidationReq, background_tasks: BackgroundTasks):
    """
    Triggers the JSNAPy job.
    """

    # LOGIC CHECK: Ensure we have a target
    # Since we made hostname Optional in Pydantic to fix the 422,
    # we must manually validate that we actually have a target to run on.
    target_host = req.hostname

    if not target_host:
        # TODO: Add logic to parse req.inventory_file and extract IPs if needed
        raise HTTPException(
            status_code=400,
            detail="Inventory file support is not yet enabled. Please enter a specific Hostname/IP.",
        )

    job_id = f"job-{uuid.uuid4()}"

    # Offload to background task
    background_tasks.add_task(
        websocket_service.execute_jsnapy_and_stream,
        job_id=job_id,
        hostname=target_host,
        username=req.username,
        password=req.password,
        tests=req.tests,
        mode=req.mode,
        tag=req.tag,
    )

    # Return matches what Frontend expects
    return {
        "job_id": job_id,
        "ws_channel": f"job:{job_id}",
        "status": "queued",
        "message": f"Job {job_id} started in background",
    }
