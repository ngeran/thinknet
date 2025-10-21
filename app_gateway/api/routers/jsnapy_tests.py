from fastapi import APIRouter, HTTPException
from loguru import logger

# Import from data_access layer
try:
    from app_gateway.data_access import test_reader
except ImportError as e:
    logger.error(f"Failed to import test_reader: {e}")
    raise

router = APIRouter()


@router.get("/tests")
async def get_tests():
    """
    Returns structured test file inventory (list of .yml files only)
    """
    try:
        inventory = test_reader.scan_tests_directory()
        logger.info(f"Returning {len(inventory['tests'])} test files")
        return inventory
    except Exception as e:
        logger.error(f"Error scanning tests: {e}")
        raise HTTPException(status_code=500, detail=f"Error scanning tests: {str(e)}")


@router.get("/tests/{test_path:path}")
async def get_test(test_path: str):
    """
    Returns a specific test file by relative path (e.g., tests/test_bgp_summary.yml)
    """
    try:
        test_data = test_reader.get_test_by_path(test_path)
        if not test_data:
            raise HTTPException(
                status_code=404,
                detail=f"Test file '{test_path}' not found",
            )
        return test_data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting test file {test_path}: {e}")
        raise HTTPException(
            status_code=500, detail=f"Error retrieving test file: {str(e)}"
        )
