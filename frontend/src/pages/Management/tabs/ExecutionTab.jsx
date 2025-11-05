/**
 * =============================================================================
 * EXECUTION TAB COMPONENT
 * =============================================================================
 *
 * Real-time progress monitoring for pre-check and upgrade operations
 *
 * @module components/tabs/ExecutionTab
 * @author nikos-geranios_vgi
 * @date 2025-11-05
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, CheckCircle, XCircle, Terminal } from 'lucide-react';
import EnhancedProgressBar from '@/components/realTimeProgress/EnhancedProgressBar';
import { shouldFilterMessage } from '../utils/messageFiltering';

/**
 * Execution Tab Component
 *
 * Displays real-time progress of pre-check validation or upgrade execution:
 * - Operation status header
 * - Progress bar with percentage
 * - Step-by-step validation log
 * - Completion summary statistics
 *
 * @param {Object} props
 * @param {string} props.currentPhase - Current operation phase
 * @param {boolean} props.isRunning - Whether operation is running
 * @param {boolean} props.isComplete - Whether operation completed successfully
 * @param {boolean} props.hasError - Whether operation failed
 * @param {number} props.progress - Progress percentage (0-100)
 * @param {number} props.completedSteps - Number of completed steps
 * @param {number} props.totalSteps - Total number of steps
 * @param {string} props.latestStepMessage - Latest step message for display
 * @param {Array} props.jobOutput - Array of job output messages
 * @param {boolean} props.showTechnicalDetails - Whether to show technical details
 * @param {Function} props.onToggleTechnicalDetails - Callback to toggle details
 * @param {React.Ref} props.scrollAreaRef - Ref for scroll area
 */
