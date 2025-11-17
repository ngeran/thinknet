/**
 * =============================================================================
 * EXECUTION TAB - ENHANCED ERROR VISIBILITY & MESSAGE DISPLAY
 * =============================================================================
 *
 * VERSION: 2.5.0 - Fixed Message Display Issue
 * AUTHOR: nikos
 * DATE: 2025-11-07
 * LAST UPDATED: 2025-11-17
 *
 * CRITICAL UPDATES (v2.5.0):
 * - Fixed message filtering to show all 10 steps properly
 * - Improved LOG_MESSAGE detection for user-facing content
 * - Better handling of mixed event types
 * - Black and white color scheme maintained
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
   * Includes STEP_COMPLETE, OPERATION_START, OPERATION_COMPLETE, and user-facing LOG_MESSAGE.
   */
  const structuredSteps = jobOutput.filter(entry => {
    // Always include structured step events
    if (entry.event_type === 'STEP_COMPLETE') return true;
    if (entry.event_type === 'OPERATION_START') return true;
    if (entry.event_type === 'OPERATION_COMPLETE') return true;
    if (entry.event_type === 'PRE_CHECK_COMPLETE') return true;

    // Include LOG_MESSAGE or INFO messages if they contain step information
    if (entry.message && (entry.event_type === 'LOG_MESSAGE' || entry.event_type === 'INFO')) {
      const msg = entry.message.toLowerCase();

      // Check if message contains step patterns (be inclusive)
      if (entry.message.includes('Step ') ||
        entry.message.match(/step\s+\d+/i) ||
        entry.message.includes('✅') ||
        entry.message.includes('❌') ||
        entry.message.includes('⚠️') ||
        msg.includes('checking') ||
        msg.includes('validating') ||
        msg.includes('retrieving') ||
        msg.includes('verifying') ||
        msg.includes('connecting') ||
        msg.includes('connected') ||
        msg.includes('starting') ||
        msg.includes('completed') ||
        msg.includes('running') ||
        msg.includes('failed') ||
        msg.includes('success')) {
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
      console.log("[EXECUTION_TAB] All structured steps messages:",
        structuredSteps.map((s, i) => `${i}: ${s.message.substring(0, 100)}`));
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
   * Clean and format step message for user-friendly display
   */
  const cleanStepMessage = (message) => {
    // Remove timestamp and logging prefixes like "2025-11-11 00:11:04,669 - __main__ - INFO - [run.py:470] -"
    let cleaned = message
      .replace(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2},\d+\s+-\s+\S+\s+-\s+\w+\s+-\s+\[.*?\]\s+-\s*/, '')
      .replace(/^Step \d+\/\d+:\s*/, '')
      .replace(/^Step \d+:\s*/, '')
      .replace(/^[\[<].*?[\]>]\s*/, '') // Remove [timestamp] or <tag> prefixes
      .replace(/^INFO:\s*/i, '')
      .replace(/^DEBUG:\s*/i, '')
      .replace(/^WARNING:\s*/i, '')
      .replace(/^ERROR:\s*/i, '')
      .trim();

    // Remove emojis at the start
    cleaned = cleaned.replace(/^[✅❌⚠️⊘]\s*/, '');

    // Clean up common technical patterns
    cleaned = cleaned
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/^[-•]\s*/, '') // Remove bullet points
      .trim();

    // Capitalize first letter if not already
    if (cleaned.length > 0 && cleaned[0] === cleaned[0].toLowerCase()) {
      cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }

    return cleaned;
  };

  /**
   * Get icon for step based on message content and position
   */
  const getStepIcon = (message, isLastStep) => {
    if (message.includes('❌')) {
      return <XCircle className="h-5 w-5 text-gray-700" />;
    } else if (message.includes('✅')) {
      return <CheckCircle className="h-5 w-5 text-gray-900" />;
    } else if (message.includes('⚠️')) {
      return <AlertCircle className="h-5 w-5 text-gray-600" />;
    } else if (message.includes('⊘')) {
      return <Circle className="h-5 w-5 text-gray-300" />;
    } else if (isLastStep && isRunning) {
      return <Loader2 className="h-5 w-5 text-gray-900 animate-spin" />;
    } else {
      return <Circle className="h-5 w-5 text-gray-800 fill-gray-800" />;
    }
  };

  /**
   * Extract step number from message (before cleaning)
   * Returns null if no step number found (for non-step messages)
   */
  const extractStepNumber = (message) => {
    // Try to match "Step X/Y:" or "Step X:" format
    const match = message.match(/Step\s+(\d+)(?:\/\d+)?[:\s]/i);
    if (match) {
      return parseInt(match[1]);
    }
    return null; // Return null instead of fallback
  };

  /**
   * Get status badge for overall operation
   */
  const getStatusBadge = () => {
    if (isRunning) {
      return (
        <Badge variant="default" className="bg-gray-900">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          In Progress
        </Badge>
      );
    }

    if (isComplete) {
      return (
        <Badge variant="default" className="bg-gray-800">
          <CheckCircle className="h-3 w-3 mr-1" />
          Completed
        </Badge>
      );
    }

    if (hasError) {
      return (
        <Badge variant="destructive" className="bg-gray-700">
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
      return 'border-gray-400 bg-gray-100';
    } else if (message.includes('✅')) {
      return 'border-gray-800 bg-gray-50';
    } else if (message.includes('⚠️')) {
      return 'border-gray-400 bg-gray-100';
    } else if (message.includes('⊘')) {
      return 'border-gray-200 bg-white opacity-60';
    } else if (isLastStep && isRunning) {
      return 'border-gray-900 bg-gray-100 shadow-sm';
    } else {
      return 'border-gray-300 bg-gray-50';
    }
  };

  // =============================================================================
  // SECTION 2: RENDER
  // =============================================================================

  return (
    <div className="space-y-6">

      {/* ===================================================================
          SUBSECTION 2.1: ERROR SUMMARY CARD (v2.3.0)
          =================================================================== */}
      {hasError && errorMessages.length > 0 && (
        <Card className="border-gray-400 bg-gray-100 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-900">
              <XCircle className="h-5 w-5" />
              Operation Failed - Error Details
            </CardTitle>
            <CardDescription className="text-gray-700">
              The {currentPhase === 'pre_check' ? 'pre-check validation' : 'upgrade operation'}
              encountered critical errors and could not complete.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {errorMessages.slice(-3).map((msg, i) => (
                <div
                  key={i}
                  className="bg-white border-2 border-gray-500 rounded-lg p-4 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-gray-800 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <p className="text-xs text-gray-600 font-medium">
                          {new Date(msg.timestamp).toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                          })}
                        </p>
                        <Badge variant="outline" className="text-xs h-5 border-gray-600">
                          {msg.event_type}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-900 font-mono break-words leading-relaxed">
                        {msg.message}
                      </p>
                    </div>
                  </div>
                </div>
              ))}

              {errorMessages.length > 3 && (
                <p className="text-xs text-gray-700 text-center">
                  Showing {Math.min(3, errorMessages.length)} of {errorMessages.length} error messages
                </p>
              )}

              <div className="pt-2 flex gap-2">
                <Button
                  onClick={onToggleTechnicalDetails}
                  variant="outline"
                  size="sm"
                  className="border-gray-400 hover:bg-gray-200"
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

                  // Extract step number and label from ORIGINAL message (before cleaning)
                  const stepLabelMatch = step.message.match(/(Step\s+\d+(?:\/\d+)?)/i);
                  const stepLabel = stepLabelMatch ? stepLabelMatch[1] : null;

                  const displayMessage = cleanStepMessage(step.message);
                  const statusClass = getStepStatusClass(step.message, isLastStep);

                  // Determine status icon for the circle
                  let circleIcon;
                  let circleClass;

                  if (step.message.includes('❌') || step.message.toLowerCase().includes('failed')) {
                    circleIcon = <XCircle className="h-5 w-5 text-gray-800" />;
                    circleClass = 'bg-gray-200 border-gray-400';
                  } else if (step.message.includes('✅') || step.message.toLowerCase().includes('success')) {
                    circleIcon = <CheckCircle className="h-5 w-5 text-gray-900" />;
                    circleClass = 'bg-white border-gray-800';
                  } else if (step.message.includes('⚠️') || step.message.toLowerCase().includes('warning')) {
                    circleIcon = <AlertCircle className="h-5 w-5 text-gray-700" />;
                    circleClass = 'bg-gray-100 border-gray-500';
                  } else if (isLastStep && isRunning) {
                    circleIcon = <Loader2 className="h-5 w-5 text-gray-900 animate-spin" />;
                    circleClass = 'bg-white border-gray-900';
                  } else {
                    circleIcon = <CheckCircle className="h-5 w-5 text-gray-700" />;
                    circleClass = 'bg-white border-gray-600';
                  }

                  return (
                    <div
                      key={index}
                      className={`flex items-start gap-3 p-4 rounded-lg border transition-all ${statusClass}`}
                    >
                      {/* Status icon circle */}
                      <div className={`flex-shrink-0 w-10 h-10 rounded-full border-2 flex items-center justify-center shadow-sm ${circleClass}`}>
                        {circleIcon}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium leading-relaxed ${isLastStep && isRunning ? 'text-gray-900' : 'text-gray-800'
                          }`}>
                          {stepLabel && <span className="font-semibold">{stepLabel}: </span>}
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
                  <AlertTriangle className="h-4 w-4 text-gray-600" />
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
                      bgClass = 'bg-gray-100';
                      borderClass = 'border-gray-600';
                      textClass = 'text-gray-900';
                      levelBadge = <Badge variant="outline" className="text-xs h-4 px-1 border-gray-600">ERROR</Badge>;
                    } else if (msg.level === 'warning' || msg.level === 'WARNING') {
                      bgClass = 'bg-gray-50';
                      borderClass = 'border-gray-400';
                      textClass = 'text-gray-800';
                      levelBadge = <Badge variant="outline" className="text-xs h-4 px-1 border-gray-400">WARN</Badge>;
                    } else if (msg.event_type === 'STEP_COMPLETE') {
                      bgClass = 'bg-gray-50';
                      borderClass = 'border-gray-300';
                      textClass = 'text-gray-800';
                      levelBadge = <Badge variant="outline" className="text-xs h-4 px-1 border-gray-500">STEP</Badge>;
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
        <Card className={hasError ? 'border-gray-400 bg-gray-100' : 'border-gray-800 bg-gray-50'}>
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              {hasError ? (
                <XCircle className="h-8 w-8 text-gray-700 flex-shrink-0" />
              ) : (
                <CheckCircle className="h-8 w-8 text-gray-900 flex-shrink-0" />
              )}

              <div className="flex-1">
                <h3 className={`text-lg font-semibold mb-1 ${hasError ? 'text-gray-900' : 'text-gray-900'}`}>
                  {hasError ? 'Validation Failed' : 'Validation Completed'}
                </h3>
                <p className={`text-sm ${hasError ? 'text-gray-700' : 'text-gray-700'}`}>
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
