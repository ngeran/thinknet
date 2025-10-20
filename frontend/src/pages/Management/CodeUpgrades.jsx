/**
 * =============================================================================
 * CODE UPGRADES COMPONENT
 * =============================================================================
 * Main component for managing device code upgrade operations with real-time
 * progress tracking and enhanced results visualization.
 * 
 * @version 1.0.0
 * @last_updated 2025-10-18
 * =============================================================================
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, XCircle, Loader2, PlayCircle, ArrowRight } from 'lucide-react';

// Progress Components
import EnhancedProgressBar from '@/components/realTimeProgress/EnhancedProgressBar';
import EnhancedProgressStep from '@/components/realTimeProgress/EnhancedProgressStep';

// Form Components
import CodeUpgradeForm from '@/forms/CodeUpgradeForm';
import SelectImageRelease from '@/forms/SelectImageRelease';
import { useJobWebSocket } from '@/hooks/useJobWebSocket';

// API Configuration
const API_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000';

/**
 * Main Code Upgrades Component
 * Handles device code upgrade operations with real-time progress tracking
 */
export default function CodeUpgrades() {
  // =========================================================================
  // 🧠 STATE MANAGEMENT
  // =========================================================================

  // Upgrade configuration parameters
  const [upgradeParams, setUpgradeParams] = useState({
    username: "admin",
    password: "manolis1",
    hostname: "172.27.200.200",
    inventory_file: "",
    vendor: "",
    platform: "",
    target_version: "",
    image_filename: ""
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

  // Step Tracking
  const [completedSteps, setCompletedSteps] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);

  // Statistics
  const [statistics, setStatistics] = useState({
    total: 0,
    succeeded: 0,
    failed: 0
  });

  // Refs
  const processedStepsRef = useRef(new Set());
  const latestStepMessageRef = useState("");
  const loggedMessagesRef = useRef(new Set());
  const scrollAreaRef = useRef(null);

  // WebSocket Hook
  const { sendMessage, lastMessage, isConnected } = useJobWebSocket();

  // =========================================================================
  // 🧩 FORM HANDLERS
  // =========================================================================

  const handleParamChange = (name, value) => {
    setUpgradeParams(prev => ({ ...prev, [name]: value }));
  };

  // =========================================================================
  // 🔄 WORKFLOW RESET
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
    loggedMessagesRef.current.clear();

    console.log("[WORKFLOW] Code upgrade workflow reset to initial state");
  };

  // =========================================================================
  // 🚀 UPGRADE EXECUTION
  // =========================================================================

  const startUpgradeExecution = async (e) => {
    e.preventDefault();

    // Validation
    if (!upgradeParams.hostname && !upgradeParams.inventory_file) {
      setJobOutput(prev => [...prev, {
        timestamp: new Date().toISOString(),
        message: "Error: Must specify either hostname or inventory file",
        level: 'error'
      }]);
      return;
    }

    if (!upgradeParams.image_filename) {
      setJobOutput(prev => [...prev, {
        timestamp: new Date().toISOString(),
        message: "Error: Must select an image file for upgrade",
        level: 'error'
      }]);
      return;
    }

    if (jobStatus === 'running') return;

    if (!isConnected) {
      console.error("[UPGRADE START] WebSocket not connected - cannot start upgrade");
      setJobOutput(prev => [...prev, {
        timestamp: new Date().toISOString(),
        message: "WebSocket not connected. Cannot start upgrade.",
        level: 'error'
      }]);
      setJobStatus("failed");
      setActiveTab("results");
      return;
    }

    if (wsChannel) {
      sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
    }

    console.log("[UPGRADE START] Starting Code Upgrade...");
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

    const payload = {
      command: "code_upgrade",
      hostname: upgradeParams.hostname.trim(),
      inventory_file: upgradeParams.inventory_file.trim(),
      username: upgradeParams.username,
      password: upgradeParams.password,
      vendor: upgradeParams.vendor,
      platform: upgradeParams.platform,
      target_version: upgradeParams.target_version,
      image_filename: upgradeParams.image_filename,
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
      console.log(`[UPGRADE START] Upgrade initiated - ID: ${data.job_id}, Channel: ${data.ws_channel}`);
      sendMessage({ type: 'SUBSCRIBE', channel: data.ws_channel });

    } catch (error) {
      console.error("[UPGRADE START] API Call Failed:", error);
      setJobOutput(prev => [...prev, {
        timestamp: new Date().toISOString(),
        message: `Upgrade start failed: ${error.message}`,
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

    // Extract nested progress data (similar to Backup.jsx)
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

    // Log message deduplication
    const createLogSignature = (payload) => {
      const msg = payload.message || '';
      const eventType = payload.event_type || 'unknown';
      return `${eventType}::${msg.substring(0, 100)}`;
    };

    const logSignature = createLogSignature(finalPayload);

    if (!loggedMessagesRef.current.has(logSignature)) {
      loggedMessagesRef.current.add(logSignature);

      const logEntry = {
        timestamp: finalPayload.timestamp || new Date().toISOString(),
        message: finalPayload.message || (typeof finalPayload === 'string' ? finalPayload : "Processing..."),
        level: finalPayload.level?.toLowerCase() || "info",
        event_type: finalPayload.event_type,
        data: finalPayload.data,
      };

      setJobOutput(prev => [...prev, logEntry]);

      // Update latest step message
      if (logEntry.message && finalPayload.event_type !== "OPERATION_COMPLETE") {
        latestStepMessageRef.current = logEntry.message;
      }

      // Auto-scroll
      if (scrollAreaRef.current) {
        setTimeout(() => {
          if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
          }
        }, 50);
      }
    }

    // Handle progress and step tracking (similar to Backup.jsx)
    if (finalPayload.event_type === "OPERATION_START" && typeof finalPayload.data?.total_steps === "number") {
      console.log(`[PROGRESS] Operation started with ${finalPayload.data.total_steps} total steps`);
      setTotalSteps(finalPayload.data.total_steps);
      setProgress(5);
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

    // Handle completion
    const isCompletionEvent =
      finalPayload.event_type === "OPERATION_COMPLETE" ||
      finalPayload.success !== undefined ||
      (finalPayload.message && finalPayload.message.includes('Upgrade completed'));

    if (isCompletionEvent) {
      let finalSuccess = false;

      if (finalPayload.success === true || finalPayload.data?.final_results?.success === true) {
        finalSuccess = true;
      }
      else if (finalPayload.data?.status === "SUCCESS") {
        finalSuccess = true;
      }
      else if (finalPayload.message && (finalPayload.message.includes('success: True') || finalPayload.message.includes('completed successfully'))) {
        finalSuccess = true;
      }

      console.log("[UPGRADE COMPLETE] Final event detected:", {
        success: finalSuccess,
        event_type: finalPayload.event_type,
        message: finalPayload.message
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
  // 🧱 UI RENDER
  // =========================================================================

  const isRunning = jobStatus === 'running';
  const isComplete = jobStatus === 'success';
  const hasError = jobStatus === 'failed';

  // Form validation
  const isFormValid =
    upgradeParams.username.trim() &&
    upgradeParams.password.trim() &&
    (upgradeParams.hostname.trim() || upgradeParams.inventory_file.trim()) &&
    upgradeParams.image_filename.trim();

  return (
    <div className="p-8 pt-6">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Code Upgrade Operation</h1>
          <p className="text-muted-foreground">Upgrade device operating system software</p>
        </div>
        {jobStatus !== 'idle' && (
          <Button onClick={resetWorkflow} variant="outline" size="sm">
            Start New Upgrade
          </Button>
        )}
      </div>
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
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 max-w-7xl">
            {/* Image Selection Sidebar */}
            <div className="xl:col-span-1">
              <SelectImageRelease
                parameters={upgradeParams}
                onParamChange={handleParamChange}
              />
            </div>

            {/* Device Configuration Main Content */}
            <div className="xl:col-span-2 space-y-6">
              <CodeUpgradeForm
                parameters={upgradeParams}
                onParamChange={handleParamChange}
              />

              {/* Execution Button */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex-1">
                      <h4 className="text-lg font-semibold mb-2">Ready to Upgrade</h4>
                      <div className="space-y-1 text-sm text-gray-600">
                        {upgradeParams.image_filename && (
                          <p className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span className="font-medium">Image: {upgradeParams.image_filename}</span>
                          </p>
                        )}
                        {upgradeParams.hostname && (
                          <p className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span>Device: {upgradeParams.hostname}</span>
                          </p>
                        )}
                        {!isFormValid && (
                          <p className="text-orange-600 text-sm">
                            {!upgradeParams.image_filename && '• Select a software image\n'}
                            {!upgradeParams.hostname && !upgradeParams.inventory_file && '• Configure device target\n'}
                            {(!upgradeParams.username || !upgradeParams.password) && '• Provide authentication credentials'}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      onClick={startUpgradeExecution}
                      disabled={!isFormValid || jobStatus !== 'idle' || !isConnected}
                      size="lg"
                      className="w-full sm:w-auto"
                    >
                      {jobStatus === 'running' ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Running...
                        </>
                      ) : (
                        <>
                          Start Upgrade
                          <ArrowRight className="h-4 w-4 ml-2" />
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="execute">
          <div className="space-y-6 p-4 border rounded-lg max-w-6xl">
            <h2 className="text-xl font-semibold mb-4">Upgrade Progress</h2>

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
                    Waiting for upgrade to start...
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
            <Card className={`
              border-2 ${jobStatus === 'success' ? 'border-green-200 bg-green-50' :
                jobStatus === 'failed' ? 'border-red-200 bg-red-50' :
                  'border-gray-200'
              }`}
            >
              <CardContent className="pt-6">
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
                        {jobStatus === 'success' ? 'Upgrade Completed Successfully' :
                          jobStatus === 'failed' ? 'Upgrade Failed' :
                            'Awaiting Execution'}
                      </h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        {finalResults?.message || 'No results available yet'}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Selected Image Information */}
            {upgradeParams.image_filename && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    Selected Software Image
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Vendor:</span>
                      <p className="text-muted-foreground">{upgradeParams.vendor || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="font-medium">Platform:</span>
                      <p className="text-muted-foreground">{upgradeParams.platform || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="font-medium">Release:</span>
                      <p className="text-muted-foreground">{upgradeParams.target_version || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="font-medium">Image:</span>
                      <p className="text-muted-foreground font-mono text-xs break-all">
                        {upgradeParams.image_filename}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Execution Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Execution Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Job ID:</span>
                    <span className="font-mono text-xs">{jobId || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Progress:</span>
                    <span className="font-semibold">{progress}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Steps:</span>
                    <span className="font-semibold">{completedSteps}/{totalSteps || 'Unknown'}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Configuration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Target:</span>
                    <span className="font-medium truncate">{upgradeParams.hostname || upgradeParams.inventory_file || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Username:</span>
                    <span className="font-medium">{upgradeParams.username}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status:</span>
                    <span className={`font-medium ${jobStatus === 'success' ? 'text-green-600' :
                      jobStatus === 'failed' ? 'text-red-600' :
                        'text-blue-600'
                      }`}>
                      {jobStatus.toUpperCase()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Debug Information */}
            {finalResults && process.env.NODE_ENV === 'development' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Debug Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-48">
                    <pre className="text-xs font-mono whitespace-pre-wrap">
                      {JSON.stringify(finalResults, null, 2)}
                    </pre>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
