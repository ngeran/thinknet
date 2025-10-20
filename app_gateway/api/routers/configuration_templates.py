"""
FastAPI Router for Configuration Templates (Improved)
Provides structured, categorized template data from the templates directory
"""

from fastapi import APIRouter, HTTPException
from loguru import logger

# Import from data_access layer
from app_gateway.data_access import template_reader

router = APIRouter()


@router.get("/templates")
async def get_templates():
    """
    Returns structured configuration template inventory with categories (list of .j2 files only)
    """
    try:
        inventory = template_reader.scan_templates_directory()
        logger.info(f"Returning {len(inventory['categories'])} categories")
        return inventory
    except Exception as e:
        logger.error(f"Error scanning templates: {e}")
        raise HTTPException(
            status_code=500, detail=f"Error scanning templates: {str(e)}"
        )


@router.get("/templates/{template_path:path}")
async def get_template(template_path: str):
    """
    Returns a specific template by relative path (e.g., protocols/bgp.j2)
    """
    try:
        template_data = template_reader.get_template_by_path(template_path)
        if not template_data:
            raise HTTPException(
                status_code=404,
                detail=f"Template '{template_path}' not found",
            )
        return template_data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting template {template_path}: {e}")
        raise HTTPException(
            status_code=500, detail=f"Error retrieving template: {str(e)}"
        )
