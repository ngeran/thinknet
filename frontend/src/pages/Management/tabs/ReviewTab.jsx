/**
 * =============================================================================
 * REVIEW TAB COMPONENT v2.3.0
 * =============================================================================
 *
 * Pre-check results review interface with upgrade options display
 *
 * VERSION: 2.3.0 - Upgrade Options Display
 * AUTHOR: nikos-geranios_vgi
 * DATE: 2025-11-05
 * LAST UPDATED: 2025-11-19 12:00:58 UTC
 *
 * ENHANCEMENTS v2.3.0 (2025-11-19 12:00:58 UTC):
 * - Added upgrade options display card
 * - Shows validation, file copy, and reboot settings
 * - Visual indicators for safe/risky configurations
 * - Warnings for disabled validation or manual reboot
 * - Maintains backward compatibility with existing layout
 *
 * CRITICAL FIXES (v2.2.1):
 * - Added specific handling for backend API mismatch errors
 * - Enhanced error type detection for Python function signature errors
 * - Maintained original three-column layout for success cases
 * - Simplified error display without troubleshooting guides
 * - Enhanced error handling for connection failures
 * - Added support for error_occurred flag in summary
 *
 * @module components/tabs/ReviewTab
 */
 
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Loader2,
  Bug,
  XCircle,
  AlertCircle,
  Code,
  Settings,
  AlertTriangle,
  CheckCircle,
  Info
} from 'lucide-react';
 
import ReviewHeader from "./ReviewHeader";
import CriticalIssuesColumn from "../review/CriticalIssuesColumn";
import WarningsColumn from "../review/WarningsColumn";
import PassedChecksColumn from "../review/PassedChecksColumn";
import ReviewActions from "../review/ReviewActions";
 
/**
 * Review Tab Component
 *
 * Displays comprehensive pre-check validation results or job failure state.
 * Handles three main states: Success with results, Error states, and Loading.
 *
 * ENHANCEMENTS v2.3.0 (2025-11-19 12:00:58 UTC):
 * - Added upgradeParams prop for displaying upgrade options
 * - Shows configured upgrade options in success state
 * - Visual warnings for risky configurations
 *
 * @param {Object} props
 * @param {Object} props.preCheckSummary - Pre-check summary data
 * @param {Object} props.upgradeParams - Upgrade parameters including options (NEW v2.3.0)
 * @param {boolean} props.isConnected - WebSocket connection status
 * @param {string} props.jobStatus - Job status ("success" or "failed")
 * @param {boolean} props.isRunningPreCheck - True if pre-check is running
 * @param {Function} props.onProceedWithUpgrade - Callback to start upgrade
 * @param {Function} props.onCancel - Callback to cancel and reset
 * @param {Function} props.onForceReview - Debug function to force review tab
 */
