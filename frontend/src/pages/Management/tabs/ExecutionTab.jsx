/**
 * =============================================================================
 * EXECUTION TAB - ENHANCED ERROR VISIBILITY
 * =============================================================================
 *
 * VERSION: 2.3.0 - Enhanced Error Display and Visibility
 * AUTHOR: nikos
 * DATE: 2025-11-07
 * LAST UPDATED: 2025-11-10
 *
 * CRITICAL UPDATES (v2.3.0):
 * - Added prominent error summary card at top
 * - Enhanced error message display with filtering
 * - Improved visual hierarchy for failed operations
 * - Added quick navigation to technical details
 */

import React, { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CheckCircle,
  Circle,
  XCircle,
  AlertCircle,
  Loader2,
  AlertTriangle,
  Eye,
  EyeOff,
  PlayCircle
} from 'lucide-react';

// =============================================================================
// SECTION 1: MAIN COMPONENT
// =============================================================================

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
  scrollAreaRef
}) {

  // ===========================================================================
  // SUBSECTION 1.1: DEBUG - LOG WHAT WE'RE RECEIVING
  // ===========================================================================

  useEffect(() => {
    if (jobOutput.length > 0) {
      console.log("[EXECUTION_TAB] ========================================");
      console.log("[EXECUTION_TAB] Total messages:", jobOutput.length);
      console.log("[EXECUTION_TAB] Event types present:",
        [...new Set(jobOutput.map(e => e.event_type))]);
      console.log("[EXECUTION_TAB] Last 3 messages:", jobOutput.slice(-3));
      console.log("[EXECUTION_TAB] ========================================");
    }
  }, [jobOutput.length]);

  // ===========================================================================
  // SUBSECTION 1.2: FILTER STRUCTURED STEPS
  // ===========================================================================

  /**
   * Show ALL messages that have useful content.
   * Includes STEP_COMPLETE, OPERATION_START, OPERATION_COMPLETE, and LOG_MESSAGE with step info.
   */
  const structuredSteps = jobOutput.filter(entry => {
    // Include any message that looks like a step
    if (entry.event_type === 'STEP_COMPLETE') return true;
    if (entry.event_type === 'OPERATION_START') return true;
    if (entry.event_type === 'OPERATION_COMPLETE') return true;

    // Also include LOG_MESSAGE if it contains step information
    if (entry.event_type === 'LOG_MESSAGE' && entry.message) {
      // Check if message contains step patterns
      if (entry.message.includes('Step ') ||
          entry.message.includes('✅') ||
          entry.message.includes('❌') ||
          entry.message.includes('Checking') ||
          entry.message.includes('Validating') ||
          entry.message.includes('Retrieving')) {
        return true;
      }
    }

    return false;
  });

  /**
   * Get all messages for technical details view
   */
  const allMessages = jobOutput;

  /**
   * Extract error messages for prominent display
   */
  const errorMessages = jobOutput.filter(
    msg => msg.level === 'error' || msg.level === 'ERROR'
  );

  // ===========================================================================
  // SUBSECTION 1.3: DEBUG LOG FILTERED RESULTS
  // ===========================================================================

  useEffect(() => {
    console.log("[EXECUTION_TAB] Structured steps count:", structuredSteps.length);
    if (structuredSteps.length > 0) {
      console.log("[EXECUTION_TAB] First structured step:", structuredSteps[0]);
    }
    if (errorMessages.length > 0) {
      console.log("[EXECUTION_TAB] Error messages count:", errorMessages.length);
    }
  }, [structuredSteps.length, errorMessages.length]);

  // ===========================================================================
  // SUBSECTION 1.4: AUTO-SCROLL EFFECT
  // ===========================================================================

  useEffect(() => {
    if (scrollAreaRef?.current) {
      const scrollElement = scrollAreaRef.current;
      setTimeout(() => {
        if (scrollElement) {
          scrollElement.scrollTop = scrollElement.scrollHeight;
        }
      }, 100);
    }
  }, [jobOutput.length, scrollAreaRef]);

  // ===========================================================================
  // SUBSECTION 1.5: HELPER FUNCTIONS
  // ===========================================================================

  /**
   * Get icon for step based on message content and position
   */
  const getStepIcon = (message, isLastStep) => {
    if (message.includes('❌')) {
      return <XCircle className="h-5 w-5 text-red-500" />;
    } else if (message.includes('✅')) {
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    } else if (message.includes('⚠️')) {
      return <AlertCircle className="h-5 w-5 text-yellow-500" />;
    } else if (message.includes('⊘')) {
      return <Circle className="h-5 w-5 text-gray-300" />;
    } else if (isLastStep && isRunning) {
      return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
    } else {
      return <Circle className="h-5 w-5 text-blue-500 fill-blue-500" />;
    }
  };

  /**
   * Extract step number from message
   */
  const extractStepNumber = (message, fallbackIndex) => {
    const match = message.match(/Step (\d+)[/:]/);
    if (match) {
      return parseInt(match[1]);
    }
    return fallbackIndex + 1;
  };

  /**
   * Get status badge for overall operation
   */
  const getStatusBadge = () => {
    if (isRunning) {
      return (
        <Badge variant="default" className="bg-blue-500">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          In Progress
        </Badge>
      );
    }

    if (isComplete) {
      return (
        <Badge variant="default" className="bg-green-500">
          <CheckCircle className="h-3 w-3 mr-1" />
          Completed
        </Badge>
      );
    }

    if (hasError) {
      return (
        <Badge variant="destructive">
          <XCircle className="h-3 w-3 mr-1" />
          Failed
        </Badge>
      );
    }

    return (
      <Badge variant="outline">
        <Circle className="h-3 w-3 mr-1" />
        Idle
      </Badge>
    );
  };

  /**
   * Get status class for step styling
   */
  const getStepStatusClass = (message, isLastStep) => {
    if (message.includes('❌')) {
      return 'border-red-200 bg-red-50';
    } else if (message.includes('✅')) {
      return 'border-green-200 bg-green-50';
    } else if (message.includes('⚠️')) {
      return 'border-yellow-200 bg-yellow-50';
    } else if (message.includes('⊘')) {
      return 'border-gray-200 bg-gray-50 opacity-60';
    } else if (isLastStep && isRunning) {
      return 'border-blue-300 bg-blue-100 shadow-sm';
    } else {
      return 'border-blue-200 bg-blue-50';
    }
  };

  // =============================================================================
  // SECTION 2: RENDER
  // =============================================================================

  return (
    <div className="space-y-6">

      {/* ===================================================================
          SUBSECTION 2.1: ERROR SUMMARY CARD (NEW - v2.3.0)
          =================================================================== */}
      {hasError && errorMessages.length > 0 && (
        <Card className="border-red-200 bg-red-50 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700">
              <XCircle className="h-5 w-5" />
              Operation Failed - Error Details
            </CardTitle>
            <CardDescription className="text-red-600">
              The {currentPhase === 'pre_check' ? 'pre-check validation' : 'upgrade operation'}
              encountered critical errors and could not complete.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {errorMessages.slice(-3).map((msg, i) => (
                <div
                  key={i}
                  className="bg-white border-2 border-red-300 rounded-lg p-4 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <p className="text-xs text-red-500 font-medium">
                          {new Date(msg.timestamp).toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                          })}
                        </p>
                        <Badge variant="destructive" className="text-xs h-5">
                          {msg.event_type}
                        </Badge>
                      </div>
                      <p className="text-sm text-red-800 font-mono break-words leading-relaxed">
                        {msg.message}
                      </p>
                    </div>
                  </div>
                </div>
              ))}

              {errorMessages.length > 3 && (
                <p className="text-xs text-red-600 text-center">
                  Showing {Math.min(3, errorMessages.length)} of {errorMessages.length} error messages
                </p>
              )}

              <div className="pt-2 flex gap-2">
                <Button
                  onClick={onToggleTechnicalDetails}
                  variant="outline"
                  size="sm"
                  className="border-red-300 hover:bg-red-100"
                >
                  {showTechnicalDetails ? (
                    <>
                      <EyeOff className="h-4 w-4 mr-2" />
                      Hide Full Log
                    </>
                  ) : (
                    <>
                      <Eye className="h-4 w-4 mr-2" />
                      View Full Technical Log
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===================================================================
          SUBSECTION 2.2: PROGRESS OVERVIEW CARD
          =================================================================== */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>
              {currentPhase === 'pre_check' ? 'Pre-Check Validation' : 'Upgrade Execution'}
            </span>
            {getStatusBadge()}
          </CardTitle>
          <CardDescription>
            {currentPhase === 'pre_check'
              ? 'Validating device readiness for upgrade'
              : 'Executing device operating system upgrade'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Progress Bar */}
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">Overall Progress</span>
              <span className="font-medium">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {/* Step Counter */}
          {totalSteps > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Steps Completed</span>
              <span className="font-medium">{completedSteps} / {totalSteps}</span>
            </div>
          )}

          {/* Latest Step Message */}
          {latestStepMessage && (
            <div className="pt-2 border-t">
              <p className="text-sm text-muted-foreground mb-1">Current Step:</p>
              <p className="text-sm font-medium">{latestStepMessage}</p>
            </div>
          )}

          {/* DEBUG INFO */}
          {process.env.NODE_ENV === 'development' && (
            <div className="pt-2 border-t bg-yellow-50 p-2 rounded">
              <p className="text-xs text-yellow-800">
                <strong>Debug:</strong> Total messages: {jobOutput.length} |
                Structured steps: {structuredSteps.length} |
                Errors: {errorMessages.length} |
                Event types: {[...new Set(jobOutput.map(e => e.event_type))].join(', ')}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===================================================================
          SUBSECTION 2.3: STRUCTURED STEPS DISPLAY
          =================================================================== */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <CardTitle>Validation Steps</CardTitle>
              <CardDescription>
                {structuredSteps.length === 0
                  ? `Waiting for validation to begin... (${jobOutput.length} messages received)`
                  : `${structuredSteps.length} step${structuredSteps.length !== 1 ? 's' : ''} processed`}
              </CardDescription>
            </div>

            {/* Toggle Technical Details Button - ALWAYS VISIBLE */}
            <Button
              variant="outline"
              size="sm"
              onClick={onToggleTechnicalDetails}
              className="ml-4 flex-shrink-0"
            >
              {showTechnicalDetails ? (
                <>
                  <EyeOff className="h-4 w-4 mr-2" />
                  Hide Details
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 mr-2" />
                  Show Technical Details
                </>
              )}
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <ScrollArea className="h-[500px] pr-4" ref={scrollAreaRef}>

            {/* ============================================================
                USER-FRIENDLY STEP VIEW
                ============================================================ */}
            {!showTechnicalDetails && (
              <div className="space-y-3">

                {/* Loading State */}
                {structuredSteps.length === 0 && isRunning && (
                  <div className="text-center py-12 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3" />
                    <p className="text-sm font-medium">Starting validation...</p>
                    <p className="text-xs mt-1">Connecting to device and initializing checks</p>
                    {process.env.NODE_ENV === 'development' && (
                      <p className="text-xs mt-2 text-yellow-600">
                        ({jobOutput.length} messages received - check Technical Details)
                      </p>
                    )}
                  </div>
                )}

                {/* Empty state */}
                {structuredSteps.length === 0 && !isRunning && (
                  <div className="text-center py-12 text-muted-foreground">
                    <PlayCircle className="h-8 w-8 mx-auto mb-3 text-gray-300" />
                    <p className="text-sm font-medium">No validation steps yet</p>
                    <p className="text-xs mt-1">Start a pre-check to see validation progress here</p>
                  </div>
                )}

                {/* STEP DISPLAY */}
                {structuredSteps.map((step, index) => {
                  const isLastStep = index === structuredSteps.length - 1;
                  const stepNumber = extractStepNumber(step.message, index);
                  const icon = getStepIcon(step.message, isLastStep);

                  let displayMessage = step.message
                    .replace(/^Step \d+\/\d+:\s*/, '')
                    .replace(/^Step \d+:\s*/, '');

                  const statusClass = getStepStatusClass(step.message, isLastStep);

                  return (
                    <div
                      key={index}
                      className={`flex items-start gap-3 p-4 rounded-lg border transition-all ${statusClass}`}
                    >
                      <div className={`flex-shrink-0 w-8 h-8 rounded-full bg-white border-2 flex items-center justify-center text-sm font-bold shadow-sm ${
                        isLastStep && isRunning
                          ? 'border-blue-500 text-blue-600'
                          : 'border-gray-300 text-gray-600'
                      }`}>
                        {stepNumber}
                      </div>

                      <div className="flex-shrink-0 mt-1">
                        {icon}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium leading-relaxed ${
                          isLastStep && isRunning ? 'text-blue-700' : ''
                        }`}>
                          {displayMessage}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-xs text-muted-foreground">
                            {new Date(step.timestamp).toLocaleTimeString('en-US', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit'
                            })}
                          </p>
                          {isLastStep && isRunning && (
                            <Badge variant="outline" className="text-xs py-0 px-1.5 h-5">
                              In Progress
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-xs py-0 px-1.5 h-5">
                            {step.event_type}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  );
                })}

              </div>
            )}

            {/* ============================================================
                TECHNICAL DETAILS VIEW
                ============================================================ */}
            {showTechnicalDetails && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-3 pb-2 border-b sticky top-0 bg-white z-10">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  <p className="text-xs font-medium text-muted-foreground">
                    Technical Details - Advanced View ({allMessages.length} messages)
                  </p>
                </div>

                {allMessages.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="text-sm">No technical details available yet</p>
                  </div>
                ) : (
                  allMessages.map((msg, index) => {
                    let bgClass = 'bg-gray-50';
                    let borderClass = 'border-gray-200';
                    let textClass = 'text-gray-700';
                    let levelBadge = null;

                    if (msg.level === 'error' || msg.level === 'ERROR') {
                      bgClass = 'bg-red-50';
                      borderClass = 'border-red-200';
                      textClass = 'text-red-700';
                      levelBadge = <Badge variant="destructive" className="text-xs h-4 px-1">ERROR</Badge>;
                    } else if (msg.level === 'warning' || msg.level === 'WARNING') {
                      bgClass = 'bg-yellow-50';
                      borderClass = 'border-yellow-200';
                      textClass = 'text-yellow-700';
                      levelBadge = <Badge variant="outline" className="text-xs h-4 px-1 border-yellow-400">WARN</Badge>;
                    } else if (msg.event_type === 'STEP_COMPLETE') {
                      bgClass = 'bg-blue-50';
                      borderClass = 'border-blue-200';
                      textClass = 'text-blue-700';
                      levelBadge = <Badge variant="outline" className="text-xs h-4 px-1 border-blue-400">STEP</Badge>;
                    }

                    return (
                      <div
                        key={index}
                        className={`p-2 rounded border ${bgClass} ${borderClass}`}
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-xs font-mono text-muted-foreground flex-shrink-0">
                            {new Date(msg.timestamp).toLocaleTimeString('en-US', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit'
                            })}
                          </span>
                          <Badge variant="outline" className="text-xs h-4 px-1 flex-shrink-0">
                            {msg.event_type}
                          </Badge>
                          {levelBadge}
                          <span className={`text-xs font-mono ${textClass} break-all flex-1`}>
                            {msg.message}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

          </ScrollArea>
        </CardContent>
      </Card>

      {/* ===================================================================
          SUBSECTION 2.4: STATUS SUMMARY (Success/Failure)
          =================================================================== */}
      {(isComplete || hasError) && structuredSteps.length > 0 && (
        <Card className={hasError ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}>
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              {hasError ? (
                <XCircle className="h-8 w-8 text-red-500 flex-shrink-0" />
              ) : (
                <CheckCircle className="h-8 w-8 text-green-500 flex-shrink-0" />
              )}

              <div className="flex-1">
                <h3 className={`text-lg font-semibold mb-1 ${hasError ? 'text-red-700' : 'text-green-700'}`}>
                  {hasError ? 'Validation Failed' : 'Validation Completed'}
                </h3>
                <p className={`text-sm ${hasError ? 'text-red-600' : 'text-green-600'}`}>
                  {hasError
                    ? 'Pre-check validation encountered critical issues. Review the failed checks in the Review tab.'
                    : 'Pre-check validation completed successfully. Proceed to the Review tab to see detailed results.'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
