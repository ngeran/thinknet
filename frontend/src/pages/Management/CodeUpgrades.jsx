/**
 * =============================================================================
 * CODE UPGRADES COMPONENT - PRODUCTION READY v4.2.0 (FULLY FIXED)
 * =============================================================================
 *
 * @version 4.2.0
 * @last_updated 2025-10-31
 * @author nikos-geranios_vgi
 *
 * 🔧 CRITICAL FIXES IN THIS VERSION:
 * ✅ FIX 1: Removed unnecessary transitionToReviewTab callback complexity
 * ✅ FIX 2: Simplified tab transition - uses existing state from PRE_CHECK_COMPLETE
 * ✅ FIX 3: Added comprehensive debug logging for troubleshooting
 * ✅ FIX 4: Proper OPERATION_COMPLETE detection and handling
 * ✅ FIX 5: Eliminated race condition by relying on already-set preCheckSummary
 *
 * 🎯 HOW IT WORKS NOW:
 * 1. PRE_CHECK_COMPLETE arrives → Sets preCheckSummary state → Enables Review tab
 * 2. OPERATION_COMPLETE arrives (0.15s later) → Triggers setTimeout for transition
 * 3. After 1.5s delay → setActiveTab("review") executes successfully
 * 4. React re-renders → User sees Review tab with results
 *
 * 💡 KEY INSIGHT:
 * We don't need to pass summary data to transition function because React state
 * from PRE_CHECK_COMPLETE is already available. The tab trigger is simply:
 *   setActiveTab("review") + setCurrentPhase("review")
 *
 * 🔍 DEBUGGING:
 * All critical operations log to console with [PREFIX] tags:
 *   [PRE-CHECK] - Pre-check phase operations
 *   [OPERATION] - OPERATION_COMPLETE detection
 *   [TAB TRANSITION] - Tab switching logic
 *   [DEBUG] - State verification logs
 *
 * ARCHITECTURE:
 * Frontend → FastAPI (code_upgrade.py) → Redis Queue → Job Orchestrator → run.py
 *                                                              ↓
 *                                                        WebSocket Updates
 *                                                              ↓
 *                                                     Frontend (this component)
 *
 * WORKFLOW STATES:
 * 1. CONFIGURE  - User selects device, image, credentials
 * 2. EXECUTE    - Pre-check runs with live progress updates
 * 3. REVIEW     - User reviews pre-check results and decides (AUTO-TRANSITION)
 * 4. RESULTS    - Final upgrade outcome and statistics
 *
 * API ENDPOINTS:
 *   POST /api/operations/pre-check  - Queue pre-check validation job
 *   POST /api/operations/execute    - Queue upgrade execution job
 *   GET  /api/operations/health     - Service health check
 *
 * WEBSOCKET EVENTS (in order):
 *   OPERATION_START      → Initialize progress tracking
 *   STEP_START          → Begin individual step
 *   STEP_COMPLETE       → Finish individual step
 *   PRE_CHECK_RESULT    → Individual validation result
 *   PRE_CHECK_COMPLETE  → All checks complete (contains summary)
 *   OPERATION_COMPLETE  → Job finalized (triggers tab transition)
 *
 * =============================================================================
 */
 
import React, { useState, useEffect, useRef, useMemo } from 'react';
 
// ============================================================================
// UI COMPONENT IMPORTS
// ============================================================================
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
 
// ============================================================================
// ICON IMPORTS
// ============================================================================
import {
  CheckCircle,
  XCircle,
  Loader2,
  PlayCircle,
  ArrowRight,
  AlertTriangle,
  Shield,
  Activity,
  HardDrive,
  Database,
  Zap,
  Info,
  RefreshCw
} from 'lucide-react';
 
// ============================================================================
// CUSTOM COMPONENT IMPORTS
// ============================================================================
import EnhancedProgressBar from '@/components/realTimeProgress/EnhancedProgressBar';
import EnhancedProgressStep from '@/components/realTimeProgress/EnhancedProgressStep';
import CodeUpgradeForm from '@/forms/CodeUpgradeForm';
import SelectImageRelease from '@/forms/SelectImageRelease';
 
// ============================================================================
// CUSTOM HOOKS
// ============================================================================
import { useJobWebSocket } from '@/hooks/useJobWebSocket';
 
// ============================================================================
// UTILITY IMPORTS
// ============================================================================
import { extractVersionFromImageFilename } from '@/utils/versionParser';
 
// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================
 
/**
 * API base URL - Retrieved from environment or defaults to localhost
 */
const API_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000';
 
/**
 * UI timing constants for better control and consistency
 */
const TIMING = {
  AUTO_SCROLL_DELAY: 50,        // Delay before auto-scrolling logs (ms)
  TAB_TRANSITION_DELAY: 1500,   // Delay before switching tabs (ms) - increased for state stability
  PROGRESS_UPDATE_INTERVAL: 100 // Progress bar update throttle (ms)
};
 
/**
 * Pre-check result severity icons mapping
 * Maps check names to their corresponding Lucide icons for visual feedback
 */
const PRE_CHECK_ICONS = {
  "Device Connectivity": Shield,
  "Storage Space": HardDrive,
  "System State": Activity,
  "Redundancy Status": Database,
  "Image Availability": CheckCircle,
  "Version Compatibility": Zap,
  "Snapshot Availability": RefreshCw,
  "Resource Utilization": Activity,
};
 
// ============================================================================
// MAIN COMPONENT
// ============================================================================
 
