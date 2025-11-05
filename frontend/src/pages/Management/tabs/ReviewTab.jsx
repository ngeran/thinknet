/**
 * =============================================================================
 * REVIEW TAB COMPONENT
 * =============================================================================
 *
 * Pre-check results review interface.
 *
 * CRITICAL FIX: The loading state now checks if the job is finished but failed
 * (using isRunningPreCheck and jobStatus) to display a failure message,
 * preventing the UI from being stuck on the spinner.
 *
 * @module components/tabs/ReviewTab
 * @author nikos-geranios_vgi
 * @date 2025-11-05
 */

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Bug, XCircle } from 'lucide-react'; // Added XCircle for error

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
  jobStatus, // <-- NEW PROP for robust state checking
  isRunningPreCheck, // <-- NEW PROP for robust state checking
  onProceedWithUpgrade,
  onCancel,
  onForceReview,
}) {
  // ========================================================================
  // CASE 1: Pre-check summary is available (SUCCESS or partial FAILURE results)
  // ========================================================================
  if (preCheckSummary) {
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
  // CASE 2: Job FAILED and no summary received
  // This handles the state where OPERATION_COMPLETE (FAILED) is received,
  // isRunningPreCheck is false, but preCheckSummary is null, preventing the
  // stuck loading spinner issue.
  // ========================================================================
  if (!isRunningPreCheck && jobStatus === 'failed') {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-12">
            <XCircle className="h-12 w-12 mx-auto text-red-500 mb-4" />
            <p className="text-lg font-semibold text-red-700 mb-2">
              Pre-check Job Failed Unexpectedly
            </p>
            <p className="text-muted-foreground mb-4">
              The pre-check operation terminated with an error before compiling the final results.
              Please check the **Monitor** tab for detailed logs to troubleshoot the issue.
            </p>

            {/* Action buttons to only allow Cancel/Reset or Debugging */}
            <ReviewActions
              summary={{ can_proceed: false, warnings: 0, results: [] }} // Dummy summary to force CANCEL/failure state in ReviewActions
              isConnected={isConnected}
              onCancel={onCancel}
              onProceed={onProceedWithUpgrade}
            />
            {/* Debug button for testing */}
            <Button
              onClick={onForceReview}
              variant="outline"
              className="mt-4"
              size="sm"
            >
              <Bug className="h-3 w-3 mr-2" />
              Debug: Force Load Test Results
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }


  // ========================================================================
  // CASE 3: Loading (still running or waiting for first message)
  // ========================================================================
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-center py-12">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-4">
            Loading pre-check results...
          </p>
          <p className="text-sm text-gray-500 mb-4">
            If results don't appear, check the WebSocket Message Inspector in the Configuration tab
          </p>

          {/* Debug button for testing */}
          <Button
            onClick={onForceReview}
            variant="outline"
            className="mt-4"
            size="sm"
          >
            <Bug className="h-3 w-3 mr-2" />
            Debug: Force Load Test Results
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
