# app_gateway/routers/sidebar_metadata.py (FINAL, CORRECTED LOGIC)

from fastapi import APIRouter, HTTPException
import yaml
from pathlib import Path
from typing import List, Dict, Any
import traceback
import logging

router = APIRouter(
    prefix="/sidebar-data", 
    tags=["Sidebar Metadata"],
)
DATA_DIR = Path("/app/shared/data")

@router.get("/sidebar/{sidebar_id}")
async def get_sidebar_data(sidebar_id: str):
    file_path = DATA_DIR / "sidebars" / f"{sidebar_id}.yaml"

    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Sidebar configuration not found: {file_path}")

    try:
        content = file_path.read_text()
        data = yaml.safe_load(content)

        # 1. Determine the final item_list to use, defaulting to an empty list.
        item_list: List[Dict[str, Any]]

        if data is None:
            # File was empty or only comments, use empty list.
            item_list = []
        
        elif isinstance(data, list):
            # Top-level is a list (valid structure).
            item_list = data
        
        elif isinstance(data, dict):
            # Top-level is a dict (your structure 'items: [...]'), extract the list.
            # We explicitly check the type of the extracted value to be safe.
            items_value = data.get('items', [])
            item_list = items_value if isinstance(items_value, list) else []
        
        else:
            # Any other type (e.g., just a string or number in YAML)
            item_list = []
        
        # 2. Restructure the list (THIS IS NOW GUARANTEED TO BE SAFE)
        grouped_data = {}
        for item in item_list: # <--- This line will now run successfully.
            # ... (Rest of your grouping logic)
            group_name = item.pop('group', 'Default') 
            
            if group_name not in grouped_data:
                grouped_data[group_name] = {"title": group_name, "items": []}
            grouped_data[group_name]['items'].append(item)

        return list(grouped_data.values())

    except Exception as e:
        # ... (error handling remains the same) ...
        logging.getLogger().error(f"Sidebar YAML Crash: {e}\n{traceback.format_exc()}")
        
        raise HTTPException(
            status_code=500, 
            detail=f"Error reading or parsing YAML file: {str(e)}. Check docker logs for full traceback."
        )
