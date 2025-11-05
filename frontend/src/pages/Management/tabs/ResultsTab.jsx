/**
 * =============================================================================
 * RESULTS TAB COMPONENT
 * =============================================================================
 *
 * Final upgrade execution results and comprehensive summary
 *
 * @module components/tabs/ResultsTab
 * @author nikos-geranios_vgi
 * @date 2025-11-05
 */
 
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  CheckCircle,
  XCircle,
  Loader2,
  Shield,
  Database,
  Activity,
  Terminal,
  Info,
  RefreshCw,
  Bug
} from 'lucide-react';
 
/**
 * Results Tab Component
 *
 * Displays final results after upgrade execution:
 * - Main results card (success/failure)
 * - Pre-check summary reference
 * - Software image details
 * - Execution details and configuration
 * - Statistics
 * - Debug information (development only)
 *
 * @param {Object} props
 * @param {string} props.jobStatus - Job status (idle/running/success/failed)
 * @param {Object} props.finalResults - Final results data
 * @param {Object} props.preCheckSummary - Pre-check summary for reference
 * @param {Object} props.upgradeParams - Upgrade parameters
 * @param {string} props.jobId - Job ID
 * @param {string} props.preCheckJobId - Pre-check job ID
 * @param {number} props.progress - Progress percentage
 * @param {number} props.completedSteps - Completed steps
 * @param {number} props.totalSteps - Total steps
 * @param {string} props.currentPhase - Current phase
 * @param {boolean} props.isConnected - WebSocket connection status
 * @param {Object} props.statistics - Operation statistics
 * @param {boolean} props.showTechnicalDetails - Whether to show technical details
 * @param {Function} props.onToggleTechnicalDetails - Toggle technical details
 * @param {Function} props.onNavigateToExecute - Navigate to execute tab
 * @param {Function} props.onStartNewUpgrade - Start new upgrade workflow
 * @param {Array} props.jobOutput - Job output for detailed log
 */
