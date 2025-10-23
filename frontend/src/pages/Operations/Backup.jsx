/**
 * =============================================================================
 * BACKUP OPERATION COMPONENT
 * =============================================================================
 * Main component for managing device backup operations with real-time progress
 * tracking and enhanced results visualization.
 * 
 * @version 5.3.0
 * @last_updated 2025-10-18
 * =============================================================================
 */
import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ArrowRight, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';

// PROGRESS COMPONENTS IMPORTS
import EnhancedProgressBar from '@/components/realTimeProgress/EnhancedProgressBar';
import EnhancedProgressStep from '@/components/realTimeProgress/EnhancedProgressStep';

// FORM AND SELECTOR COMPONENTS
import BackupForm from '@/forms/BackupForm';
import DeviceTargetSelector from '@/shared/DeviceTargetSelector';
import { useJobWebSocket } from '@/hooks/useJobWebSocket';

// API CONFIGURATION
const API_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000';

/**
 * Main Backup Component
 * Handles device backup operations with real-time progress tracking
 */
export default function Backup() {
  // =========================================================================
  // 🧠 STATE MANAGEMENT SECTION
  // =========================================================================

  // Backup configuration parameters
  const [backupParams, setBackupParams] = useState({
    username: "admin",
    password: "manolis1",
    hostname: "172.27.200.200",
    inventory_file: "",
  });

  // UI State
  const [activeTab, setActiveTab] = useState("config");
  const [jobStatus, setJobStatus] = useState("idle");

  // Progress Tracking State
  const [progress, setProgress] = useState(0);
  const [jobOutput, setJobOutput] = useState([]);
  const [jobId, setJobId] = useState(null);
  const [wsChannel, setWsChannel] = useState(null);
  const [finalResults, setFinalResults] = useState(null);

  // Step Tracking State
  const [completedSteps, setCompletedSteps] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);

  // Real-time Statistics Tracking
  const [statistics, setStatistics] = useState({
    total: 0,
    succeeded: 0,
    failed: 0
  });

  // Refs for tracking processed data without re-renders
  const processedStepsRef = useRef(new Set());
  const latestStepMessageRef = useRef("");
  const loggedMessagesRef = useRef(new Set()); // Track logged messages to prevent duplicates

  // Custom WebSocket hook and UI refs
  const { sendMessage, lastMessage, isConnected } = useJobWebSocket();
  const scrollAreaRef = useRef(null);

  // =========================================================================
  // 🐞 DEBUG MONITORS
  // =========================================================================

  useEffect(() => {
    console.log(`[DEBUG: activeTab] Tab changed to: "${activeTab}"`);
  }, [activeTab]);

  useEffect(() => {
    if (jobStatus !== 'running' && jobStatus !== 'idle') {
      console.log(`[DEBUG: jobStatus] Final status determined: "${jobStatus.toUpperCase()}"`);
    }
  }, [jobStatus]);

  // =========================================================================
  // 🧩 FORM HANDLERS SECTION
  // =========================================================================

  const handleParamChange = (name, value) => {
    setBackupParams(prev => ({ ...prev, [name]: value }));
  };

  const isFormValid =
    backupParams.username.trim() !== "" &&
    backupParams.password.trim() !== "" &&
    (backupParams.hostname.trim() !== "" || backupParams.inventory_file.trim() !== "");

  // =========================================================================
  // 🔄 WORKFLOW RESET FUNCTION
  // =========================================================================

  const resetWorkflow = () => {
    if (wsChannel) {
      sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
      console.log('[WORKFLOW] Unsubscribed from WebSocket channel');
    }

    setJobStatus("idle");
    setProgress(0);
    setJobOutput([]);
    setJobId(null);
    setWsChannel(null);
    setFinalResults(null);
    setActiveTab("config");
    setCompletedSteps(0);
    setTotalSteps(0);
    setStatistics({ total: 0, succeeded: 0, failed: 0 });

    processedStepsRef.current.clear();
    latestStepMessageRef.current = "";
    loggedMessagesRef.current.clear(); // Clear logged messages

    console.log("[WORKFLOW] Workflow reset to initial state");
  };

  // =========================================================================
  // 🚀 JOB EXECUTION
  // =========================================================================

  const startJobExecution = async (e) => {
    e.preventDefault();

    if (!isFormValid || jobStatus === 'running') return;

    if (!isConnected) {
      console.error("[JOB START] WebSocket not connected - cannot start job");
      setJobOutput(prev => [...prev, {
        timestamp: new Date().toISOString(),
        message: "WebSocket not connected. Cannot start job.",
        level: 'error'
      }]);
      setJobStatus("failed");
      setActiveTab("results");
      return;
    }

    if (wsChannel) {
      sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
    }

    console.log("[JOB START] Starting Backup Job...");
    setActiveTab("execute");
    setJobStatus("running");
    setProgress(0);
    setJobOutput([]);
    setFinalResults(null);
    setJobId(null);
    setWsChannel(null);
    setCompletedSteps(0);
    setTotalSteps(0);
    setStatistics({ total: 0, succeeded: 0, failed: 0 });
    processedStepsRef.current.clear();
    latestStepMessageRef.current = "";
    loggedMessagesRef.current.clear(); // Clear logged messages

    const payload = {
      command: "backup",
      hostname: backupParams.hostname.trim(),
      inventory_file: backupParams.inventory_file.trim(),
      username: backupParams.username,
      password: backupParams.password,
      backup_path: "/app/shared/data/backups",
    };

    try {
      const response = await fetch(`${API_URL}/api/operations/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`API error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      setJobId(data.job_id);
      setWsChannel(data.ws_channel);
      console.log(`[JOB START] Job initiated - ID: ${data.job_id}, Channel: ${data.ws_channel}`);
      sendMessage({ type: 'SUBSCRIBE', channel: data.ws_channel });

    } catch (error) {
      console.error("[JOB START] API Call Failed:", error);
      setJobOutput(prev => [...prev, {
        timestamp: new Date().toISOString(),
        message: `Job start failed: ${error.message}`,
        level: 'error'
      }]);
      setJobStatus("failed");
      setActiveTab("results");
    }
  };

  // =========================================================================
  // 🔌 WEBSOCKET MESSAGE HANDLER
  // =========================================================================

  useEffect(() => {
    if (!lastMessage || !jobId) return;

    const raw = lastMessage;

    if (typeof raw !== 'string' || (!raw.startsWith('{') && !raw.startsWith('['))) {
      console.log('[WEBSOCKET] Skipping non-JSON message:', raw.substring(0, 100));
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      console.warn('[WEBSOCKET DEBUG] Failed to parse initial JSON:', raw.substring(0, 200));
      return;
    }

    if (parsed.channel && wsChannel && !parsed.channel.includes(wsChannel)) {
      console.log('[WEBSOCKET] Skipping message from different channel:', parsed.channel);
      return;
    }

    // =====================================================================
    // 🔄 PAYLOAD EXTRACTION
    // =====================================================================

    const extractNestedProgressData = (initialParsed) => {
      let currentPayload = initialParsed;
      let deepestNestedData = null;

      if (initialParsed.data) {
        try {
          const dataPayload = typeof initialParsed.data === 'string'
            ? JSON.parse(initialParsed.data)
            : initialParsed.data;

          currentPayload = dataPayload;

          if (dataPayload.event_type === "ORCHESTRATOR_LOG" && dataPayload.message) {
            const message = dataPayload.message;
            const jsonMatch = message.match(/\[(STDOUT|STDERR)(?:_RAW)?\]\s*(\{.*\})/s);

            if (jsonMatch && jsonMatch[2]) {
              try {
                deepestNestedData = JSON.parse(jsonMatch[2]);
              } catch (parseError) {
                console.warn('[WEBSOCKET DEBUG] Failed to parse nested JSON:', jsonMatch[2].substring(0, 200));
              }
            }
          }
        } catch (error) {
          console.warn('[WEBSOCKET DEBUG] Failed to parse data field:', error.message);
        }
      }

      return {
        payload: deepestNestedData || currentPayload,
        isNested: !!deepestNestedData
      };
    };

    const { payload: finalPayload, isNested } = extractNestedProgressData(parsed);

    // =====================================================================
    // 📝 LOG STREAM UPDATES - DEDUPLICATION LOGIC
    // =====================================================================

    /**
     * Create a unique signature for each log message to detect duplicates
     */
    const createLogSignature = (payload) => {
      const msg = payload.message || '';
      const eventType = payload.event_type || 'unknown';
      const timestamp = payload.timestamp || '';

      // Create signature from message content + event type
      // We don't include timestamp to catch duplicates sent at slightly different times
      return `${eventType}::${msg.substring(0, 100)}`;
    };

    const logSignature = createLogSignature(finalPayload);

    // Check if we've already logged this message
    if (loggedMessagesRef.current.has(logSignature)) {
      console.log('[WEBSOCKET FILTER] Duplicate message detected and skipped:', logSignature);
      // Still process progress updates even if we skip logging
    } else {
      // This is a new unique message, log it
      loggedMessagesRef.current.add(logSignature);

      const logEntry = {
        timestamp: finalPayload.timestamp || new Date().toISOString(),
        message: finalPayload.message || (typeof finalPayload === 'string' ? finalPayload : "Processing..."),
        level: finalPayload.level?.toLowerCase() || "info",
        event_type: finalPayload.event_type,
        data: finalPayload.data,
      };

      setJobOutput(prev => [...prev, logEntry]);

      // Auto-scroll to latest log entry
      if (scrollAreaRef.current) {
        setTimeout(() => {
          if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
          }
        }, 50);
      }
    }

    // Update latest step message for progress bar display
    const logMessage = finalPayload.message || (typeof finalPayload === 'string' ? finalPayload : "Processing...");
    if (logMessage && finalPayload.event_type !== "OPERATION_COMPLETE") {
      latestStepMessageRef.current = logMessage;
    }

    // =====================================================================
    // 📊 REAL-TIME STATISTICS PARSING
    // =====================================================================

    // Parse statistics from various message formats
    if (logMessage) {
      // Pattern 1: "Backup finished. Succeeded: X, Failed: Y"
      const finishedMatch = logMessage.match(/Backup finished\.\s*Succeeded:\s*(\d+),\s*Failed:\s*(\d+)/i);
      if (finishedMatch) {
        const succeeded = parseInt(finishedMatch[1], 10);
        const failed = parseInt(finishedMatch[2], 10);
        setStatistics({
          total: succeeded + failed,
          succeeded: succeeded,
          failed: failed
        });
        console.log("[STATISTICS] Updated from 'Backup finished' message:", { succeeded, failed });
      }

      // Pattern 2: "Backup completed: X succeeded, Y failed"
      const completedMatch = logMessage.match(/Backup completed:\s*(\d+)\s*succeeded,\s*(\d+)\s*failed/i);
      if (completedMatch) {
        const succeeded = parseInt(completedMatch[1], 10);
        const failed = parseInt(completedMatch[2], 10);
        setStatistics({
          total: succeeded + failed,
          succeeded: succeeded,
          failed: failed
        });
        console.log("[STATISTICS] Updated from 'Backup completed' message:", { succeeded, failed });
      }

      // Pattern 3: Individual device success/failure messages
      if (logMessage.includes('Backup for') && logMessage.includes('successful')) {
        setStatistics(prev => ({
          total: prev.total + 1,
          succeeded: prev.succeeded + 1,
          failed: prev.failed
        }));
        console.log("[STATISTICS] Device succeeded, incrementing counter");
      } else if (logMessage.includes('Backup for') && logMessage.includes('failed')) {
        setStatistics(prev => ({
          total: prev.total + 1,
          succeeded: prev.succeeded,
          failed: prev.failed + 1
        }));
        console.log("[STATISTICS] Device failed, incrementing counter");
      }
    }

    // Also check if statistics are provided in structured data
    if (finalPayload.data?.statistics) {
      setStatistics({
        total: (finalPayload.data.statistics.succeeded || 0) + (finalPayload.data.statistics.failed || 0),
        succeeded: finalPayload.data.statistics.succeeded || 0,
        failed: finalPayload.data.statistics.failed || 0
      });
      console.log("[STATISTICS] Updated from structured data:", finalPayload.data.statistics);
    }

    // =====================================================================
    // 📊 PROGRESS & STEP TRACKING
    // =====================================================================

    if (finalPayload.event_type === "OPERATION_START" && typeof finalPayload.data?.total_steps === "number") {
      console.log(`[PROGRESS] Operation started with ${finalPayload.data.total_steps} total steps`);
      setTotalSteps(finalPayload.data.total_steps);
      setProgress(5);
    }

    if (finalPayload.event_type === "STEP_START" && finalPayload.data?.step) {
      if (finalPayload.data.step > totalSteps) {
        const inferredTotal = finalPayload.data.step + 3;
        setTotalSteps(inferredTotal);
      }
    }

    if (finalPayload.event_type === "STEP_COMPLETE" && typeof finalPayload.data?.step === "number") {
      const stepNum = finalPayload.data.step;

      if (!processedStepsRef.current.has(stepNum)) {
        processedStepsRef.current.add(stepNum);

        setCompletedSteps(prevCompleted => {
          const newCompleted = prevCompleted + 1;
          let newProgress = progress;

          if (totalSteps > 0) {
            newProgress = Math.min(99, Math.round((newCompleted / totalSteps) * 100));
          } else {
            newProgress = Math.min(99, progress + 25);
          }

          setProgress(newProgress);
          return newCompleted;
        });
      }
    }

    if (finalPayload.event_type === "PROGRESS_UPDATE" && typeof finalPayload.data?.progress === "number") {
      setProgress(Math.min(99, Math.max(0, finalPayload.data.progress)));
    }

    // =====================================================================
    // 🏁 OPERATION COMPLETE
    // =====================================================================

    const isCompletionEvent =
      finalPayload.event_type === "OPERATION_COMPLETE" ||
      finalPayload.success !== undefined ||
      (logMessage && logMessage.includes('Orchestrator completed with success')) ||
      (logMessage && logMessage.includes('Backup completed:')) ||
      (logMessage && /Backup (finished|completed):/.test(logMessage));

    if (isCompletionEvent) {
      // Enhanced success detection logic
      let finalSuccess = false;

      // Method 1: Direct success flag
      if (finalPayload.success === true || finalPayload.data?.final_results?.success === true) {
        finalSuccess = true;
      }
      // Method 2: Status field
      else if (finalPayload.data?.status === "SUCCESS") {
        finalSuccess = true;
      }
      // Method 3: Parse "Succeeded: X, Failed: Y" pattern
      else if (logMessage) {
        const succeededMatch = logMessage.match(/Succeeded:\s*(\d+)/i);
        const failedMatch = logMessage.match(/Failed:\s*(\d+)/i);

        if (succeededMatch && failedMatch) {
          const succeededCount = parseInt(succeededMatch[1], 10);
          const failedCount = parseInt(failedMatch[1], 10);

          // Success if we have at least one success and zero failures
          finalSuccess = succeededCount > 0 && failedCount === 0;

          // Update statistics (may already be set from earlier parsing)
          setStatistics(prev => ({
            total: succeededCount + failedCount,
            succeeded: succeededCount,
            failed: failedCount
          }));
        }
        // Method 4: Look for explicit success messages
        else if (logMessage.includes('success: True') ||
          logMessage.includes('completed successfully')) {
          finalSuccess = true;
        }
      }

      console.log("[JOB COMPLETE] Final event detected:", {
        success: finalSuccess,
        event_type: finalPayload.event_type,
        message: logMessage,
        data_status: finalPayload.data?.status,
        nested_success: finalPayload.data?.final_results?.success
      });

      setJobStatus(finalSuccess ? "success" : "failed");
      setFinalResults(prev => prev || finalPayload);
      setProgress(100);

      if (totalSteps > 0) {
        setCompletedSteps(totalSteps);
      }

      if (wsChannel) {
        sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
      }

      requestAnimationFrame(() => {
        console.log("[TAB SWITCH] Executing scheduled tab switch to 'results'");
        setActiveTab("results");
      });
    }
  }, [lastMessage, jobId, wsChannel, sendMessage, setActiveTab, totalSteps, progress, completedSteps]);

  // =========================================================================
  // 🧱 UI RENDER SECTION
  // =========================================================================

  const isRunning = jobStatus === 'running';
  const isComplete = jobStatus === 'success';
  const hasError = jobStatus === 'failed';

  return (
    <div className="p-8 pt-6">
      <h1 className="text-3xl font-bold tracking-tight mb-2">Device Backup Operation</h1>
      <p className="text-muted-foreground mb-6">Configure, execute, and review device backups.</p>
      <Separator className="mb-8" />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="config" disabled={jobStatus === 'running'}>
            Configure
          </TabsTrigger>
          <TabsTrigger value="execute">
            Execute
          </TabsTrigger>
          <TabsTrigger value="results" disabled={jobStatus === 'running'}>
            Results
          </TabsTrigger>
        </TabsList>

        <TabsContent value="config">
          <div className="space-y-8 max-w-4xl">
            <DeviceTargetSelector
              parameters={backupParams}
              onParamChange={handleParamChange}
            />
            <BackupForm
              parameters={backupParams}
              onParamChange={handleParamChange}
            />
            <div className="flex justify-end pt-4">
              <Button
                onClick={startJobExecution}
                disabled={!isFormValid || jobStatus !== 'idle' || !isConnected}
                className="w-full sm:w-auto"
              >
                {jobStatus === 'running' ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running...</>
                ) : (
                  <>Start Backup Job <ArrowRight className="ml-2 h-4 w-4" /></>
                )}
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="execute">
          <div className="space-y-6 p-4 border rounded-lg max-w-4xl">
            <h2 className="text-xl font-semibold mb-4">Job Execution Status</h2>

            <EnhancedProgressBar
              percentage={progress}
              currentStep={latestStepMessageRef.current}
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

            <ScrollArea className="h-96 bg-background/50 p-4 rounded-md border">
              <div ref={scrollAreaRef} className="space-y-3">
                {jobOutput.length === 0 ? (
                  <p className="text-center text-muted-foreground pt-4">
                    Waiting for job to start...
                  </p>
                ) : (
                  jobOutput.map((log, index) => (
                    <EnhancedProgressStep
                      key={`${log.timestamp}-${index}`}
                      step={{
                        message: log.message,
                        level: log.level,
                        timestamp: log.timestamp,
                        type: log.event_type,
                      }}
                      isLatest={index === jobOutput.length - 1}
                      compact={false}
                      showTimestamp={true}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </TabsContent>

        <TabsContent value="results">
          <div className="space-y-6 max-w-6xl">
            {/* Header Status Card */}
            <div className={`p-6 rounded-lg border-2 ${jobStatus === 'success' ? 'bg-green-50 border-green-200' :
                jobStatus === 'failed' ? 'bg-red-50 border-red-200' :
                  'bg-muted border-border'
              }`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  {jobStatus === 'success' ? (
                    <CheckCircle className="h-8 w-8 text-green-600" />
                  ) : jobStatus === 'failed' ? (
                    <XCircle className="h-8 w-8 text-red-600" />
                  ) : (
                    <Loader2 className="h-8 w-8 text-muted-foreground" />
                  )}
                  <div>
                    <h2 className="text-2xl font-bold">
                      {jobStatus === 'success' ? 'Backup Completed Successfully' :
                        jobStatus === 'failed' ? 'Backup Failed' :
                          'Awaiting Execution'}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {finalResults?.message || 'No results available yet'}
                    </p>
                  </div>
                </div>
                <Button onClick={resetWorkflow} variant="outline" size="sm">
                  Start New Backup
                </Button>
              </div>
            </div>

            {/* Statistics Grid */}
            {(statistics.total > 0 || jobStatus !== 'idle') && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-4 border rounded-lg bg-card">
                  <div className="text-sm font-medium text-muted-foreground">Total Devices</div>
                  <div className="text-3xl font-bold mt-2">
                    {statistics.total}
                  </div>
                </div>
                <div className="p-4 border rounded-lg bg-card">
                  <div className="text-sm font-medium text-muted-foreground">Succeeded</div>
                  <div className="text-3xl font-bold mt-2 text-green-600">
                    {statistics.succeeded}
                  </div>
                </div>
                <div className="p-4 border rounded-lg bg-card">
                  <div className="text-sm font-medium text-muted-foreground">Failed</div>
                  <div className="text-3xl font-bold mt-2 text-red-600">
                    {statistics.failed}
                  </div>
                </div>
                <div className="p-4 border rounded-lg bg-card">
                  <div className="text-sm font-medium text-muted-foreground">Success Rate</div>
                  <div className="text-3xl font-bold mt-2">
                    {statistics.total > 0 ? `${Math.round((statistics.succeeded / statistics.total) * 100)}%` : '—'}
                  </div>
                </div>
              </div>
            )}

            {/* Device Results Table */}
            {finalResults?.data?.device_results && finalResults.data.device_results.length > 0 && (
              <div className="border rounded-lg bg-card">
                <div className="p-4 border-b">
                  <h3 className="text-lg font-semibold">Device Backup Results</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Detailed status for each device
                  </p>
                </div>
                <ScrollArea className="h-96">
                  <div className="p-4">
                    <table className="w-full">
                      <thead className="border-b">
                        <tr className="text-left">
                          <th className="pb-3 font-semibold text-sm">Status</th>
                          <th className="pb-3 font-semibold text-sm">Device</th>
                          <th className="pb-3 font-semibold text-sm">Message</th>
                          <th className="pb-3 font-semibold text-sm">Duration</th>
                        </tr>
                      </thead>
                      <tbody>
                        {finalResults.data.device_results.map((device, index) => (
                          <tr key={index} className="border-b last:border-0 hover:bg-muted/50">
                            <td className="py-3">
                              {device.success ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                  <CheckCircle className="h-3 w-3" />
                                  Success
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                                  <XCircle className="h-3 w-3" />
                                  Failed
                                </span>
                              )}
                            </td>
                            <td className="py-3 font-medium">{device.hostname || device.device || 'Unknown'}</td>
                            <td className="py-3 text-sm text-muted-foreground max-w-md truncate">
                              {device.message || device.error || 'No message'}
                            </td>
                            <td className="py-3 text-sm text-muted-foreground">
                              {device.duration ? `${device.duration.toFixed(2)}s` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* Execution Metadata */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 border rounded-lg bg-card">
                <h3 className="text-sm font-semibold mb-3">Execution Details</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Job ID:</dt>
                    <dd className="font-mono text-xs">{jobId || 'N/A'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Progress:</dt>
                    <dd className="font-semibold">{progress}%</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Steps:</dt>
                    <dd className="font-semibold">{completedSteps}/{totalSteps || 'Unknown'}</dd>
                  </div>
                </dl>
              </div>

              <div className="p-4 border rounded-lg bg-card">
                <h3 className="text-sm font-semibold mb-3">Configuration</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Target:</dt>
                    <dd className="font-medium truncate ml-2">{backupParams.hostname || backupParams.inventory_file || 'N/A'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Username:</dt>
                    <dd className="font-medium">{backupParams.username}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Backup Path:</dt>
                    <dd className="font-mono text-xs">/app/shared/data/backups</dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* Debug Information (Development Only) */}
            {finalResults && process.env.NODE_ENV === 'development' && (
              <details className="border rounded-lg bg-card">
                <summary className="p-4 cursor-pointer font-semibold text-sm hover:bg-muted/50">
                  Debug Information (Development Only)
                </summary>
                <div className="p-4 border-t bg-muted/30">
                  <pre className="text-xs font-mono whitespace-pre-wrap overflow-auto max-h-96">
                    {JSON.stringify(finalResults, null, 2)}
                  </pre>
                </div>
              </details>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