export default function ExecutionTab({
  currentPhase,
  isRunning,
  isComplete,
  hasError,
  progress,
  completedSteps,
  totalSteps,
  latestStepMessage,
  jobOutput,
  showTechnicalDetails,
  onToggleTechnicalDetails,
  scrollAreaRef,
}) {
  return (
    <div className="space-y-6 max-w-6xl">

      {/* ====================================================================
          OPERATION STATUS HEADER
          ==================================================================== */}
      <Card className="border-gray-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                {/* Dynamic status icon */}
                {isRunning && <Loader2 className="h-5 w-5 animate-spin text-blue-600" />}
                {isComplete && <CheckCircle className="h-5 w-5 text-green-600" />}
                {hasError && <XCircle className="h-5 w-5 text-red-600" />}

                {/* Dynamic title based on phase */}
                {currentPhase === "pre_check" ? "Pre-Check Validation" : "Upgrade Execution"}
              </CardTitle>

              <CardDescription>
                {isRunning && "Processing validation checks..."}
                {isComplete && "All checks completed successfully"}
                {hasError && "Validation encountered errors"}
              </CardDescription>
            </div>

            {/* Step counter badge */}
            {totalSteps > 0 && (
              <Badge variant="outline" className="text-sm px-3 py-1">
                {completedSteps} / {totalSteps} Steps
              </Badge>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* ====================================================================
          ENHANCED PROGRESS BAR
          ==================================================================== */}
      <Card className="border-gray-200">
        <CardContent className="pt-6">
          <EnhancedProgressBar
            percentage={progress}
            currentStep={latestStepMessage}
            totalSteps={totalSteps}
            completedSteps={completedSteps}
            isRunning={isRunning}
            isComplete={isComplete}
            hasError={hasError}
            animated={isRunning}
            showStepCounter={true}
            showPercentage={true}
            compact={false}
            variant={isComplete ? "success" : hasError ? "destructive" : "default"}
          />
        </CardContent>
      </Card>

      {/* ====================================================================
          VALIDATION STEPS LOG
          ==================================================================== */}
      <Card className="border-gray-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Validation Steps</CardTitle>
              <CardDescription>
                Real-time progress of pre-check validation
              </CardDescription>
            </div>

            {/* Technical details toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={onToggleTechnicalDetails}
              className="text-xs"
            >
              <Terminal className="w-3 h-3 mr-1" />
              {showTechnicalDetails ? 'Hide' : 'Show'} Technical Details
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <ScrollArea className="h-96">
            <div ref={scrollAreaRef} className="space-y-2 pr-4">

              {/* Empty state - waiting for messages */}
              {jobOutput.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                    <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {currentPhase === "pre_check"
                      ? "Initializing pre-check validation..."
                      : "Initializing upgrade process..."}
                  </p>
                </div>
              ) : (
                /* Step messages display */
                jobOutput
                  .filter(log => showTechnicalDetails || !shouldFilterMessage(log))
                  .map((log, index, filteredArray) => {
                    // Determine step status
                    let stepStatus = 'COMPLETE';
                    const isLast = index === filteredArray.length - 1;

                    if (isRunning && isLast) {
                      stepStatus = 'IN_PROGRESS';
                    } else if (log.level === 'error' || log.message?.includes('failed')) {
                      stepStatus = 'FAILED';
                    }

                    return (
                      <div
                        key={`${log.timestamp}-${index}`}
                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        {/* Status icon */}
                        {stepStatus === 'COMPLETE' && (
                          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                        )}
                        {stepStatus === 'IN_PROGRESS' && (
                          <Loader2 className="w-5 h-5 animate-spin text-blue-600 flex-shrink-0" />
                        )}
                        {stepStatus === 'FAILED' && (
                          <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                        )}

                        {/* Message content */}
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm ${stepStatus === 'COMPLETE' ? 'text-gray-700' :
                              stepStatus === 'IN_PROGRESS' ? 'text-black font-medium' :
                                'text-red-600 font-medium'
                            }`}>
                            {log.message}
                          </div>

                          {/* Timestamp */}
                          {(stepStatus === 'COMPLETE' || showTechnicalDetails) && (
                            <div className="text-xs text-gray-400 mt-0.5 font-mono">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </div>
                          )}

                          {/* Event type badge in technical mode */}
                          {showTechnicalDetails && log.event_type && (
                            <Badge variant="outline" className="mt-1 text-xs">
                              {log.event_type}
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })
              )}

              {/* Processing indicator while running */}
              {isRunning && jobOutput.length > 0 && (
                <div className="flex items-center gap-3 p-3 text-sm text-gray-500">
                  <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" />
                  <span>Processing validation checks...</span>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* ====================================================================
          COMPLETION SUMMARY CARD
          ==================================================================== */}
      {!isRunning && jobOutput.length > 0 && (
        <Card className={`border-2 ${isComplete ? 'border-green-200 bg-green-50' :
            hasError ? 'border-red-200 bg-red-50' :
              'border-gray-200'
          }`}>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              {isComplete && (
                <>
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  Validation Complete
                </>
              )}
              {hasError && (
                <>
                  <XCircle className="h-5 w-5 text-red-600" />
                  Validation Failed
                </>
              )}
            </CardTitle>
            <CardDescription>
              {isComplete && "All pre-check validations completed successfully"}
              {hasError && "Some validations failed - review results before proceeding"}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              {/* Steps completed */}
              <div className="text-center p-3 bg-white rounded-lg border">
                <div className="text-2xl font-bold text-blue-600">
                  {completedSteps}
                </div>
                <div className="text-xs text-gray-500 mt-1">Steps Completed</div>
              </div>

              {/* Progress percentage */}
              <div className="text-center p-3 bg-white rounded-lg border">
                <div className="text-2xl font-bold text-green-600">
                  {progress}%
                </div>
                <div className="text-xs text-gray-500 mt-1">Progress</div>
              </div>

              {/* Total validation checks */}
              <div className="text-center p-3 bg-white rounded-lg border">
                <div className="text-2xl font-bold text-gray-600">
                  {jobOutput.filter(log => !shouldFilterMessage(log)).length}
                </div>
                <div className="text-xs text-gray-500 mt-1">Validation Checks</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