export default function ResultsTab({
  jobStatus,
  finalResults,
  preCheckSummary,
  upgradeParams,
  jobId,
  preCheckJobId,
  progress,
  completedSteps,
  totalSteps,
  currentPhase,
  isConnected,
  statistics,
  showTechnicalDetails,
  onToggleTechnicalDetails,
  onNavigateToExecute,
  onStartNewUpgrade,
  jobOutput,
}) {
  return (
    <div className="space-y-6 max-w-6xl">
 
      {/* ====================================================================
          MAIN RESULTS CARD
          ==================================================================== */}
      <Card className={`border-2 ${
        jobStatus === 'success' ? 'border-green-200 bg-green-50' :
        jobStatus === 'failed' ? 'border-red-200 bg-red-50' :
        'border-gray-200'
      }`}>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              {/* Status icon */}
              {jobStatus === 'success' ? (
                <CheckCircle className="h-8 w-8 text-green-600" />
              ) : jobStatus === 'failed' ? (
                <XCircle className="h-8 w-8 text-red-600" />
              ) : (
                <Loader2 className="h-8 w-8 text-muted-foreground" />
              )}
 
              {/* Status message */}
              <div>
                <h2 className="text-2xl font-bold">
                  {jobStatus === 'success' ? 'Upgrade Completed Successfully' :
                    jobStatus === 'failed' ? 'Upgrade Failed' :
                    'Awaiting Execution'}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {finalResults?.message || 'No results available yet'}
                </p>
              </div>
            </div>
 
            {/* Timestamp badge */}
            {finalResults?.timestamp && (
              <Badge variant="outline" className="text-xs">
                {new Date(finalResults.timestamp).toLocaleString()}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
 
      {/* ====================================================================
          PRE-CHECK VALIDATION SUMMARY (Reference)
          ==================================================================== */}
      {preCheckSummary && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-600" />
              Pre-Check Validation Summary
            </CardTitle>
            <CardDescription>
              Summary of validation checks performed before upgrade
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="font-medium text-gray-600">Total Checks:</span>
                <p className="text-lg font-semibold text-blue-600">
                  {preCheckSummary.total_checks}
                </p>
              </div>
              <div>
                <span className="font-medium text-gray-600">Passed:</span>
                <p className="text-lg font-semibold text-green-600">
                  {preCheckSummary.passed}
                </p>
              </div>
              <div>
                <span className="font-medium text-gray-600">Warnings:</span>
                <p className="text-lg font-semibold text-orange-600">
                  {preCheckSummary.warnings}
                </p>
              </div>
              <div>
                <span className="font-medium text-gray-600">Critical:</span>
                <p className="text-lg font-semibold text-red-600">
                  {preCheckSummary.critical_failures}
                </p>
              </div>
            </div>
 
            {/* Detailed results toggle */}
            {preCheckSummary.results && preCheckSummary.results.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onToggleTechnicalDetails}
                  className="mb-2"
                >
                  <Info className="h-3 w-3 mr-2" />
                  {showTechnicalDetails ? 'Hide' : 'Show'} Detailed Check Results
                </Button>
 
                {showTechnicalDetails && (
                  <ScrollArea className="h-48 mt-2">
                    <div className="space-y-2">
                      {preCheckSummary.results.map((result, index) => (
                        <div
                          key={index}
                          className={`p-2 rounded border text-xs ${
                            result.severity === 'critical' ? 'bg-red-50 border-red-200' :
                            result.severity === 'warning' ? 'bg-orange-50 border-orange-200' :
                            'bg-green-50 border-green-200'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={`text-xs ${
                                result.severity === 'critical' ? 'bg-red-100' :
                                result.severity === 'warning' ? 'bg-orange-100' :
                                'bg-green-100'
                              }`}
                            >
                              {result.severity}
                            </Badge>
                            <span className="font-semibold">{result.check_name}</span>
                          </div>
                          <p className="mt-1 text-gray-700">{result.message}</p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
 
      {/* ====================================================================
          SOFTWARE IMAGE DETAILS
          ==================================================================== */}
      {upgradeParams.image_filename && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-green-600" />
              Software Image Details
            </CardTitle>
            <CardDescription>
              Information about the upgrade image used
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="font-medium text-gray-600">Vendor:</span>
                <p className="text-muted-foreground mt-1">
                  {upgradeParams.vendor || 'N/A'}
                </p>
              </div>
              <div>
                <span className="font-medium text-gray-600">Platform:</span>
                <p className="text-muted-foreground mt-1">
                  {upgradeParams.platform || 'N/A'}
                </p>
              </div>
              <div>
                <span className="font-medium text-gray-600">Target Version:</span>
                <p className="text-muted-foreground mt-1 font-semibold">
                  {upgradeParams.target_version || 'N/A'}
                </p>
              </div>
              <div>
                <span className="font-medium text-gray-600">Image File:</span>
                <p className="text-muted-foreground font-mono text-xs break-all mt-1">
                  {upgradeParams.image_filename}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
 
      {/* ====================================================================
          EXECUTION DETAILS & CONFIGURATION - Two columns
          ==================================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 
        {/* Execution Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Execution Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Job ID:</span>
              <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                {jobId || 'N/A'}
              </span>
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Progress:</span>
              <span className="font-semibold">{progress}%</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Steps Completed:</span>
              <span className="font-semibold">
                {completedSteps}/{totalSteps || 'Unknown'}
              </span>
            </div>
            <Separator />
            {preCheckJobId && (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Pre-Check ID:</span>
                  <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                    {preCheckJobId}
                  </span>
                </div>
                <Separator />
              </>
            )}
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Operation Phase:</span>
              <Badge variant="outline">{currentPhase}</Badge>
            </div>
          </CardContent>
        </Card>
 
        {/* Configuration Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Terminal className="h-4 w-4" />
              Configuration Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Target Device:</span>
              <span className="font-medium truncate max-w-[200px]">
                {upgradeParams.hostname || upgradeParams.inventory_file || 'N/A'}
              </span>
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Username:</span>
              <span className="font-medium">{upgradeParams.username}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">WebSocket:</span>
              <Badge variant={isConnected ? "default" : "destructive"}>
                {isConnected ? 'Connected' : 'Disconnected'}
              </Badge>
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Status:</span>
              <Badge
                variant="outline"
                className={`font-medium ${
                  jobStatus === 'success' ? 'text-green-600 border-green-600' :
                  jobStatus === 'failed' ? 'text-red-600 border-red-600' :
                  jobStatus === 'running' ? 'text-blue-600 border-blue-600' :
                  'text-gray-600 border-gray-600'
                }`}
              >
                {jobStatus.toUpperCase()}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
 
      {/* ====================================================================
          STATISTICS CARD
          ==================================================================== */}
      {(statistics.total > 0 || finalResults) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Info className="h-4 w-4" />
              Operation Statistics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="p-3 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">
                  {statistics.total || completedSteps}
                </div>
                <div className="text-xs text-gray-600 mt-1">Total Operations</div>
              </div>
              <div className="p-3 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  {statistics.succeeded || (jobStatus === 'success' ? completedSteps : 0)}
                </div>
                <div className="text-xs text-gray-600 mt-1">Succeeded</div>
              </div>
              <div className="p-3 bg-red-50 rounded-lg">
                <div className="text-2xl font-bold text-red-600">
                  {statistics.failed || (jobStatus === 'failed' ? 1 : 0)}
                </div>
                <div className="text-xs text-gray-600 mt-1">Failed</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
 
      {/* ====================================================================
          DEBUG INFORMATION (Development Only)
          ==================================================================== */}
      {finalResults && process.env.NODE_ENV === 'development' && (
        <Card className="border-purple-200">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Bug className="h-4 w-4" />
              Debug Information
            </CardTitle>
            <CardDescription>
              Raw response data (visible in development mode only)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64">
              <pre className="text-xs font-mono whitespace-pre-wrap bg-gray-50 p-4 rounded">
                {JSON.stringify(finalResults, null, 2)}
              </pre>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
 
      {/* ====================================================================
          ACTION BUTTONS
          ==================================================================== */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex-1">
              <h4 className="text-lg font-semibold mb-1">
                Operation Complete
              </h4>
              <p className="text-sm text-muted-foreground">
                {jobStatus === 'success'
                  ? 'The upgrade operation has completed successfully. You can start a new upgrade or review the results.'
                  : 'The operation has finished. Review the results and start a new upgrade if needed.'}
              </p>
            </div>
 
            <div className="flex gap-3 w-full sm:w-auto">
              {/* View logs button */}
              <Button
                onClick={onNavigateToExecute}
                variant="outline"
                size="lg"
              >
                <Terminal className="h-4 w-4 mr-2" />
                View Logs
              </Button>
 
              {/* Start new upgrade button */}
              <Button
                onClick={onStartNewUpgrade}
                size="lg"
                className="flex-1 sm:flex-initial"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Start New Upgrade
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}