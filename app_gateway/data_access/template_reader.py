"""
Template Reader Module (Improved)
Scans the shared/templates directory recursively and provides structured, categorized template data
"""

import os
from pathlib import Path
from typing import Dict, List, Optional
from loguru import logger

# Define the base directory for templates
TEMPLATES_BASE_DIR = Path("/app/shared/data/templates")


def scan_templates_directory() -> Dict:
    """
    Recursively scans the templates directory and returns structured data with categories
    Expected directory structure:
    shared/data/templates/
    ├── protocols/
    │   ├── bgp.j2
    │   └── ospf.j2
    └── interfaces/
        └── interface.j2
    """
    inventory = {"categories": []}

    if not TEMPLATES_BASE_DIR.exists():
        logger.warning(f"Templates directory not found: {TEMPLATES_BASE_DIR}")
        return inventory

    def scan_dir(current_dir: Path, category_path: str = "") -> List[Dict]:
        templates = []
        for item in current_dir.iterdir():
            if item.is_dir():
                sub_category = (
                    f"{category_path}/{item.name}" if category_path else item.name
                )
                sub_templates = scan_dir(item, sub_category)
                if sub_templates:
                    inventory["categories"].append(
                        {"name": sub_category, "templates": sub_templates}
                    )
            elif item.is_file() and item.suffix.lower() == ".j2":
                templates.append(
                    {
                        "name": item.name,
                        "path": str(item.relative_to(TEMPLATES_BASE_DIR)),
                    }
                )
        return templates

    # Start scanning from base dir
    base_templates = scan_dir(TEMPLATES_BASE_DIR)
    if base_templates:
        inventory["categories"].append({"name": "root", "templates": base_templates})

    # Sort categories and templates
    inventory["categories"].sort(key=lambda x: x["name"])
    for cat in inventory["categories"]:
        cat["templates"].sort(key=lambda x: x["name"])

    logger.info(
        f"Scanned templates directory: found {len(inventory['categories'])} categories"
    )
    return inventory


def get_template_by_path(template_path: str) -> Optional[Dict]:
    """
    Get a specific template by its relative path (e.g., 'protocols/bgp.j2')
    """
    full_path = TEMPLATES_BASE_DIR / template_path
    if not full_path.exists() or full_path.suffix.lower() != ".j2":
        return None

    try:
        with open(full_path, "r") as f:
            content = f.read()
        template_data = {
            "name": full_path.name,
            "path": template_path,
            "size": full_path.stat().st_size,
            "size_kb": round(full_path.stat().st_size / 1024, 2),
            "modified": full_path.stat().st_mtime,
            "content": content,
        }
        return template_data
    except Exception as e:
        logger.error(f"Error reading template {template_path}: {e}")
        return None
