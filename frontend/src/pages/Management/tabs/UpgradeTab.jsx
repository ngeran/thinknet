/**
 * =============================================================================
 * UPGRADE EXECUTION TAB COMPONENT - ENHANCED v1.1.0
 * =============================================================================
 *
 * Real-time upgrade execution monitoring with progress tracking
 *
 * @module components/tabs/UpgradeTab
 * @author nikos-geranios_vgi
 * @date 2025-11-18
 * @created 2025-11-18 17:20:18 UTC
 * @updated 2025-11-18 22:45:00 UTC - Enhanced error handling and user feedback
 *
 * PURPOSE:
 * Dedicated tab for monitoring device software upgrade execution with real-time
 * progress updates, step-by-step visibility, and comprehensive status tracking.
 * Separates upgrade execution from pre-check validation for clearer UX.
 *
 * ARCHITECTURE:
 * - Displays live upgrade progress during execution
 * - Shows filtered user-facing messages (hides XML/SSH noise)
 * - Provides technical details toggle for troubleshooting
 * - Auto-transitions to Results tab on completion
 * - Integrates with WebSocket for real-time updates
 *
 * WORKFLOW:
 * 1. User clicks "Proceed with Upgrade" in Review tab
 * 2. System auto-navigates to this Upgrade tab
 * 3. Backend executes upgrade (install, reboot, verify)
 * 4. Tab displays progress messages in real-time
 * 5. On completion, auto-navigates to Results tab
 *
 * ENHANCEMENTS v1.1.0:
 * - Enhanced error state handling with detailed messages
 * - Improved progress tracking for multi-step operations
 * - Better visual feedback for connection states
 * - Enhanced technical details view with structured logging
 *
 * ENHANCEMENTS v1.0.0:
 * - Phase-specific branding (upgrade vs pre-check)
 * - Upgrade-specific progress indicators
 * - Installation progress tracking
 * - Reboot monitoring display
 * - Version verification status
 * - Technical details expandable section
 * - Clean message filtering
 * =============================================================================
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  Info,
  Terminal,
  Rocket,
  RotateCw,
  HardDrive,
  Wifi,
  ShieldAlert,
} from 'lucide-react';

import { shouldShowToUser } from '../utils/messageFiltering';

/**
 * =============================================================================
 * UPGRADE STATUS BADGE COMPONENT
 * =============================================================================
 *
 * Visual status indicator for upgrade execution state
 *
 * @param {string} status - Current job status
 * @param {boolean} isRunning - Whether upgrade is actively running
 * @returns {JSX.Element} Styled badge component
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
 * =============================================================================
 * UPGRADE PROGRESS CARD COMPONENT
 * =============================================================================
 *
 * Displays overall upgrade progress with visual indicators
 *
 * @param {number} progress - Progress percentage (0-100)
 * @param {number} completedSteps - Number of completed steps
 * @param {number} totalSteps - Total number of steps
 * @param {boolean} isRunning - Whether upgrade is running
 * @returns {JSX.Element} Progress card component
 */
