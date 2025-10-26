/**
 * =============================================================================
 * CODE UPGRADES COMPONENT
 * =============================================================================
 * 
 * MAIN FUNCTIONALITY:
 * - Manages device operating system code upgrade operations
 * - Provides real-time progress tracking via WebSocket connections
 * - Displays step-by-step execution progress with enhanced visualization
 * - Handles both single device and bulk upgrades via inventory files
 * 
 * ARCHITECTURE:
 * - Frontend: React with shadcn/ui components
 * - Backend: FastAPI (REST) + Rust Hub (WebSocket)
 * - Real-time Updates: WebSocket connection for progress tracking
 * - Job Queue: Redis for background job processing
 * 
 * COMPONENT FLOW:
 * 1. CONFIGURATION: User selects target devices and upgrade image
 * 2. EXECUTION: Real-time progress tracking during upgrade process
 * 3. RESULTS: Detailed results and statistics display
 * 
 * KEY FEATURES:
 * - Multi-step progress tracking
 * - Real-time log streaming
 * - WebSocket connection management
 * - Error handling and recovery
 * - Responsive design
 * 
 * @version 2.0.0
 * @last_updated 2025-10-18
 * =============================================================================
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';

// =============================================================================
// UI COMPONENT IMPORTS
// =============================================================================
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// Lucide React Icons
import { CheckCircle, XCircle, Loader2, PlayCircle, ArrowRight } from 'lucide-react';

// =============================================================================
// CUSTOM COMPONENT IMPORTS
// =============================================================================
// Progress Tracking Components
import EnhancedProgressBar from '@/components/realTimeProgress/EnhancedProgressBar';
import EnhancedProgressStep from '@/components/realTimeProgress/EnhancedProgressStep';

// Form Components
import CodeUpgradeForm from '@/forms/CodeUpgradeForm';
import SelectImageRelease from '@/forms/SelectImageRelease';

// Custom Hooks
import { useJobWebSocket } from '@/hooks/useJobWebSocket';

// =============================================================================
// API CONFIGURATION
// =============================================================================
const API_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000';
const WS_BASE = import.meta.env.VITE_WS_HUB_URL || 'ws://localhost:3100/ws';

/**
 * Main Code Upgrades Component
 * 
 * Handles the complete lifecycle of device code upgrade operations:
 * - Configuration: Device targeting and image selection
 * - Execution: Real-time progress monitoring via WebSocket
 * - Results: Detailed outcome analysis and statistics
 * 
 * WebSocket Integration:
 * - Subscribes to job-specific channels for real-time updates
 * - Processes nested progress data from backend orchestrator
 * - Handles connection lifecycle and error states
 * - Provides automatic reconnection and cleanup
 */
