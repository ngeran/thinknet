/**
 * =============================================================================
 * BACKUP OPERATION COMPONENT
 * =============================================================================
 * Main component for managing device backup operations with real-time progress
 * tracking and enhanced results visualization.
 *
 * @version 5.3.5 (Fix for JavaScript Syntax Error on Ref Declaration)
 * @last_updated 2025-11-22
 * =============================================================================
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
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
    hostname: "192.168.100.4",
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
  // FIX: Corrected syntax error on this line (formerly const loggedMessagesRef.current = new Set();)
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
  // 🔌 NESTED JSON EXTRACTION (Reusable helper function)
  // =========================================================================

  /**
   * Extracts nested progress data from WebSocket messages
   */
  const extractNestedProgressData = (initialParsed) => {
    let currentPayload = initialParsed;
    let deepestNestedData = null;

    if (initialParsed.data) {
      try {
        // Parse the 'data' field (may be string or object)
        const dataPayload = typeof initialParsed.data === 'string'
          ? JSON.parse(initialParsed.data)
          : initialParsed.data;

        currentPayload = dataPayload;

        // Handle ORCHESTRATOR_LOG messages that contain nested JSON
        // Format: "[STDOUT] {\"event_type\":\"STEP_START\",...}"
        if (dataPayload.event_type === "ORCHESTRATOR_LOG" && dataPayload.message) {
          const message = dataPayload.message;
          const jsonMatch = message.match(/\[(STDOUT|STDERR)(?:_RAW)?\]\s*(\{.*\})/s);

          if (jsonMatch && jsonMatch[2]) {
            try {
              deepestNestedData = JSON.parse(jsonMatch[2]);
            } catch {
              console.warn('[BACKUP] Failed to parse nested JSON from ORCHESTRATOR_LOG message');
            }
          }
        }
      } catch (error) {
        console.warn('[BACKUP] Failed to parse data field:', error.message);
      }
    }

    return {
      payload: deepestNestedData || currentPayload,
      isNested: !!deepestNestedData
    };
  };

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
  // 🚀 JOB EXECUTION FUNCTION
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
    loggedMessagesRef.current.clear();

    // The API endpoint configured in the backend (operations.py)
    const apiUrl = `${API_URL}/api/operations/backup`;

    // Construct the clean payload
    const payload = {
      command: "backup",
      hostname: backupParams.hostname.trim() || null,
      inventory_file: backupParams.inventory_file.trim() || null,
      username: backupParams.username,
      password: backupParams.password,
    };

    console.log(`[JOB START] Endpoint: ${apiUrl}`);
    console.log(`[JOB START] Payload:`, JSON.stringify(payload, null, 2));

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      console.log(`[JOB START] Response status:`, response.status);

      if (response.ok) {
        const data = await response.json();
        console.log(`[JOB START] SUCCESS:`, data);

        setJobId(data.job_id);
        setWsChannel(data.ws_channel);
        console.log(`[JOB START] Job initiated - ID: ${data.job_id}, Channel: ${data.ws_channel}`);
        sendMessage({ type: 'SUBSCRIBE', channel: data.ws_channel });

      } else {
        const errorText = await response.text();
        console.log(`[JOB START] FAILED:`, errorText);

        throw new Error(`API call failed: ${response.status} ${response.statusText} - ${errorText}`);
      }
    } catch (error) {
      console.error(`[JOB START] Error:`, error);
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
  // 🔌 WEBSOCKET MESSAGE HANDLER - ENHANCED FOR NESTED JSON
  // =========================================================================

  const processMessage = useCallback((lastMessage) => {
    if (!lastMessage || !jobId) return;

    const raw = lastMessage;

    if (typeof raw !== 'string' || (!raw.startsWith('{') && !raw.startsWith('['))) {
      return;
    }

    let initialParsed;
    try {
      initialParsed = JSON.parse(raw);
    } catch (error) {
      console.warn('[WEBSOCKET] Failed to parse JSON:', raw.substring(0, 200));
      return;
    }

    // Extract nested progress data
    const { payload: parsed } = extractNestedProgressData(initialParsed);

    // Check if this message is for our channel
    if (parsed.channel && wsChannel && !parsed.channel.includes(wsChannel)) {
      return;
    }

    // Create log signature for deduplication
    const createLogSignature = (payload) => {
      const msg = payload.message || '';
      const eventType = payload.event_type || 'unknown';
      return `${eventType}::${msg.substring(0, 100)}`;
    };

    const logSignature = createLogSignature(parsed);

    // Check if we've already logged this message
    if (loggedMessagesRef.current.has(logSignature)) {
      // Skip duplicate
    } else {
      loggedMessagesRef.current.add(logSignature);

      const logEntry = {
        timestamp: parsed.timestamp || new Date().toISOString(),
        message: parsed.message || "Processing...",
        level: (parsed.level || "info").toLowerCase(),
        event_type: parsed.event_type,
        data: parsed.data,
      };

      setJobOutput(prev => [...prev, logEntry]);

      // Auto-scroll to latest log entry
      if (scrollAreaRef.current) {
        setTimeout(() => {
          const scrollElement = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
          if (scrollElement) {
            scrollElement.scrollTop = scrollElement.scrollHeight;
          }
        }, 50);
      }
    }

    // Update latest step message for progress bar display
    const logMessage = parsed.message || "Processing...";
    if (logMessage && parsed.event_type !== "OPERATION_COMPLETE") {
      latestStepMessageRef.current = logMessage;
    }

    // =====================================================================
    // 📊 REAL-TIME STATISTICS PARSING & PROGRESS TRACKING
    // =====================================================================
    if (parsed.data?.statistics) {
      setStatistics({
        total: (parsed.data.statistics.succeeded || 0) + (parsed.data.statistics.failed || 0),
        succeeded: parsed.data.statistics.succeeded || 0,
        failed: parsed.data.statistics.failed || 0
      });
    }

    if (parsed.event_type === "OPERATION_START" && typeof parsed.data?.total_steps === "number") {
      setTotalSteps(parsed.data.total_steps);
      setProgress(5);
    }

    if (parsed.event_type === "STEP_COMPLETE" && typeof parsed.data?.step === "number") {
      const stepNum = parsed.data.step;

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

    if (parsed.event_type === "PROGRESS_UPDATE" && typeof parsed.data?.progress === "number") {
      setProgress(Math.min(99, Math.max(0, parsed.data.progress)));
    }

    // =====================================================================
    // 🏁 OPERATION COMPLETE
    // =====================================================================

    const isCompletionEvent =
      parsed.event_type === "OPERATION_COMPLETE" ||
      parsed.success !== undefined ||
      (logMessage && logMessage.includes('Orchestrator completed with success')) ||
      (logMessage && /Backup (finished|completed):/.test(logMessage));

    if (isCompletionEvent) {
      let finalSuccess = parsed.success === true || parsed.data?.final_results?.success === true || parsed.data?.status === "SUCCESS";

      // If success is still unknown, try inferring from log message statistics
      if (!finalSuccess && logMessage) {
        const succeededMatch = logMessage.match(/Succeeded:\s*(\d+)/i);
        const failedMatch = logMessage.match(/Failed:\s*(\d+)/i);
        if (succeededMatch && failedMatch) {
          finalSuccess = parseInt(succeededMatch[1], 10) > 0 && parseInt(failedMatch[1], 10) === 0;
        }
      }

      setJobStatus(finalSuccess ? "success" : "failed");
      setFinalResults(prev => prev || parsed);
      setProgress(100);

      if (totalSteps > 0) {
        setCompletedSteps(totalSteps);
      }

      if (wsChannel) {
        sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
      }

      requestAnimationFrame(() => {
        setActiveTab("results");
      });
    }
  }, [jobId, wsChannel, completedSteps, totalSteps, progress, sendMessage]);

  // WebSocket effect hook
  useEffect(() => {
    if (lastMessage) {
      processMessage(lastMessage);
    }
  }, [lastMessage, processMessage]);

  // Scroll to bottom of the log output
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollElement = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [jobOutput]);

  // =========================================================================
  // 🧱 UI RENDER SECTION
  // =========================================================================

  const isRunning = jobStatus === 'running';
  const isComplete = jobStatus === 'success';
  const hasError = jobStatus === 'failed';

  return (
    <div className="p-8 pt-6">
      <h1 className="text-3xl font-bold tracking-tight mb-2">Device Configuration Backup</h1>
      <p className="text-muted-foreground mb-6">Configure, execute, and review device configuration backups.</p>
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
              <div className="space-y-3">
                {jobOutput.length === 0 ? (
                  <p className="text-center text-muted-foreground pt-4">
                    Waiting for job to start...
                  </p>
                ) : (
                  jobOutput.map((log, index) => (
                    <div key={`${log.timestamp}-${index}`} className={`text-xs font-mono
                      ${log.level === 'error' ? 'text-red-500' :
                      log.level === 'success' ? 'text-green-600 dark:text-green-400' :
                        'text-gray-700 dark:text-gray-300'
                      }
                      whitespace-pre-wrap
                    `}>
                      <span className="text-muted-foreground mr-2 opacity-70">
                        {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ''}
                      </span>
                      {log.message}
                    </div>
                  ))
                )}
              </div>
              <div ref={scrollAreaRef} />
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
                    <dt className="text-muted-foreground">Operation:</dt>
                    <dd className="font-mono text-xs">Configuration Backup</dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* Debug Information (Development Only) */}
            {finalResults && import.meta.env.DEV && (
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
