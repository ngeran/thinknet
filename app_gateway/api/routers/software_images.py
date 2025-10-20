"""
FastAPI Router for Software Image Inventory
Provides structured image data for code upgrades
"""

from fastapi import APIRouter, HTTPException
from loguru import logger

# Import from data_access layer
from app_gateway.data_access import image_reader

router = APIRouter()


@router.get("/inventories/software-images")
async def get_software_images():
    """
    Returns structured software image inventory
    """
    try:
        inventory = image_reader.scan_images_directory()
        logger.info(
            f"Returning {len(inventory['vendors'])} vendors with software images"
        )
        return inventory
    except Exception as e:
        logger.error(f"Error scanning software images: {e}")
        raise HTTPException(status_code=500, detail=f"Error scanning images: {str(e)}")


@router.get("/inventories/software-images/{vendor}/{platform}")
async def get_platform_images(vendor: str, platform: str):
    """
    Returns images for a specific vendor category and platform
    """
    try:
        platform_data = image_reader.get_platform_images(vendor, platform)
        if not platform_data:
            raise HTTPException(
                status_code=404,
                detail=f"Platform '{platform}' not found for vendor '{vendor}'",
            )
        return platform_data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting platform images: {e}")
        raise HTTPException(
            status_code=500, detail=f"Error retrieving images: {str(e)}"
        )


@router.get("/inventories/software-images/{vendor}/{platform}/{release}")
async def get_release_images(vendor: str, platform: str, release: str):
    """
    Returns images for a specific vendor, platform, and release
    """
    try:
        release_data = image_reader.get_release_images(vendor, platform, release)
        if not release_data:
            raise HTTPException(
                status_code=404,
                detail=f"Release '{release}' not found for platform '{platform}'",
            )
        return release_data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting release images: {e}")
        raise HTTPException(
            status_code=500, detail=f"Error retrieving release images: {str(e)}"
        )
