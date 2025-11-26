import uuid
from typing import List, Optional
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel

# Import the new service
from app_gateway.services.jsnapy_service_v2 import JSNAPyServiceV2
# We need the existing websocket logic, but we need to inject our new Service into it.
# To keep things clean, we will assume you update the websocket service to accept a service_class argument
# OR we simply define the background task logic here.

from app_gateway.services import websocket as websocket_service

router = APIRouter(prefix="/operations", tags=["JSNAPy V2"])


class ValidationReq(BaseModel):
    hostname: str
    username: str
    password: str
    tests: List[str]
    mode: Optional[str] = "check"
    tag: Optional[str] = "snap"
    inventory_file: Optional[str] = None  # Ignored
    command: Optional[str] = "validation"  # Ignored


@router.post("/validation/execute-v2")
async def execute_validation_v2(req: ValidationReq, background_tasks: BackgroundTasks):
    job_id = f"job-{uuid.uuid4()}"

    # Use the proper streaming function that handles Redis publishing
    async def run_validation_job():
        await websocket_service.execute_jsnapy_and_stream(
            job_id=job_id,
            hostname=req.hostname,
            username=req.username,
            password=req.password,
            tests=req.tests,
            mode=req.mode,
            tag=req.tag,
        )

    background_tasks.add_task(run_validation_job)

    return {
        "job_id": job_id,
        "ws_channel": f"job:{job_id}",
        "status": "queued",
        "message": "JSNAPy V2 Storage Check Started",
    }
