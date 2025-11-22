"""
Safe JSON serialization utilities.

Provides utilities for handling complex Python objects, enums, and
nested data structures during JSON serialization.
"""

from typing import Any
from enum import Enum


def safe_json_serialize(obj: Any) -> Any:
    """
    Recursively serialize Python objects to JSON-compatible types.

    Handles Enums, dataclasses, nested collections, and provides fallbacks
    for unserializable objects.

    Args:
        obj: Any Python object to serialize

    Returns:
        JSON-compatible representation of the object
    """
    if obj is None:
        return None
    elif isinstance(obj, (str, int, float, bool)):
        return obj
    elif isinstance(obj, dict):
        return {k: safe_json_serialize(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [safe_json_serialize(item) for item in obj]
    elif isinstance(obj, Enum):
        return obj.value
    elif hasattr(obj, "__dict__"):
        try:
            return safe_json_serialize(obj.__dict__)
        except Exception:
            try:
                return str(obj)
            except Exception:
                return "UNSERIALIZABLE_OBJECT"
    else:
        try:
            return str(obj)
        except Exception:
            return "UNSERIALIZABLE_OBJECT"
