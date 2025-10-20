"""
Image Reader Module
Scans the shared/images directory and provides structured image data for code upgrades
"""

import os
from pathlib import Path
from typing import Dict, List, Optional
from loguru import logger

# Define the base directory for images
IMAGES_BASE_DIR = Path("/app/shared/data/images")


def scan_images_directory() -> Dict:
    """
    Recursively scans the images directory and returns structured data
    Expected directory structure:
    shared/data/images/
    ├── routers/
    │   ├── MX/
    │   │   ├── 240/
    │   │   ├── 301/
    │   │   └── 480/
    │   └── ACX/
    │       └── 5548/
    ├── switches/
    │   └── EX/
    │       ├── 4400/
    │       └── 4600/
    └── firewalls/
        └── SRX/
            └── 210/
    """
    inventory = {"vendors": []}

    if not IMAGES_BASE_DIR.exists():
        logger.warning(f"Images directory not found: {IMAGES_BASE_DIR}")
        return inventory

    # Vendor categories (routers, switches, firewalls)
    vendor_categories = {
        "routers": "Juniper Routers",
        "switches": "Juniper Switches",
        "firewalls": "Juniper Firewalls",
    }

    for vendor_dir in IMAGES_BASE_DIR.iterdir():
        if vendor_dir.is_dir():
            vendor_key = vendor_dir.name.lower()  # routers, switches, firewalls
            vendor_display_name = vendor_categories.get(
                vendor_key, vendor_dir.name.title()
            )

            vendor_data = {
                "name": vendor_display_name,
                "category": vendor_key,
                "platforms": [],
            }

            # Platform level (MX, EX, SRX, ACX, etc.)
            for platform_dir in vendor_dir.iterdir():
                if platform_dir.is_dir():
                    platform_name = platform_dir.name.upper()  # mx -> MX, ex -> EX
                    platform_data = {"name": platform_name, "releases": []}

                    # Release/Model level (240, 480, 210, etc.)
                    for release_dir in platform_dir.iterdir():
                        if release_dir.is_dir():
                            release_name = release_dir.name
                            release_data = {"version": release_name, "images": []}

                            # Image files
                            image_files = []
                            for image_file in release_dir.iterdir():
                                if (
                                    image_file.is_file()
                                    and not image_file.name.startswith(".")
                                ):
                                    # Common JunOS image file extensions
                                    if image_file.suffix.lower() in [
                                        ".tgz",
                                        ".img",
                                        ".bin",
                                        ".iso",
                                        ".package",
                                    ]:
                                        image_data = {
                                            "file": image_file.name,
                                            "path": str(
                                                image_file.relative_to(IMAGES_BASE_DIR)
                                            ),
                                            "size": image_file.stat().st_size,
                                            "size_mb": round(
                                                image_file.stat().st_size
                                                / (1024 * 1024),
                                                2,
                                            ),
                                            "modified": image_file.stat().st_mtime,
                                        }
                                        image_files.append(image_data)

                            # Sort images by filename
                            image_files.sort(key=lambda x: x["file"])
                            release_data["images"] = image_files

                            # Only include releases that have images
                            if release_data["images"]:
                                platform_data["releases"].append(release_data)

                    # Sort releases by version
                    platform_data["releases"].sort(key=lambda x: x["version"])

                    # Only include platforms that have releases
                    if platform_data["releases"]:
                        vendor_data["platforms"].append(platform_data)

            # Sort platforms by name
            vendor_data["platforms"].sort(key=lambda x: x["name"])

            # Only include vendors that have platforms
            if vendor_data["platforms"]:
                inventory["vendors"].append(vendor_data)

    # Sort vendors by category
    inventory["vendors"].sort(key=lambda x: x["category"])

    logger.info(f"Scanned images directory: found {len(inventory['vendors'])} vendors")
    return inventory


def get_platform_images(vendor: str, platform: str) -> Optional[Dict]:
    """
    Get images for a specific vendor and platform
    """
    inventory = scan_images_directory()

    vendor_data = next(
        (v for v in inventory["vendors"] if v["category"].lower() == vendor.lower()),
        None,
    )
    if not vendor_data:
        return None

    platform_data = next(
        (p for p in vendor_data["platforms"] if p["name"].lower() == platform.lower()),
        None,
    )

    return platform_data


def get_release_images(vendor: str, platform: str, release: str) -> Optional[Dict]:
    """
    Get images for a specific vendor, platform, and release
    """
    platform_data = get_platform_images(vendor, platform)
    if not platform_data:
        return None

    release_data = next(
        (r for r in platform_data["releases"] if r["version"] == release), None
    )

    return release_data
