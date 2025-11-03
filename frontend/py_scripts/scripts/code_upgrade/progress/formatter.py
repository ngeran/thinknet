"""
Human-readable output formatting for console display.

Provides tabular displays, color-coded status indicators, and structured
summaries for CLI users during standalone execution.
"""

from core.dataclasses import PreCheckSummary, DeviceStatus
from validation.version_manager import get_version_change_risk


class HumanReadableFormatter:
    """
    Formats upgrade progress and results for human-readable console output.

    Provides tabular displays, color-coded status indicators, and structured
    summaries for CLI users.
    """

    @staticmethod
    def print_banner(title: str, width: int = 80):
        """
        Print formatted section banner.

        Args:
            title: Banner title text
            width: Banner width in characters
        """
        print(f"\n{'=' * width}")
        print(f"🎯 {title.upper()}")
        print(f"{'=' * width}")

    @staticmethod
    def print_check_results_table(pre_check_summary: PreCheckSummary):
        """
        Print pre-check results in formatted table.

        Args:
            pre_check_summary: Summary of all pre-check results
        """
        print(f"\n📊 PRE-CHECK RESULTS SUMMARY")
        print(f"{'─' * 100}")

        stats_line = f"✅ Passed: {pre_check_summary.passed} | "
        stats_line += f"⚠️  Warnings: {pre_check_summary.warnings} | "
        stats_line += f"❌ Critical: {pre_check_summary.critical_failures} | "
        stats_line += f"📋 Total: {pre_check_summary.total_checks}"
        print(stats_line)
        print(f"{'─' * 100}")

        print(f"\n{'CHECK NAME':<35} {'STATUS':<12} {'SEVERITY':<10} {'MESSAGE'}")
        print(f"{'─' * 35} {'─' * 12} {'─' * 10} {'─' * 43}")

        for result in pre_check_summary.results:
            status_icon = "✅" if result.passed else "❌"
            status_text = "PASS" if result.passed else "FAIL"

            severity_icon = {
                "pass": "🟢",
                "warning": "🟡",
                "critical": "🔴",
                "info": "🔵",
            }.get(result.severity.value, "⚪")
            severity_text = result.severity.value.upper()

            message = result.message
            if len(message) > 43:
                message = message[:40] + "..."

            print(
                f"{result.check_name:<35} {status_icon} {status_text:<8} "
                f"{severity_icon} {severity_text:<6} {message}"
            )

            # Print recommendation if check failed
            if not result.passed and result.recommendation:
                print(f"{'':>35} 💡 Recommendation: {result.recommendation}")

        print(f"{'─' * 100}")

        if pre_check_summary.can_proceed:
            print(f"\n🎉 OVERALL STATUS: ✅ UPGRADE CAN PROCEED")
        else:
            print(
                f"\n🚫 OVERALL STATUS: ❌ UPGRADE BLOCKED - Critical failures detected"
            )
            print(f"\n🔧 FAILED CHECKS REQUIRING ATTENTION:")
            for failed_check in pre_check_summary.get_failed_checks():
                if failed_check.severity.value == "critical":
                    print(f"   • {failed_check.check_name}: {failed_check.message}")
                    if failed_check.recommendation:
                        print(f"     → {failed_check.recommendation}")

    @staticmethod
    def print_upgrade_results(device_status: DeviceStatus):
        """
        Print final upgrade results.

        Args:
            device_status: Final device status with upgrade results
        """
        if not device_status.upgrade_result:
            print(f"\n📭 No upgrade results available")
            return

        upgrade_result = device_status.upgrade_result
        HumanReadableFormatter.print_banner("UPGRADE RESULTS")

        status_icon = "✅" if upgrade_result.success else "❌"
        status_text = "SUCCESS" if upgrade_result.success else "FAILED"
        print(f"\n{status_icon} OVERALL STATUS: {status_text}")

        print(f"\n🔄 VERSION TRANSITION:")
        print(f"   From: {upgrade_result.initial_version}")
        print(f"   To:   {upgrade_result.final_version or 'N/A'}")
        print(
            f"   Action: {upgrade_result.version_action.value.replace('_', ' ').title()}"
        )
        print(
            f"   Risk Level: {get_version_change_risk(upgrade_result.version_action)}"
        )

        print(f"\n⏱️  DURATION: {upgrade_result.calculate_duration():.1f} seconds")

        if upgrade_result.reboot_required:
            reboot_status = (
                "✅ Performed"
                if upgrade_result.reboot_performed
                else "❌ Not Performed"
            )
            print(f"\n🔁 REBOOT: {reboot_status}")
            if upgrade_result.reboot_performed and upgrade_result.reboot_wait_time > 0:
                print(f"   Reboot Wait Time: {upgrade_result.reboot_wait_time:.1f}s")

        if upgrade_result.rollback_performed:
            print(f"\n🔙 ROLLBACK PERFORMED")
            if upgrade_result.rollback_reason:
                print(f"   Reason: {upgrade_result.rollback_reason}")

        if upgrade_result.upgrade_steps:
            print(f"\n📋 UPGRADE STEPS:")
            print(f"{'─' * 100}")
            print(f"{'STEP':<35} {'STATUS':<12} {'DURATION':<10} {'MESSAGE'}")
            print(f"{'─' * 35} {'─' * 12} {'─' * 10} {'─' * 43}")

            for step in upgrade_result.upgrade_steps:
                step_icon = (
                    "✅"
                    if step["status"] == "completed"
                    else "🔄"
                    if step["status"] == "in_progress"
                    else "❌"
                )
                duration = f"{step['duration']:.1f}s" if step["duration"] > 0 else "N/A"
                message = (
                    step["message"][:43] + "..."
                    if len(step["message"]) > 43
                    else step["message"]
                )
                print(
                    f"{step['step']:<35} {step_icon} {step['status']:<8} "
                    f"{duration:<10} {message}"
                )

            print(f"{'─' * 100}")

        if upgrade_result.warnings:
            print(f"\n⚠️  WARNINGS ({len(upgrade_result.warnings)}):")
            for warning in upgrade_result.warnings:
                print(f"   • {warning}")

        if upgrade_result.errors:
            print(f"\n❌ ERRORS ({len(upgrade_result.errors)}):")
            for error in upgrade_result.errors:
                print(f"   • {error}")

        print(f"\n💡 RECOMMENDATION:")
        if upgrade_result.success:
            if upgrade_result.final_version == device_status.target_version:
                print(f"   ✅ Upgrade completed successfully to target version")
                print(f"   ✅ Device is operational and ready for production use")
            else:
                print(f"   ⚠️  Upgrade completed but final version differs from target")
                print(f"   🔍 Manual verification recommended")
        else:
            print(f"   🔧 Review errors above and address root causes")
            if upgrade_result.rollback_performed:
                print(f"   ✅ Device has been rolled back to previous version")
                print(f"   🔍 Investigate failure before retrying upgrade")
            else:
                print(f"   ⚠️  Manual intervention may be required")

        print(f"{'─' * 100}")