export default function ReviewTab({
  preCheckSummary,
  upgradeParams,  // NEW v2.3.0
  isConnected,
  jobStatus,
  isRunningPreCheck,
  onProceedWithUpgrade,
  onCancel,
  onForceReview,
}) {
 
  // ========================================================================
  // CASE 1: SUCCESS STATE - Pre-check summary available with valid results
  // ENHANCED v2.3.0: Now includes upgrade options display
  // ========================================================================
  if (preCheckSummary && !preCheckSummary.error_occurred) {
    // Categorize results by severity for column distribution
    const criticalChecks = preCheckSummary.results.filter(r => r.severity === 'critical');
    const warningChecks = preCheckSummary.results.filter(r => r.severity === 'warning');
    const passedChecks = preCheckSummary.results.filter(r => r.severity === 'pass');
 
    // Check for risky upgrade options (NEW v2.3.0)
    const hasValidationDisabled = upgradeParams?.no_validate === true;
    const hasManualReboot = upgradeParams?.auto_reboot === false;
    const hasRiskyOptions = hasValidationDisabled || hasManualReboot;
 
    return (
      <div className="space-y-6 max-w-7xl">
 
        {/* Summary Header with visual status and statistics */}
        <ReviewHeader summary={preCheckSummary} />
 
        {/* ================================================================
            UPGRADE OPTIONS DISPLAY CARD (NEW v2.3.0)
            Shows user-selected upgrade options for review before proceeding
            ================================================================ */}
        <Card className={`border-2 ${hasRiskyOptions ? 'border-orange-200 bg-orange-50/30' : 'border-gray-200'}`}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-gray-700" />
                <CardTitle className="text-base">Upgrade Configuration</CardTitle>
              </div>
              {hasRiskyOptions && (
                <AlertTriangle className="h-5 w-5 text-orange-600" />
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
 
            {/* Option 1: Image Validation */}
            <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
              <div className="flex items-center gap-3">
                {hasValidationDisabled ? (
                  <XCircle className="h-5 w-5 text-orange-600 flex-shrink-0" />
                ) : (
                  <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                )}
                <div>
                  <p className="text-sm font-medium text-gray-900">Image Validation</p>
                  <p className="text-xs text-gray-600">
                    {hasValidationDisabled
                      ? 'Disabled - Installation will proceed without validation'
                      : 'Enabled - Image will be validated before installation'}
                  </p>
                </div>
              </div>
              <span className={`text-sm font-semibold ${
                hasValidationDisabled ? 'text-orange-600' : 'text-green-600'
              }`}>
                {hasValidationDisabled ? 'Skipped' : 'Active'}
              </span>
            </div>
 
            {/* Option 2: File Copy */}
            <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
              <div className="flex items-center gap-3">
                <Info className="h-5 w-5 text-blue-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900">File Transfer</p>
                  <p className="text-xs text-gray-600">
                    {upgradeParams?.no_copy
                      ? 'Skipped - Image already on device in /var/tmp/'
                      : 'Enabled - Image will be transferred to device'}
                  </p>
                </div>
              </div>
              <span className="text-sm font-semibold text-blue-600">
                {upgradeParams?.no_copy ? 'Skipped' : 'Transfer'}
              </span>
            </div>
 
            {/* Option 3: Automatic Reboot */}
            <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
              <div className="flex items-center gap-3">
                {hasManualReboot ? (
                  <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0" />
                ) : (
                  <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                )}
                <div>
                  <p className="text-sm font-medium text-gray-900">Device Reboot</p>
                  <p className="text-xs text-gray-600">
                    {hasManualReboot
                      ? 'Manual - You will need to reboot the device manually'
                      : 'Automatic - Device will reboot automatically (~5-10 min)'}
                  </p>
                </div>
              </div>
              <span className={`text-sm font-semibold ${
                hasManualReboot ? 'text-blue-600' : 'text-green-600'
              }`}>
                {hasManualReboot ? 'Manual' : 'Auto'}
              </span>
            </div>
 
            {/* Warning for Disabled Validation */}
            {hasValidationDisabled && (
              <Alert className="border-orange-200 bg-orange-50">
                <AlertTriangle className="h-4 w-4 text-orange-600" />
                <AlertTitle className="text-orange-900 font-semibold text-sm">
                  Validation Disabled
                </AlertTitle>
                <AlertDescription className="text-orange-800 text-xs">
                  Image validation is disabled. The system will install the image without verifying
                  its integrity. This increases the risk of installation failure.
                </AlertDescription>
              </Alert>
            )}
 
            {/* Info for Manual Reboot */}
            {hasManualReboot && (
              <Alert className="border-blue-200 bg-blue-50">
                <Info className="h-4 w-4 text-blue-600" />
                <AlertTitle className="text-blue-900 font-semibold text-sm">
                  Manual Reboot Required
                </AlertTitle>
                <AlertDescription className="text-blue-800 text-xs">
                  After installation completes, you will need to manually reboot the device to
                  activate the new software version. Version verification will be skipped.
                </AlertDescription>
              </Alert>
            )}
 
          </CardContent>
        </Card>
 
        {/* Three-column detailed results layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <CriticalIssuesColumn criticalChecks={criticalChecks} />
          <WarningsColumn warningChecks={warningChecks} />
          <PassedChecksColumn passedChecks={passedChecks} />
        </div>
 
        {/* Action buttons and connection status alerts */}
        <ReviewActions
          summary={preCheckSummary}
          isConnected={isConnected}
          onCancel={onCancel}
          onProceed={onProceedWithUpgrade}
        />
      </div>
    );
  }
 
  // ========================================================================
  // CASE 2: ERROR STATE - Job FAILED with error summary
  // Handles connection failures, backend API errors, timeouts, and generic failures
  // UNCHANGED from v2.2.1
  // ========================================================================
  if (
    (preCheckSummary?.error_occurred) ||
    (!isRunningPreCheck && jobStatus === 'failed' && !preCheckSummary) ||
    (!isRunningPreCheck && jobStatus === 'failed' && preCheckSummary?.error_occurred)
  ) {
    const errorType = preCheckSummary?.error_type || "UNKNOWN_ERROR";
    const isTimeoutError = errorType === "TIMEOUT";
    const isConnectionError = errorType === "CONNECTION_ERROR";
    const errorResult = preCheckSummary?.results?.[0];
 
    // Enhanced backend error detection
    const isBackendApiError = errorResult?.message?.includes('unexpected keyword argument') ||
      errorResult?.message?.includes('got an unexpected keyword argument');
    const isBackendError = isBackendApiError || errorType === "BACKEND_ERROR";
 
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
 
        {/* ================================================================
            ERROR DISPLAY CARD
            Unified error container with specific error type handling
            ================================================================ */}
        <Card className="border-red-200">
          <CardContent className="pt-6">
            <div className="text-center py-8">
 
              {/* Error Icon - Dynamic based on error type */}
              {isBackendError ? (
                <Code className="h-16 w-16 mx-auto text-amber-500 mb-4" />
              ) : (
                <XCircle className="h-16 w-16 mx-auto text-red-500 mb-4" />
              )}
 
              {/* Error Title - Context-specific messaging */}
              <h2 className="text-2xl font-bold text-red-700 mb-2">
                {isBackendError && "Backend Configuration Error"}
                {isTimeoutError && "Pre-Check Operation Timed Out"}
                {isConnectionError && "Device Connection Failed"}
                {!isBackendError && !isTimeoutError && !isConnectionError && "Pre-Check Operation Failed"}
              </h2>
 
              {/* Error Description - Tailored to error type */}
              <p className="text-muted-foreground mb-6">
                {isBackendError
                  ? "There is a configuration issue with the upgrade system."
                  : "The pre-check validation could not complete successfully."
                }
              </p>
 
              {/* ============================================================
                  BACKEND API ERROR SPECIFIC DISPLAY
                  ============================================================ */}
              {isBackendError && errorResult && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 mb-6 text-left max-w-2xl mx-auto">
                  <div className="flex items-start gap-4">
                    <Code className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-amber-900 text-lg mb-2">
                        Backend API Compatibility Issue
                      </h3>
                      <p className="text-sm text-amber-800 mb-3 leading-relaxed">
                        The frontend and backend versions are incompatible. The system is attempting to use parameters
                        that the current backend doesn't support.
                      </p>
 
                      {errorResult.message && (
                        <div className="bg-white/60 border border-amber-200 rounded p-3 mb-3">
                          <p className="text-xs text-amber-700 leading-relaxed font-mono">
                            <strong>Technical Error:</strong> {errorResult.message}
                          </p>
                        </div>
                      )}
 
                      <div className="mt-3 p-3 bg-amber-100 border border-amber-300 rounded">
                        <p className="text-xs text-amber-900">
                          <strong>Resolution Required:</strong> This is a system configuration issue that requires
                          backend development attention. Please contact the development team with the error details above.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
 
              {/* ============================================================
                  STANDARD ERROR DISPLAY
                  ============================================================ */}
              {!isBackendError && errorResult && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-5 mb-6 text-left max-w-2xl mx-auto">
                  <div className="flex items-start gap-4">
                    <AlertCircle className="h-6 w-6 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-red-900 text-lg mb-2">
                        {errorResult.check_name || "Operation Failed"}
                      </h3>
                      <p className="text-sm text-red-800 mb-3 leading-relaxed">
                        {errorResult.message}
                      </p>
                      {errorResult.details && (
                        <div className="bg-white/60 border border-red-200 rounded p-3">
                          <p className="text-xs text-red-700 leading-relaxed">
                            <strong>Details:</strong> {errorResult.details}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
 
              {/* ============================================================
                  GENERIC ERROR MESSAGE
                  ============================================================ */}
              {!errorResult && (
                <Alert variant="destructive" className="mb-6 max-w-2xl mx-auto text-left">
                  <XCircle className="h-4 w-4" />
                  <AlertTitle>Operation Failed</AlertTitle>
                  <AlertDescription>
                    The pre-check operation terminated unexpectedly without providing detailed error information.
                    Please check the Execution tab for logs and technical details.
                  </AlertDescription>
                </Alert>
              )}
 
              {/* ============================================================
                  ACTION BUTTONS
                  ============================================================ */}
              <div className="max-w-2xl mx-auto">
                <ReviewActions
                  summary={{ can_proceed: false, warnings: 0, results: [] }}
                  isConnected={isConnected}
                  onCancel={onCancel}
                  onProceed={onProceedWithUpgrade}
                />
              </div>
 
              {/* ============================================================
                  DEBUG TOOLS
                  ============================================================ */}
              {import.meta.env.DEV && (
                <div className="mt-6">
                  <Button
                    onClick={onForceReview}
                    variant="outline"
                    size="sm"
                  >
                    <Bug className="h-3 w-3 mr-2" />
                    Debug: Force Load Test Results
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
 
  // ========================================================================
  // CASE 3: LOADING STATE - Still running or waiting for first message
  // UNCHANGED from v2.2.1
  // ========================================================================
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-center py-12">
 
          {/* Animated loading indicator */}
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-muted-foreground mb-4" />
 
          {/* Loading status message */}
          <p className="text-lg font-medium text-muted-foreground mb-2">
            Loading pre-check results...
          </p>
          <p className="text-sm text-gray-500 mb-6">
            Waiting for validation to complete and results to be compiled.
          </p>
 
          {/* Help text for troubleshooting loading issues */}
          <div className="max-w-md mx-auto bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-600 mb-2">
              <strong>If results don't appear:</strong>
            </p>
            <ul className="text-xs text-left text-gray-600 space-y-1">
              <li>• Check the <strong>Execution Tab</strong> for progress updates</li>
              <li>• Verify WebSocket connection status in Configuration tab</li>
              <li>• Results should appear within 1-2 minutes</li>
            </ul>
          </div>
 
          {/* Debug button for testing (only in development) */}
          {import.meta.env.DEV && (
            <Button
              onClick={onForceReview}
              variant="outline"
              className="mt-6"
              size="sm"
            >
              <Bug className="h-3 w-3 mr-2" />
              Debug: Force Load Test Results
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
