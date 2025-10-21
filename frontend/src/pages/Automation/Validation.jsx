// =========================================================================================
//
// COMPONENT:          Validation.jsx
// FILE:               /src/pages/Automation/Validation.jsx
//
// OVERVIEW:
//   This component provides the specialized UI for the Validation script, integrating
//   with the modern WebSocket architecture following the same pattern as CodeUpgrades.jsx
//
// =========================================================================================

// ====================================================================================
// SECTION 1: IMPORTS & CONFIGURATION
// ====================================================================================
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { PlayCircle, Layers, Loader2 } from 'lucide-react';

// --- UI Component Imports ---
import ValidationForm from '@/forms/ValidationForm.jsx';
import ScriptOptionsRenderer from '@/shared/ScriptOptionsRenderer.jsx';
import ScriptOutputDisplay from '@/shared/ScriptOutputDisplay.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.jsx';

// --- Custom Hook Imports ---
import { useJobWebSocket } from '@/hooks/useJobWebSocket';
import { useTestDiscovery } from '@/hooks/useTestDiscovery';

// API Configuration
const API_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000';

// ====================================================================================
// SECTION 2: MAIN COMPONENT DEFINITION
// ====================================================================================
function Validation({ script, parameters = {}, onParamChange }) {
  // =========================================================================
  // 🧠 STATE MANAGEMENT - Safe parameter initialization
  // =========================================================================

  // Ensure parameters has safe defaults
  const safeParameters = useMemo(() => ({
    username: "",
    password: "",
    hostname: "",
    inventory_file: "",
    tests: [],
    ...parameters
  }), [parameters]);

  // UI State
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

  // Refs
  const processedStepsRef = useRef(new Set());
  const latestStepMessageRef = useRef("");
  const loggedMessagesRef = useRef(new Set());

  // WebSocket Hook
  const { sendMessage, lastMessage, isConnected } = useJobWebSocket();

  // Test Discovery Hook
  const { categorizedTests, loading: testsLoading, error: testsError } = useTestDiscovery(script?.id);

  // Safe parameter change handler
  const handleSafeParamChange = (name, value) => {
    if (onParamChange) {
      onParamChange(name, value);
    }
  };

  // =========================================================================
  // 🔄 WORKFLOW RESET
  // =========================================================================

  const resetWorkflow = () => {
    if (wsChannel) {
      sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
      console.log('[VALIDATION WORKFLOW] Unsubscribed from WebSocket channel');
    }

    setJobStatus("idle");
    setProgress(0);
    setJobOutput([]);
    setJobId(null);
    setWsChannel(null);
    setFinalResults(null);
    setCompletedSteps(0);
    setTotalSteps(0);

    processedStepsRef.current.clear();
    latestStepMessageRef.current = "";
    loggedMessagesRef.current.clear();

    console.log("[VALIDATION WORKFLOW] Validation workflow reset to initial state");
  };

  // =========================================================================
  // 🚀 VALIDATION EXECUTION
  // =========================================================================

  const handleRun = async (event) => {
    if (event) event.preventDefault();

    // Safe validation using safeParameters
    if (!safeParameters.username || !safeParameters.password) {
      alert("Username and password are required.");
      return;
    }

    if (!safeParameters.hostname && !safeParameters.inventory_file) {
      alert("A target host or inventory file is required.");
      return;
    }

    if (!safeParameters.tests || safeParameters.tests.length === 0) {
      alert("At least one validation test must be selected.");
      return;
    }

    if (jobStatus === 'running') return;

    if (!isConnected) {
      console.error("[VALIDATION START] WebSocket not connected - cannot start validation");
      alert("WebSocket not connected. Cannot start validation.");
      setJobStatus("failed");
      return;
    }

    if (wsChannel) {
      sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
    }

    console.log("[VALIDATION START] Starting Validation...");
    setJobStatus("running");
    setProgress(0);
    setJobOutput([]);
    setFinalResults(null);
    setJobId(null);
    setWsChannel(null);
    setCompletedSteps(0);
    setTotalSteps(0);
    processedStepsRef.current.clear();
    latestStepMessageRef.current = "";
    loggedMessagesRef.current.clear();

    // Transform test IDs to match the expected format
    const formattedTests = Array.isArray(safeParameters.tests)
      ? safeParameters.tests
      : [safeParameters.tests].filter(Boolean);

    const payload = {
      command: "validation",
      scriptId: script?.id || "validation_script",
      hostname: safeParameters.hostname?.trim() || "",
      inventory_file: safeParameters.inventory_file?.trim() || "",
      username: safeParameters.username,
      password: safeParameters.password,
      tests: formattedTests,
      // Include any additional parameters from script options
      ...safeParameters
    };

    // Remove empty values
    Object.keys(payload).forEach(key => {
      if (payload[key] === "" || payload[key] == null) {
        delete payload[key];
      }
    });

    console.log("[VALIDATION START] Sending payload:", payload);

    try {
      const response = await fetch(`${API_URL}/api/operations/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log("[VALIDATION START] Response data:", data);

      if (data.job_id && data.ws_channel) {
        setJobId(data.job_id);
        setWsChannel(data.ws_channel);
        console.log(`[VALIDATION START] Validation initiated - ID: ${data.job_id}, Channel: ${data.ws_channel}`);
        sendMessage({ type: 'SUBSCRIBE', channel: data.ws_channel });
      } else {
        throw new Error('Invalid response: missing job_id or ws_channel');
      }

    } catch (error) {
      console.error("[VALIDATION START] API Call Failed:", error);
      setJobOutput(prev => [...prev, {
        timestamp: new Date().toISOString(),
        message: `Validation start failed: ${error.message}`,
        level: 'error'
      }]);
      setJobStatus("failed");
    }
  };

  // =========================================================================
  // 🔌 WEBSOCKET MESSAGE HANDLER
  // =========================================================================

  useEffect(() => {
    if (!lastMessage || !jobId) return;

    console.log('[VALIDATION WEBSOCKET] Raw message:', lastMessage);

    let parsed;
    try {
      parsed = JSON.parse(lastMessage);
    } catch (error) {
      console.warn('[VALIDATION WEBSOCKET] Failed to parse JSON, treating as raw message');
      // Treat as raw message
      const logEntry = {
        timestamp: new Date().toISOString(),
        message: lastMessage,
        level: 'info',
        event_type: 'RAW_MESSAGE'
      };

      setJobOutput(prev => [...prev, logEntry]);
      return;
    }

    // Check if message is for our channel
    if (parsed.channel && wsChannel && parsed.channel !== wsChannel) {
      return;
    }

    // Handle different message formats
    let finalPayload = parsed;

    // Extract nested data if present
    if (parsed.data && typeof parsed.data === 'object') {
      // Check if data contains nested JSON in message
      if (parsed.data.message && typeof parsed.data.message === 'string') {
        const jsonMatch = parsed.data.message.match(/\{.*\}/s);
        if (jsonMatch) {
          try {
            const nestedData = JSON.parse(jsonMatch[0]);
            finalPayload = { ...parsed.data, ...nestedData };
          } catch (e) {
            // If nested parse fails, use the original data
            finalPayload = parsed.data;
          }
        } else {
          finalPayload = parsed.data;
        }
      } else {
        finalPayload = parsed.data;
      }
    }

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
        level: (finalPayload.level || 'info').toLowerCase(),
        event_type: finalPayload.event_type,
        data: finalPayload.data || finalPayload,
      };

      setJobOutput(prev => [...prev, logEntry]);

      // Update latest step message
      if (logEntry.message && finalPayload.event_type !== "OPERATION_COMPLETE") {
        latestStepMessageRef.current = logEntry.message;
      }
    }

    // Handle progress and step tracking
    if (finalPayload.event_type === "OPERATION_START" && typeof finalPayload.total_steps === "number") {
      console.log(`[VALIDATION PROGRESS] Operation started with ${finalPayload.total_steps} total steps`);
      setTotalSteps(finalPayload.total_steps);
      setProgress(5);
    }

    if (finalPayload.event_type === "STEP_COMPLETE" && typeof finalPayload.step === "number") {
      const stepNum = finalPayload.step;

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

    if (finalPayload.event_type === "PROGRESS_UPDATE" && typeof finalPayload.progress === "number") {
      setProgress(Math.min(99, Math.max(0, finalPayload.progress)));
    }

    // Handle completion
    const isCompletionEvent =
      finalPayload.event_type === "OPERATION_COMPLETE" ||
      finalPayload.success !== undefined ||
      (finalPayload.message && (
        finalPayload.message.includes('Validation completed') ||
        finalPayload.message.includes('completed successfully') ||
        finalPayload.message.includes('FAILED') ||
        finalPayload.message.includes('ERROR')
      ));

    if (isCompletionEvent) {
      let finalSuccess = false;

      if (finalPayload.success === true || finalPayload.final_results?.success === true) {
        finalSuccess = true;
      }
      else if (finalPayload.status === "SUCCESS") {
        finalSuccess = true;
      }
      else if (finalPayload.message && (finalPayload.message.includes('success: True') || finalPayload.message.includes('completed successfully'))) {
        finalSuccess = true;
      }

      console.log("[VALIDATION COMPLETE] Final event detected:", {
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
    }
  }, [lastMessage, jobId, wsChannel, sendMessage, totalSteps, progress, completedSteps]);

  // =========================================================================
  // 🧱 UI RENDER - Safe rendering
  // =========================================================================

  const isRunning = jobStatus === 'running';
  const isComplete = jobStatus === 'success' || jobStatus === 'failed';
  const hasError = jobStatus === 'failed';

  // Safe form validation
  const isFormValid =
    safeParameters.username?.trim() &&
    safeParameters.password?.trim() &&
    (safeParameters.hostname?.trim() || safeParameters.inventory_file?.trim()) &&
    safeParameters.tests && safeParameters.tests.length > 0;

  const getDisabledReason = () => {
    if (isRunning) return 'A script is currently running.';
    if (!safeParameters.username || !safeParameters.password) return 'Username and password are required.';
    if (!safeParameters.hostname && !safeParameters.inventory_file) return 'A target host or inventory file is required.';
    if (!safeParameters.tests || safeParameters.tests.length === 0) return 'At least one validation test must be selected.';
    return '';
  };

  const disabledReason = getDisabledReason();

  // Prepare data for ScriptOutputDisplay
  const progressEvents = useMemo(() => {
    return jobOutput.map(log => ({
      event_type: log.event_type,
      message: log.message,
      data: log.data,
      timestamp: log.timestamp
    }));
  }, [jobOutput]);

  const finalResult = useMemo(() => {
    if (finalResults) {
      return finalResults;
    }
    return null;
  }, [finalResults]);

  const error = useMemo(() => {
    if (hasError) {
      return finalResults?.message || "Validation failed";
    }
    return null;
  }, [hasError, finalResults]);

  // Safe script data
  const safeScript = useMemo(() => ({
    displayName: "Validation",
    description: "Run validation tests against network devices",
    id: "validation_script",
    capabilities: {},
    ...script
  }), [script]);

  return (
    <div className="p-8 pt-6">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{safeScript.displayName}</h1>
          <p className="text-muted-foreground">{safeScript.description}</p>
        </div>
        {jobStatus !== 'idle' && (
          <Button onClick={resetWorkflow} variant="outline" size="sm">
            Start New Validation
          </Button>
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-8 mt-6">
        {/* Sidebar for script-level options */}
        <aside className="w-full md:w-72 lg:w-80 flex-shrink-0">
          <div className="sticky top-24 space-y-6 bg-card p-6 rounded-xl border shadow-sm">
            <h3 className="text-lg font-semibold flex items-center border-b pb-3">
              <Layers size={18} className="mr-2 text-muted-foreground" /> Script Options
            </h3>
            <ScriptOptionsRenderer
              script={safeScript}
              parameters={safeParameters}
              onParamChange={handleSafeParamChange}
            />
          </div>
        </aside>

        {/* Main content area for forms and results */}
        <main className="flex-1 space-y-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl font-bold">{safeScript.displayName}</CardTitle>
              <p className="text-muted-foreground">{safeScript.description}</p>
            </CardHeader>
            <CardContent className="space-y-6">
              <ValidationForm
                parameters={safeParameters}
                onParamChange={handleSafeParamChange}
                categorizedTests={categorizedTests}
                testsLoading={testsLoading}
                testsError={testsError}
              />

              <div className="border-t pt-6">
                <Button
                  type="button"
                  onClick={handleRun}
                  disabled={!isFormValid || isRunning || !isConnected}
                  className="w-full font-bold"
                  title={disabledReason}
                >
                  {isRunning ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Running Validation...
                    </>
                  ) : (
                    <>
                      <PlayCircle className="mr-2 h-4 w-4" />
                      Run Validation
                    </>
                  )}
                </Button>
                {!isConnected && (
                  <p className="text-sm text-destructive mt-2">
                    WebSocket not connected. Please check your connection.
                  </p>
                )}
                {disabledReason && !isRunning && isConnected && (
                  <p className="text-sm text-muted-foreground mt-2">
                    {disabledReason}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Script Output Display */}
          {(isRunning || isComplete) && (
            <ScriptOutputDisplay
              script={safeScript}
              isRunning={isRunning}
              isComplete={isComplete}
              progressEvents={progressEvents}
              finalResult={finalResult}
              error={error}
              showDebug={safeScript?.capabilities?.enableDebug}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default Validation;
