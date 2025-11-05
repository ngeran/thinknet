/**
 * =============================================================================
 * REVIEW TAB COMPONENT
 * =============================================================================
 *
 * Pre-check results review interface
 *
 * @module components/tabs/ReviewTab
 * @author nikos-geranios_vgi
 * @date 2025-11-05
 */

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Bug } from 'lucide-react';

import ReviewHeader from "./ReviewHeader";
import CriticalIssuesColumn from "../review/CriticalIssuesColumn";
import WarningsColumn from "../review/WarningsColumn";
import PassedChecksColumn from "../review/PassedChecksColumn";
import ReviewActions from "../review/ReviewActions";

/**
 * Review Tab Component
 *
 * Displays comprehensive pre-check validation results:
 * - Summary header with pass/fail status
 * - Three-column layout: Critical | Warnings | Passed
 * - Action buttons to proceed or cancel
 *
 * @param {Object} props
 * @param {Object} props.preCheckSummary - Pre-check summary data
 * @param {boolean} props.isConnected - WebSocket connection status
 * @param {Function} props.onProceedWithUpgrade - Callback to start upgrade
 * @param {Function} props.onCancel - Callback to cancel and reset
 * @param {Function} props.onForceReview - Debug function to force review tab
 */
export default function ReviewTab({
  preCheckSummary,
  isConnected,
  onProceedWithUpgrade,
  onCancel,
  onForceReview,
}) {
  // ========================================================================
  // CASE 1: Pre-check summary is available
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
  // CASE 2: No pre-check summary available (loading state)
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
