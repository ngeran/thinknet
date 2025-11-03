"""
Main device upgrader class orchestrating the complete upgrade process.

Manages the complete upgrade lifecycle including pre-checks, installation,
reboot, validation, and automatic rollback on failure.
"""

import time
import logging
from typing import Tuple

from jnpr.junos.exception import ConnectError, RpcError

from connectivity.device_connector import DeviceConnector
from validation.pre_check_engine import EnhancedPreCheckEngine
from validation.post_upgrade_validator import PostUpgradeValidator
from validation.version_manager import compare_versions
from progress.event_sender import (
    send_device_progress,
    send_operation_complete,
    send_upgrade_progress,
)
from progress.formatter import HumanReadableFormatter
from upgrade.rollback_manager import RollbackManager
from upgrade.software_installer import SoftwareInstaller

from core.dataclasses import DeviceStatus, UpgradeResult
from core.enums import UpgradePhase, VersionAction
from core.constants import STEPS_PER_DEVICE
from core.exceptions import (
    PreCheckFailure,
    InstallationFailure,
    RebootTimeoutError,
    ValidationError,
)

logger = logging.getLogger(__name__)


class DeviceUpgrader:
    """
    Main orchestrator for Juniper device software upgrades.

    Manages the complete upgrade lifecycle with enhanced pre-checks,
    rollback, and validation.
    """

    def __init__(
        self,
        hostname: str,
        username: str,
        password: str,
        target_version: str,
        image_filename: str,
        vendor: str = "juniper",
        platform: str = "srx",
        skip_pre_check: bool = False,
        force_upgrade: bool = False,
    ):
        """
        Initialize device upgrader.

        Args:
            hostname: Device hostname or IP address
            username: Authentication username
            password: Authentication password
            target_version: Target software version
            image_filename: Image filename (must exist in /var/tmp/)
            vendor: Device vendor (default: juniper)
            platform: Device platform (default: srx)
            skip_pre_check: Skip pre-upgrade checks
            force_upgrade: Proceed despite warnings
        """
        self.hostname = hostname
        self.username = username
        self.password = password
        self.target_version = target_version
        self.image_filename = image_filename
        self.vendor = vendor
        self.platform = platform
        self.skip_pre_check = skip_pre_check
        self.force_upgrade = force_upgrade

        self.connector = DeviceConnector(hostname, username, password)
        self.status = DeviceStatus(hostname, target_version)
        self.formatter = HumanReadableFormatter()
        self.pre_upgrade_facts = {}

    def get_current_version(self) -> str:
        """
        Retrieve current software version from device.

        Returns:
            Current software version string
        """
        try:
            facts = self.connector.get_device_facts()
            current_version = facts.get("version", "unknown")

            # Store additional facts for post-upgrade comparison
            self.pre_upgrade_facts = {
                "version": current_version,
                "hostname": facts.get("hostname", "unknown"),
                "model": facts.get("model", "unknown"),
                "serial_number": facts.get("serialnumber", "unknown"),
            }

            logger.info(f"[{self.hostname}] Current version: {current_version}")
            return current_version

        except Exception as e:
            logger.error(f"[{self.hostname}] ❌ Failed to get current version: {e}")
            raise

    def run_pre_checks(self) -> bool:
        """
        Execute comprehensive pre-upgrade validation checks.

        Returns:
            True if checks pass or warnings only, False if critical failures
        """
        try:
            self.status.update_phase(
                UpgradePhase.PRE_CHECK, "Running pre-upgrade validation checks"
            )

            send_device_progress(
                self.status, 1, STEPS_PER_DEVICE, "Running pre-upgrade checks"
            )

            engine = EnhancedPreCheckEngine(
                self.connector.device, self.hostname, self.image_filename
            )
            pre_check_summary = engine.run_all_checks()
            self.status.pre_check_summary = pre_check_summary

            # Display results
            self.formatter.print_check_results_table(pre_check_summary)
            from progress.event_sender import send_pre_check_results

            send_pre_check_results(self.status)

            if not pre_check_summary.can_proceed:
                if self.force_upgrade:
                    logger.warning(
                        f"[{self.hostname}] ⚠️  Pre-checks failed but force_upgrade enabled, proceeding anyway"
                    )
                    self.status.add_warning(
                        "Pre-checks failed but force upgrade enabled"
                    )
                    return True
                else:
                    logger.error(
                        f"[{self.hostname}] ❌ Pre-checks failed and force upgrade not enabled"
                    )
                    return False

            return True

        except Exception as e:
            logger.error(f"[{self.hostname}] ❌ Pre-check execution failed: {e}")
            if self.force_upgrade:
                logger.warning(
                    f"[{self.hostname}] ⚠️  Pre-check failed but force_upgrade enabled"
                )
                return True
            return False

    def perform_upgrade(self) -> UpgradeResult:
        """
        Execute complete upgrade process with all steps.

        Includes pre-checks, installation, reboot, recovery, validation,
        and automatic rollback on failure.

        Returns:
            UpgradeResult with complete upgrade outcome
        """
        start_time = time.time()
        upgrade_result = UpgradeResult(
            success=False,
            start_time=start_time,
            end_time=0,
            initial_version=self.status.current_version,
        )

        try:
            current_step = 1

            # STEP 1: Pre-Checks (unless skipped)
            if not self.skip_pre_check:
                upgrade_result.add_step(
                    "pre_checks", "in_progress", "Running pre-upgrade checks"
                )
                send_device_progress(
                    self.status, current_step, STEPS_PER_DEVICE, "Running pre-checks"
                )

                if not self.run_pre_checks():
                    upgrade_result.add_step("pre_checks", "failed", "Pre-checks failed")
                    upgrade_result.errors.append("Pre-check validation failed")
                    upgrade_result.end_time = time.time()
                    raise PreCheckFailure(
                        "Pre-check validation failed",
                        "Review failed checks and address critical issues",
                    )

                upgrade_result.add_step("pre_checks", "completed", "Pre-checks passed")
                current_step += 1

            # STEP 2: Version Validation
            upgrade_result.add_step(
                "validation", "in_progress", "Validating version compatibility"
            )
            send_device_progress(
                self.status, current_step, STEPS_PER_DEVICE, "Validating versions"
            )

            current_version = self.get_current_version()
            version_action = compare_versions(current_version, self.target_version)
            upgrade_result.version_action = version_action
            self.status.version_action = version_action

            if version_action == VersionAction.SAME_VERSION and not self.force_upgrade:
                upgrade_result.add_step(
                    "validation", "skipped", "Already on target version"
                )
                upgrade_result.success = True
                upgrade_result.final_version = current_version
                upgrade_result.warnings.append("Device already running target version")
                upgrade_result.end_time = time.time()
                return upgrade_result

            from validation.version_manager import get_version_change_risk

            risk_level = get_version_change_risk(version_action)
            logger.info(
                f"[{self.hostname}] Version change: {version_action.value} (Risk: {risk_level})"
            )

            upgrade_result.add_step(
                "validation", "completed", f"Version action: {version_action.value}"
            )
            current_step += 1

            # STEP 3: Software Installation
            upgrade_result.add_step(
                "software_install", "in_progress", "Installing software package"
            )
            self.status.update_phase(
                UpgradePhase.INSTALLING, "Installing software package"
            )
            send_device_progress(
                self.status, current_step, STEPS_PER_DEVICE, "Installing software"
            )

            installer = SoftwareInstaller(
                self.connector, self.status, self.image_filename
            )
            install_success, install_message = installer.perform_installation()

            if not install_success:
                upgrade_result.add_step(
                    "software_install",
                    "failed",
                    f"Installation failed: {install_message}",
                )
                upgrade_result.errors.append(install_message)
                upgrade_result.end_time = time.time()
                raise InstallationFailure(
                    install_message, "Check device logs and verify image file integrity"
                )

            upgrade_result.add_step(
                "software_install", "completed", "Software installation successful"
            )
            upgrade_result.reboot_required = True
            upgrade_result.reboot_performed = True
            current_step += 1

            # STEP 4: Wait for Reboot and Recovery
            upgrade_result.add_step(
                "reboot_wait", "in_progress", "Waiting for device reboot"
            )
            self.status.update_phase(
                UpgradePhase.REBOOTING, "Device rebooting after upgrade"
            )
            send_device_progress(
                self.status, current_step, STEPS_PER_DEVICE, "Device rebooting"
            )

            reboot_start = time.time()
            from connectivity.reachability import wait_for_device_recovery

            recovery_success, recovery_message = wait_for_device_recovery(
                self.hostname, self.username, self.password
            )
            upgrade_result.reboot_wait_time = time.time() - reboot_start

            if not recovery_success:
                upgrade_result.add_step(
                    "reboot_wait",
                    "failed",
                    f"Device recovery failed: {recovery_message}",
                )
                upgrade_result.errors.append(recovery_message)
                upgrade_result.end_time = time.time()
                raise RebootTimeoutError(
                    recovery_message,
                    "Check device console or physical access for recovery",
                )

            upgrade_result.add_step(
                "reboot_wait", "completed", "Device recovered after reboot"
            )
            current_step += 1

            # STEP 5: Verify Final Version and Run Post-Upgrade Validation
            upgrade_result.add_step(
                "verification", "in_progress", "Verifying final version"
            )
            self.status.update_phase(
                UpgradePhase.VERIFYING, "Verifying upgrade success"
            )
            send_device_progress(
                self.status, current_step, STEPS_PER_DEVICE, "Verifying upgrade"
            )

            # Reconnect to get final version
            with self.connector.connect():
                final_version = self.get_current_version()
                upgrade_result.final_version = final_version

                # STEP 6: Post-Upgrade Functional Validation
                current_step += 1
                send_device_progress(
                    self.status,
                    current_step,
                    STEPS_PER_DEVICE,
                    "Running post-upgrade validation",
                )

                validator = PostUpgradeValidator(
                    self.connector.device, self.hostname, self.pre_upgrade_facts
                )
                validation_success, validation_warnings = (
                    validator.run_all_validations()
                )

                if validation_warnings:
                    upgrade_result.warnings.extend(validation_warnings)

                if not validation_success:
                    logger.error(
                        f"[{self.hostname}] ❌ Post-upgrade validation failed critically"
                    )
                    upgrade_result.add_step(
                        "post_validation", "failed", "Post-upgrade validation failed"
                    )

                    # Initiate rollback
                    if not self.force_upgrade:
                        raise ValidationError(
                            "Post-upgrade validation failed",
                            "Device will be rolled back to previous version",
                        )
                else:
                    upgrade_result.add_step(
                        "post_validation", "completed", "Post-upgrade validation passed"
                    )

                # Version verification
                if final_version == self.target_version:
                    upgrade_result.add_step(
                        "verification",
                        "completed",
                        f"Successfully upgraded to {final_version}",
                    )
                    upgrade_result.success = True
                else:
                    upgrade_result.add_step(
                        "verification",
                        "completed",
                        f"Upgrade completed but version mismatch: {final_version}",
                    )
                    upgrade_result.warnings.append(
                        f"Version mismatch: expected {self.target_version}, got {final_version}"
                    )
                    upgrade_result.success = (
                        True  # Still consider successful if running
                    )

            # FINAL: Mark Completion
            self.status.update_phase(
                UpgradePhase.COMPLETED, "Upgrade completed successfully"
            )
            upgrade_result.end_time = time.time()
            upgrade_result.calculate_duration()

            logger.info(
                f"[{self.hostname}] ✅ Upgrade completed successfully in {upgrade_result.upgrade_duration:.1f}s"
            )
            return upgrade_result

        except (
            PreCheckFailure,
            InstallationFailure,
            RebootTimeoutError,
            ValidationError,
        ) as e:
            # Known upgrade errors - attempt rollback if appropriate
            return self._handle_upgrade_failure(upgrade_result, e, start_time)

        except Exception as e:
            # Unexpected errors
            error_msg = f"Unexpected upgrade error: {str(e)}"
            logger.error(f"[{self.hostname}] ❌ {error_msg}")
            upgrade_result.errors.append(error_msg)
            upgrade_result.end_time = time.time()
            upgrade_result.calculate_duration()
            self.status.update_phase(UpgradePhase.FAILED, error_msg)
            return upgrade_result

    def _handle_upgrade_failure(
        self, upgrade_result: UpgradeResult, exception: Exception, start_time: float
    ) -> UpgradeResult:
        """Handle upgrade failure with rollback attempt."""
        logger.error(f"[{self.hostname}] ❌ Upgrade failed: {exception.message}")

        if isinstance(exception, (InstallationFailure, ValidationError)):
            # Attempt automatic rollback
            logger.warning(f"[{self.hostname}] 🔙 Attempting automatic rollback...")

            try:
                with self.connector.connect():
                    rollback_mgr = RollbackManager(
                        self.connector.device, self.hostname, self.status
                    )
                    rollback_success, rollback_msg = rollback_mgr.perform_rollback(
                        exception.message
                    )

                    if rollback_success:
                        # Wait for rollback recovery
                        recovery_success, recovery_msg = (
                            rollback_mgr.wait_for_rollback_recovery(
                                self.username, self.password
                            )
                        )

                        if recovery_success:
                            upgrade_result.rollback_performed = True
                            upgrade_result.rollback_reason = exception.message
                            self.status.update_phase(
                                UpgradePhase.ROLLED_BACK,
                                "Upgrade failed and rolled back successfully",
                            )
                            logger.info(
                                f"[{self.hostname}] ✅ Rollback completed successfully"
                            )
                        else:
                            upgrade_result.errors.append(
                                f"Rollback recovery failed: {recovery_msg}"
                            )
                    else:
                        upgrade_result.errors.append(f"Rollback failed: {rollback_msg}")

            except Exception as rollback_error:
                logger.error(
                    f"[{self.hostname}] ❌ Rollback attempt failed: {rollback_error}"
                )
                upgrade_result.errors.append(
                    f"Rollback attempt failed: {str(rollback_error)}"
                )

        upgrade_result.errors.append(exception.message)
        if hasattr(exception, "remediation") and exception.remediation:
            upgrade_result.warnings.append(f"Remediation: {exception.remediation}")

        upgrade_result.end_time = time.time()
        upgrade_result.calculate_duration()
        self.status.update_phase(UpgradePhase.FAILED, exception.message)
        return upgrade_result

    def run_upgrade(self) -> bool:
        """
        Main entry point to run complete upgrade process.

        Manages device connection lifecycle and orchestrates all upgrade steps.

        Returns:
            True if upgrade succeeded, False otherwise
        """
        self.status.start_time = time.time()

        self.formatter.print_banner(
            f"JUNIPER DEVICE UPGRADE - {self.hostname}", width=100
        )

        print(f"\n📋 UPGRADE DETAILS:")
        print(f"   Device: {self.hostname}")
        print(f"   Target Version: {self.target_version}")
        print(f"   Image File: {self.image_filename}")
        print(f"   Platform: {self.platform}")
        print(f"   Skip Pre-Check: {self.skip_pre_check}")
        print(f"   Force Upgrade: {self.force_upgrade}")
        print(f"   Started: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}")
        print(f"{'─' * 100}\n")

        try:
            # Initial connection and version check
            self.status.update_phase(UpgradePhase.CONNECTING, "Connecting to device")
            send_device_progress(
                self.status, 0, STEPS_PER_DEVICE, "Connecting to device"
            )

            with self.connector.connect():
                # Get initial version
                self.status.current_version = self.get_current_version()
                self.status.version_action = compare_versions(
                    self.status.current_version, self.target_version
                )

                # Perform the actual upgrade
                upgrade_result = self.perform_upgrade()
                self.status.set_upgrade_result(upgrade_result)
                self.status.end_time = time.time()

                # Send final results
                send_operation_complete(
                    self.status,
                    upgrade_result.success,
                    "Upgrade completed successfully"
                    if upgrade_result.success
                    else "Upgrade failed",
                )

                # Display human-readable results
                self.formatter.print_upgrade_results(self.status)

                return upgrade_result.success

        except ConnectError as e:
            error_msg = f"Connection failed: {str(e)}"
            logger.error(f"[{self.hostname}] ❌ {error_msg}")
            self.status.error = error_msg
            self.status.error_type = "ConnectionError"
            self.status.update_phase(UpgradePhase.FAILED, error_msg)
            send_operation_complete(self.status, False, error_msg)

            print(f"\n❌ CONNECTION ERROR: {error_msg}")
            print(
                f"💡 Remediation: Verify network connectivity and device accessibility"
            )
            return False

        except Exception as e:
            error_msg = f"Unexpected error: {str(e)}"
            logger.error(f"[{self.hostname}] ❌ {error_msg}")
            self.status.error = error_msg
            self.status.error_type = "UnexpectedError"
            self.status.update_phase(UpgradePhase.FAILED, error_msg)
            send_operation_complete(self.status, False, error_msg)

            print(f"\n❌ UNEXPECTED ERROR: {error_msg}")
            print(f"💡 Remediation: Review logs and contact support if issue persists")
            return False
