/**
 * =============================================================================
 * UPGRADE EXECUTION TAB COMPONENT
 * =============================================================================
 *
 * Real-time upgrade execution monitoring with progress tracking
 *
 * @module components/tabs/UpgradeTab
 * @author nikos-geranios_vgi
 * @date 2025-11-18
 * @created 2025-11-18 17:20:18 UTC
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
      <Badge variant="default" className="bg-blue-600">
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
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Rocket className="h-4 w-4 text-blue-600" />
          Upgrade Progress
        </CardTitle>
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
              Upgrade in progress...
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
 * Removes step prefixes for cleaner display
 *
 * @param {string} message - Original message
 * @returns {string} Cleaned message
 */
function cleanStepMessage(message) {
  // Remove "Step X/Y: " prefix if present
  return message.replace(/^Step \d+\/\d+:\s*/i, '');
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
  // SUBSECTION: EMPTY STATE
  // =========================================================================
  if (jobOutput.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-12">
            <Rocket className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium text-muted-foreground mb-2">
              Waiting for upgrade to start...
            </p>
            <p className="text-sm text-gray-500">
              Upgrade execution will begin after pre-check approval
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
    <div className="space-y-6 max-w-6xl">
 
      {/* ====================================================================
          HEADER SECTION
          ==================================================================== */}
      <Card className="border-blue-200 bg-gradient-to-r from-blue-50 to-white">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Rocket className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <CardTitle className="text-xl">Device Software Upgrade</CardTitle>
                <CardDescription className="mt-1">
                  Installing software, rebooting device, and verifying upgrade
                </CardDescription>
              </div>
            </div>
            <UpgradeStatusBadge status={jobStatus} isRunning={isRunning} />
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
            <CardTitle className="text-base">Upgrade Execution Steps</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleTechnicalDetails}
            >
              <Terminal className="h-3 w-3 mr-2" />
              {showTechnicalDetails ? 'Hide' : 'Show'} Technical Details
            </Button>
          </div>
        </CardHeader>
        <CardContent>
 
          {/* User-Facing Messages */}
          {!showTechnicalDetails && (
            <ScrollArea className="h-[500px] pr-4" ref={scrollAreaRef}>
              <div className="space-y-3">
                {userFacingMessages.map((step, index) => {
                  const isPassed = step.message?.includes('✅') ||
                                   step.message?.toLowerCase().includes('success') ||
                                   step.message?.toLowerCase().includes('complete');
                  const isFailed = step.message?.includes('❌') ||
                                   step.message?.toLowerCase().includes('fail');
                  const displayMessage = cleanStepMessage(step.message || '');
 
                  return (
                    <div
                      key={index}
                      className={`flex items-start gap-3 p-4 rounded-lg border transition-colors ${
                        isFailed
                          ? 'bg-red-50 border-red-200'
                          : isPassed
                          ? 'bg-green-50 border-green-200'
                          : 'bg-white border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {/* Status Icon */}
                      <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                        isFailed
                          ? 'bg-red-100'
                          : isPassed
                          ? 'bg-green-100'
                          : 'bg-gray-100'
                      }`}>
                        <UpgradeStepIcon message={displayMessage} passed={isPassed} />
                      </div>
 
                      {/* Message Content */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 break-words">
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
                })}
              </div>
            </ScrollArea>
          )}
 
          {/* Technical Details View */}
          {showTechnicalDetails && (
            <ScrollArea className="h-[500px] pr-4" ref={scrollAreaRef}>
              <div className="space-y-2">
                {jobOutput.map((log, index) => (
                  <div
                    key={index}
                    className="p-3 bg-gray-50 rounded border border-gray-200 font-mono text-xs"
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-gray-500 flex-shrink-0">
                        {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ''}
                      </span>
                      <span className={`flex-shrink-0 ${
                        log.level === 'error' ? 'text-red-600' :
                        log.level === 'warning' ? 'text-orange-600' :
                        log.level === 'success' ? 'text-green-600' :
                        'text-blue-600'
                      }`}>
                        [{log.event_type || 'LOG'}]
                      </span>
                      <span className="text-gray-800 break-all">
                        {log.message}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
 
        </CardContent>
      </Card>
 
      {/* ====================================================================
          STATUS ALERTS
          ==================================================================== */}
      {isComplete && !hasError && (
        <Card className="border-green-200 bg-green-50">
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
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <XCircle className="h-8 w-8 text-red-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-red-900">
                  Upgrade failed
                </p>
                <p className="text-sm text-red-700 mt-1">
                  An error occurred during upgrade execution. Check the logs above for details.
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
        <Card className="border-blue-200 bg-blue-50">
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
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