function UpgradeProgressCard({ progress, completedSteps, totalSteps, isRunning }) {
  // Calculate progress color based on completion
  const getProgressColor = () => {
    if (progress >= 90) return 'bg-green-600';
    if (progress >= 70) return 'bg-blue-600';
    if (progress >= 50) return 'bg-blue-500';
    if (progress >= 30) return 'bg-blue-400';
    return 'bg-blue-300';
  };

  return (
    <Card className="border-l-4 border-l-blue-500">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Rocket className="h-4 w-4 text-blue-600" />
          Upgrade Progress
          {isRunning && (
            <Loader2 className="h-3 w-3 text-blue-600 animate-spin" />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Overall Progress</span>
            <span className="font-medium">{progress}%</span>
          </div>
          <Progress value={progress} className={`h-2 ${getProgressColor()}`} />
        </div>

        <Separator />

        {/* Step counter */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Steps Completed</span>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-blue-600">{completedSteps}</span>
            <span className="text-muted-foreground">/ {totalSteps || '?'}</span>
          </div>
        </div>

        {/* Status indicator */}
        {isRunning && (
          <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg border border-blue-200">
            <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
            <span className="text-sm text-blue-700 font-medium">
              Upgrade in progress... This may take 10-15 minutes
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * =============================================================================
 * UPGRADE STEP ICON COMPONENT
 * =============================================================================
 *
 * Returns appropriate icon based on step message content
 *
 * @param {string} message - Step message text
 * @param {boolean} passed - Whether step passed
 * @returns {JSX.Element} Icon component
 */
function UpgradeStepIcon({ message, passed }) {
  const messageLower = message.toLowerCase();

  // Installation step
  if (messageLower.includes('install')) {
    return <HardDrive className="h-5 w-5 text-blue-600" />;
  }

  // Reboot step
  if (messageLower.includes('reboot') || messageLower.includes('recover')) {
    return <RotateCw className="h-5 w-5 text-orange-600" />;
  }

  // Verification step
  if (messageLower.includes('verif') || messageLower.includes('version')) {
    return <CheckCircle className="h-5 w-5 text-purple-600" />;
  }

  // Connectivity step
  if (messageLower.includes('connect') || messageLower.includes('reach')) {
    return <Wifi className="h-5 w-5 text-green-600" />;
  }

  // Error/Warning step
  if (messageLower.includes('error') || messageLower.includes('fail') || messageLower.includes('warn')) {
    return <ShieldAlert className="h-5 w-5 text-red-600" />;
  }

  // Success/failure
  if (passed) {
    return <CheckCircle className="h-5 w-5 text-green-600" />;
  } else {
    return <XCircle className="h-5 w-5 text-red-600" />;
  }
}

/**
 * =============================================================================
 * CLEAN STEP MESSAGE FUNCTION
 * =============================================================================
 *
 * Removes step prefixes for cleaner display and enhances readability
 *
 * @param {string} message - Original message
 * @returns {string} Cleaned message
 */
function cleanStepMessage(message) {
  if (!message) return 'No message';

  let cleaned = message;

  // Remove "Step X/Y: " prefix if present
  cleaned = cleaned.replace(/^Step \d+\/\d+:\s*/i, '');

  // Remove common timestamp prefixes
  cleaned = cleaned.replace(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3} - /, '');

  // Remove log level prefixes
  cleaned = cleaned.replace(/^(INFO|DEBUG|WARNING|ERROR|CRITICAL)\s+-\s+/, '');

  // Remove module path prefixes
  cleaned = cleaned.replace(/^\[[^\]]+\]\s*/, '');

  // Trim whitespace
  cleaned = cleaned.trim();

  return cleaned || 'Processing...';
}

/**
 * =============================================================================
 * MESSAGE PRIORITY INDICATOR
 * =============================================================================
 *
 * Visual indicator for message priority/severity
 *
 * @param {string} level - Message level (error, warning, info, success)
 * @returns {JSX.Element} Priority indicator component
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
 * =============================================================================
 * MAIN UPGRADE TAB COMPONENT
 * =============================================================================
 *
 * Primary component for upgrade execution monitoring
 *
 * @param {Object} props - Component properties
 * @param {string} props.jobStatus - Current job status (idle/running/success/failed)
 * @param {boolean} props.isRunning - Whether upgrade is actively running
 * @param {boolean} props.isComplete - Whether upgrade has completed
 * @param {boolean} props.hasError - Whether upgrade encountered errors
 * @param {number} props.progress - Progress percentage (0-100)
 * @param {number} props.completedSteps - Number of completed steps
 * @param {number} props.totalSteps - Total number of steps
 * @param {Array} props.jobOutput - Array of output messages
 * @param {boolean} props.showTechnicalDetails - Whether to show technical logs
 * @param {Function} props.onToggleTechnicalDetails - Toggle technical details
 * @param {Object} props.scrollAreaRef - Ref for scroll area
 * @returns {JSX.Element} UpgradeTab component
 */
export default function UpgradeTab({
  jobStatus,
  isRunning,
  isComplete,
  hasError,
  progress,
  completedSteps,
  totalSteps,
  jobOutput,
  showTechnicalDetails,
  onToggleTechnicalDetails,
  scrollAreaRef,
}) {
  // =========================================================================
  // SUBSECTION: MESSAGE FILTERING
  // =========================================================================
  // Filter messages to show only user-facing content
  const userFacingMessages = jobOutput.filter(shouldShowToUser);

  // =========================================================================
  // SUBSECTION: STATUS CALCULATIONS
  // =========================================================================
  const hasCriticalErrors = jobOutput.some(log =>
    log.level === 'error' &&
    (log.message?.includes('failed') || log.message?.includes('error'))
  );

  const hasWarnings = jobOutput.some(log => log.level === 'warning');

  const recentActivity = jobOutput.length > 0 ?
    new Date(jobOutput[jobOutput.length - 1].timestamp).toLocaleTimeString() :
    'No activity';

  // =========================================================================
  // SUBSECTION: EMPTY STATE
  // =========================================================================
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

  // =========================================================================
  // SUBSECTION: MAIN RENDER
  // =========================================================================
  return (
    <div className="space-y-6 max-w-6xl mx-auto">

      {/* ====================================================================
          HEADER SECTION
          ==================================================================== */}
      <Card className={`border-l-4 ${hasError ? 'border-l-red-500 bg-red-50' :
          isComplete ? 'border-l-green-500 bg-green-50' :
            'border-l-blue-500 bg-gradient-to-r from-blue-50 to-white'
        }`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${hasError ? 'bg-red-100' :
                  isComplete ? 'bg-green-100' :
                    'bg-blue-100'
                }`}>
                <Rocket className={`h-6 w-6 ${hasError ? 'text-red-600' :
                    isComplete ? 'text-green-600' :
                      'text-blue-600'
                  }`} />
              </div>
              <div>
                <CardTitle className="text-xl">Device Software Upgrade</CardTitle>
                <CardDescription className="mt-1">
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
                        className={`flex items-start gap-3 p-4 rounded-lg border transition-all duration-200 ${isFailed
                            ? 'bg-red-50 border-red-200 hover:border-red-300'
                            : isWarning
                              ? 'bg-orange-50 border-orange-200 hover:border-orange-300'
                              : isPassed
                                ? 'bg-green-50 border-green-200 hover:border-green-300'
                                : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm'
                          }`}
                      >
                        {/* Priority Indicator */}
                        <MessagePriorityIndicator level={step.level} />

                        {/* Status Icon */}
                        <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${isFailed
                            ? 'bg-red-100'
                            : isWarning
                              ? 'bg-orange-100'
                              : isPassed
                                ? 'bg-green-100'
                                : 'bg-gray-100'
                          }`}>
                          <UpgradeStepIcon message={displayMessage} passed={isPassed} />
                        </div>

                        {/* Message Content */}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium break-words ${isFailed ? 'text-red-900' :
                              isWarning ? 'text-orange-900' :
                                isPassed ? 'text-green-900' :
                                  'text-gray-900'
                            }`}>
                            {displayMessage}
                          </p>
                          {step.timestamp && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(step.timestamp).toLocaleTimeString()}
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
