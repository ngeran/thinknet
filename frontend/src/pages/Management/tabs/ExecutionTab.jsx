/**
 * =============================================================================
 * EXECUTION TAB - SIMPLIFIED WITH CENTRALIZED FILTERING
 * =============================================================================
 *
 * VERSION: 3.0.0 - Centralized Filtering Architecture
 * AUTHOR: nikos-geranios_vgi
 * DATE: 2025-11-18 15:27:44 UTC
 * LAST UPDATED: 2025-11-18 15:27:44 UTC
 *
 * CRITICAL ARCHITECTURAL CHANGE (v3.0.0):
 * - Removed 200+ lines of inline filtering logic
 * - Imported shouldShowToUser from messageFiltering.js
 * - Component now focuses ONLY on display, not filtering logic
 * - All filtering rules centralized in utils/messageFiltering.js
 *
 * BENEFITS:
 * ✅ Cleaner, more maintainable component (650 lines → 450 lines)
 * ✅ Filtering logic testable in isolation
 * ✅ Easy to update filters without touching UI code
 * ✅ Other components can reuse same filtering
 * ✅ Single source of truth for all filtering rules
 *
 * PREVIOUS UPDATES (v2.7.1):
 * - Enhanced message filtering
 * - Better check visibility
 * - Comprehensive console logging
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
// CRITICAL IMPORT v3.0.0: Centralized message filtering
// =============================================================================
// ExecutionTab.jsx location: tabs/ExecutionTab.jsx
// messageFiltering.js location: utils/messageFiltering.js
// Path from tabs/ to utils/: ../utils/
import { shouldShowToUser, getFilteringStats } from '../utils/messageFiltering';
 
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
  // Add progress logging
  useEffect(() => {
    console.log("[EXECUTION_TAB] 📊 Progress updated:", {
      progress,
      isRunning,
      isComplete,
      hasError,
      currentPhase
    });
  }, [progress, isRunning, isComplete, hasError, currentPhase]);
 
  // ===========================================================================
  // SUBSECTION 1.1: DEBUG - LOG WHAT WE'RE RECEIVING
  // ===========================================================================
 
  useEffect(() => {
    if (jobOutput && jobOutput.length > 0) {
      console.log("[EXECUTION_TAB] ========================================");
      console.log("[EXECUTION_TAB] Component Update v3.0.0");
      console.log("[EXECUTION_TAB] Date: 2025-11-18 15:27:44 UTC");
      console.log("[EXECUTION_TAB] User: nikos-geranios_vgi");
      console.log("[EXECUTION_TAB] Total messages:", jobOutput.length);
      console.log("[EXECUTION_TAB] Event types:", [...new Set(jobOutput.map(e => e.event_type))]);
 
      // NEW v3.0.0: Use centralized stats function
      const stats = getFilteringStats(jobOutput);
      console.log("[EXECUTION_TAB] Filtering stats:", stats);
      console.log("[EXECUTION_TAB] Messages shown to user:", stats?.shown);
      console.log("[EXECUTION_TAB] Messages hidden as noise:", stats?.hidden);
      console.log("[EXECUTION_TAB] ========================================");
    }
  }, [jobOutput?.length]);
 
  // ===========================================================================
  // SUBSECTION 1.2: FILTER STRUCTURED STEPS - SIMPLIFIED v3.0.0
  // ===========================================================================
 
  /**
   * Filter messages using centralized filtering logic.
   *
   * SIMPLIFICATION v3.0.0:
   * - Removed 200+ lines of inline filtering logic
   * - Now just calls shouldShowToUser() from messageFiltering.js
   * - All filtering rules managed in one place
   * - Component focuses only on display
   */
  const structuredSteps = (jobOutput || []).filter(shouldShowToUser);
 
  /**
   * Get all messages for technical details view (unfiltered)
   */
  const allMessages = jobOutput || [];
 
  /**
   * Extract error messages for prominent display
   */
  const errorMessages = (jobOutput || []).filter(
    msg => msg.level === 'error' || msg.level === 'ERROR'
  );
 
  // ===========================================================================
  // SUBSECTION 1.3: DEBUG LOG FILTERED RESULTS
  // ===========================================================================
 
  useEffect(() => {
    if (jobOutput && jobOutput.length > 0) {
      console.log("[EXECUTION_TAB] Filtered results:");
      console.log("[EXECUTION_TAB] - Shown to user:", structuredSteps.length);
      console.log("[EXECUTION_TAB] - Hidden:", jobOutput.length - structuredSteps.length);
 
      if (structuredSteps.length > 0) {
        console.log("[EXECUTION_TAB] First 3 shown messages:");
        structuredSteps.slice(0, 3).forEach((step, i) => {
          console.log(`[EXECUTION_TAB]   ${i+1}. ${step.event_type}: ${step.message?.substring(0, 60)}`);
        });
      }
    }
  }, [structuredSteps.length, jobOutput?.length]);
 
  // ===========================================================================
  // SUBSECTION 1.4: AUTO-SCROLL EFFECT
  // ===========================================================================
 
  useEffect(() => {
    if (scrollAreaRef?.current) {
      setTimeout(() => {
        if (scrollAreaRef?.current) {
          scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
        }
      }, 100);
    }
  }, [jobOutput?.length, scrollAreaRef]);
 
  // ===========================================================================
  // SUBSECTION 1.5: HELPER FUNCTIONS
  // ===========================================================================
 
  /**
   * Clean and format step message for user-friendly display.
   * Removes timestamps, logging prefixes, and technical noise.
   */
  const cleanStepMessage = (message) => {
    let cleaned = message
      .replace(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2},\d+\s+-\s+\S+\s+-\s+\w+\s+-\s+\[.*?\]\s+-\s*/, '')
      .replace(/^Step \d+\/\d+:\s*/, '')
      .replace(/^Step \d+:\s*/, '')
      .replace(/^[\[<].*?[\]>]\s*/, '')
      .replace(/^INFO:\s*/i, '')
      .replace(/^DEBUG:\s*/i, '')
      .replace(/^WARNING:\s*/i, '')
      .replace(/^ERROR:\s*/i, '')
      .trim();
 
    cleaned = cleaned.replace(/^[✅❌⚠️⊘🔍]\s*/, '');
    cleaned = cleaned.replace(/\s+/g, ' ').replace(/^[-•]\s*/, '').trim();
 
    if (cleaned.length > 0 && cleaned[0] === cleaned[0].toLowerCase()) {
      cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }
 
    return cleaned;
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
    if (message?.includes('❌')) {
      return 'border-gray-400 bg-gray-100';
    } else if (message?.includes('✅')) {
      return 'border-gray-800 bg-gray-50';
    } else if (message?.includes('⚠️')) {
      return 'border-gray-400 bg-gray-100';
    } else if (message?.includes('⊘')) {
      return 'border-gray-200 bg-white opacity-60';
    } else if (message?.includes('🔍')) {
      return 'border-gray-900 bg-gray-100 shadow-sm';
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
          SUBSECTION 2.1: ERROR SUMMARY CARD
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
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">Overall Progress</span>
              <span className="font-medium">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
 
          {totalSteps > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Steps Completed</span>
              <span className="font-medium">{completedSteps} / {totalSteps}</span>
            </div>
          )}
        </CardContent>
      </Card>
 
      {/* ===================================================================
          SUBSECTION 2.3: VALIDATION STEPS CARD
          =================================================================== */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <CardTitle>Validation Steps</CardTitle>
              <CardDescription>
                {structuredSteps.length === 0
                  ? `Waiting for validation... (${jobOutput?.length || 0} messages received)`
                  : `${structuredSteps.length} step${structuredSteps.length !== 1 ? 's' : ''} processed`}
              </CardDescription>
            </div>
 
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
 
            {!showTechnicalDetails && (
              <div className="space-y-3">
 
                {structuredSteps.length === 0 && isRunning && (
                  <div className="text-center py-12 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3" />
                    <p className="text-sm font-medium">Starting validation...</p>
                    <p className="text-xs mt-1">({jobOutput?.length || 0} messages received)</p>
                  </div>
                )}
 
                {structuredSteps.length === 0 && !isRunning && (
                  <div className="text-center py-12 text-muted-foreground">
                    <PlayCircle className="h-8 w-8 mx-auto mb-3 text-gray-300" />
                    <p className="text-sm font-medium">No validation steps yet</p>
                    <p className="text-xs mt-1">Start a pre-check to see validation progress here</p>
                  </div>
                )}
 
                {structuredSteps.map((step, index) => {
                  const isLastStep = index === structuredSteps.length - 1;
                  const stepLabelMatch = step.message?.match(/(Step\s+\d+(?:\/\d+)?)/i);
                  const stepLabel = stepLabelMatch ? stepLabelMatch[1] : null;
                  const displayMessage = cleanStepMessage(step.message || '');
                  const statusClass = getStepStatusClass(step.message || '', isLastStep);
 
                  let circleIcon;
                  let circleClass;
 
                  if (step.message?.includes('❌') || step.message?.toLowerCase().includes('failed')) {
                    circleIcon = <XCircle className="h-5 w-5 text-gray-800" />;
                    circleClass = 'bg-gray-200 border-gray-400';
                  } else if (step.message?.includes('✅') || step.message?.toLowerCase().includes('success') || step.message?.toLowerCase().includes('passed')) {
                    circleIcon = <CheckCircle className="h-5 w-5 text-gray-900" />;
                    circleClass = 'bg-white border-gray-800';
                  } else if (step.message?.includes('⚠️') || step.message?.toLowerCase().includes('warning')) {
                    circleIcon = <AlertCircle className="h-5 w-5 text-gray-700" />;
                    circleClass = 'bg-gray-100 border-gray-500';
                  } else if (step.message?.includes('🔍')) {
                    circleIcon = <Loader2 className="h-5 w-5 text-gray-900 animate-spin" />;
                    circleClass = 'bg-white border-gray-900';
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
                      <div className={`flex-shrink-0 w-10 h-10 rounded-full border-2 flex items-center justify-center shadow-sm ${circleClass}`}>
                        {circleIcon}
                      </div>
 
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium leading-relaxed ${isLastStep && isRunning ? 'text-gray-900' : 'text-gray-800'}`}>
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
