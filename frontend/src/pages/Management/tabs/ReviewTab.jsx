/**
 * =============================================================================
 * REVIEW TAB COMPONENT
 * =============================================================================
 *
 * Pre-check results review interface.
 *
 * VERSION: 2.2.1 - Enhanced Backend Error Handling
 * AUTHOR: nikos-geranios_vgi
 * DATE: 2025-11-05
 * LAST UPDATED: 2025-11-11
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
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Bug, XCircle, AlertCircle, Code } from 'lucide-react';

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
 * @param {Object} props
 * @param {Object} props.preCheckSummary - Pre-check summary data (Non-null indicates results are ready)
 * @param {boolean} props.isConnected - WebSocket connection status
 * @param {string} props.jobStatus - The final status of the pre-check job ("success" or "failed")
 * @param {boolean} props.isRunningPreCheck - True if the pre-check job is actively running
 * @param {Function} props.onProceedWithUpgrade - Callback to start upgrade
 * @param {Function} props.onCancel - Callback to cancel and reset
 * @param {Function} props.onForceReview - Debug function to force review tab
 */
export default function ReviewTab({
  preCheckSummary,
  isConnected,
  jobStatus,
  isRunningPreCheck,
  onProceedWithUpgrade,
  onCancel,
  onForceReview,
}) {

  // ========================================================================
  // CASE 1: SUCCESS STATE - Pre-check summary available with valid results
  // Uses original three-column layout for comprehensive results display
  // ========================================================================
  if (preCheckSummary && !preCheckSummary.error_occurred) {
    // Categorize results by severity for column distribution
    const criticalChecks = preCheckSummary.results.filter(r => r.severity === 'critical');
    const warningChecks = preCheckSummary.results.filter(r => r.severity === 'warning');
    const passedChecks = preCheckSummary.results.filter(r => r.severity === 'pass');

    return (
      <div className="space-y-6 max-w-7xl">

        {/* Summary Header with visual status and statistics */}
        <ReviewHeader summary={preCheckSummary} />

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
  // Enhanced to detect specific backend function signature mismatches
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

    // Enhanced backend error detection - looks for Python function signature mismatches
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
                  Handles Python function signature mismatches and backend issues
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

                      {/* Technical details for development troubleshooting */}
                      {errorResult.message && (
                        <div className="bg-white/60 border border-amber-200 rounded p-3 mb-3">
                          <p className="text-xs text-amber-700 leading-relaxed font-mono">
                            <strong>Technical Error:</strong> {errorResult.message}
                          </p>
                        </div>
                      )}

                      {/* Resolution guidance */}
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
                  For connection issues, timeouts, and generic failures
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
                  Fallback when no specific error result is available
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
                  Consistent action interface across all error types
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
                  Development-only utilities for testing and troubleshooting
                  ============================================================ */}
              {process.env.NODE_ENV === 'development' && (
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
  // Provides user feedback during pre-check execution
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
          {process.env.NODE_ENV === 'development' && (
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