export default function CodeUpgrades() {
  // =========================================================================
  // 🧠 STATE MANAGEMENT
  // =========================================================================

  /**
   * Upgrade Configuration Parameters
   * Stores all user-input parameters for the code upgrade operation
   */
  const [upgradeParams, setUpgradeParams] = useState({
    username: "admin",           // Device authentication username
    password: "manolis1",        // Device authentication password
    hostname: "172.27.200.200",  // Single target device hostname/IP
    inventory_file: "",          // Path to inventory file for bulk operations
    vendor: "",                  // Device vendor (cisco, juniper, arista, etc.)
    platform: "",                // Device platform/model
    target_version: "",          // Target software version
    image_filename: ""           // Selected upgrade image filename
  });

  /**
   * UI State Management
   * Controls the component's visual state and user interface flow
   */
  const [activeTab, setActiveTab] = useState("config");  // Current active tab
  const [jobStatus, setJobStatus] = useState("idle");    // Current job status

  /**
   * Progress Tracking State
   * Manages real-time progress information during upgrade execution
   */
  const [progress, setProgress] = useState(0);           // Progress percentage (0-100)
  const [jobOutput, setJobOutput] = useState([]);        // Array of log messages
  const [jobId, setJobId] = useState(null);              // Unique job identifier
  const [wsChannel, setWsChannel] = useState(null);      // WebSocket channel for updates
  const [finalResults, setFinalResults] = useState(null); // Final operation results

  /**
   * Step Tracking State
   * Tracks multi-step progress through the upgrade process
   */
  const [completedSteps, setCompletedSteps] = useState(0); // Number of completed steps
  const [totalSteps, setTotalSteps] = useState(0);         // Total number of steps

  /**
   * Statistics State
   * Collects and displays operation statistics
   */
  const [statistics, setStatistics] = useState({
    total: 0,       // Total devices processed
    succeeded: 0,   // Successful upgrades
    failed: 0       // Failed upgrades
  });

  // =========================================================================
  // 🎯 REFS FOR IMPERATIVE OPERATIONS
  // =========================================================================

  /**
   * processedStepsRef: Tracks which steps have been processed to avoid duplicates
   * Uses Set for O(1) lookups and automatic deduplication
   */
  const processedStepsRef = useRef(new Set());

  /**
   * latestStepMessageRef: Stores the most recent step message for progress display
   * Uses useRef to avoid unnecessary re-renders while maintaining current value
   */
  const latestStepMessageRef = useRef("");

  /**
   * loggedMessagesRef: Prevents duplicate log entries in the output
   * Uses Set to track message signatures for deduplication
   */
  const loggedMessagesRef = useRef(new Set());

  /**
   * scrollAreaRef: Reference to the scroll area for auto-scrolling to latest logs
   * Used to automatically scroll to the bottom when new logs arrive
   */
  const scrollAreaRef = useRef(null);

  // =========================================================================
  // 🔌 WEBSOCKET HOOK INTEGRATION
  // =========================================================================

  /**
   * useJobWebSocket Hook
   * Manages WebSocket connection, message handling, and connection state
   * 
   * Returns:
   * - sendMessage: Function to send messages through WebSocket
   * - lastMessage: The most recent message received from WebSocket
   * - isConnected: Boolean indicating WebSocket connection status
   */
  const { sendMessage, lastMessage, isConnected } = useJobWebSocket();

  // =========================================================================
  // 🧩 FORM HANDLERS
  // =========================================================================

  /**
   * Handle Parameter Changes
   * Updates specific parameters in the upgradeParams state
   * 
   * @param {string} name - The parameter name to update
   * @param {string} value - The new value for the parameter
   */
  const handleParamChange = (name, value) => {
    setUpgradeParams(prev => ({ ...prev, [name]: value }));
  };

  // =========================================================================
  // 🔄 WORKFLOW RESET FUNCTION
  // =========================================================================

  /**
   * Reset Workflow to Initial State
   * 
   * Performs complete cleanup and reset of the component state:
   * - Unsubscribes from WebSocket channels
   * - Resets all state variables to initial values
   * - Clears all refs and temporary data
   * - Returns to configuration tab
   */
  const resetWorkflow = () => {
    // Unsubscribe from WebSocket channel if active
    if (wsChannel) {
      sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
      console.log('[WORKFLOW] Unsubscribed from WebSocket channel:', wsChannel);
    }

    // Reset all state variables
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

    // Clear all refs
    processedStepsRef.current.clear();
    latestStepMessageRef.current = "";
    loggedMessagesRef.current.clear();

    console.log("[WORKFLOW] Code upgrade workflow reset to initial state");
  };

  // =========================================================================
  // 🚀 UPGRADE EXECUTION FUNCTION
  // =========================================================================

  /**
   * Start Upgrade Execution
   * 
   * Initiates the code upgrade process by:
   * 1. Validating all required parameters
   * 2. Resetting previous state
   * 3. Submitting job to backend API
   * 4. Setting up WebSocket subscription for real-time updates
   * 
   * @param {Event} e - Form submission event
   */
  const startUpgradeExecution = async (e) => {
    e.preventDefault();

    // =====================================================================
    // PARAMETER VALIDATION
    // =====================================================================

    // Validate target specification (hostname OR inventory file required)
    if (!upgradeParams.hostname && !upgradeParams.inventory_file) {
      setJobOutput(prev => [...prev, {
        timestamp: new Date().toISOString(),
        message: "Error: Must specify either hostname or inventory file",
        level: 'error'
      }]);
      return;
    }

    // Validate image selection
    if (!upgradeParams.image_filename) {
      setJobOutput(prev => [...prev, {
        timestamp: new Date().toISOString(),
        message: "Error: Must select an image file for upgrade",
        level: 'error'
      }]);
      return;
    }

    // Prevent multiple simultaneous executions
    if (jobStatus === 'running') return;

    // Validate WebSocket connection
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

    // Unsubscribe from any existing WebSocket channel
    if (wsChannel) {
      sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
    }

    // =====================================================================
    // STATE INITIALIZATION
    // =====================================================================

    console.log("[UPGRADE START] Starting Code Upgrade...");

    // Reset all state for new execution
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

    // Clear all refs
    processedStepsRef.current.clear();
    latestStepMessageRef.current = "";
    loggedMessagesRef.current.clear();

    // =====================================================================
    // API PAYLOAD CONSTRUCTION
    // =====================================================================

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
      // =================================================================
      // API CALL - SUBMIT UPGRADE JOB
      // =================================================================
      const response = await fetch(`${API_URL}/api/operations/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // Handle API errors
      if (!response.ok) {
        throw new Error(`API error ${response.status}: ${response.statusText}`);
      }

      // Parse successful response
      const data = await response.json();

      // =================================================================
      // WEB SOCKET SETUP
      // =================================================================
      setJobId(data.job_id);
      setWsChannel(data.ws_channel);

      console.log(`[UPGRADE START] Upgrade initiated - ID: ${data.job_id}, Channel: ${data.ws_channel}`);

      // Subscribe to WebSocket channel for real-time updates
      sendMessage({ type: 'SUBSCRIBE', channel: data.ws_channel });

      // Add initial success log entry
      setJobOutput(prev => [...prev, {
        timestamp: new Date().toISOString(),
        message: `Upgrade job started successfully. Job ID: ${data.job_id}`,
        level: 'info'
      }]);

    } catch (error) {
      // =================================================================
      // ERROR HANDLING
      // =================================================================
      console.error("[UPGRADE START] API Call Failed:", error);

      // Add error log entry
      setJobOutput(prev => [...prev, {
        timestamp: new Date().toISOString(),
        message: `Upgrade start failed: ${error.message}`,
        level: 'error'
      }]);

      // Update UI state to reflect failure
      setJobStatus("failed");
      setActiveTab("results");
    }
  };

  // =========================================================================
  // 🔌 WEBSOCKET MESSAGE HANDLER
  // =========================================================================

  /**
   * WebSocket Message Processing Effect
   * 
   * Handles real-time messages from the WebSocket connection:
   * - Parses and validates incoming messages
   * - Extracts nested progress data from orchestrator logs
   * - Updates progress tracking and step counters
   * - Manages log output and auto-scrolling
   * - Detects operation completion and final results
   * 
   * Message Processing Flow:
   * 1. Parse raw WebSocket message
   * 2. Filter messages by channel (job-specific)
   * 3. Extract nested progress data from ORCHESTRATOR_LOG
   * 4. Deduplicate and process log messages
   * 5. Update progress indicators and step counters
   * 6. Detect completion events and finalize operation
   */
  useEffect(() => {
    // Ignore if no message or no active job
    if (!lastMessage || !jobId) return;

    const raw = lastMessage;

    // Skip non-JSON messages (connection status, errors, etc.)
    if (typeof raw !== 'string' || (!raw.startsWith('{') && !raw.startsWith('['))) {
      console.log('[WEBSOCKET] Skipping non-JSON message:', raw.substring(0, 100));
      return;
    }

    // Parse JSON message
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      console.warn('[WEBSOCKET DEBUG] Failed to parse initial JSON:', raw.substring(0, 200));
      return;
    }

    /**
     * Channel Filtering
     * Ensure we only process messages for our specific job channel
     * Prevents cross-talk between multiple concurrent operations
     */
    if (parsed.channel && wsChannel && !parsed.channel.includes(wsChannel)) {
      console.log('[WEBSOCKET] Skipping message from different channel:', parsed.channel);
      return;
    }

    /**
     * Nested Progress Data Extraction
     * 
     * Backend Architecture:
     * Layer 1 (WebSocket): { data: "..." }
     * Layer 2 (Worker): { event_type: "ORCHESTRATOR_LOG", message: "[STDOUT] {...}" }
     * Layer 3 (Progress): { event_type: "STEP_START", message: "...", data: {...} }
     * 
     * This function unwraps these layers to extract actual progress events
     */
    const extractNestedProgressData = (initialParsed) => {
      let currentPayload = initialParsed;
      let deepestNestedData = null;

      // Check if message contains nested data field
      if (initialParsed.data) {
        try {
          // Parse data field (may be stringified JSON or object)
          const dataPayload = typeof initialParsed.data === 'string'
            ? JSON.parse(initialParsed.data)
            : initialParsed.data;

          currentPayload = dataPayload;

          // Handle ORCHESTRATOR_LOG messages containing nested JSON
          if (dataPayload.event_type === "ORCHESTRATOR_LOG" && dataPayload.message) {
            const message = dataPayload.message;

            // Extract JSON from [STDOUT] or [STDERR] prefixes
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

    // Extract final payload from nested structure
    const { payload: finalPayload, isNested } = extractNestedProgressData(parsed);

    /**
     * Log Message Deduplication
     * Prevents duplicate log entries from repeated or similar messages
     * Creates unique signature based on event type and message content
     */
    const createLogSignature = (payload) => {
      const msg = payload.message || '';
      const eventType = payload.event_type || 'unknown';
      return `${eventType}::${msg.substring(0, 100)}`;
    };

    const logSignature = createLogSignature(finalPayload);

    // Process new unique messages only
    if (!loggedMessagesRef.current.has(logSignature)) {
      loggedMessagesRef.current.add(logSignature);

      /**
       * Create Log Entry
       * Standardized log entry format for consistent display
       */
      const logEntry = {
        timestamp: finalPayload.timestamp || new Date().toISOString(),
        message: finalPayload.message || (typeof finalPayload === 'string' ? finalPayload : "Processing..."),
        level: finalPayload.level?.toLowerCase() || "info",
        event_type: finalPayload.event_type,
        data: finalPayload.data,
      };

      // Add to job output
      setJobOutput(prev => [...prev, logEntry]);

      // Update latest step message for progress display
      if (logEntry.message && finalPayload.event_type !== "OPERATION_COMPLETE") {
        latestStepMessageRef.current = logEntry.message;
      }

      /**
       * Auto-scroll to Latest Log
       * Ensures users always see the most recent log entries
       */
      if (scrollAreaRef.current) {
        setTimeout(() => {
          if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
          }
        }, 50);
      }
    }

    // =====================================================================
    // PROGRESS AND STEP TRACKING
    // =====================================================================

    /**
     * OPERATION_START Event
     * Initializes step tracking when operation begins
     */
    if (finalPayload.event_type === "OPERATION_START" && typeof finalPayload.data?.total_steps === "number") {
      console.log(`[PROGRESS] Operation started with ${finalPayload.data.total_steps} total steps`);
      setTotalSteps(finalPayload.data.total_steps);
      setProgress(5); // Initial progress indication
    }

    /**
     * STEP_COMPLETE Event
     * Updates progress when steps complete
     */
    if (finalPayload.event_type === "STEP_COMPLETE" && typeof finalPayload.data?.step === "number") {
      const stepNum = finalPayload.data.step;

      // Process each step only once
      if (!processedStepsRef.current.has(stepNum)) {
        processedStepsRef.current.add(stepNum);

        // Update completed steps and progress
        setCompletedSteps(prevCompleted => {
          const newCompleted = prevCompleted + 1;
          let newProgress = progress;

          // Calculate progress based on steps
          if (totalSteps > 0) {
            newProgress = Math.min(99, Math.round((newCompleted / totalSteps) * 100));
          } else {
            // Fallback progress calculation
            newProgress = Math.min(99, progress + 25);
          }

          setProgress(newProgress);
          return newCompleted;
        });
      }
    }

    /**
     * PROGRESS_UPDATE Event
     * Direct progress percentage updates from backend
     */
    if (finalPayload.event_type === "PROGRESS_UPDATE" && typeof finalPayload.data?.progress === "number") {
      setProgress(Math.min(99, Math.max(0, finalPayload.data.progress)));
    }

    // =====================================================================
    // COMPLETION DETECTION AND FINALIZATION
    // =====================================================================

    /**
     * Completion Event Detection
     * Identifies when the upgrade operation has completed
     * Supports multiple completion indicator patterns
     */
    const isCompletionEvent =
      finalPayload.event_type === "OPERATION_COMPLETE" ||
      finalPayload.success !== undefined ||
      (finalPayload.message && (
        finalPayload.message.includes('Upgrade completed') ||
        finalPayload.message.includes('Operation completed') ||
        finalPayload.message.includes('SUCCESS') ||
        finalPayload.message.includes('FAILED')
      ));

    if (isCompletionEvent) {
      /**
       * Determine Final Success Status
       * Checks multiple success indicator patterns for robustness
       */
      let finalSuccess = false;

      // Pattern 1: Direct success flag
      if (finalPayload.success === true || finalPayload.data?.final_results?.success === true) {
        finalSuccess = true;
      }
      // Pattern 2: Status field
      else if (finalPayload.data?.status === "SUCCESS") {
        finalSuccess = true;
      }
      // Pattern 3: Success message patterns
      else if (finalPayload.message && (
        finalPayload.message.includes('success: True') ||
        finalPayload.message.includes('completed successfully') ||
        finalPayload.message.includes('SUCCESS')
      )) {
        finalSuccess = true;
      }

      console.log("[UPGRADE COMPLETE] Final event detected:", {
        success: finalSuccess,
        event_type: finalPayload.event_type,
        message: finalPayload.message
      });

      // =================================================================
      // FINAL STATE UPDATES
      // =================================================================

      // Update job status
      setJobStatus(finalSuccess ? "success" : "failed");

      // Store final results
      setFinalResults(prev => prev || finalPayload);

      // Set progress to 100%
      setProgress(100);

      // Mark all steps as completed if total steps known
      if (totalSteps > 0) {
        setCompletedSteps(totalSteps);
      }

      // Unsubscribe from WebSocket channel
      if (wsChannel) {
        sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
      }

      /**
       * Schedule Tab Switch to Results
       * Uses setTimeout to ensure state updates are processed first
       */
      setTimeout(() => {
        console.log("[TAB SWITCH] Switching to results tab");
        setActiveTab("results");
      }, 1000);
    }
  }, [lastMessage, jobId, wsChannel, sendMessage, totalSteps, progress, completedSteps]);

  // =========================================================================
  // 🧮 DERIVED STATE AND MEMOIZED VALUES
  // =========================================================================

  /**
   * Status Booleans for Conditional Rendering
   * Derived from jobStatus for clean conditional logic
   */
  const isRunning = jobStatus === 'running';
  const isComplete = jobStatus === 'success';
  const hasError = jobStatus === 'failed';

  /**
   * Form Validation
   * Checks if all required parameters are provided for upgrade execution
   */
  const isFormValid = useMemo(() => {
    return (
      upgradeParams.username.trim() &&
      upgradeParams.password.trim() &&
      (upgradeParams.hostname.trim() || upgradeParams.inventory_file.trim()) &&
      upgradeParams.image_filename.trim()
    );
  }, [upgradeParams]);

  // =========================================================================
  // 🧱 UI RENDER
  // =========================================================================

  return (
    <div className="p-8 pt-6">
      {/* =====================================================================
          HEADER SECTION
          ===================================================================== */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Code Upgrade Operation</h1>
          <p className="text-muted-foreground">Upgrade device operating system software</p>
        </div>

        {/* Reset Button - Only show when operation is active or completed */}
        {jobStatus !== 'idle' && (
          <Button onClick={resetWorkflow} variant="outline" size="sm">
            Start New Upgrade
          </Button>
        )}
      </div>

      <Separator className="mb-8" />

      {/* =====================================================================
          MAIN TABBED INTERFACE
          ===================================================================== */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">

        {/* Tab Navigation */}
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

        {/* =================================================================
            TAB 1: CONFIGURATION
            ================================================================= */}
        <TabsContent value="config">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 max-w-7xl">

            {/* Left Sidebar: Image Selection */}
            <div className="xl:col-span-1">
              <SelectImageRelease
                parameters={upgradeParams}
                onParamChange={handleParamChange}
              />
            </div>

            {/* Right Panel: Device Configuration */}
            <div className="xl:col-span-2 space-y-6">

              {/* Device Configuration Form */}
              <CodeUpgradeForm
                parameters={upgradeParams}
                onParamChange={handleParamChange}
              />

              {/* Execution Readiness Card */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">

                    {/* Readiness Status */}
                    <div className="flex-1">
                      <h4 className="text-lg font-semibold mb-2">Ready to Upgrade</h4>
                      <div className="space-y-1 text-sm text-gray-600">

                        {/* Image Selection Status */}
                        {upgradeParams.image_filename && (
                          <p className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span className="font-medium">Image: {upgradeParams.image_filename}</span>
                          </p>
                        )}

                        {/* Device Target Status */}
                        {upgradeParams.hostname && (
                          <p className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span>Device: {upgradeParams.hostname}</span>
                          </p>
                        )}

                        {/* Validation Errors */}
                        {!isFormValid && (
                          <p className="text-orange-600 text-sm">
                            {!upgradeParams.image_filename && '• Select a software image\n'}
                            {!upgradeParams.hostname && !upgradeParams.inventory_file && '• Configure device target\n'}
                            {(!upgradeParams.username || !upgradeParams.password) && '• Provide authentication credentials'}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Start Upgrade Button */}
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

        {/* =================================================================
            TAB 2: EXECUTION PROGRESS
            ================================================================= */}
        <TabsContent value="execute">
          <div className="space-y-6 p-4 border rounded-lg max-w-6xl">
            <h2 className="text-xl font-semibold mb-4">Upgrade Progress</h2>

            {/* Enhanced Progress Bar */}
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

            {/* Real-time Log Output */}
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

        {/* =================================================================
            TAB 3: RESULTS AND STATISTICS
            ================================================================= */}
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

                    {/* Status Icon */}
                    {jobStatus === 'success' ? (
                      <CheckCircle className="h-8 w-8 text-green-600" />
                    ) : jobStatus === 'failed' ? (
                      <XCircle className="h-8 w-8 text-red-600" />
                    ) : (
                      <Loader2 className="h-8 w-8 text-muted-foreground" />
                    )}

                    {/* Status Text */}
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

            {/* Execution Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Job Execution Details */}
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

              {/* Configuration Summary */}
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

            {/* Debug Information (Development Only) */}
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
