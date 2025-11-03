"""
Software installation management with fallback strategies.

Handles Junos software package installation using PyEZ SW.install() with
comprehensive validation, progress tracking, and automatic fallback to
installation without validation when needed.
"""

import logging
from typing import Tuple

from jnpr.junos.exception import RpcError

from connectivity.device_connector import DeviceConnector
from progress.event_sender import send_upgrade_progress

from core.dataclasses import DeviceStatus
from core.constants import DEFAULT_OPERATION_TIMEOUT
from core.exceptions import InstallationFailure

logger = logging.getLogger(__name__)


class SoftwareInstaller:
    """
    Manages software installation with validation and fallback strategies.

    Provides robust software installation with:
    - Primary installation with full package validation
    - Fallback to installation without validation when validation fails
    - Real-time progress reporting for frontend integration
    - Comprehensive error handling and logging
    """

    def __init__(
        self,
        connector: DeviceConnector,
        device_status: DeviceStatus,
        image_filename: str,
    ):
        """
        Initialize software installer with device connection and upgrade details.

        Args:
            connector: Device connector instance for Junos communication
            device_status: Current device status and upgrade context
            image_filename: Actual image filename to install (e.g., 'junos-install-srxsme-mips-64-25.2R1-S1.4.tgz')
        """
        self.connector = connector
        self.device_status = device_status
        self.hostname = device_status.hostname
        self.image_filename = (
            image_filename  # Store the actual filename for package installation
        )

    def _upgrade_progress_callback(self, dev, report):
        """
        Callback for SW.install() progress updates.

        Receives progress reports from PyEZ and forwards to frontend
        with structured JSON events for real-time UI updates.

        Args:
            dev: Device object (unused but required by PyEZ callback signature)
            report: Progress report (dict with progress info or string message)
        """
        logger.info(f"[{self.hostname}] 📦 Upgrade progress: {report}")

        progress_message = "Installing software package"
        progress_percent = 0

        # Parse different report formats from PyEZ
        if isinstance(report, dict):
            if "progress" in report:
                progress_percent = report["progress"]
            elif "message" in report:
                progress_message = report["message"]
            elif "status" in report:
                progress_message = report["status"]
        elif isinstance(report, str):
            progress_message = report

        # Send structured progress event to frontend
        send_upgrade_progress(
            self.device_status,
            "software_install",
            "in_progress",
            progress_percent,
            progress_message,
        )

    def perform_installation(self) -> Tuple[bool, str]:
        """
        Perform software installation with validation-first approach.

        Attempts installation with full package validation first, then falls back
        to installation without validation if validation fails. This provides the
        safest upgrade path while maintaining compatibility with various Junos versions.

        Returns:
            Tuple of (success: bool, message: str) indicating installation outcome

        Raises:
            InstallationFailure: When both validation and fallback installation methods fail
        """
        try:
            logger.info(f"[{self.hostname}] 🚀 Starting software installation")
            sw = self.connector.get_software_utility()

            # Primary installation attempt with full validation
            # Validation ensures package compatibility and integrity before installation
            try:
                logger.debug(
                    f"[{self.hostname}] Attempting installation with validation"
                )
                install_result = sw.install(
                    package=f"/var/tmp/{self.image_filename}",  # Use actual filename from arguments
                    progress=self._upgrade_progress_callback,
                    validate=True,  # Enable package validation for safety
                    reboot=True,  # Automatically reboot after successful installation
                    cleanfs=True,  # Clean filesystem to free up space
                    timeout=DEFAULT_OPERATION_TIMEOUT,
                    no_copy=True,  # Use existing file in /var/tmp/
                )

                # Handle different return types from PyEZ install()
                if isinstance(install_result, tuple):
                    ok, msg = install_result
                    if ok:
                        logger.info(
                            f"[{self.hostname}] ✅ Installation completed: {msg}"
                        )
                        return True, msg
                    else:
                        logger.warning(
                            f"[{self.hostname}] ⚠️  Installation with validation failed: {msg}"
                        )
                        # Fall back to installation without validation
                        return self._install_without_validation()
                else:
                    # Boolean return type (legacy PyEZ behavior)
                    if install_result:
                        logger.info(
                            f"[{self.hostname}] ✅ Installation completed successfully"
                        )
                        return True, "Installation completed"
                    else:
                        logger.warning(
                            f"[{self.hostname}] ⚠️  Installation with validation failed"
                        )
                        # Fall back to installation without validation
                        return self._install_without_validation()

            except RpcError as e:
                # Handle RPC errors specifically - some devices may not support validation
                if "validation" in str(e).lower() or "package" in str(e).lower():
                    logger.warning(
                        f"[{self.hostname}] ⚠️  Validation failed, using fallback: {e}"
                    )
                    return self._install_without_validation()
                else:
                    # Re-raise unexpected RPC errors
                    raise

        except RpcError as e:
            error_msg = f"RPC error during installation: {str(e)}"
            logger.error(f"[{self.hostname}] ❌ {error_msg}")
            return False, error_msg
        except Exception as e:
            error_msg = f"Unexpected error during installation: {str(e)}"
            logger.error(f"[{self.hostname}] ❌ {error_msg}")
            return False, error_msg

    def _install_without_validation(self) -> Tuple[bool, str]:
        """
        Fallback installation method without package validation.

        Used when package validation fails but we need to proceed with installation.
        This is less safe but necessary for devices with validation compatibility issues
        or when dealing with custom/unofficial packages.

        Returns:
            Tuple of (success: bool, message: str) indicating installation outcome
        """
        try:
            logger.info(f"[{self.hostname}] 🛠️  Using installation without validation")
            sw = self.connector.get_software_utility()

            # Installation without validation - proceed despite potential risks
            install_result = sw.install(
                package=f"/var/tmp/{self.image_filename}",  # Use actual filename from arguments
                progress=self._upgrade_progress_callback,
                validate=False,  # Skip validation (fallback mode)
                reboot=True,  # Still reboot after installation
                cleanfs=True,  # Still clean filesystem
                timeout=DEFAULT_OPERATION_TIMEOUT,
                no_copy=True,  # Use existing file
            )

            # Handle different return types from PyEZ
            if isinstance(install_result, tuple):
                ok, msg = install_result
                if ok:
                    logger.info(
                        f"[{self.hostname}] ✅ Installation without validation completed: {msg}"
                    )
                    return True, msg
                else:
                    logger.error(
                        f"[{self.hostname}] ❌ Installation without validation failed: {msg}"
                    )
                    return False, msg
            else:
                # Boolean return type
                if install_result:
                    logger.info(
                        f"[{self.hostname}] ✅ Installation without validation completed"
                    )
                    return True, "Installation completed"
                else:
                    logger.error(
                        f"[{self.hostname}] ❌ Installation without validation failed"
                    )
                    return False, "Installation failed"

        except Exception as e:
            error_msg = f"Error during installation without validation: {str(e)}"
            logger.error(f"[{self.hostname}] ❌ {error_msg}")
            return False, error_msg

    def validate_package_only(self) -> Tuple[bool, str]:
        """
        Validate software package without installing.

        Useful for pre-upgrade checks to verify package integrity and compatibility
        before committing to the full installation process.

        Returns:
            Tuple of (valid: bool, message: str) indicating validation result
        """
        try:
            logger.info(f"[{self.hostname}] 🔍 Validating software package")
            sw = self.connector.get_software_utility()

            # Use validate=True but without actual installation
            validation_result = sw.install(
                package=f"/var/tmp/{self.image_filename}",
                progress=self._upgrade_progress_callback,
                validate=True,
                reboot=False,  # Don't reboot for validation-only
                cleanfs=False,  # Don't clean filesystem for validation
                no_copy=True,
            )

            if isinstance(validation_result, tuple):
                ok, msg = validation_result
                if ok:
                    logger.info(
                        f"[{self.hostname}] ✅ Package validation successful: {msg}"
                    )
                    return True, msg
                else:
                    logger.warning(
                        f"[{self.hostname}] ⚠️  Package validation failed: {msg}"
                    )
                    return False, msg
            else:
                success = bool(validation_result)
                status = "successful" if success else "failed"
                logger.info(f"[{self.hostname}] ✅ Package validation {status}")
                return success, f"Package validation {status}"

        except Exception as e:
            error_msg = f"Package validation error: {str(e)}"
            logger.error(f"[{self.hostname}] ❌ {error_msg}")
            return False, error_msg
