#!/usr/bin/env python3
# =================================================================================================
#
# FILE:               RestoreConfig.py (Worker - CORRECTED with Path Fix)
#
# OVERVIEW:
#   This file contains the `RestoreManager` class, a dedicated "worker" responsible for
#   handling the configuration restore logic for a single Juniper device. It is designed
#   to be instantiated and controlled by an asynchronous orchestrator (`run.py`).
#
# KEY FEATURES:
#   - Asynchronous Execution: Uses `asyncio.to_thread` to execute synchronous, blocking
#     PyEZ operations in a separate thread, ensuring the application remains responsive.
#   - Reliable XML-First Restore: Prioritizes the XML backup file for restores, which is
#     the most reliable format for programmatic configuration management.
#   - Graceful "No Changes" Handling: Intelligently detects when a restore operation
#     results in no changes and sends a specific completion event for the UI.
#   - Decoupled Progress Reporting: Uses a callback function to send detailed progress
#     updates, making it highly reusable.
#
# =================================================================================================

# =================================================================================================
# SECTION 1: IMPORTS
# =================================================================================================
import asyncio
from typing import Any
from pathlib import Path  # Ensure Path is imported if the class is in a separate file

# --- ### THE FIX IS HERE ### ---
# The PyEZ imports must be wrapped in a `try...except` block to handle cases
# where the library might not be installed, and to have correct Python syntax.
try:
    from jnpr.junos import Device
    from jnpr.junos.utils.config import Config
    # We don't need to import the exceptions here as they are handled in the calling orchestrator.
except ImportError as e:
    # This is a critical failure. We raise it immediately to stop the script.
    raise ImportError(f"Missing critical PyEZ dependency: {e}")


