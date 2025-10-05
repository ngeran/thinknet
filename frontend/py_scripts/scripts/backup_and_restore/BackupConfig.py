# ====================================================================================
# FILE: BackupConfig.py
# SECTION 2: BACKUP MANAGER CLASS
# Encapsulates all logic for the backup of a single device, with detailed progress.
# ====================================================================================
import json
import asyncio
from datetime import datetime
from pathlib import Path
from lxml import etree
from jnpr.junos import Device


class BackupManager:
    """Manages the backup process for a single Juniper device."""

    def __init__(
        self,
        host,
        username,
        password,
        backup_path: Path,
        step_offset: int,
        progress_callback: callable,
    ):
        self.host = host
        self.username = username
        self.password = password
        self.backup_path = backup_path
        self.step_offset = step_offset
        self.progress_callback = progress_callback
        self.dev = None

    def _save_config_files(self) -> dict:
        hostname = self.dev.facts.get("hostname", self.host)
        device_backup_path = self.backup_path / hostname
        device_backup_path.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        files_created = {}

        # XML format
        try:
            config_xml = self.dev.rpc.get_config()
            xml_content = (
                etree.tostring(config_xml, pretty_print=True)
                if config_xml is not None
                else b""
            )
            xml_filepath = device_backup_path / f"{timestamp}_{hostname}_config.xml"
            xml_filepath.write_bytes(xml_content)
            files_created["xml"] = str(xml_filepath)
        except Exception as e:
            self.progress_callback(
                "warning",
                "FILE_SAVE_ERROR",
                {"format": "xml"},
                f"XML config save failed: {e}",
            )

        # Set format
        try:
            config_set = self.dev.rpc.get_config(options={"format": "set"})
            set_content = (
                config_set.text
                if config_set is not None and hasattr(config_set, "text")
                else ""
            )
            set_filepath = device_backup_path / f"{timestamp}_{hostname}_config.set"
            set_filepath.write_text(set_content)
            files_created["set"] = str(set_filepath)
        except Exception as e:
            self.progress_callback(
                "warning",
                "FILE_SAVE_ERROR",
                {"format": "set"},
                f"Set config save failed: {e}",
            )

        # JSON format
        try:
            config_json = self.dev.rpc.get_config(options={"format": "json"})
            json_filepath = device_backup_path / f"{timestamp}_{hostname}_config.json"
            json_filepath.write_text(json.dumps(config_json or {}, indent=4))
            files_created["json"] = str(json_filepath)
        except Exception as e:
            self.progress_callback(
                "warning",
                "FILE_SAVE_ERROR",
                {"format": "json"},
                f"JSON config save failed: {e}",
            )

        # Text/conf format
        try:
            config_text = self.dev.rpc.get_config(options={"format": "text"})
            text_content = (
                config_text.text
                if config_text is not None and hasattr(config_text, "text")
                else ""
            )
            text_filepath = device_backup_path / f"{timestamp}_{hostname}_config.conf"
            text_filepath.write_text(text_content)
            files_created["text"] = str(text_filepath)
        except Exception as e:
            self.progress_callback(
                "warning",
                "FILE_SAVE_ERROR",
                {"format": "text"},
                f"Text config save failed: {e}",
            )

        return files_created

    async def run_backup(self) -> tuple:
        connect_step = self.step_offset + 1
        backup_step = self.step_offset + 2
        try:
            # --- Step 1: Connect to Device ---
            self.progress_callback(
                "info",
                "STEP_START",
                {"step": connect_step},
                f"Connecting to {self.host}...",
            )
            self.dev = Device(
                host=self.host,
                user=self.username,
                password=self.password,
                gather_facts=True,
                normalize=True,
            )
            try:
                await asyncio.to_thread(self.dev.open)
            except Exception as connect_err:
                # More detailed error handling for connection/authentication
                err_msg = str(connect_err)
                if (
                    "Authentication failed" in err_msg
                    or "permission" in err_msg.lower()
                ):
                    user_msg = "Authentication failed: Check username/password."
                elif "Timeout" in err_msg or "timed out" in err_msg.lower():
                    user_msg = "Connection timed out: Device unreachable."
                elif (
                    "unknown host" in err_msg.lower() or "not known" in err_msg.lower()
                ):
                    user_msg = "DNS/host error: Hostname not found."
                else:
                    user_msg = f"Connection failed: {err_msg}"

                self.progress_callback(
                    "error",
                    "STEP_COMPLETE",
                    {"step": connect_step, "status": "FAILED"},
                    user_msg,
                )
                return ("FAILED", {"host": self.host, "error": user_msg})

            hostname = self.dev.facts.get("hostname", self.host)
            self.progress_callback(
                "success",
                "STEP_COMPLETE",
                {"step": connect_step, "status": "COMPLETED"},
                f"Successfully connected to {hostname}",
            )

            # --- Step 2: Perform Backup ---
            self.progress_callback(
                "info",
                "STEP_START",
                {"step": backup_step},
                f"Starting backup for {hostname}...",
            )
            try:
                files = await asyncio.to_thread(self._save_config_files)
            except Exception as backup_error:
                self.progress_callback(
                    "error",
                    "STEP_COMPLETE",
                    {"step": backup_step, "status": "FAILED"},
                    f"Backup failed: {backup_error}",
                )
                return (
                    "FAILED",
                    {"host": self.host, "error": f"Backup failed: {backup_error}"},
                )

            self.progress_callback(
                "success",
                "STEP_COMPLETE",
                {"step": backup_step, "status": "COMPLETED"},
                f"Backup for {hostname} successful",
            )
            return (
                "SUCCESS",
                {"host": self.host, "hostname": hostname, "files": files},
            )

        except Exception as e:
            error_message = f"Unexpected error for {self.host}: {str(e)}"
            self.progress_callback(
                "error",
                "STEP_COMPLETE",
                {"step": connect_step, "status": "FAILED"},
                error_message,
            )
            return ("FAILED", {"host": self.host, "error": error_message})

        finally:
            if self.dev and self.dev.connected:
                self.dev.close()

