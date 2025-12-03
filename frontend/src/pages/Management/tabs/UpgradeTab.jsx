/**
 * =============================================================================
 * UPGRADE EXECUTION TAB COMPONENT v2.0.0
 * =============================================================================
 *
 * Real-time upgrade execution monitoring with elapsed timer
 *
 * ENHANCEMENTS v2.0.0 (2025-11-20 15:25:23 UTC):
 * - Added elapsed time tracking and display
 * - Timer shows in header during upgrade execution
 * - Consistent message filtering with ExecutionTab
 * - Enhanced UX with elapsed duration visibility
 *
 * FEATURES:
 * - Live upgrade progress during execution
 * - Filtered user-facing messages (removes XML/SSH noise)
 * - Technical details toggle for troubleshooting
 * - Elapsed time counter updates every second
 * - Auto-transitions to Results tab on completion
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  CheckCircle,
  XCircle,
  Circle,
  Loader2,
  AlertCircle,
  Info,
  Terminal,
  Rocket,
  RotateCw,
  HardDrive,
  Wifi,
  ShieldAlert,
  Clock,
} from 'lucide-react';

import { shouldShowToUser } from '../utils/messageFiltering';

// =============================================================================
// SECTION 1: HELPER COMPONENTS
// =============================================================================

/**
 * Status Badge Component
 * Visual indicator for upgrade execution state
 */
function UpgradeStatusBadge({ status, isRunning }) {
  if (isRunning) {
    return (
      <Badge variant="default" className="bg-blue-600 animate-pulse">
        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        Upgrading...
      </Badge>
    );
  }

  if (status === 'success') {
    return (
      <Badge variant="default" className="bg-green-600">
        <CheckCircle className="h-3 w-3 mr-1" />
        Completed
      </Badge>
    );
  }

  if (status === 'failed') {
    return (
      <Badge variant="destructive">
        <XCircle className="h-3 w-3 mr-1" />
        Failed
      </Badge>
    );
  }

  return (
    <Badge variant="outline">
      <AlertCircle className="h-3 w-3 mr-1" />
      Idle
    </Badge>
  );
}

/**
 * Elapsed Time Display Component
 * Shows formatted elapsed time during upgrade
 */
function ElapsedTimeDisplay({ isRunning, jobOutput }) {
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    if (!isRunning || jobOutput.length === 0) {
      return;
    }

    // Find the first message timestamp
    const firstMessage = jobOutput[0];
    if (!firstMessage?.timestamp) {
      return;
    }

    const startTime = new Date(firstMessage.timestamp).getTime();

    const interval = setInterval(() => {
      const now = new Date().getTime();
      const elapsed = Math.floor((now - startTime) / 1000);
      setElapsedTime(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, jobOutput]);

  // Format elapsed time as HH:MM:SS
  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-blue-100 border border-blue-300">
      <Clock className="h-4 w-4 text-blue-600" />
      <span className="text-sm font-mono font-semibold text-blue-900">
        {formatTime(elapsedTime)}
      </span>
    </div>
  );
}

/**
 * Progress Card Component - Matches ExecutionTab styling
 * Displays overall upgrade progress with visual indicators
 */
