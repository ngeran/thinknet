/**
 * =============================================================================
 * CODE UPGRADES COMPONENT - PRODUCTION READY v4.1.0 (FIXED)
 * =============================================================================
 *
 * @version 4.1.0
 * @last_updated 2025-10-30
 * @author nikos-geranios_vgi
 *
 * 🔧 CRITICAL FIXES IN THIS VERSION:
 * ✅ FIX 1: Added unified OPERATION_COMPLETE handler for all phases
 * ✅ FIX 2: Fixed pre-check completion detection to match backend contract
 * ✅ FIX 3: Proper tab transition logic for pre-check → review
 * ✅ FIX 4: Enhanced WebSocket message processing with better error handling
 * ✅ FIX 5: Aligned completion detection with Templates.jsx working pattern
 *
 * WHY THESE FIXES MATTER:
 * - The backend (run.py) sends OPERATION_COMPLETE as the final event
 * - Previous version only handled PRE_CHECK_COMPLETE, missing the finalization
 * - Without OPERATION_COMPLETE detection, WebSocket stays open indefinitely
 * - UI waits forever and never transitions to review tab
 * - These fixes ensure proper job lifecycle management
 *
 * ARCHITECTURE:
 * Frontend → FastAPI (code_upgrade.py) → Redis Queue → Job Orchestrator → run.py
 *                                                              ↓
 *                                                        WebSocket Updates
 *                                                              ↓
 *                                                     Frontend (this component)
 *
 * WORKFLOW:
 * 1. CONFIGURE - User selects device, image, credentials
 * 2. EXECUTE   - Pre-check runs with live progress updates
 * 3. REVIEW    - User reviews pre-check results and decides
 * 4. RESULTS   - Final upgrade outcome and statistics
 *
 * API ENDPOINTS:
 *   POST /api/operations/pre-check  - Queue pre-check validation job
 *   POST /api/operations/execute    - Queue upgrade execution job
 *   GET  /api/operations/health     - Service health check
 *
 * WEBSOCKET:
 *   ws://localhost:3100/ws - Real-time job progress updates
 *   Channel format: job:{job_id}
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
 
const API_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000';
 
const TIMING = {
  AUTO_SCROLL_DELAY: 50,
  TAB_TRANSITION_DELAY: 1000,
  PROGRESS_UPDATE_INTERVAL: 100
};
 
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
 
  const [upgradeParams, setUpgradeParams] = useState({
    username: "",
    password: "",
    hostname: "",
    inventory_file: "",
    vendor: "",
    platform: "",
    target_version: "",
    image_filename: ""
  });
 
  const [activeTab, setActiveTab] = useState("config");
  const [jobStatus, setJobStatus] = useState("idle");
  const [currentPhase, setCurrentPhase] = useState("config");
 
  const [progress, setProgress] = useState(0);
  const [jobOutput, setJobOutput] = useState([]);
  const [jobId, setJobId] = useState(null);
  const [wsChannel, setWsChannel] = useState(null);
  const [finalResults, setFinalResults] = useState(null);
 
  const [completedSteps, setCompletedSteps] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);
 
  const [preCheckJobId, setPreCheckJobId] = useState(null);
  const [preCheckResults, setPreCheckResults] = useState(null);
  const [preCheckSummary, setPreCheckSummary] = useState(null);
  const [isRunningPreCheck, setIsRunningPreCheck] = useState(false);
  const [canProceedWithUpgrade, setCanProceedWithUpgrade] = useState(false);
 
  const [statistics, setStatistics] = useState({
    total: 0,
    succeeded: 0,
    failed: 0
  });
 
  // ==========================================================================
  // REFS FOR PERFORMANCE AND STATE TRACKING
  // ==========================================================================
 
  const processedStepsRef = useRef(new Set());
  const latestStepMessageRef = useRef("");
  const loggedMessagesRef = useRef(new Set());
  const scrollAreaRef = useRef(null);
 
  // ==========================================================================
  // WEBSOCKET HOOK
  // ==========================================================================
 
  const { sendMessage, lastMessage, isConnected } = useJobWebSocket();
 
  // ==========================================================================
  // EVENT HANDLERS
  // ==========================================================================
 
  const handleParamChange = (name, value) => {
    setUpgradeParams(prev => ({ ...prev, [name]: value }));
 
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
 
  const resetWorkflow = () => {
    console.log("[WORKFLOW] Initiating complete reset");
 
    if (wsChannel) {
      console.log(`[WEBSOCKET] Unsubscribing from channel: ${wsChannel}`);
      sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
    }
 
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
 
    setPreCheckJobId(null);
    setPreCheckResults(null);
    setPreCheckSummary(null);
    setIsRunningPreCheck(false);
    setCanProceedWithUpgrade(false);
 
    processedStepsRef.current.clear();
    latestStepMessageRef.current = "";
    loggedMessagesRef.current.clear();
 
    console.log("[WORKFLOW] Reset complete - ready for new operation");
  };
 
  // ==========================================================================
  // PRE-CHECK HANDLER
  // ==========================================================================
 
  const startPreCheck = async (e) => {
    e.preventDefault();
 
    console.log("[PRE-CHECK] ===== PRE-CHECK VALIDATION INITIATED =====");
    console.log("[PRE-CHECK] Parameters:", {
      hostname: upgradeParams.hostname,
      image: upgradeParams.image_filename,
      version: upgradeParams.target_version
    });
 
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
 
    if (wsChannel) {
      console.log(`[PRE-CHECK] Unsubscribing from previous channel: ${wsChannel}`);
      sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
    }
 
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
 
    const payload = {
      hostname: upgradeParams.hostname.trim(),
      inventory_file: upgradeParams.inventory_file.trim(),
      username: upgradeParams.username,
      password: upgradeParams.password,
      vendor: upgradeParams.vendor,
      platform: upgradeParams.platform,
      target_version: upgradeParams.target_version,
      image_filename: upgradeParams.image_filename,
      skip_storage_check: false,
      skip_snapshot_check: false,
      require_snapshot: false,
    };
 
    console.log("[PRE-CHECK] Submitting payload:", {
      ...payload,
      password: '***REDACTED***'
    });
 
    try {
      const response = await fetch(`${API_URL}/api/operations/pre-check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
 
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
 
      const data = await response.json();
 
      console.log("[PRE-CHECK] Job queued successfully:", {
        job_id: data.job_id,
        ws_channel: data.ws_channel,
        phase: data.phase
      });
 
      setPreCheckJobId(data.job_id);
      setJobId(data.job_id);
      setWsChannel(data.ws_channel);
 
      console.log(`[WEBSOCKET] Subscribing to channel: ${data.ws_channel}`);
      sendMessage({ type: 'SUBSCRIBE', channel: data.ws_channel });
 
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
 
  const startUpgradeExecution = async () => {
    console.log("[UPGRADE] ===== UPGRADE EXECUTION INITIATED =====");
    console.log("[UPGRADE] Pre-check job ID:", preCheckJobId);
 
    if (!isConnected) {
      console.error("[UPGRADE] WebSocket not connected");
      setJobOutput(prev => [...prev, {
        timestamp: new Date().toISOString(),
        message: "WebSocket not connected. Cannot start upgrade.",
        level: 'error'
      }]);
      return;
    }
 
    if (wsChannel) {
      console.log(`[UPGRADE] Unsubscribing from previous channel: ${wsChannel}`);
      sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
    }
 
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
      pre_check_job_id: preCheckJobId,
      skip_pre_check: false,
      force_upgrade: false,
    };
 
    console.log("[UPGRADE] Submitting payload:", {
      ...payload,
      password: '***REDACTED***'
    });
 
    try {
      const response = await fetch(`${API_URL}/api/operations/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
 
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
 
      const data = await response.json();
 
      console.log("[UPGRADE] Job queued successfully:", {
        job_id: data.job_id,
        ws_channel: data.ws_channel,
        phase: data.phase
      });
 
      setJobId(data.job_id);
      setWsChannel(data.ws_channel);
 
      console.log(`[WEBSOCKET] Subscribing to channel: ${data.ws_channel}`);
      sendMessage({ type: 'SUBSCRIBE', channel: data.ws_channel });
 
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
  // WEBSOCKET MESSAGE HANDLER (FIXED VERSION) - PART 1
  // ==========================================================================
 
  useEffect(() => {
    if (!lastMessage || !jobId) return;
 
    const raw = lastMessage;
 
    if (typeof raw !== 'string' || (!raw.startsWith('{') && !raw.startsWith('['))) {
      return;
    }
 
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      console.debug("[WEBSOCKET] Failed to parse message:", error);
      return;
    }
 
    if (parsed.channel && wsChannel && !parsed.channel.includes(wsChannel)) {
      console.debug("[WEBSOCKET] Ignoring message for different channel:", parsed.channel);
      return;
    }
 
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
 
      if (logEntry.message && finalPayload.event_type !== "OPERATION_COMPLETE") {
        latestStepMessageRef.current = logEntry.message;
      }
 
      if (scrollAreaRef.current) {
        setTimeout(() => {
          if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
          }
        }, TIMING.AUTO_SCROLL_DELAY);
      }
    }
 
    if (finalPayload.event_type === "PRE_CHECK_RESULT") {
      console.log("[PRE-CHECK] Individual result received:", finalPayload);
      setPreCheckResults(prev => {
        const updated = prev ? [...prev] : [];
        updated.push(finalPayload);
        return updated;
      });
    }
 
    if (finalPayload.event_type === "PRE_CHECK_COMPLETE") {
      console.log("[PRE-CHECK] Complete event received", finalPayload);
 
      if (finalPayload.data && finalPayload.data.summary) {
        const summary = finalPayload.data.summary;
 
        console.log("[PRE-CHECK] Summary:", {
          total_checks: summary.total_checks,
          passed: summary.passed,
          warnings: summary.warnings,
          critical_failures: summary.critical_failures,
          can_proceed: summary.can_proceed
        });
 
        setPreCheckSummary(summary);
        setCanProceedWithUpgrade(summary.can_proceed);
      }
    }
 
    if (finalPayload.event_type === "OPERATION_START" && typeof finalPayload.data?.total_steps === "number") {
      console.log("[PROGRESS] Operation started with", finalPayload.data.total_steps, "steps");
      setTotalSteps(finalPayload.data.total_steps);
      setProgress(5);
    }
 
    if (finalPayload.event_type === "STEP_COMPLETE" && typeof finalPayload.data?.step === "number") {
      const stepNum = finalPayload.data.step;
 
      if (!processedStepsRef.current.has(stepNum)) {
        processedStepsRef.current.add(stepNum);
 
        console.log(`[PROGRESS] Step ${stepNum} completed`);
 
        setCompletedSteps(prevCompleted => {
          const newCompleted = prevCompleted + 1;
          let newProgress = progress;
 
          if (totalSteps > 0) {
            newProgress = Math.min(99, Math.round((newCompleted / totalSteps) * 100));
          } else {
            newProgress = Math.min(99, progress + 25);
          }
 
          console.log(`[PROGRESS] ${newCompleted}/${totalSteps} steps (${newProgress}%)`);
          setProgress(newProgress);
          return newCompleted;
        });
      }
    }
 
    // ⭐⭐⭐ CRITICAL FIX: UNIFIED OPERATION_COMPLETE HANDLER ⭐⭐⭐
    if (finalPayload.event_type === "OPERATION_COMPLETE") {
      const finalStatus = finalPayload.data?.status;
      const operationType = finalPayload.data?.operation || currentPhase;
 
      console.log("[OPERATION] Completion detected:", {
        status: finalStatus,
        operation: operationType,
        phase: currentPhase,
        can_proceed: finalPayload.data?.can_proceed,
        data: finalPayload.data
      });
 
      if (currentPhase === "pre_check" || operationType === "pre_check") {
        console.log("[PRE-CHECK] Operation complete - finalizing pre-check phase");
 
        let finalSuccess = false;
 
        if (finalPayload.data?.can_proceed === true) {
          finalSuccess = true;
        } else if (finalStatus === "SUCCESS") {
          finalSuccess = true;
        } else if (finalPayload.data?.final_results?.success === true) {
          finalSuccess = true;
        }
 
        console.log("[PRE-CHECK] Final Status:", finalSuccess ? "SUCCESS" : "FAILED");
 
        setJobStatus(finalSuccess ? "success" : "failed");
        setIsRunningPreCheck(false);
        setProgress(100);
 
        if (totalSteps > 0) {
          setCompletedSteps(totalSteps);
        }
 
        if (wsChannel) {
          console.log(`[WEBSOCKET] Pre-check complete, unsubscribing from ${wsChannel}`);
          sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
        }
 
        console.log("[PRE-CHECK] Transitioning to review tab in", TIMING.TAB_TRANSITION_DELAY, "ms");
        setTimeout(() => {
          setActiveTab("review");
          setCurrentPhase("review");
          console.log("[PRE-CHECK] Tab transition complete - now on review tab");
        }, TIMING.TAB_TRANSITION_DELAY);
 
      } else if (currentPhase === "upgrade" || operationType === "upgrade") {
        console.log("[UPGRADE] Operation complete - finalizing upgrade phase");
 
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
 
        setJobStatus(finalSuccess ? "success" : "failed");
        setFinalResults(finalPayload);
        setProgress(100);
 
        if (totalSteps > 0) {
          setCompletedSteps(totalSteps);
        }
 
        if (wsChannel) {
          console.log(`[WEBSOCKET] Upgrade complete, unsubscribing from ${wsChannel}`);
          sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
        }
 
        console.log("[UPGRADE] Transitioning to results tab in", TIMING.TAB_TRANSITION_DELAY, "ms");
        setTimeout(() => {
          setActiveTab("results");
          setCurrentPhase("results");
          console.log("[UPGRADE] Tab transition complete - now on results tab");
        }, TIMING.TAB_TRANSITION_DELAY);
      }
    }
 
    const isLegacyCompletionEvent =
      finalPayload.success !== undefined &&
      currentPhase === "upgrade" &&
      finalPayload.event_type !== "OPERATION_COMPLETE";
 
    if (isLegacyCompletionEvent) {
      console.log("[UPGRADE] Legacy completion detected");
 
      const finalSuccess = finalPayload.success === true;
 
      console.log("[UPGRADE] Legacy Final Status:", finalSuccess ? "SUCCESS" : "FAILED");
 
      setJobStatus(finalSuccess ? "success" : "failed");
      setFinalResults(prev => prev || finalPayload);
      setProgress(100);
 
      if (totalSteps > 0) {
        setCompletedSteps(totalSteps);
      }
 
      if (wsChannel) {
        console.log(`[WEBSOCKET] Unsubscribing from ${wsChannel}`);
        sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
      }
 
      setTimeout(() => {
        setActiveTab("results");
        setCurrentPhase("results");
      }, TIMING.TAB_TRANSITION_DELAY);
    }
 
  }, [lastMessage, jobId, wsChannel, sendMessage, totalSteps, progress, completedSteps, currentPhase]);
 
  // ==========================================================================
  // DERIVED STATE
  // ==========================================================================
 
  const isRunning = jobStatus === 'running';
  const isComplete = jobStatus === 'success';
  const hasError = jobStatus === 'failed';
 
  const isFormValid = useMemo(() => {
    return (
      upgradeParams.username.trim() &&
      upgradeParams.password.trim() &&
      (upgradeParams.hostname.trim() || upgradeParams.inventory_file.trim()) &&
      upgradeParams.image_filename.trim() &&
      upgradeParams.target_version.trim()
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
      {/* HEADER SECTION */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Code Upgrade Operation</h1>
          <p className="text-muted-foreground">
            Upgrade device operating system with pre-flight validation
          </p>
        </div>
 
        {jobStatus !== 'idle' && (
          <Button onClick={resetWorkflow} variant="outline" size="sm">
            Start New Upgrade
          </Button>
        )}
      </div>
 
      <Separator className="mb-8" />
 
      {/* TABS NAVIGATION */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-6">
          <TabsTrigger value="config" disabled={isRunning}>
            Configure
          </TabsTrigger>
          <TabsTrigger value="execute" disabled={currentPhase === "config"}>
            {currentPhase === "pre_check" ? "Pre-Check" : "Execute"}
          </TabsTrigger>
          <TabsTrigger value="review" disabled={!preCheckSummary}>
            Review
          </TabsTrigger>
          <TabsTrigger value="results" disabled={currentPhase !== "results"}>
            Results
          </TabsTrigger>
        </TabsList>
 
        {/* TAB 1: CONFIGURATION */}
        <TabsContent value="config">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 max-w-7xl">
            <div className="xl:col-span-1">
              <SelectImageRelease
                parameters={upgradeParams}
                onParamChange={handleParamChange}
              />
            </div>
 
            <div className="xl:col-span-2 space-y-6">
              <CodeUpgradeForm
                parameters={upgradeParams}
                onParamChange={handleParamChange}
              />
 
              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex-1">
                      <h4 className="text-lg font-semibold mb-2 flex items-center gap-2">
                        <Shield className="h-5 w-5 text-blue-600" />
                        Ready for Pre-Check Validation
                      </h4>
                      <div className="space-y-1 text-sm text-gray-600">
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
 
        {/* TAB 2: EXECUTION */}
        <TabsContent value="execute">
          <div className="space-y-6 p-4 border rounded-lg max-w-6xl">
            <h2 className="text-xl font-semibold mb-4">
              {currentPhase === "pre_check" ? "Pre-Check Validation" : "Upgrade Progress"}
            </h2>
 
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
          </div>
        </TabsContent>
 
        {/* TAB 3: REVIEW */}
        <TabsContent value="review">
          <div className="space-y-6 max-w-6xl">
            {preCheckSummary ? (
              <>
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
 
        {/* TAB 4: RESULTS */}
        <TabsContent value="results">
          <div className="space-y-6 max-w-6xl">
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

{master:0}
mist@ORIENGWANDJEX01> 