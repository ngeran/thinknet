"""
Main device upgrader class orchestrating the complete upgrade process.
 
ENHANCEMENTS v4.0.0:
- Added progress_callback support for granular pre-check progress tracking
- Enhanced run_pre_checks to accept and pass callbacks to validation engine
- Improved logging for callback invocation debugging
- Maintained backward compatibility with non-callback invocations
 
PREVIOUS FEATURES:
- Complete upgrade/downgrade lifecycle management
- Enhanced pre-checks with rollback and validation
- Support for both version upgrades and downgrades
- Comprehensive risk assessment and safety checks
"""
 
import time
import logging
from typing import Optional, List, Tuple, Callable
 
from jnpr.junos.exception import ConnectError, RpcError
 
from connectivity.device_connector import DeviceConnector
from validation.pre_check_engine import EnhancedPreCheckEngine
from validation.post_upgrade_validator import PostUpgradeValidator
from validation.version_manager import (
    compare_versions,
    get_version_change_risk,
    is_downgrade_supported,
)
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
 
 
# =============================================================================
# SECTION 1: DEVICE UPGRADER CLASS
# =============================================================================
 
class DeviceUpgrader:
    """
    Main orchestrator for Juniper device software upgrades and downgrades.
 
    Manages the complete upgrade/downgrade lifecycle with enhanced pre-checks,
    rollback, and validation. Supports both version upgrades and downgrades
    with comprehensive risk assessment and safety checks.
 
    ENHANCEMENTS v4.0.0:
    - Added progress callback support for real-time check updates
    - Improved integration with pre-check engine for granular progress
    """
 
    # =========================================================================
    # SUBSECTION 1.1: INITIALIZATION
    # =========================================================================
 
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
        Initialize device upgrader with upgrade/downgrade parameters.
 
        Args:
            hostname: Device hostname or IP address
            username: Authentication username
            password: Authentication password
            target_version: Target software version (for upgrade or downgrade)
            image_filename: Image filename (must exist in /var/tmp/)
            vendor: Device vendor (default: juniper)
            platform: Device platform (default: srx)
            skip_pre_check: Skip pre-upgrade checks (not recommended)
            force_upgrade: Proceed despite warnings and critical issues
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
 
    # =========================================================================
    # SUBSECTION 1.2: VERSION RETRIEVAL
    # =========================================================================
 
    def get_current_version(self) -> str:
        """
        Retrieve current software version from device.
 
        Establishes connection and gathers device facts including version,
        model, and serial number for pre-upgrade baseline.
 
        Returns:
            Current software version string
 
        Raises:
            ConnectError: If device connection fails
            RpcError: If version information cannot be retrieved
        """
        try:
            facts = self.connector.get_device_facts()
            current_version = facts.get("version", "unknown")
 
            # Store additional facts for post-upgrade comparison and rollback
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
 
    # =========================================================================
    # SUBSECTION 1.3: PRE-CHECK EXECUTION - ENHANCED WITH CALLBACK SUPPORT
    # =========================================================================
 
    def run_pre_checks(
        self,
        selected_check_ids: Optional[List[str]] = None,
        progress_callback: Optional[Callable[[str, int, int, bool], None]] = None
    ) -> bool:
        """
        Execute comprehensive pre-upgrade validation checks.
 
        Performs safety checks including storage, hardware health, and
        protocol stability. Critical failures block upgrade unless
        force_upgrade is enabled.
 
        ENHANCEMENT v4.0.0:
        - Added progress_callback parameter to pass through to pre-check engine
        - Enables real-time progress updates during check execution
        - Callback is invoked after each individual check completes
        - Provides granular visibility into long-running validation process
 
        Args:
            selected_check_ids: Optional list of check IDs to run (None = all checks)
                               Valid IDs: 'image_availability', 'storage_space',
                                         'hardware_health', 'bgp_stability'
            progress_callback: Optional callback function for progress updates
                              Signature: callback(check_name: str, check_num: int,
                                                 total_checks: int, passed: bool)
                              Example: callback("Storage Space", 2, 4, True)
 
        Returns:
            True if checks pass or warnings only, False if critical failures
            and force_upgrade is disabled
        """
        logger.info(
            f"[{self.hostname}] DEBUG: run_pre_checks called with selected_check_ids: {selected_check_ids}"
        )
        logger.info(
            f"[{self.hostname}] DEBUG: progress_callback provided: {progress_callback is not None}"
        )
 
        try:
            self.status.update_phase(
                UpgradePhase.PRE_CHECK, "Running pre-upgrade validation checks"
            )
 
            send_device_progress(
                self.status, 1, STEPS_PER_DEVICE, "Running pre-upgrade checks"
            )
 
            # Initialize pre-check engine with device context
            engine = EnhancedPreCheckEngine(
                self.connector.device, self.hostname, self.image_filename
            )
 
            # CRITICAL FIX v4.0.0: Pass the progress_callback to the engine
            # This enables per-check progress updates in main.py
            logger.debug(f"[{self.hostname}] Calling engine.run_all_checks with callback")
            pre_check_summary = engine.run_all_checks(
                selected_check_ids=selected_check_ids,
                progress_callback=progress_callback  # Pass callback through to engine
            )
            logger.debug(f"[{self.hostname}] Pre-check engine completed successfully")
 
            self.status.pre_check_summary = pre_check_summary
 
            # Display results to user in formatted table
            self.formatter.print_check_results_table(pre_check_summary)
 
            # Send results to event system for frontend display
            from progress.event_sender import send_pre_check_results
            send_pre_check_results(self.status)
 
            # Determine if upgrade can proceed based on results
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
            logger.exception(e)  # Log full stack trace for debugging
 
            if self.force_upgrade:
                logger.warning(
                    f"[{self.hostname}] ⚠️  Pre-check failed but force_upgrade enabled"
                )
                return True
            return False
 
    # =========================================================================
    # SUBSECTION 1.4: DOWNGRADE VALIDATION
    # =========================================================================
 
    def _validate_downgrade_scenario(
        self, current_version: str, target_version: str
    ) -> Tuple[bool, str]:
        """
        Validate and handle downgrade scenarios with appropriate warnings.
 
        Downgrades are inherently riskier than upgrades and require
        additional validation and user confirmation (via force_upgrade).
 
        Args:
            current_version: Current device version
            target_version: Target downgrade version
 
        Returns:
            Tuple of (can_proceed: bool, message: str)
        """
        version_action = compare_versions(current_version, target_version)
 
        # Check if this is any type of downgrade
        if "downgrade" not in version_action.value:
            return True, "Not a downgrade scenario"
 
        logger.warning(
            f"[{self.hostname}] ⚠️  Downgrade detected: {version_action.value}"
        )
 
        # Validate downgrade support and get risk assessment
        downgrade_supported, downgrade_reason = is_downgrade_supported(
            current_version, target_version
        )
 
        if not downgrade_supported and not self.force_upgrade:
            error_msg = f"Downgrade blocked: {downgrade_reason}"
            logger.error(f"[{self.hostname}] ❌ {error_msg}")
            return False, error_msg
 
        elif not downgrade_supported and self.force_upgrade:
            warning_msg = (
                f"Force proceeding with unsupported downgrade: {downgrade_reason}"
            )
            logger.warning(f"[{self.hostname}] ⚠️  {warning_msg}")
            self.status.add_warning(warning_msg)
            return True, warning_msg
 
        else:
            info_msg = f"Downgrade validated: {downgrade_reason}"
            logger.info(f"[{self.hostname}] ✅ {info_msg}")
            self.status.add_warning(f"Downgrade in progress: {version_action.value}")
            return True, info_msg
 
    # =========================================================================
    # SUBSECTION 1.5: MAIN UPGRADE ORCHESTRATION
    # =========================================================================
 
    def perform_upgrade(self) -> UpgradeResult:
        """
        Execute complete upgrade/downgrade process with all steps.
 
        Orchestrates the entire version change process including:
        - Pre-checks and validation
        - Version compatibility assessment
        - Software installation with rollback protection
        - Reboot and recovery monitoring
        - Post-upgrade validation
 
        Supports both upgrades and downgrades with appropriate risk
        assessment and safety measures.
 
        Returns:
            UpgradeResult with complete upgrade outcome and detailed metrics
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
 
            # =================================================================
            # STEP 1: PRE-CHECKS (unless explicitly skipped)
            # =================================================================
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
 
            # =================================================================
            # STEP 2: VERSION VALIDATION AND COMPATIBILITY
            # =================================================================
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
 
            # Handle same version scenario
            if version_action == VersionAction.SAME_VERSION and not self.force_upgrade:
                upgrade_result.add_step(
                    "validation", "skipped", "Already on target version"
                )
                upgrade_result.success = True
                upgrade_result.final_version = current_version
                upgrade_result.warnings.append("Device already running target version")
                upgrade_result.end_time = time.time()
                return upgrade_result
 
            # Handle downgrade scenarios with special validation
            if "downgrade" in version_action.value:
                can_downgrade, downgrade_message = self._validate_downgrade_scenario(
                    current_version, self.target_version
                )
                if not can_downgrade:
                    upgrade_result.add_step(
                        "validation",
                        "failed",
                        f"Downgrade validation failed: {downgrade_message}",
                    )
                    upgrade_result.errors.append(
                        f"Downgrade blocked: {downgrade_message}"
                    )
                    upgrade_result.end_time = time.time()
                    raise ValidationError(
                        f"Downgrade blocked: {downgrade_message}",
                        "Use --force-upgrade to override or perform manual downgrade",
                    )
 
            # Risk assessment for both upgrades and downgrades
            risk_level = get_version_change_risk(version_action)
            logger.info(
                f"[{self.hostname}] Version change: {version_action.value} (Risk: {risk_level.value})"
            )
 
            upgrade_result.add_step(
                "validation", "completed", f"Version action: {version_action.value}"
            )
            current_step += 1
 
            # =================================================================
            # STEP 3: SOFTWARE INSTALLATION
            # =================================================================
            upgrade_result.add_step(
                "software_install", "in_progress", "Installing software package"
            )
            self.status.update_phase(
                UpgradePhase.INSTALLING, "Installing software package"
            )
            send_device_progress(
                self.status, current_step, STEPS_PER_DEVICE, "Installing software"
            )
 
            # Initialize installer with all required parameters
            installer = SoftwareInstaller(
                self.connector,
                self.status,
                self.image_filename,
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
 
            # =================================================================
            # STEP 4: WAIT FOR REBOOT AND RECOVERY
            # =================================================================
            upgrade_result.add_step(
                "reboot_wait", "in_progress", "Waiting for device reboot"
            )
            self.status.update_phase(
                UpgradePhase.REBOOTING, "Device rebooting after upgrade/downgrade"
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
 
            # =================================================================
            # STEP 5: VERIFY FINAL VERSION AND RUN POST-UPGRADE VALIDATION
            # =================================================================
            upgrade_result.add_step(
                "verification", "in_progress", "Verifying final version"
            )
            self.status.update_phase(
                UpgradePhase.VERIFYING, "Verifying upgrade/downgrade success"
            )
            send_device_progress(
                self.status, current_step, STEPS_PER_DEVICE, "Verifying upgrade"
            )
 
            # Reconnect to get final version and perform validation
            with self.connector.connect():
                final_version = self.get_current_version()
                upgrade_result.final_version = final_version
 
                # STEP 6: POST-UPGRADE FUNCTIONAL VALIDATION
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
 
                    # Initiate rollback for critical validation failures
                    if not self.force_upgrade:
                        raise ValidationError(
                            "Post-upgrade validation failed",
                            "Device will be rolled back to previous version",
                        )
                else:
                    upgrade_result.add_step(
                        "post_validation", "completed", "Post-upgrade validation passed"
                    )
 
                # Final version verification
                if final_version == self.target_version:
                    upgrade_result.add_step(
                        "verification",
                        "completed",
                        f"Successfully upgraded to {final_version}",
                    )
                    upgrade_result.success = True
                    logger.info(
                        f"[{self.hostname}] ✅ Target version {final_version} confirmed"
                    )
                else:
                    upgrade_result.add_step(
                        "verification",
                        "completed",
                        f"Upgrade completed but version mismatch: {final_version}",
                    )
                    upgrade_result.warnings.append(
                        f"Version mismatch: expected {self.target_version}, got {final_version}"
                    )
                    # Still consider successful if device is running, just with version warning
                    upgrade_result.success = True
                    logger.warning(
                        f"[{self.hostname}] ⚠️  Version mismatch: expected {self.target_version}, got {final_version}"
                    )
 
            # =================================================================
            # FINAL: MARK COMPLETION
            # =================================================================
            self.status.update_phase(
                UpgradePhase.COMPLETED, "Upgrade completed successfully"
            )
            upgrade_result.end_time = time.time()
            upgrade_result.calculate_duration()
 
            total_duration = upgrade_result.upgrade_duration
            logger.info(
                f"[{self.hostname}] ✅ Upgrade completed successfully in {total_duration:.1f}s"
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
            # Unexpected errors during upgrade process
            error_msg = f"Unexpected upgrade error: {str(e)}"
            logger.error(f"[{self.hostname}] ❌ {error_msg}")
            logger.exception(e)  # Log full stack trace
            upgrade_result.errors.append(error_msg)
            upgrade_result.end_time = time.time()
            upgrade_result.calculate_duration()
            self.status.update_phase(UpgradePhase.FAILED, error_msg)
            return upgrade_result
 
    # =========================================================================
    # SUBSECTION 1.6: UPGRADE FAILURE HANDLING
    # =========================================================================
 
    def _handle_upgrade_failure(
        self, upgrade_result: UpgradeResult, exception: Exception, start_time: float
    ) -> UpgradeResult:
        """
        Handle upgrade failure with automatic rollback attempt.
 
        Attempts to rollback device to previous version when critical
        failures occur during installation or post-upgrade validation.
 
        Args:
            upgrade_result: Upgrade result object to update
            exception: Exception that caused the failure
            start_time: Timestamp when upgrade started
 
        Returns:
            Updated UpgradeResult with failure details and rollback status
        """
        logger.error(f"[{self.hostname}] ❌ Upgrade failed: {exception.message}")
 
        # Attempt automatic rollback for installation and validation failures
        if isinstance(exception, (InstallationFailure, ValidationError)):
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
 
        # Record error and remediation information
        upgrade_result.errors.append(exception.message)
        if hasattr(exception, "remediation") and exception.remediation:
            upgrade_result.warnings.append(f"Remediation: {exception.remediation}")
 
        upgrade_result.end_time = time.time()
        upgrade_result.calculate_duration()
        self.status.update_phase(UpgradePhase.FAILED, exception.message)
        return upgrade_result
 
    # =========================================================================
    # SUBSECTION 1.7: MAIN ENTRY POINT
    # =========================================================================
 
    def run_upgrade(self) -> bool:
        """
        Main entry point to run complete upgrade/downgrade process.
 
        Manages device connection lifecycle and orchestrates all upgrade steps
        with comprehensive error handling and user feedback.
 
        Returns:
            True if upgrade/downgrade succeeded, False otherwise
        """
        self.status.start_time = time.time()
 
        # Display upgrade banner and details
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
                # Get initial version and establish baseline
                self.status.current_version = self.get_current_version()
                self.status.version_action = compare_versions(
                    self.status.current_version, self.target_version
                )
 
                # Perform the actual upgrade/downgrade
                upgrade_result = self.perform_upgrade()
                self.status.set_upgrade_result(upgrade_result)
                self.status.end_time = time.time()
 
                # Send final results to frontend/event system
                send_operation_complete(
                    self.status,
                    upgrade_result.success,
                    "Upgrade completed successfully"
                    if upgrade_result.success
                    else "Upgrade failed",
                )
 
                # Display human-readable results summary
                self.formatter.print_upgrade_results(self.status)
 
                return upgrade_result.success
 
        except ConnectError as e:
            # Handle connection failures specifically
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
            # Handle all other unexpected errors
            error_msg = f"Unexpected error: {str(e)}"
            logger.error(f"[{self.hostname}] ❌ {error_msg}")
            logger.exception(e)  # Log full stack trace
            self.status.error = error_msg
            self.status.error_type = "UnexpectedError"
            self.status.update_phase(UpgradePhase.FAILED, error_msg)
            send_operation_complete(self.status, False, error_msg)
 
            print(f"\n❌ UNEXPECTED ERROR: {error_msg}")
            print(f"💡 Remediation: Review logs and contact support if issue persists")
            return False
