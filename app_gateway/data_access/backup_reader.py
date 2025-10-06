# File Path: app_gateway/data_access/backup_reader.py

import os
from pathlib import Path
from typing import Dict, List

# Define the base directory for backups, relative to the container's WORKDIR (/app)
# Docker volume mounting ensures '/app/shared' maps to your host's './shared'.
BACKUP_BASE_DIR = Path("/app/shared/data/backups")

def get_backup_structure() -> Dict[str, List[str]]:
    """
    Scans the BACKUP_BASE_DIR for device folders and lists the backups inside each.
    
    Returns:
        dict: { "DeviceName": ["backup_file_1", "backup_file_2"], ... }
    """
    backup_data: Dict[str, List[str]] = {}
    
    # 1. Check if the base directory exists
    if not BACKUP_BASE_DIR.is_dir():
        # In a real app, this should log an error, but for development, a warning is fine.
        print(f"Warning: Backup directory not found at {BACKUP_BASE_DIR}")
        return {}

    # 2. Iterate through device folders
    for device_dir in BACKUP_BASE_DIR.iterdir():
        # Check if the item is a directory (representing a device)
        if device_dir.is_dir():
            device_name = device_dir.name
            backup_files: List[str] = []
            
            # 3. Iterate through files inside the device directory
            for backup_file in device_dir.iterdir():
                # Only include actual files (excluding directories, .DS_Store, etc.)
                if backup_file.is_file():
                    file_name = backup_file.name
                    backup_files.append(file_name)
            
            # 4. Store the results, sorted by name (which acts as a reverse chronological sort due to timestamp prefix)
            if backup_files:
                backup_data[device_name] = sorted(backup_files, reverse=True)
                
    return backup_data

# Example of how you might want to strip file extensions to group by timestamp:
# The current structure has 4 files per timestamp, which might confuse the user.
# For the UI dropdown, we only want unique timestamps.
def get_unique_backup_timestamps() -> Dict[str, List[str]]:
    """
    Scans the BACKUP_BASE_DIR and returns unique timestamp prefixes for backups.
    """
    raw_data = get_backup_structure()
    
    unique_structure = {}
    for device, files in raw_data.items():
        # Example: '20250926_001625_MLRENGBSMSRX01_config.conf' -> '20250926_001625'
        timestamps = set()
        for file_name in files:
            # Assumes format: YYYYMMDD_HHMMSS_...
            if file_name.count('_') >= 1:
                timestamp = '_'.join(file_name.split('_')[:2])
                timestamps.add(timestamp)
            else:
                # Fallback for simpler names like '9_18_2025.conf' (if grouping is needed later)
                timestamps.add(file_name) 
                
        # We still want the most recent backups first
        unique_structure[device] = sorted(list(timestamps), reverse=True)
        
    return unique_structure