# =================================================================================================
# SECTION 2: RESTORE MANAGER CLASS
# Encapsulates all logic for the restore operation on a single device.
# =================================================================================================
class RestoreManager:
    """Manages the restore process for a single Juniper device."""

    def __init__(
        self,
        host,
        username,
        password,
        backup_path,
        backup_file,
        restore_type,
        confirmed_timeout,
        commit_timeout,
        step_offset,
        progress_callback,
    ):
        """Initializes the manager for a specific device restore operation."""
        self.host = host
        self.username = username
        self.password = password
        # NOTE: backup_path is expected to be a Path object passed from run.py (/backups)
        self.backup_path = backup_path
        self.backup_file = backup_file
        self.restore_type = restore_type
        self.confirmed_timeout = confirmed_timeout
        self.commit_timeout = commit_timeout
        self.step_offset = step_offset
        self.progress_callback = progress_callback
        self.dev = None  # The PyEZ Device object.

    async def run_restore(self) -> tuple:
        """
        The main asynchronous method that orchestrates the entire restore process.
        """
        # Define the step numbers for this operation for clear progress reporting.
        connect_step, validate_step, load_step, commit_step = (
            self.step_offset + 1,
            self.step_offset + 2,
            self.step_offset + 3,
            self.step_offset + 4,
        )

        try:
            # -------------------------------------------------------------------------------------
            # STEP 1: Connect to Device
            # -------------------------------------------------------------------------------------
            self.progress_callback(
                "info",
                "STEP_START",
                {"step": connect_step},
                f"Connecting to {self.host} for restore...",
            )
            self.dev = Device(
                host=self.host,
                user=self.username,
                password=self.password,
                gather_facts=True,
                normalize=True,
            )
            await asyncio.to_thread(self.dev.open)
            hostname = self.dev.facts.get("hostname", self.host)
            self.progress_callback(
                "success",
                "STEP_COMPLETE",
                {"step": connect_step, "status": "COMPLETED"},
                f"Successfully connected to {hostname}",
            )

            # -------------------------------------------------------------------------------------
            # STEP 2: Validate Backup File Existence (PATH RESOLUTION FIX APPLIED HERE)
            # -------------------------------------------------------------------------------------
            self.progress_callback(
                "info",
                "STEP_START",
                {"step": validate_step},
                "Locating and validating backup file...",
            )

            # --- FIX: Construct the full, absolute path to the XML backup file ---

            # The base path where all backups are stored (e.g., /backups)
            base_backup_root = self.backup_path
            # The subdirectory where the specific device's backups are stored (e.g., /backups/juniper-router)
            device_backup_dir = base_backup_root / hostname

            # The backup_file argument from the orchestrator is the original file name
            # (e.g., junos_2025-10-18_10-00-00_config.txt) which we use to derive the XML name.
            base_backup_name = self.backup_file.split("_config.")[0]
            xml_backup_filename = f"{base_backup_name}_config.xml"

            # The final, absolute path to the required XML file (e.g., /backups/juniper-router/junos_..._config.xml)
            xml_backup_path = device_backup_dir / xml_backup_filename

            # ----------------------------------------------------------------------

            if not await asyncio.to_thread(xml_backup_path.is_file):
                raise FileNotFoundError(
                    f"The required XML backup file '{xml_backup_filename}' was not found at {device_backup_dir}."
                )
            self.progress_callback(
                "success",
                "STEP_COMPLETE",
                {"step": validate_step, "status": "COMPLETED"},
                f"Found reliable XML backup: {xml_backup_filename}",
            )

            # Use a context manager for safe, automatic configuration locking and unlocking.
            with Config(self.dev, mode="private") as cu:
                # ---------------------------------------------------------------------------------
                # STEP 3: Load Configuration and Check for Differences
                # ---------------------------------------------------------------------------------
                self.progress_callback(
                    "info",
                    "STEP_START",
                    {"step": load_step},
                    f"Loading configuration from XML with mode: {self.restore_type}",
                )
                load_args = {"path": str(xml_backup_path), "format": "xml"}
                if self.restore_type == "override":
                    load_args["overwrite"] = True
                elif self.restore_type == "merge":
                    load_args["merge"] = True

                await asyncio.to_thread(cu.load, **load_args)
                diff = await asyncio.to_thread(cu.diff)

                if not diff:
                    self.progress_callback(
                        "success",
                        "STEP_COMPLETE",
                        {"step": load_step, "status": "COMPLETED"},
                        "No configuration changes detected.",
                    )
                    self.progress_callback(
                        "success",
                        "STEP_COMPLETE",
                        {"step": commit_step, "status": "COMPLETED"},
                        "Skipped: No changes to commit.",
                    )
                    return (
                        "SUCCESS",
                        {
                            "host": self.host,
                            "hostname": hostname,
                            "message": "Device is already compliant. No configuration changes needed.",
                        },
                    )

                self.progress_callback(
                    "success",
                    "STEP_COMPLETE",
                    {"step": load_step, "status": "COMPLETED"},
                    "Configuration loaded successfully. Changes detected.",
                )

                # ---------------------------------------------------------------------------------
                # STEP 4: Commit Configuration (only runs if a diff was found)
                # ---------------------------------------------------------------------------------
                self.progress_callback(
                    "info",
                    "STEP_START",
                    {"step": commit_step},
                    "Committing changes to the device...",
                )
                commit_args = {
                    "comment": f"Restore from {xml_backup_filename}",
                    "timeout": self.commit_timeout,
                }
                if self.confirmed_timeout > 0:
                    commit_args["confirmed"] = True
                    commit_args["confirm_timeout"] = str(self.confirmed_timeout)
                await asyncio.to_thread(cu.commit, **commit_args)
                self.progress_callback(
                    "success",
                    "STEP_COMPLETE",
                    {"step": commit_step, "status": "COMPLETED"},
                    "Commit successful.",
                )

            return (
                "SUCCESS",
                {
                    "host": self.host,
                    "hostname": hostname,
                    "message": "Restore operation completed successfully.",
                },
            )

        except Exception as e:
            # -------------------------------------------------------------------------------------
            # Global Error Handler
            # -------------------------------------------------------------------------------------
            error_message = (
                f"Failed to restore on {self.host}: {e.__class__.__name__}: {str(e)}"
            )
            # Mark the first step as failed for a clear UI indication.
            self.progress_callback(
                "error",
                "STEP_COMPLETE",
                {"step": connect_step, "status": "FAILED"},
                error_message,
            )
            return ("FAILED", {"host": self.host, "error": error_message})

        finally:
            # -------------------------------------------------------------------------------------
            # Cleanup
            # -------------------------------------------------------------------------------------
            if self.dev and self.dev.connected:
                await asyncio.to_thread(self.dev.close)
