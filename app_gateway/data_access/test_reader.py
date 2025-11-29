import os
from pathlib import Path
from typing import Dict, List, Optional
from loguru import logger

# --- Updated Base Directory ---
# Points to: atlas/thinknet/shared/jsnapy/testfiles
TESTS_BASE_DIR = Path("/app/shared/jsnapy/testfiles")


def scan_tests_directory() -> Dict:
    """
    Scans the tests directory and returns structured data with test files.
    Supports nested directories like:
    tests/
    ├── interfaces/
    ├── protocols/
    │   ├── test_bgp_summary.yml
    │   └── test_ospf.yml
    └── system/
        └── test_version.yml
    """
    inventory = {"tests": []}

    if not TESTS_BASE_DIR.exists():
        logger.warning(f"Tests directory not found: {TESTS_BASE_DIR}")
        return inventory

    for root, _, files in os.walk(TESTS_BASE_DIR):
        for file in files:
            if file.endswith(".yml"):
                file_path = Path(root) / file
                # Create relative path from the testfiles directory
                relative_path = file_path.relative_to(TESTS_BASE_DIR.parent)
                inventory["tests"].append(
                    {
                        "name": file,
                        "path": str(relative_path),
                        "size": file_path.stat().st_size,
                        "size_kb": round(file_path.stat().st_size / 1024, 2),
                        "modified": file_path.stat().st_mtime,
                    }
                )

    # Sort by name for readability
    inventory["tests"].sort(key=lambda x: x["path"])
    logger.info(f"Scanned {len(inventory['tests'])} test files under {TESTS_BASE_DIR}")
    return inventory


def get_test_by_path(test_path: str) -> Optional[Dict]:
    """
    Get a specific test file by its relative path
    (e.g., 'test_bgp_summary.yml' or 'testfiles/test_bgp_summary.yml')
    """
    # Handle both relative paths and direct filenames
    if test_path.startswith('testfiles/'):
        full_path = TESTS_BASE_DIR.parent / test_path
    else:
        full_path = TESTS_BASE_DIR / test_path
    if not full_path.exists() or not full_path.suffix.lower() == ".yml":
        logger.warning(f"Test file not found: {full_path}")
        return None

    try:
        with open(full_path, "r") as f:
            content = f.read()
        return {
            "name": full_path.name,
            "path": test_path,
            "size": full_path.stat().st_size,
            "size_kb": round(full_path.stat().st_size / 1024, 2),
            "modified": full_path.stat().st_mtime,
            "content": content,
        }
    except Exception as e:
        logger.error(f"Error reading test file {test_path}: {e}")
        return None
