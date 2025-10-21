import os
from pathlib import Path
from typing import Dict, List, Optional
from loguru import logger

# Define the base directory for tests
TESTS_BASE_DIR = Path("/app/shared/data/tests")


def scan_tests_directory() -> Dict:
    """
    Scans the tests directory and returns structured data with test files
    Expected directory structure:
    shared/data/tests/
    ├── test_bgp_summary.yml
    ├── test_ospf.yml
    └── test_version.yml
    """
    inventory = {"tests": []}

    if not TESTS_BASE_DIR.exists():
        logger.warning(f"Tests directory not found: {TESTS_BASE_DIR}")
        return inventory

    for item in TESTS_BASE_DIR.iterdir():
        if item.is_file() and item.suffix.lower() == ".yml":
            inventory["tests"].append(
                {
                    "name": item.name,
                    "path": str(item.relative_to(TESTS_BASE_DIR.parent)),
                    "size": item.stat().st_size,
                    "size_kb": round(item.stat().st_size / 1024, 2),
                    "modified": item.stat().st_mtime,
                }
            )

    # Sort tests by name
    inventory["tests"].sort(key=lambda x: x["name"])
    logger.info(f"Scanned tests directory: found {len(inventory['tests'])} test files")
    return inventory


def get_test_by_path(test_path: str) -> Optional[Dict]:
    """
    Get a specific test file by its relative path (e.g., 'tests/test_bgp_summary.yml')
    """
    full_path = TESTS_BASE_DIR.parent / test_path
    if not full_path.exists() or full_path.suffix.lower() != ".yml":
        return None

    try:
        with open(full_path, "r") as f:
            content = f.read()
        test_data = {
            "name": full_path.name,
            "path": test_path,
            "size": full_path.stat().st_size,
            "size_kb": round(full_path.stat().st_size / 1024, 2),
            "modified": full_path.stat().st_mtime,
            "content": content,
        }
        return test_data
    except Exception as e:
        logger.error(f"Error reading test file {test_path}: {e}")
        return None
