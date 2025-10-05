# File: app_gateway/api/routers/inventory.py

import os
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import List

# --- Configuration ---
# The path must be relative to the directory where the FastAPI server is run (the project root).
INVENTORY_DIR = Path("shared/data/inventories")

router = APIRouter()

# --- Schemas (Pydantic Models) ---
class InventoryFile(BaseModel):
    """Schema for a single inventory file entry returned to the frontend."""
    name: str = Field(..., description="The filename (e.g., inventory.yaml).")
    size: int = Field(0, description="File size in bytes.")
    
class InventoryListResponse(BaseModel):
    """Schema for the full response from the inventory list endpoint."""
    files: List[InventoryFile]
    count: int
    message: str

# --- Dependency (Utility for Checking Directory) ---
def get_inventory_dir():
    """Checks directory existence and raises 404 if not found."""
    absolute_path = INVENTORY_DIR.resolve()
    if not INVENTORY_DIR.is_dir():
        raise HTTPException(
            status_code=404, 
            detail=f"Inventory directory not found: {absolute_path}"
        )
    return absolute_path

# --- Endpoint ---
@router.get(
    "/inventory/list", 
    response_model=InventoryListResponse, 
    tags=["Inventory"]
)
def list_inventory_files(
    inventory_path: Path = Depends(get_inventory_dir)
):
    """
    Scans the shared inventory directory for YAML files and returns their names and sizes.
    """
    try:
        file_list = []
        # Find all .yaml and .yml files 
        for extension in ["*.yaml", "*.yml"]:
            for file_path in inventory_path.glob(extension):
                if file_path.is_file():
                    stats = file_path.stat()
                    file_list.append(
                        InventoryFile(
                            name=file_path.name,
                            size=stats.st_size,
                        )
                    )
        
        # Ensure only unique filenames are returned
        unique_files = list({f.name: f for f in file_list}.values())
        
        if not unique_files:
            return InventoryListResponse(
                files=[],
                count=0,
                message=f"No YAML inventory files found in the '{INVENTORY_DIR.name}' directory.",
            )

        return InventoryListResponse(
            files=unique_files,
            count=len(unique_files),
            message="Successfully retrieved list of inventory files.",
        )

    except Exception as e:
        # Catch unexpected errors like permission issues
        raise HTTPException(
            status_code=500, 
            detail=f"Error reading inventory files: {str(e)}"
        )
