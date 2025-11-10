/**
 * =============================================================================
 * REVIEW TAB COMPONENT
 * =============================================================================
 *
 * Pre-check results review interface.
 *
 * VERSION: 2.2.0 - Simplified Error Display with Original Format
 * AUTHOR: nikos-geranios_vgi
 * DATE: 2025-11-05
 * LAST UPDATED: 2025-11-10
 *
 * CRITICAL FIXES (v2.2.0):
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
import { Loader2, Bug, XCircle, AlertCircle } from 'lucide-react';

import ReviewHeader from "./ReviewHeader";
import CriticalIssuesColumn from "../review/CriticalIssuesColumn";
import WarningsColumn from "../review/WarningsColumn";
import PassedChecksColumn from "../review/PassedChecksColumn";
import ReviewActions from "../review/ReviewActions";

/**
 * Review Tab Component
 *
 * Displays comprehensive pre-check validation results or job failure state.
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
  // CASE 1: Pre-check summary is available (SUCCESS or FAILURE with results)
  // Uses original three-column layout
  // ========================================================================
  if (preCheckSummary && !preCheckSummary.error_occurred) {
    // Categorize results by severity
    const criticalChecks = preCheckSummary.results.filter(r => r.severity === 'critical');
    const warningChecks = preCheckSummary.results.filter(r => r.severity === 'warning');
    const passedChecks = preCheckSummary.results.filter(r => r.severity === 'pass');

    return (
      <div className="space-y-6 max-w-7xl">

        {/* Summary Header */}
        <ReviewHeader summary={preCheckSummary} />

        {/* Three-column detailed results */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <CriticalIssuesColumn criticalChecks={criticalChecks} />
          <WarningsColumn warningChecks={warningChecks} />
          <PassedChecksColumn passedChecks={passedChecks} />
        </div>

        {/* Action buttons and alerts */}
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
  // This handles connection failures, reachability issues, and timeouts.
  // Simplified display without troubleshooting steps.
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

    return (
      <div className="space-y-6 max-w-4xl mx-auto">

        {/* ================================================================
            ERROR DISPLAY CARD
            ================================================================ */}
        <Card className="border-red-200">
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <XCircle className="h-16 w-16 mx-auto text-red-500 mb-4" />
              <h2 className="text-2xl font-bold text-red-700 mb-2">
                {isTimeoutError && "Pre-Check Operation Timed Out"}
                {isConnectionError && "Device Connection Failed"}
                {!isTimeoutError && !isConnectionError && "Pre-Check Operation Failed"}
              </h2>
              <p className="text-muted-foreground mb-6">
                The pre-check validation could not complete successfully.
              </p>

              {/* ============================================================
                  ERROR DETAILS SECTION
                  ============================================================ */}
              {errorResult && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-5 mb-6 text-left max-w-2xl mx-auto">
                  <div className="flex items-start gap-4">
                    <AlertCircle className="h-6 w-6 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-red-900 text-lg mb-2">
                        {errorResult.check_name}
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
                  GENERIC ERROR MESSAGE (when no specific error result)
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

              {/* Debug button for testing (only in development) */}
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
  // ========================================================================
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-center py-12">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-muted-foreground mb-4" />
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
