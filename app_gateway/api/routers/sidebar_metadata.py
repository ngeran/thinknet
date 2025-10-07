# app_gateway/routers/sidebar_metadata.py

from fastapi import APIRouter, HTTPException
import yaml
from pathlib import Path
from typing import List, Dict, Any

# Use the most descriptive name and a relevant prefix
router = APIRouter(
    prefix="/sidebar-data",  # /api/sidebar-data/sidebar/...
    tags=["Sidebar Metadata"],
)

# IMPORTANT: This path must match your Docker volume mount point 
# Based on your shell output, /app/shared/data is the correct root.
DATA_DIR = Path("/app/shared/data")

@router.get("/sidebar/{sidebar_id}")
async def get_sidebar_data(sidebar_id: str):
    """
    Reads and returns the content of a specific sidebar YAML file, 
    grouping the flat list into the structure expected by the frontend.
    """
    
    # 1. Construct the file path using the dynamic ID
    file_path = DATA_DIR / "sidebars" / f"{sidebar_id}.yaml"

    if not file_path.exists():
        raise HTTPException(
            status_code=404, 
            detail=f"Sidebar configuration not found for ID: {sidebar_id}. File expected at {file_path}"
        )

    try:
        # 2. Read the YAML content
        with open(file_path, 'r') as f:
            data = yaml.safe_load(f)
        
        # 🎯 CRITICAL FIX: Handle case where file is empty (yaml.safe_load returns None)
        if data is None:
            item_list: List[Dict[str, Any]] = []
        
        # --- YAML STRUCTURE PARSING ---
        elif isinstance(data, list):
            # If the YAML file is a top-level list
            item_list = data
        
        elif isinstance(data, dict):
            # If the YAML file is a dictionary (like your provided file with the 'items' key)
            item_list = data.get('items', [])
        
        else:
            # Handle any other invalid type
            item_list = []
        # ------------------------------
        
        # 3. Restructure the flat list (from the YAML) into the grouped format 
        grouped_data = {}
        for item in item_list:
            # We use 'get' here as the 'group' key is optional in the item dict
            group_name = item.pop('group', 'Default') 
            
            if group_name not in grouped_data:
                grouped_data[group_name] = {
                    "title": group_name,
                    "items": []
                }
            grouped_data[group_name]['items'].append(item)

        # 4. Return the list of grouped sections
        return list(grouped_data.values())

    except Exception as e:
        # This will catch file errors and YAML parsing errors
        raise HTTPException(
            status_code=500, 
            detail=f"Error reading or parsing YAML file: {str(e)}"
        )