function UpgradeProgressCard({ progress, completedSteps, totalSteps, isRunning, elapsedTime, currentPhase, isComplete, hasError }) {
  const getPhaseMessage = (phase) => {
    switch (phase) {
      case 'connection': return '🔌 Establishing device connection...';
      case 'version_detection': return '📋 Detecting current software version...';
      case 'package_installation': return '📦 Installing software package (this may take 10-15 minutes)...';
      case 'device_reboot': return '🔄 Device rebooting and reconnecting...';
      case 'version_verification': return '🔎 Verifying new software version...';
      case 'completion': return '✅ Finalizing upgrade...';
      default: return '🚀 Upgrade in progress... This may take 10-15 minutes';
    }
  };

  const getStatusBadge = () => {
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
        Running
      </Badge>
    );
  };

  return (
    <Card className="border-gray-300">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2">
              <Rocket className="h-4 w-4" />
              Upgrade Progress
              {isRunning && (
                <Loader2 className="h-3 w-3 animate-spin" />
              )}
            </CardTitle>
            <CardDescription>
              Device software upgrade execution with real-time monitoring
              {currentPhase && ` • Phase: ${currentPhase}`}
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            {isRunning && <ElapsedTimeDisplay isRunning={isRunning} jobOutput={[]} />}
            {getStatusBadge()}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
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

        {/* Status indicator */}
        {isRunning && (
          <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm font-medium">
              {getPhaseMessage(currentPhase)}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Step Icon Component
 * Returns appropriate icon based on step message content
 */
function UpgradeStepIcon({ message, passed }) {
  const messageLower = message.toLowerCase();

  if (messageLower.includes('install')) {
    return <HardDrive className="h-5 w-5 text-blue-600" />;
  }

  if (messageLower.includes('reboot') || messageLower.includes('recover')) {
    return <RotateCw className="h-5 w-5 text-orange-600" />;
  }

  if (messageLower.includes('verif') || messageLower.includes('version')) {
    return <CheckCircle className="h-5 w-5 text-purple-600" />;
  }

  if (messageLower.includes('connect') || messageLower.includes('reach')) {
    return <Wifi className="h-5 w-5 text-green-600" />;
  }

  if (messageLower.includes('error') || messageLower.includes('fail') || messageLower.includes('warn')) {
    return <ShieldAlert className="h-5 w-5 text-red-600" />;
  }

  if (passed) {
    return <CheckCircle className="h-5 w-5 text-green-600" />;
  }

  return <XCircle className="h-5 w-5 text-red-600" />;
}

/**
 * Clean Step Message Function
 * Removes prefixes for cleaner display
 */
function cleanStepMessage(message) {
  if (!message) return 'No message';

  let cleaned = message;
  cleaned = cleaned.replace(/^Step \d+\/\d+:\s*/i, '');
  cleaned = cleaned.replace(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3} - /, '');
  cleaned = cleaned.replace(/^(INFO|DEBUG|WARNING|ERROR|CRITICAL)\s+-\s+/, '');
  cleaned = cleaned.replace(/^\[[^\]]+\]\s*/, '');
  cleaned = cleaned.trim();

  return cleaned || 'Processing...';
}

/**
 * Message Priority Indicator Component
 * Visual indicator for message severity
 */
function MessagePriorityIndicator({ level }) {
  const getColor = () => {
    switch (level) {
      case 'error': return 'bg-red-500';
      case 'warning': return 'bg-orange-500';
      case 'success': return 'bg-green-500';
      default: return 'bg-blue-500';
    }
  };

  return (
    <div className={`w-2 h-2 rounded-full ${getColor()} flex-shrink-0 mt-2`} />
  );
}

/**
 * Get status class for step styling - matches ExecutionTab
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
  } else if (isLastStep) {
    return 'border-gray-900 bg-gray-100 shadow-sm';
  } else {
    return 'border-gray-300 bg-gray-50';
  }
};

/**
 * Get status circle class for step icons
 */
const getStatusCircleClass = (message, isLastStep) => {
  if (message?.includes('❌')) {
    return 'bg-gray-200 border-gray-400';
  } else if (message?.includes('✅')) {
    return 'bg-white border-gray-800';
  } else if (message?.includes('⚠️')) {
    return 'bg-gray-100 border-gray-500';
  } else if (message?.includes('🔍')) {
    return 'bg-white border-gray-900';
  } else if (isLastStep) {
    return 'bg-white border-gray-900';
  } else {
    return 'bg-white border-gray-600';
  }
};

/**
 * Get status icon for step
 */
const getStatusIcon = (message, isLastStep) => {
  if (message?.includes('❌') || message?.toLowerCase().includes('failed')) {
    return <XCircle className="h-5 w-5 text-gray-800" />;
  } else if (message?.includes('✅') || message?.toLowerCase().includes('success') || message?.toLowerCase().includes('passed')) {
    return <CheckCircle className="h-5 w-5 text-gray-900" />;
  } else if (message?.includes('⚠️') || message?.toLowerCase().includes('warning')) {
    return <AlertCircle className="h-5 w-5 text-gray-700" />;
  } else if (message?.includes('🔍')) {
    return <Loader2 className="h-5 w-5 text-gray-900 animate-spin" />;
  } else if (isLastStep) {
    return <Loader2 className="h-5 w-5 text-gray-900 animate-spin" />;
  } else {
    return <CheckCircle className="h-5 w-5 text-gray-700" />;
  }
};

// =============================================================================
// SECTION 2: MAIN UPGRADE TAB COMPONENT
// =============================================================================

/**
 * UpgradeTab Component
 * Primary component for upgrade execution monitoring
 *
 * ENHANCEMENTS v2.0.0:
 * - Integrated elapsed time tracking
 * - Uses messageFiltering.js for consistent message display
 * - Provides real-time upgrade execution feedback
 */
export default function UpgradeTab({
  jobStatus,
  isRunning,
  isComplete,
  hasError,
  progress,
  completedSteps,
  totalSteps,
  currentPhase,
  jobOutput,
  showTechnicalDetails,
  onToggleTechnicalDetails,
  scrollAreaRef,
}) {
  const [elapsedTime, setElapsedTime] = useState(0);

  // ==========================================================================
  // SECTION 3: TIMER EFFECT
  // ==========================================================================

  /**
   * Track elapsed time during upgrade
   * Updates every second while upgrade is running
   */
  useEffect(() => {
    if (!isRunning || jobOutput.length === 0) {
      return;
    }

    const firstMessage = jobOutput[0];
    if (!firstMessage?.timestamp) {
      return;
    }

    const startTime = new Date(firstMessage.timestamp).getTime();

    const interval = setInterval(() => {
      const now = new Date().getTime();
      const elapsed = Math.floor((now - startTime) / 1000);
      setElapsedTime(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, jobOutput]);

  // ==========================================================================
  // SECTION 4: MESSAGE FILTERING
  // ==========================================================================

  const userFacingMessages = jobOutput.filter(shouldShowToUser);

  // ==========================================================================
  // SECTION 5: STATUS CALCULATIONS
  // ==========================================================================

  const hasCriticalErrors = jobOutput.some(log =>
    log.level === 'error' &&
    (log.message?.includes('failed') || log.message?.includes('error'))
  );

  const hasWarnings = jobOutput.some(log => log.level === 'warning');

  const recentActivity = jobOutput.length > 0 ?
    new Date(jobOutput[jobOutput.length - 1].timestamp).toLocaleTimeString() :
    'No activity';

  // ==========================================================================
  // SECTION 6: EMPTY STATE
  // ==========================================================================

  if (jobOutput.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="pt-6">
          <div className="text-center py-12">
            <Rocket className="h-16 w-16 mx-auto text-muted-foreground mb-4 opacity-50" />
            <p className="text-lg font-medium text-muted-foreground mb-2">
              Waiting for upgrade to start...
            </p>
            <p className="text-sm text-gray-500 max-w-md mx-auto">
              Upgrade execution will begin after pre-check approval.
              The system will automatically navigate to this tab when the upgrade starts.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ==========================================================================
  // SECTION 7: MAIN RENDER
  // ==========================================================================

  return (
    <div className="space-y-6 max-w-6xl mx-auto">

      {/* ====================================================================
          HEADER SECTION WITH ELAPSED TIME
          ==================================================================== */}
      <Card className="border-gray-300">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${hasError ? 'bg-red-100' :
                isComplete ? 'bg-green-100' :
                  'bg-gray-100'
                }`}>
                <Rocket className={`h-6 w-6 ${hasError ? 'text-red-600' :
                  isComplete ? 'text-green-600' :
                    ''
                  }`} />
              </div>
              <div className="flex-1">
                <CardTitle>Device Software Upgrade</CardTitle>
                <CardDescription>
                  {hasError ? 'Upgrade encountered issues' :
                    isComplete ? 'Upgrade completed successfully' :
                      'Installing software, rebooting device, and verifying upgrade'}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Last Activity</p>
                <p className="text-sm font-medium">{recentActivity}</p>
              </div>
              {isRunning && (
                <ElapsedTimeDisplay isRunning={isRunning} jobOutput={jobOutput} />
              )}
              <UpgradeStatusBadge status={jobStatus} isRunning={isRunning} />
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* ====================================================================
          PROGRESS SECTION
          ==================================================================== */}
      <UpgradeProgressCard
        progress={progress}
        completedSteps={completedSteps}
        totalSteps={totalSteps}
        isRunning={isRunning}
        elapsedTime={elapsedTime}
        currentPhase={currentPhase}
        isComplete={isComplete}
        hasError={hasError}
      />

      {/* ====================================================================
          UPGRADE STEPS SECTION
          ==================================================================== */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Upgrade Execution Steps</CardTitle>
              <CardDescription>
                {userFacingMessages.length} user-facing messages
                {hasWarnings && ' • Contains warnings'}
                {hasCriticalErrors && ' • Contains errors'}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onToggleTechnicalDetails}
              className="flex items-center gap-2"
            >
              <Terminal className="h-3 w-3" />
              {showTechnicalDetails ? 'Hide' : 'Show'} Technical Details
            </Button>
          </div>
        </CardHeader>
        <CardContent>

          {/* User-Facing Messages */}
          {!showTechnicalDetails && (
            <ScrollArea className="h-[500px] pr-4" ref={scrollAreaRef}>
              <div className="space-y-3">
                {userFacingMessages.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Info className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No user-facing messages to display</p>
                    <p className="text-sm">Switch to technical details to see all logs</p>
                  </div>
                ) : (
                  userFacingMessages.map((step, index) => {
                    const isPassed = step.message?.includes('✅') ||
                      step.message?.toLowerCase().includes('success') ||
                      step.message?.toLowerCase().includes('complete') ||
                      step.message?.toLowerCase().includes('verified');
                    const isFailed = step.message?.includes('❌') ||
                      step.message?.toLowerCase().includes('fail') ||
                      step.message?.toLowerCase().includes('error');
                    const isWarning = step.message?.toLowerCase().includes('warn') ||
                      step.level === 'warning';

                    const displayMessage = cleanStepMessage(step.message || '');

                    return (
                      <div
                        key={index}
                        className={`flex items-start gap-3 p-4 rounded-lg border ${getStepStatusClass(step.message, isRunning && index === userFacingMessages.length - 1)}`}>

                        <div className={`flex-shrink-0 w-10 h-10 rounded-full border-2 flex items-center justify-center ${getStatusCircleClass(step.message, isRunning && index === userFacingMessages.length - 1)}`}>
                          {getStatusIcon(step.message, isRunning && index === userFacingMessages.length - 1)}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium break-words leading-relaxed">
                            {displayMessage}
                          </p>
                          {step.timestamp && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(step.timestamp).toLocaleTimeString('en-US', {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit'
                              })}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          )}

          {/* Technical Details View */}
          {showTechnicalDetails && (
            <ScrollArea className="h-[500px] pr-4" ref={scrollAreaRef}>
              <div className="space-y-2">
                {jobOutput.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Terminal className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No log messages available</p>
                  </div>
                ) : (
                  jobOutput.map((log, index) => {
                    const isRecent = index === jobOutput.length - 1;
                    return (
                      <div
                        key={index}
                        className={`p-3 rounded border font-mono text-xs transition-colors ${isRecent ? 'bg-blue-50 border-blue-200' :
                          log.level === 'error' ? 'bg-red-50 border-red-200' :
                            log.level === 'warning' ? 'bg-orange-50 border-orange-200' :
                              log.level === 'success' ? 'bg-green-50 border-green-200' :
                                'bg-gray-50 border-gray-200'
                          }`}
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-gray-500 flex-shrink-0 whitespace-nowrap">
                            {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '--:--:--'}
                          </span>
                          <span className={`flex-shrink-0 font-semibold ${log.level === 'error' ? 'text-red-600' :
                            log.level === 'warning' ? 'text-orange-600' :
                              log.level === 'success' ? 'text-green-600' :
                                'text-blue-600'
                            }`}>
                            [{log.event_type || 'LOG'}]
                          </span>
                          <span className="text-gray-800 break-all leading-relaxed">
                            {log.message}
                          </span>
                          {isRecent && (
                            <span className="flex-shrink-0 text-blue-600 text-xs font-medium bg-blue-100 px-1 rounded">
                              LATEST
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          )}

        </CardContent>
      </Card>

      {/* ====================================================================
          STATUS ALERTS
          ==================================================================== */}
      {isComplete && !hasError && (
        <Card className="border-green-200 bg-green-50 border-l-4 border-l-green-500">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-8 w-8 text-green-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-green-900">
                  Upgrade completed successfully!
                </p>
                <p className="text-sm text-green-700 mt-1">
                  Device is now running the new software version. View detailed results in the Results tab.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {hasError && (
        <Card className="border-red-200 bg-red-50 border-l-4 border-l-red-500">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <XCircle className="h-8 w-8 text-red-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-red-900">
                  Upgrade failed
                </p>
                <p className="text-sm text-red-700 mt-1">
                  An error occurred during upgrade execution. Check the technical details above for specific error information.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ====================================================================
          INFORMATION NOTICE
          ==================================================================== */}
      {isRunning && (
        <Card className="border-blue-200 bg-blue-50 border-l-4 border-l-blue-500">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-700">
                <p className="font-medium mb-2">Upgrade Process Information:</p>
                <ul className="list-disc list-inside space-y-1 text-blue-600">
                  <li>Device will reboot during upgrade (typically 5-10 minutes)</li>
                  <li>Connection will be temporarily lost during reboot</li>
                  <li>System will automatically verify version after recovery</li>
                  <li>Do not close this window until upgrade completes</li>
                  <li>Progress may pause during reboot - this is normal</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ====================================================================
          WARNING ALERT
          ==================================================================== */}
      {hasWarnings && !hasError && (
        <Card className="border-orange-200 bg-orange-50 border-l-4 border-l-orange-500">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-6 w-6 text-orange-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-orange-900">
                  Upgrade completed with warnings
                </p>
                <p className="text-sm text-orange-700 mt-1">
                  The upgrade completed but some non-critical issues were detected. Review the messages above for details.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
