/**
 * =============================================================================
 * REVIEW ACTIONS COMPONENT
 * =============================================================================
 *
 * Action buttons and alerts for review tab
 *
 * @module components/review/ReviewActions
 * @author nikos-geranios_vgi
 * @date 2025-11-05
 */
 
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PlayCircle, ArrowRight, AlertTriangle } from 'lucide-react';
 
/**
 * Review Actions Component
 *
 * Provides proceed/cancel buttons and contextual alerts based on pre-check results
 *
 * @param {Object} props
 * @param {Object} props.summary - Pre-check summary
 * @param {boolean} props.summary.can_proceed - Whether upgrade can proceed
 * @param {number} props.summary.warnings - Number of warnings
 * @param {boolean} props.isConnected - WebSocket connection status
 * @param {Function} props.onCancel - Callback for cancel action
 * @param {Function} props.onProceed - Callback to proceed with upgrade
 */
export default function ReviewActions({
  summary,
  isConnected,
  onCancel,
  onProceed
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
 
          {/* Decision message */}
          <div className="flex-1">
            <h4 className="text-lg font-semibold mb-2">
              {summary.can_proceed ? 'Ready to Proceed' : 'Cannot Proceed'}
            </h4>
            <p className="text-sm text-muted-foreground">
              {summary.can_proceed
                ? 'All critical checks passed. You can proceed with the upgrade.'
                : 'Critical failures detected. Resolve issues before upgrading.'}
            </p>
          </div>
 
          {/* Action buttons */}
          <div className="flex gap-3 w-full sm:w-auto">
            <Button
              onClick={onCancel}
              variant="outline"
              size="lg"
            >
              Cancel
            </Button>
 
            <Button
              onClick={onProceed}
              disabled={!summary.can_proceed || !isConnected}
              size="lg"
              className="flex-1 sm:flex-initial"
            >
              <PlayCircle className="h-4 w-4 mr-2" />
              Proceed with Upgrade
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
 
        {/* Alert: Cannot proceed (critical failures) */}
        {!summary.can_proceed && (
          <Alert className="mt-4" variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Critical Issues Detected</AlertTitle>
            <AlertDescription>
              You must resolve the critical failures listed above before proceeding.
              Review the recommendations for each failed check.
            </AlertDescription>
          </Alert>
        )}
 
        {/* Alert: Can proceed but has warnings */}
        {summary.can_proceed && summary.warnings > 0 && (
          <Alert className="mt-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Warnings Present</AlertTitle>
            <AlertDescription>
              {summary.warnings} warning{summary.warnings > 1 ? 's' : ''} detected.
              Review the warnings above and ensure you understand the implications before proceeding.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}