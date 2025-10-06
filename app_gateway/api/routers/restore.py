# File Path: app_gateway/api/routers/restore.py

from fastapi import APIRouter
from pydantic import RootModel # Assuming you made the change to import RootModel
from typing import Dict, List

# Use absolute import based on your app_gateway structure
from app_gateway.data_access.backup_reader import get_unique_backup_timestamps

# --- Pydantic Response Model (V2 Compatible) ---
class BackupStructureModel(RootModel):
    """
    Model for the JSON response structure.
    Maps Device Name to a list of unique backup timestamps/names.
    """
    # The root attribute holds the type of the root element (a Dict in this case)
    # The actual data will be returned as the naked Dict[str, List[str]]
    root: Dict[str, List[str]] 

router = APIRouter(
    prefix="/restore",
    tags=["Restore Operations"]
)

@router.get(
    "/available-backups", 
    response_model=BackupStructureModel,
    summary="Get available device backups grouped by unique timestamp/name"
)
async def get_available_backups():
    """
    Retrieves the hierarchical structure of available backups:
    """
    data = get_unique_backup_timestamps()
    
    # ✅ THE FIX: Explicitly wrap the returned data in the RootModel
    # This creates an object { "root": { ... data ... } } internally, 
    # which Pydantic V2 then correctly serializes as the naked dictionary.
    return BackupStructureModel(root=data)