export default function CodeUpgrades() {
 
  // ==========================================================================
  // STATE MANAGEMENT
  // ==========================================================================
 
  /**
   * Upgrade configuration parameters
   * These are populated by the user through forms and selections
   */
  const [upgradeParams, setUpgradeParams] = useState({
    username: "",           // Device authentication username
    password: "",           // Device authentication password
    hostname: "",           // Single device target (IP or hostname)
    inventory_file: "",     // Alternative: multiple devices from CSV file
    vendor: "",             // Device vendor (e.g., "juniper")
    platform: "",           // Device platform (e.g., "srx", "mx")
    target_version: "",     // Target software version (auto-extracted from image)
    image_filename: ""      // Selected upgrade image filename
  });
 
  /**
   * UI state management
   */
  const [activeTab, setActiveTab] = useState("config");        // Current active tab
  const [jobStatus, setJobStatus] = useState("idle");          // Job execution status
  const [currentPhase, setCurrentPhase] = useState("config");  // Current workflow phase
 
  /**
   * Progress tracking state
   */
  const [progress, setProgress] = useState(0);                 // Overall progress percentage (0-100)
  const [jobOutput, setJobOutput] = useState([]);              // Array of log entries from job execution
  const [jobId, setJobId] = useState(null);                    // Current job identifier (UUID)
  const [wsChannel, setWsChannel] = useState(null);            // WebSocket channel name (job:{jobId})
  const [finalResults, setFinalResults] = useState(null);      // Final job results object
 
  /**
   * Step tracking for progress visualization
   */
  const [completedSteps, setCompletedSteps] = useState(0);     // Number of completed steps
  const [totalSteps, setTotalSteps] = useState(0);             // Total steps in current operation
 
  /**
   * Pre-check specific state
   */
  const [preCheckJobId, setPreCheckJobId] = useState(null);              // Pre-check job ID (for reference in upgrade)
  const [preCheckResults, setPreCheckResults] = useState(null);          // Array of individual check results
  const [preCheckSummary, setPreCheckSummary] = useState(null);          // Aggregated pre-check summary
  const [isRunningPreCheck, setIsRunningPreCheck] = useState(false);     // Pre-check execution flag
  const [canProceedWithUpgrade, setCanProceedWithUpgrade] = useState(false); // Approval status from pre-check
 
  /**
   * Statistics for results display
   */
  const [statistics, setStatistics] = useState({
    total: 0,      // Total devices processed
    succeeded: 0,  // Successful upgrades
    failed: 0      // Failed upgrades
  });
 
  // ==========================================================================
  // REFS FOR PERFORMANCE AND STATE TRACKING
  // ==========================================================================
 
  /**
   * Track processed steps to avoid duplicate progress updates
   * Using Set for O(1) lookup performance
   */
  const processedStepsRef = useRef(new Set());
 
  /**
   * Store the latest step message for display in progress bar
   */
  const latestStepMessageRef = useRef("");
 
  /**
   * Track logged messages to prevent duplicates in the log viewer
   * Uses message signature (event_type + message substring) for deduplication
   */
  const loggedMessagesRef = useRef(new Set());
 
  /**
   * Reference to the scroll area DOM element for auto-scrolling logs
   */
  const scrollAreaRef = useRef(null);
 
  // ==========================================================================
  // WEBSOCKET HOOK
  // ==========================================================================
 
  /**
   * WebSocket connection for real-time job progress updates
   * Provides:
   *   - sendMessage(msg): Send WebSocket message (subscribe/unsubscribe)
   *   - lastMessage: Latest received message
   *   - isConnected: Connection status boolean
   */
  const { sendMessage, lastMessage, isConnected } = useJobWebSocket();
 
  // ==========================================================================
  // EVENT HANDLERS
  // ==========================================================================
 
  /**
   * Handle form parameter changes
   *
   * Special handling for image_filename:
   *   - Automatically extracts precise version from filename
   *   - Updates target_version with extracted value
   *
   * @param {string} name - Parameter name to update
   * @param {*} value - New value for the parameter
   */
  const handleParamChange = (name, value) => {
    setUpgradeParams(prev => ({ ...prev, [name]: value }));
 
    // Auto-extract precise version when image is selected
    if (name === 'image_filename' && value) {
      const preciseVersion = extractVersionFromImageFilename(value);
      if (preciseVersion) {
        console.log(`[VERSION EXTRACTION] Extracted "${preciseVersion}" from "${value}"`);
        setUpgradeParams(prev => ({ ...prev, target_version: preciseVersion }));
      } else {
        console.warn(`[VERSION EXTRACTION] Could not extract version from "${value}"`);
      }
    }
  };
 
  /**
   * Reset the entire workflow to initial state
   *
   * Actions performed:
   *   - Unsubscribes from WebSocket channel
   *   - Clears all state variables
   *   - Resets refs
   *   - Returns to configuration tab
   */
  const resetWorkflow = () => {
    console.log("[WORKFLOW] Initiating complete reset");
 
    // Unsubscribe from WebSocket channel if active
    if (wsChannel) {
      console.log(`[WEBSOCKET] Unsubscribing from channel: ${wsChannel}`);
      sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
    }
 
    // Reset all state to initial values
    setJobStatus("idle");
    setCurrentPhase("config");
    setProgress(0);
    setJobOutput([]);
    setJobId(null);
    setWsChannel(null);
    setFinalResults(null);
    setActiveTab("config");
    setCompletedSteps(0);
    setTotalSteps(0);
    setStatistics({ total: 0, succeeded: 0, failed: 0 });
 
    // Reset pre-check state
    setPreCheckJobId(null);
    setPreCheckResults(null);
    setPreCheckSummary(null);
    setIsRunningPreCheck(false);
    setCanProceedWithUpgrade(false);
 
    // Clear refs
    processedStepsRef.current.clear();
    latestStepMessageRef.current = "";
    loggedMessagesRef.current.clear();
 
    console.log("[WORKFLOW] Reset complete - ready for new operation");
  };
 
  // ==========================================================================
  // PRE-CHECK HANDLER
  // ==========================================================================
 
  /**
   * Initiate pre-check validation workflow
   *
   * This function:
   *   1. Validates required parameters
   *   2. Prepares the UI for execution
   *   3. Submits pre-check job to FastAPI
   *   4. Receives job_id and ws_channel
   *   5. Subscribes to WebSocket for progress updates
   *
   * @param {Event} e - Form submit event
   */
  const startPreCheck = async (e) => {
    e.preventDefault();
 
    console.log("[PRE-CHECK] ===== PRE-CHECK VALIDATION INITIATED =====");
    console.log("[PRE-CHECK] Parameters:", {
      hostname: upgradeParams.hostname,
      image: upgradeParams.image_filename,
      version: upgradeParams.target_version
    });
 
    // ========================================================================
    // VALIDATION: Check required parameters
    // ========================================================================
 
    if (!upgradeParams.hostname && !upgradeParams.inventory_file) {
      console.error("[PRE-CHECK] Validation failed: No target specified");
      setJobOutput(prev => [...prev, {
        timestamp: new Date().toISOString(),
        message: "Error: Must specify either hostname or inventory file",
        level: 'error'
      }]);
      return;
    }
 
    if (!upgradeParams.image_filename) {
      console.error("[PRE-CHECK] Validation failed: No image selected");
      setJobOutput(prev => [...prev, {
        timestamp: new Date().toISOString(),
        message: "Error: Must select an image file",
        level: 'error'
      }]);
      return;
    }
 
    if (!upgradeParams.target_version) {
      console.error("[PRE-CHECK] Validation failed: No target version");
      setJobOutput(prev => [...prev, {
        timestamp: new Date().toISOString(),
        message: "Error: Target version is required (should be auto-extracted from image)",
        level: 'error'
      }]);
      return;
    }
 
    if (!isConnected) {
      console.error("[PRE-CHECK] WebSocket not connected");
      setJobOutput(prev => [...prev, {
        timestamp: new Date().toISOString(),
        message: "WebSocket not connected. Cannot start pre-check.",
        level: 'error'
      }]);
      return;
    }
 
    // ========================================================================
    // CLEANUP: Unsubscribe from previous WebSocket channel if exists
    // ========================================================================
 
    if (wsChannel) {
      console.log(`[PRE-CHECK] Unsubscribing from previous channel: ${wsChannel}`);
      sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
    }
 
    // ========================================================================
    // UI PREPARATION: Set up state for pre-check execution
    // ========================================================================
 
    setActiveTab("execute");
    setCurrentPhase("pre_check");
    setIsRunningPreCheck(true);
    setJobStatus("running");
    setProgress(0);
    setJobOutput([]);
    setPreCheckResults(null);
    setPreCheckSummary(null);
    setCanProceedWithUpgrade(false);
    processedStepsRef.current.clear();
    loggedMessagesRef.current.clear();
 
    // ========================================================================
    // PAYLOAD CONSTRUCTION: Build request payload for FastAPI
    // ========================================================================
 
    const payload = {
      hostname: upgradeParams.hostname.trim(),
      inventory_file: upgradeParams.inventory_file.trim(),
      username: upgradeParams.username,
      password: upgradeParams.password,
      vendor: upgradeParams.vendor,
      platform: upgradeParams.platform,
      target_version: upgradeParams.target_version,  // Precise version from image filename
      image_filename: upgradeParams.image_filename,
      skip_storage_check: false,
      skip_snapshot_check: false,
      require_snapshot: false,
    };
 
    console.log("[PRE-CHECK] Submitting payload:", {
      ...payload,
      password: '***REDACTED***'  // Don't log passwords
    });
 
    // ========================================================================
    // API CALL: Submit pre-check job to FastAPI
    // ========================================================================
 
    try {
      const response = await fetch(`${API_URL}/api/operations/pre-check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',  // Include cookies for session-based auth
        body: JSON.stringify(payload),
      });
 
      // Handle HTTP errors
      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage;
 
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.detail || errorJson.message || errorText;
        } catch {
          errorMessage = errorText;
        }
 
        throw new Error(`API error ${response.status}: ${errorMessage}`);
      }
 
      // Parse successful response
      const data = await response.json();
 
      console.log("[PRE-CHECK] Job queued successfully:", {
        job_id: data.job_id,
        ws_channel: data.ws_channel,
        phase: data.phase
      });
 
      // ======================================================================
      // STATE UPDATE: Store job information
      // ======================================================================
 
      setPreCheckJobId(data.job_id);
      setJobId(data.job_id);
      setWsChannel(data.ws_channel);
 
      // ======================================================================
      // WEBSOCKET: Subscribe to job progress channel
      // ======================================================================
 
      console.log(`[WEBSOCKET] Subscribing to channel: ${data.ws_channel}`);
      sendMessage({ type: 'SUBSCRIBE', channel: data.ws_channel });
 
      // Add initial log entry
      setJobOutput(prev => [...prev, {
        timestamp: new Date().toISOString(),
        message: `Pre-check validation started. Job ID: ${data.job_id}`,
        level: 'info'
      }]);
 
    } catch (error) {
      console.error("[PRE-CHECK] API Call Failed:", error);
 
      setJobOutput(prev => [...prev, {
        timestamp: new Date().toISOString(),
        message: `Pre-check start failed: ${error.message}`,
        level: 'error'
      }]);
 
      setJobStatus("failed");
      setIsRunningPreCheck(false);
    }
  };
 
  // ==========================================================================
  // UPGRADE EXECUTION HANDLER
  // ==========================================================================
 
  /**
   * Initiate upgrade execution workflow
   *
   * This function:
   *   1. Validates WebSocket connection
   *   2. Prepares the UI for execution
   *   3. Submits upgrade job to FastAPI
   *   4. Receives job_id and ws_channel
   *   5. Subscribes to WebSocket for progress updates
   *
   * NOTE: Should only be called after successful pre-check review
   */
  const startUpgradeExecution = async () => {
    console.log("[UPGRADE] ===== UPGRADE EXECUTION INITIATED =====");
    console.log("[UPGRADE] Pre-check job ID:", preCheckJobId);
 
    // ========================================================================
    // VALIDATION: Ensure WebSocket is connected
    // ========================================================================
 
    if (!isConnected) {
      console.error("[UPGRADE] WebSocket not connected");
      setJobOutput(prev => [...prev, {
        timestamp: new Date().toISOString(),
        message: "WebSocket not connected. Cannot start upgrade.",
        level: 'error'
      }]);
      return;
    }
 
    // ========================================================================
    // CLEANUP: Unsubscribe from previous WebSocket channel
    // ========================================================================
 
    if (wsChannel) {
      console.log(`[UPGRADE] Unsubscribing from previous channel: ${wsChannel}`);
      sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
    }
 
    // ========================================================================
    // UI PREPARATION: Set up state for upgrade execution
    // ========================================================================
 
    setActiveTab("execute");
    setCurrentPhase("upgrade");
    setJobStatus("running");
    setProgress(0);
    setJobOutput([]);
    setFinalResults(null);
    setCompletedSteps(0);
    setTotalSteps(0);
    processedStepsRef.current.clear();
    loggedMessagesRef.current.clear();
 
    // ========================================================================
    // PAYLOAD CONSTRUCTION: Build request payload for FastAPI
    // ========================================================================
 
    const payload = {
      command: "code_upgrade",
      hostname: upgradeParams.hostname.trim(),
      inventory_file: upgradeParams.inventory_file.trim(),
      username: upgradeParams.username,
      password: upgradeParams.password,
      vendor: upgradeParams.vendor,
      platform: upgradeParams.platform,
      target_version: upgradeParams.target_version,  // Precise version from image filename
      image_filename: upgradeParams.image_filename,
      pre_check_job_id: preCheckJobId,  // Reference to pre-check job
      skip_pre_check: false,
      force_upgrade: false,
    };
 
    console.log("[UPGRADE] Submitting payload:", {
      ...payload,
      password: '***REDACTED***'  // Don't log passwords
    });
 
    // ========================================================================
    // API CALL: Submit upgrade job to FastAPI
    // ========================================================================
 
    try {
      const response = await fetch(`${API_URL}/api/operations/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',  // Include cookies for session-based auth
        body: JSON.stringify(payload),
      });
 
      // Handle HTTP errors
      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage;
 
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.detail || errorJson.message || errorText;
        } catch {
          errorMessage = errorText;
        }
 
        throw new Error(`API error ${response.status}: ${errorMessage}`);
      }
 
      // Parse successful response
      const data = await response.json();
 
      console.log("[UPGRADE] Job queued successfully:", {
        job_id: data.job_id,
        ws_channel: data.ws_channel,
        phase: data.phase
      });
 
      // ======================================================================
      // STATE UPDATE: Store job information
      // ======================================================================
 
      setJobId(data.job_id);
      setWsChannel(data.ws_channel);
 
      // ======================================================================
      // WEBSOCKET: Subscribe to job progress channel
      // ======================================================================
 
      console.log(`[WEBSOCKET] Subscribing to channel: ${data.ws_channel}`);
      sendMessage({ type: 'SUBSCRIBE', channel: data.ws_channel });
 
      // Add initial log entry
      setJobOutput(prev => [...prev, {
        timestamp: new Date().toISOString(),
        message: `Upgrade job started successfully. Job ID: ${data.job_id}`,
        level: 'info'
      }]);
 
    } catch (error) {
      console.error("[UPGRADE] API Call Failed:", error);
 
      setJobOutput(prev => [...prev, {
        timestamp: new Date().toISOString(),
        message: `Upgrade start failed: ${error.message}`,
        level: 'error'
      }]);
 
      setJobStatus("failed");
      setActiveTab("results");
    }
  };
 
  // ==========================================================================
  // WEBSOCKET MESSAGE HANDLER (FULLY FIXED VERSION)
  // ==========================================================================
 
  /**
   * Process incoming WebSocket messages
   *
   * 🔧 CRITICAL FIXES IN THIS VERSION:
   * - Removed complex transitionToReviewTab callback
   * - Uses existing preCheckSummary state from PRE_CHECK_COMPLETE
   * - Simple setTimeout-based tab transition on OPERATION_COMPLETE
   * - Comprehensive debug logging for troubleshooting
   *
   * This effect handles all real-time progress updates from the job orchestrator:
   *   - Parses nested JSON messages
   *   - Deduplicates log entries
   *   - Updates progress tracking
   *   - Processes pre-check results
   *   - Detects job completion
   *   - Auto-scrolls log viewer
   *   - Triggers tab transitions
   *
   * Message flow:
   *   Job Orchestrator → WebSocket → lastMessage → This handler → State updates
   */
  useEffect(() => {
    // Skip if no message or no active job
    if (!lastMessage || !jobId) return;
 
    const raw = lastMessage;
 
    // Only process JSON messages
    if (typeof raw !== 'string' || (!raw.startsWith('{') && !raw.startsWith('['))) {
      return;
    }
 
    // ========================================================================
    // PARSE: Convert string to JSON object
    // ========================================================================
 
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      console.debug("[WEBSOCKET] Failed to parse message:", error);
      return;
    }
 
    // ========================================================================
    // FILTER: Ensure message is for our current job
    // ========================================================================
 
    if (parsed.channel && wsChannel && !parsed.channel.includes(wsChannel)) {
      console.debug("[WEBSOCKET] Ignoring message for different channel:", parsed.channel);
      return;
    }
 
    // ========================================================================
    // EXTRACT NESTED DATA: Handle orchestrator message nesting
    // ========================================================================
 
    /**
     * Extract deeply nested progress data from orchestrator messages
     *
     * Message nesting structure:
     *   1. Top level: WebSocket envelope
     *   2. data field: Orchestrator message
     *   3. message field: STDOUT/STDERR from run.py
     *   4. JSON within message: Actual progress data
     *
     * @param {Object} initialParsed - Initial parsed message
     * @returns {Object} { payload, isNested }
     */
    const extractNestedProgressData = (initialParsed) => {
      let currentPayload = initialParsed;
      let deepestNestedData = null;
 
      // Check for data field (orchestrator envelope)
      if (initialParsed.data) {
        try {
          const dataPayload = typeof initialParsed.data === 'string'
            ? JSON.parse(initialParsed.data)
            : initialParsed.data;
 
          currentPayload = dataPayload;
 
          // Check for orchestrator log with nested JSON
          if (dataPayload.event_type === "ORCHESTRATOR_LOG" && dataPayload.message) {
            const message = dataPayload.message;
            // Match [STDOUT] or [STDERR] followed by JSON
            const jsonMatch = message.match(/\[(STDOUT|STDERR)(?:_RAW)?\]\s*(\{.*\})/s);
 
            if (jsonMatch && jsonMatch[2]) {
              try {
                deepestNestedData = JSON.parse(jsonMatch[2]);
              } catch (parseError) {
                console.debug('[WEBSOCKET] Failed to parse nested JSON:', parseError);
              }
            }
          }
        } catch (error) {
          console.debug('[WEBSOCKET] Data field is not valid JSON:', error);
        }
      }
 
      return {
        payload: deepestNestedData || currentPayload,
        isNested: !!deepestNestedData
      };
    };
 
    const { payload: finalPayload } = extractNestedProgressData(parsed);
 
    // ========================================================================
    // DEDUPLICATION: Create message signature to prevent duplicate logs
    // ========================================================================
 
    /**
     * Create unique signature for log deduplication
     * Uses event type + message substring for matching
     *
     * @param {Object} payload - Message payload
     * @returns {string} Unique signature
     */
    const createLogSignature = (payload) => {
      const msg = payload.message || '';
      const eventType = payload.event_type || 'unknown';
      return `${eventType}::${msg.substring(0, 100)}`;
    };
 
    const logSignature = createLogSignature(finalPayload);
 
    // ========================================================================
    // LOG ENTRY: Add to job output if not already logged
    // ========================================================================
 
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
 
      // Update latest step message (exclude completion events)
      if (logEntry.message && finalPayload.event_type !== "OPERATION_COMPLETE") {
        latestStepMessageRef.current = logEntry.message;
      }
 
      // Auto-scroll to bottom of log viewer
      if (scrollAreaRef.current) {
        setTimeout(() => {
          if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
          }
        }, TIMING.AUTO_SCROLL_DELAY);
      }
    }
 
    // ========================================================================
    // PRE-CHECK RESULT PROCESSING
    // ========================================================================
 
    if (finalPayload.event_type === "PRE_CHECK_RESULT") {
      console.log("[PRE-CHECK] Individual result received:", finalPayload);
      setPreCheckResults(prev => {
        const updated = prev ? [...prev] : [];
        updated.push(finalPayload);
        return updated;
      });
    }
 
    // ========================================================================
    // PRE-CHECK COMPLETION (Sets state - enables Review tab)
    // ========================================================================
    /**
     * This event arrives BEFORE OPERATION_COMPLETE
     * It contains the detailed pre-check summary that enables the Review tab
     * We store the summary here and wait for OPERATION_COMPLETE to trigger transition
     */
    if (finalPayload.event_type === "PRE_CHECK_COMPLETE") {
      console.log("[PRE-CHECK] Complete event received", finalPayload);
 
      if (finalPayload.data && finalPayload.data.summary) {
        const summary = finalPayload.data.summary;
 
        console.log("[PRE-CHECK] Summary received:", {
          total_checks: summary.total_checks,
          passed: summary.passed,
          warnings: summary.warnings,
          critical_failures: summary.critical_failures,
          can_proceed: summary.can_proceed
        });
 
        // ⭐ CRITICAL: Set the summary state - this enables the Review tab
        setPreCheckSummary(summary);
        setCanProceedWithUpgrade(summary.can_proceed);
 
        console.log("[PRE-CHECK] State updated - Review tab is now enabled");
        console.log("[PRE-CHECK] Waiting for OPERATION_COMPLETE to trigger transition");
      }
    }
 
    // ========================================================================
    // PROGRESS TRACKING
    // ========================================================================
 
    // Operation start - Initialize total steps
    if (finalPayload.event_type === "OPERATION_START" && typeof finalPayload.data?.total_steps === "number") {
      console.log("[PROGRESS] Operation started with", finalPayload.data.total_steps, "steps");
      setTotalSteps(finalPayload.data.total_steps);
      setProgress(5); // Show initial progress
    }
 
    // Step completion - Update progress
    if (finalPayload.event_type === "STEP_COMPLETE" && typeof finalPayload.data?.step === "number") {
      const stepNum = finalPayload.data.step;
 
      // Prevent duplicate step processing
      if (!processedStepsRef.current.has(stepNum)) {
        processedStepsRef.current.add(stepNum);
 
        console.log(`[PROGRESS] Step ${stepNum} completed`);
 
        setCompletedSteps(prevCompleted => {
          const newCompleted = prevCompleted + 1;
          let newProgress = progress;
 
          // Calculate progress percentage
          if (totalSteps > 0) {
            newProgress = Math.min(99, Math.round((newCompleted / totalSteps) * 100));
          } else {
            // Fallback if total steps unknown
            newProgress = Math.min(99, progress + 25);
          }
 
          console.log(`[PROGRESS] ${newCompleted}/${totalSteps} steps (${newProgress}%)`);
          setProgress(newProgress);
          return newCompleted;
        });
      }
    }
 
    // ========================================================================
    // ⭐⭐⭐ OPERATION_COMPLETE - SIMPLIFIED TAB TRANSITION ⭐⭐⭐
    // ========================================================================
    /**
     * This is the FINAL event that triggers job completion
     *
     * TIMING FLOW:
     * 1. PRE_CHECK_COMPLETE arrives → Sets preCheckSummary state
     * 2. Backend waits 0.15s → Flushes stderr
     * 3. OPERATION_COMPLETE arrives → Triggers this handler
     * 4. We wait 1.5s (TIMING.TAB_TRANSITION_DELAY) → For React to process state
     * 5. setActiveTab("review") executes → Tab transition succeeds because state is set
     *
     * KEY INSIGHT:
     * We don't need to extract summary from this payload because it's already
     * in state from PRE_CHECK_COMPLETE. We just trigger the transition.
     */
    if (finalPayload.event_type === "OPERATION_COMPLETE") {
      const finalStatus = finalPayload.data?.status; // SUCCESS or FAILED
      const operationType = finalPayload.data?.operation || currentPhase;
 
      console.log("[OPERATION] ⭐ Completion detected:", {
        status: finalStatus,
        operation: operationType,
        phase: currentPhase,
        can_proceed: finalPayload.data?.can_proceed,
        summary_in_payload: finalPayload.data?.summary ? true : false
      });
 
      // ======================================================================
      // PRE-CHECK PHASE COMPLETION (FULLY FIXED)
      // ======================================================================
      if (currentPhase === "pre_check" || operationType === "pre_check") {
        console.log("[PRE-CHECK] Operation complete - finalizing pre-check phase");
 
        // Determine final success status
        let finalSuccess = false;
 
        if (finalPayload.data?.can_proceed === true) {
          finalSuccess = true;
        } else if (finalStatus === "SUCCESS") {
          finalSuccess = true;
        } else if (finalPayload.data?.final_results?.success === true) {
          finalSuccess = true;
        }
 
        console.log("[PRE-CHECK] Final Status:", finalSuccess ? "SUCCESS" : "FAILED");
 
        // Update job completion state
        setJobStatus(finalSuccess ? "success" : "failed");
        setIsRunningPreCheck(false);
        setProgress(100);
 
        if (totalSteps > 0) {
          setCompletedSteps(totalSteps);
        }
 
        // Unsubscribe from WebSocket
        if (wsChannel) {
          console.log(`[WEBSOCKET] Pre-check complete, unsubscribing from ${wsChannel}`);
          sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
        }
 
        // ⭐⭐⭐ CRITICAL FIX: Simplified tab transition ⭐⭐⭐
        // Verify state before transition
        console.log("[DEBUG] Pre-transition state verification:");
        console.log("  - preCheckSummary exists:", preCheckSummary !== null);
        console.log("  - preCheckSummary.can_proceed:", preCheckSummary?.can_proceed);
        console.log("  - canProceedWithUpgrade:", canProceedWithUpgrade);
        console.log("  - activeTab:", activeTab);
        console.log("  - currentPhase:", currentPhase);
 
        // Schedule tab transition
        console.log(`[TAB TRANSITION] Scheduling transition in ${TIMING.TAB_TRANSITION_DELAY}ms`);
 
        setTimeout(() => {
          console.log("[TAB TRANSITION] ⏰ Timer fired - executing transition NOW");
          console.log("[TAB TRANSITION] Current activeTab before change:", activeTab);
          console.log("[TAB TRANSITION] preCheckSummary at transition time:", preCheckSummary !== null);
 
          // Execute the transition
          setActiveTab("review");
          setCurrentPhase("review");
 
          console.log("[TAB TRANSITION] ✅ setActiveTab('review') called");
          console.log("[TAB TRANSITION] ✅ setCurrentPhase('review') called");
          console.log("[TAB TRANSITION] ✅ Tab transition complete");
        }, TIMING.TAB_TRANSITION_DELAY);
      }
 
      // ======================================================================
      // UPGRADE PHASE COMPLETION
      // ======================================================================
      else if (currentPhase === "upgrade" || operationType === "upgrade") {
        console.log("[UPGRADE] Operation complete - finalizing upgrade phase");
 
        // Determine success status from various indicators
        let finalSuccess = false;
 
        if (finalPayload.success === true || finalPayload.data?.final_results?.success === true) {
          finalSuccess = true;
        } else if (finalPayload.data?.status === "SUCCESS") {
          finalSuccess = true;
        } else if (finalPayload.message && (
          finalPayload.message.includes('success: True') ||
          finalPayload.message.includes('completed successfully')
        )) {
          finalSuccess = true;
        }
 
        console.log("[UPGRADE] Final Status:", finalSuccess ? "SUCCESS" : "FAILED");
 
        // Update state
        setJobStatus(finalSuccess ? "success" : "failed");
        setFinalResults(finalPayload);
        setProgress(100);
 
        if (totalSteps > 0) {
          setCompletedSteps(totalSteps);
        }
 
        // Unsubscribe from WebSocket
        if (wsChannel) {
          console.log(`[WEBSOCKET] Upgrade complete, unsubscribing from ${wsChannel}`);
          sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
        }
 
        // Auto-transition to results tab
        console.log("[UPGRADE] Transitioning to results tab in", TIMING.TAB_TRANSITION_DELAY, "ms");
        setTimeout(() => {
          setActiveTab("results");
          setCurrentPhase("results");
          console.log("[UPGRADE] Tab transition complete - now on results tab");
        }, TIMING.TAB_TRANSITION_DELAY);
      }
    }
 
    // ========================================================================
    // LEGACY COMPLETION DETECTION (Keep for backward compatibility)
    // ========================================================================
    /**
     * This handles old-style completion messages that might still be sent
     * by other parts of the system. We keep this for robustness but the
     * primary completion detection is now via OPERATION_COMPLETE above.
     */
    const isLegacyCompletionEvent =
      finalPayload.success !== undefined &&
      currentPhase === "upgrade" &&
      finalPayload.event_type !== "OPERATION_COMPLETE";
 
    if (isLegacyCompletionEvent) {
      console.log("[UPGRADE] Legacy completion detected (success field present)");
 
      const finalSuccess = finalPayload.success === true;
 
      console.log("[UPGRADE] Legacy Final Status:", finalSuccess ? "SUCCESS" : "FAILED");
 
      setJobStatus(finalSuccess ? "success" : "failed");
      setFinalResults(prev => prev || finalPayload);
      setProgress(100);
 
      if (totalSteps > 0) {
        setCompletedSteps(totalSteps);
      }
 
      if (wsChannel) {
        console.log(`[WEBSOCKET] Unsubscribing from ${wsChannel} (legacy completion)`);
        sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
      }
 
      setTimeout(() => {
        setActiveTab("results");
        setCurrentPhase("results");
      }, TIMING.TAB_TRANSITION_DELAY);
    }
 
  }, [lastMessage, jobId, wsChannel, sendMessage, totalSteps, progress, completedSteps, currentPhase, activeTab, preCheckSummary, canProceedWithUpgrade]);
 
  // ==========================================================================
  // DERIVED STATE (COMPUTED VALUES)
  // ==========================================================================
 
  /**
   * Job execution states derived from jobStatus
   */
  const isRunning = jobStatus === 'running';
  const isComplete = jobStatus === 'success';
  const hasError = jobStatus === 'failed';
 
  /**
   * Form validation - Check if all required fields are populated
   */
  const isFormValid = useMemo(() => {
    return (
      upgradeParams.username.trim() &&
      upgradeParams.password.trim() &&
      (upgradeParams.hostname.trim() || upgradeParams.inventory_file.trim()) &&
      upgradeParams.image_filename.trim() &&
      upgradeParams.target_version.trim()  // Must have version (auto-extracted)
    );
  }, [upgradeParams]);
 
  // ==========================================================================
  // RENDER - CONTINUES IN PART 2
  // ==========================================================================
    // ==========================================================================
  // RENDER (CONTINUED FROM PART 1)
  // ==========================================================================
 
  return (
    <div className="p-8 pt-6">
      {/* ====================================================================
          HEADER SECTION
          ==================================================================== */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Code Upgrade Operation</h1>
          <p className="text-muted-foreground">
            Upgrade device operating system with pre-flight validation
          </p>
        </div>
 
        {/* Reset button - Only show when not idle */}
        {jobStatus !== 'idle' && (
          <Button onClick={resetWorkflow} variant="outline" size="sm">
            Start New Upgrade
          </Button>
        )}
      </div>
 
      <Separator className="mb-8" />
 
      {/* ====================================================================
          TABS NAVIGATION
          ==================================================================== */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-6">
          <TabsTrigger value="config" disabled={isRunning}>
            Configure
          </TabsTrigger>
          <TabsTrigger value="execute" disabled={currentPhase === "config"}>
            {currentPhase === "pre_check" ? "Pre-Check" : "Execute"}
          </TabsTrigger>
          {/* ⭐ CRITICAL: Tab is enabled when preCheckSummary state is set */}
          <TabsTrigger value="review" disabled={!preCheckSummary}>
            Review
          </TabsTrigger>
          <TabsTrigger value="results" disabled={currentPhase !== "results"}>
            Results
          </TabsTrigger>
        </TabsList>
 
        {/* ==================================================================
            TAB 1: CONFIGURATION
            ================================================================== */}
        <TabsContent value="config">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 max-w-7xl">
            {/* Image Selection (Left Column) */}
            <div className="xl:col-span-1">
              <SelectImageRelease
                parameters={upgradeParams}
                onParamChange={handleParamChange}
              />
            </div>
 
            {/* Device Configuration (Right Column) */}
            <div className="xl:col-span-2 space-y-6">
              <CodeUpgradeForm
                parameters={upgradeParams}
                onParamChange={handleParamChange}
              />
 
              {/* Pre-Check Action Card */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex-1">
                      <h4 className="text-lg font-semibold mb-2 flex items-center gap-2">
                        <Shield className="h-5 w-5 text-blue-600" />
                        Ready for Pre-Check Validation
                      </h4>
                      <div className="space-y-1 text-sm text-gray-600">
                        {/* Show selected configuration */}
                        {upgradeParams.image_filename && (
                          <p className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span className="font-medium">Image: {upgradeParams.image_filename}</span>
                          </p>
                        )}
 
                        {upgradeParams.target_version && (
                          <p className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span>Target Version: <strong>{upgradeParams.target_version}</strong></span>
                          </p>
                        )}
 
                        {upgradeParams.hostname && (
                          <p className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span>Device: {upgradeParams.hostname}</span>
                          </p>
                        )}
 
                        {/* Show validation errors */}
                        {!isFormValid && (
                          <p className="text-orange-600 text-sm mt-2">
                            {!upgradeParams.image_filename && '• Select a software image\n'}
                            {!upgradeParams.target_version && '• Target version will be auto-extracted from image\n'}
                            {!upgradeParams.hostname && !upgradeParams.inventory_file && '• Configure device target\n'}
                            {(!upgradeParams.username || !upgradeParams.password) && '• Provide authentication credentials'}
                          </p>
                        )}
                      </div>
                    </div>
 
                    {/* Start Pre-Check Button */}
                    <Button
                      onClick={startPreCheck}
                      disabled={!isFormValid || isRunning || !isConnected}
                      size="lg"
                      className="w-full sm:w-auto"
                    >
                      {isRunning ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Running...
                        </>
                      ) : (
                        <>
                          <Shield className="h-4 w-4 mr-2" />
                          Start Pre-Check
                          <ArrowRight className="h-4 w-4 ml-2" />
                        </>
                      )}
                    </Button>
                  </div>
 
                  {/* WebSocket Connection Warning */}
                  {!isConnected && (
                    <Alert className="mt-4" variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>WebSocket Disconnected</AlertTitle>
                      <AlertDescription>
                        Real-time progress updates are unavailable. Please check your connection.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
 
        {/* ==================================================================
            TAB 2: EXECUTION
            ================================================================== */}
        <TabsContent value="execute">
          <div className="space-y-6 p-4 border rounded-lg max-w-6xl">
            <h2 className="text-xl font-semibold mb-4">
              {currentPhase === "pre_check" ? "Pre-Check Validation" : "Upgrade Progress"}
            </h2>
 
            {/* Progress Bar */}
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
 
            {/* Log Viewer */}
            <ScrollArea className="h-96 bg-background/50 p-4 rounded-md border">
              <div ref={scrollAreaRef} className="space-y-3">
                {jobOutput.length === 0 ? (
                  <p className="text-center text-muted-foreground pt-4">
                    {currentPhase === "pre_check"
                      ? "Waiting for pre-check to start..."
                      : "Waiting for upgrade to start..."}
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
 
            {/* 🐛 Debug Button - Remove after testing */}
            {jobStatus === 'success' && currentPhase === 'pre_check' && preCheckSummary && (
              <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800 mb-2">
                  🐛 Debug Mode: Pre-check complete, testing tab transition
                </p>
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      console.log("[MANUAL DEBUG] Forcing tab transition");
                      console.log("[MANUAL DEBUG] preCheckSummary:", preCheckSummary);
                      console.log("[MANUAL DEBUG] activeTab before:", activeTab);
                      setActiveTab("review");
                      setCurrentPhase("review");
                      console.log("[MANUAL DEBUG] Tab transition executed");
                    }}
                    variant="outline"
                    size="sm"
                  >
                    🐛 Manual Transition to Review
                  </Button>
                  <Button
                    onClick={() => {
                      console.log("[DEBUG] Current State:", {
                        activeTab,
                        currentPhase,
                        jobStatus,
                        preCheckSummary: preCheckSummary !== null,
                        canProceed: preCheckSummary?.can_proceed
                      });
                    }}
                    variant="outline"
                    size="sm"
                  >
                    🐛 Log Current State
                  </Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>
 
        {/* ==================================================================
            TAB 3: REVIEW (PRE-CHECK RESULTS)
            ================================================================== */}
        <TabsContent value="review">
          <div className="space-y-6 max-w-6xl">
            {preCheckSummary ? (
              <>
                {/* Pre-Check Summary Card */}
                <Card className={`border-2 ${preCheckSummary.can_proceed
                  ? 'border-green-200 bg-green-50'
                  : 'border-red-200 bg-red-50'
                  }`}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        {preCheckSummary.can_proceed ? (
                          <CheckCircle className="h-8 w-8 text-green-600" />
                        ) : (
                          <XCircle className="h-8 w-8 text-red-600" />
                        )}
 
                        <div>
                          <h2 className="text-2xl font-bold">
                            {preCheckSummary.can_proceed
                              ? 'Pre-Check Validation Passed'
                              : 'Pre-Check Validation Failed'}
                          </h2>
                          <p className="text-sm text-muted-foreground mt-1">
                            {preCheckSummary.can_proceed
                              ? 'Device is ready for upgrade. Review details below and proceed when ready.'
                              : 'Critical issues detected. Resolve problems before attempting upgrade.'}
                          </p>
                        </div>
                      </div>
                    </div>
 
                    {/* Statistics Grid */}
                    <div className="grid grid-cols-4 gap-4 mt-6">
                      <div className="text-center">
                        <div className="text-3xl font-bold text-blue-600">{preCheckSummary.total_checks}</div>
                        <div className="text-sm text-muted-foreground">Total Checks</div>
                      </div>
                      <div className="text-center">
                        <div className="text-3xl font-bold text-green-600">{preCheckSummary.passed}</div>
                        <div className="text-sm text-muted-foreground">Passed</div>
                      </div>
                      <div className="text-center">
                        <div className="text-3xl font-bold text-orange-600">{preCheckSummary.warnings}</div>
                        <div className="text-sm text-muted-foreground">Warnings</div>
                      </div>
                      <div className="text-center">
                        <div className="text-3xl font-bold text-red-600">{preCheckSummary.critical_failures}</div>
                        <div className="text-sm text-muted-foreground">Critical Failures</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
 
                {/* Detailed Results */}
                <Card>
                  <CardHeader>
                    <CardTitle>Detailed Pre-Check Results</CardTitle>
                    <CardDescription>
                      Review each validation check before proceeding with upgrade
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {preCheckSummary.results.map((result, index) => {
                      const IconComponent = PRE_CHECK_ICONS[result.check_name] || Info;
                      const severityColor =
                        result.severity === 'pass' ? 'text-green-600' :
                          result.severity === 'warning' ? 'text-orange-600' :
                            'text-red-600';
                      const bgColor =
                        result.severity === 'pass' ? 'bg-green-50 border-green-200' :
                          result.severity === 'warning' ? 'bg-orange-50 border-orange-200' :
                            'bg-red-50 border-red-200';
 
                      return (
                        <div key={index} className={`p-4 rounded-lg border ${bgColor}`}>
                          <div className="flex items-start gap-3">
                            <IconComponent className={`h-5 w-5 ${severityColor} mt-0.5`} />
 
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="font-semibold">{result.check_name}</h4>
                                <Badge variant={
                                  result.severity === 'pass' ? 'default' :
                                    result.severity === 'warning' ? 'secondary' :
                                      'destructive'
                                }>
                                  {result.severity.toUpperCase()}
                                </Badge>
                              </div>
 
                              <p className="text-sm text-gray-700 mb-2">{result.message}</p>
 
                              {result.details && (
                                <div className="text-xs text-gray-600 bg-white/50 p-2 rounded mt-2">
                                  <pre className="whitespace-pre-wrap">
                                    {JSON.stringify(result.details, null, 2)}
                                  </pre>
                                </div>
                              )}
 
                              {result.recommendation && (
                                <Alert className="mt-3">
                                  <Info className="h-4 w-4" />
                                  <AlertTitle>Recommendation</AlertTitle>
                                  <AlertDescription>{result.recommendation}</AlertDescription>
                                </Alert>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
 
                {/* Action Card */}
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="flex-1">
                        <h4 className="text-lg font-semibold mb-2">
                          {preCheckSummary.can_proceed ? 'Ready to Proceed' : 'Cannot Proceed'}
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          {preCheckSummary.can_proceed
                            ? 'All critical checks passed. You can proceed with the upgrade.'
                            : 'Critical failures detected. Resolve issues before upgrading.'}
                        </p>
                      </div>
 
                      <div className="flex gap-3 w-full sm:w-auto">
                        <Button
                          onClick={resetWorkflow}
                          variant="outline"
                          size="lg"
                        >
                          Cancel
                        </Button>
 
                        <Button
                          onClick={startUpgradeExecution}
                          disabled={!preCheckSummary.can_proceed || !isConnected}
                          size="lg"
                          className="flex-1 sm:flex-initial"
                        >
                          <PlayCircle className="h-4 w-4 mr-2" />
                          Proceed with Upgrade
                          <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                      </div>
                    </div>
 
                    {/* Critical Failures Warning */}
                    {!preCheckSummary.can_proceed && (
                      <Alert className="mt-4" variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Critical Issues Detected</AlertTitle>
                        <AlertDescription>
                          You must resolve the critical failures listed above before proceeding.
                          Review the recommendations for each failed check.
                        </AlertDescription>
                      </Alert>
                    )}
 
                    {/* Warnings Present Notice */}
                    {preCheckSummary.can_proceed && preCheckSummary.warnings > 0 && (
                      <Alert className="mt-4">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Warnings Present</AlertTitle>
                        <AlertDescription>
                          {preCheckSummary.warnings} warning{preCheckSummary.warnings > 1 ? 's' : ''} detected.
                          Review the warnings above and ensure you understand the implications before proceeding.
                        </AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              </>
            ) : (
              /* Loading State */
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-12">
                    <Loader2 className="h-12 w-12 animate-spin mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Loading pre-check results...</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
 
        {/* ==================================================================
            TAB 4: RESULTS (FINAL OUTCOME)
            ================================================================== */}
        <TabsContent value="results">
          <div className="space-y-6 max-w-6xl">
            {/* Completion Status Card */}
            <Card className={`border-2 ${jobStatus === 'success' ? 'border-green-200 bg-green-50' :
              jobStatus === 'failed' ? 'border-red-200 bg-red-50' :
                'border-gray-200'
              }`}>
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
 
            {/* Pre-Check Summary Reference */}
            {preCheckSummary && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-blue-600" />
                    Pre-Check Validation Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Total Checks:</span>
                      <p className="text-muted-foreground">{preCheckSummary.total_checks}</p>
                    </div>
                    <div>
                      <span className="font-medium">Passed:</span>
                      <p className="text-green-600 font-semibold">{preCheckSummary.passed}</p>
                    </div>
                    <div>
                      <span className="font-medium">Warnings:</span>
                      <p className="text-orange-600 font-semibold">{preCheckSummary.warnings}</p>
                    </div>
                    <div>
                      <span className="font-medium">Critical:</span>
                      <p className="text-red-600 font-semibold">{preCheckSummary.critical_failures}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
 
            {/* Configuration Details */}
            {upgradeParams.image_filename && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    Software Image Details
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
                      <span className="font-medium">Target Version:</span>
                      <p className="text-muted-foreground">{upgradeParams.target_version || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="font-medium">Image File:</span>
                      <p className="text-muted-foreground font-mono text-xs break-all">
                        {upgradeParams.image_filename}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
 
            {/* Execution Statistics */}
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
                    <span className="text-muted-foreground">Steps Completed:</span>
                    <span className="font-semibold">{completedSteps}/{totalSteps || 'Unknown'}</span>
                  </div>
                  {preCheckJobId && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Pre-Check ID:</span>
                      <span className="font-mono text-xs">{preCheckJobId}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
 
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Configuration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Target Device:</span>
                    <span className="font-medium truncate">
                      {upgradeParams.hostname || upgradeParams.inventory_file || 'N/A'}
                    </span>
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