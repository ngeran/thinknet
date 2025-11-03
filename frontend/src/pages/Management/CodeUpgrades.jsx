/**
 * =============================================================================
 * CODE UPGRADES COMPONENT - PRODUCTION READY v4.5.2 (ENHANCED UI)
 * =============================================================================
 *
 * @version 4.5.2
 * @last_updated 2025-11-02
 * @author nikos-geranios_vgi
 *
 * 🔧 UPDATES IN THIS VERSION:
 * ✅ All fixes from v4.5.1 maintained
 * ✅ NEW: Clean step-by-step progress display (like Templates component)
 * ✅ NEW: Smart message filtering (hides ncclient debug noise)
 * ✅ NEW: Technical details toggle for developers
 * ✅ NEW: Completion summary statistics card
 * ✅ NEW: Professional message formatting
 *
 * 🎯 HOW IT WORKS NOW:
 * 1. PRE_CHECK_COMPLETE arrives → Sets preCheckSummary state → Enables Review tab
 * 2. OPERATION_COMPLETE arrives → Triggers automatic tab transition after delay
 * 3. User reviews results in enhanced categorized view
 * 4. Upgrade execution begins with proper progress tracking
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
  RefreshCw,
  Terminal
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
  TAB_TRANSITION_DELAY: 1500,
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
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

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
  // REFS
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
  // MESSAGE FORMATTING UTILITIES
  // ==========================================================================

  const formatStepMessage = (message, stepNumber = null) => {
    if (!message) return message;

    const hostnameMatch = message.match(/\[([^\]]+)\]/);
    let cleanMessage = message.replace(/\[[^\]]+\]\s*/, '');

    const checkPatterns = {
      '_check_image_availability': 'Image Availability Check',
      '_check_storage_space': 'Storage Space Verification',
      '_check_configuration_committed': 'Configuration State Check',
      '_check_system_alarms': 'System Alarms Check',
      'Current version:': 'Detected Current Version:',
      'PHASE: PRE_CHECK': 'Initiating Pre-Check Validation',
      'PHASE: UPGRADE': 'Starting Upgrade Process',
      'Pre-check validation started': 'Pre-Check Job Queued',
      'Upgrade job started': 'Upgrade Job Queued'
    };

    for (const [pattern, replacement] of Object.entries(checkPatterns)) {
      if (cleanMessage.includes(pattern)) {
        if (pattern.startsWith('_check_')) {
          const status = cleanMessage.includes('pass') ? '✅' :
            cleanMessage.includes('warning') ? '⚠️' :
              cleanMessage.includes('fail') ? '❌' : '';
          return stepNumber
            ? `Step ${stepNumber}: ${replacement} ${status}`
            : `${replacement} ${status}`;
        }
        cleanMessage = cleanMessage.replace(pattern, replacement);
        break;
      }
    }

    if (stepNumber && !cleanMessage.toLowerCase().startsWith('step')) {
      return `Step ${stepNumber}: ${cleanMessage}`;
    }

    return cleanMessage;
  };

  const shouldFilterMessage = (log) => {
    const message = log.message?.toLowerCase() || '';

    const noisePatterns = [
      'ncclient',
      'connected (version',
      'authentication',
      'session-id',
      '<?xml',
      'sending:',
      'received message',
      'requesting \'',
      'invoke name=',
      '<nc:rpc',
      '</nc:rpc>',
      'ssh.py',
      'transport.py',
      'rpc.py'
    ];

    return noisePatterns.some(pattern => message.includes(pattern));
  };

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
    setShowTechnicalDetails(false);

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
  // WEBSOCKET MESSAGE HANDLER
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

    console.log("[WEBSOCKET DEBUG] Received message:", {
      raw: lastMessage?.substring(0, 200) + (lastMessage?.length > 200 ? '...' : ''),
      parsed: parsed,
      event_type: parsed.event_type || parsed.type,
      has_data: !!parsed.data
    });

    const extractNestedProgressData = (initialParsed) => {
      let currentPayload = initialParsed;

      if (initialParsed.event_type === "ORCHESTRATOR_LOG" && initialParsed.message) {
        const message = initialParsed.message;

        const preCheckMatch = message.match(/PRE_CHECK_COMPLETE.*?(\{.*?\})/s);
        if (preCheckMatch && preCheckMatch[1]) {
          try {
            const preCheckData = JSON.parse(preCheckMatch[1]);
            console.log("[WEBSOCKET] 🎯 Extracted PRE_CHECK_COMPLETE from ORCHESTRATOR_LOG:", preCheckData);
            return { payload: preCheckData, isNested: true };
          } catch (parseError) {
            console.debug('[WEBSOCKET] Failed to parse PRE_CHECK_COMPLETE from ORCHESTRATOR_LOG:', parseError);
          }
        }

        const operationMatch = message.match(/OPERATION_COMPLETE.*?(\{.*?\})/s);
        if (operationMatch && operationMatch[1]) {
          try {
            const operationData = JSON.parse(operationMatch[1]);
            console.log("[WEBSOCKET] 🎯 Extracted OPERATION_COMPLETE from ORCHESTRATOR_LOG:", operationData);
            return { payload: operationData, isNested: true };
          } catch (parseError) {
            console.debug('[WEBSOCKET] Failed to parse OPERATION_COMPLETE from ORCHESTRATOR_LOG:', parseError);
          }
        }
      }

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
                const nestedData = JSON.parse(jsonMatch[2]);
                return { payload: nestedData, isNested: true };
              } catch (parseError) {
                console.debug('[WEBSOCKET] Failed to parse nested JSON:', parseError);
              }
            }
          }
        } catch (error) {
          console.debug('[WEBSOCKET] Data field is not valid JSON:', error);
        }
      }

      return { payload: currentPayload, isNested: false };
    };

    const { payload: finalPayload, isNested } = extractNestedProgressData(parsed);

    const createLogSignature = (payload) => {
      const msg = payload.message || '';
      const eventType = payload.event_type || 'unknown';
      return `${eventType}::${msg.substring(0, 100)}`;
    };

    const logSignature = createLogSignature(finalPayload);

    if (!loggedMessagesRef.current.has(logSignature) && !shouldFilterMessage(finalPayload)) {
      loggedMessagesRef.current.add(logSignature);

      const currentStepNumber = jobOutput.filter(log => !shouldFilterMessage(log)).length + 1;

      const logEntry = {
        timestamp: finalPayload.timestamp || new Date().toISOString(),
        message: formatStepMessage(
          finalPayload.message || (typeof finalPayload === 'string' ? finalPayload : "Processing..."),
          currentStepNumber
        ),
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

    if (finalPayload.event_type === "PRE_CHECK_COMPLETE" ||
      (finalPayload.type === "PRE_CHECK_COMPLETE" && finalPayload.data)) {

      console.log("[PRE-CHECK] 🎯 PRE_CHECK_COMPLETE event detected:", finalPayload);

      let summaryData = finalPayload.data;

      if (!summaryData && finalPayload.pre_check_summary) {
        summaryData = { pre_check_summary: finalPayload.pre_check_summary };
      }

      if (summaryData && summaryData.pre_check_summary) {
        const summary = summaryData.pre_check_summary;

        console.log("[PRE-CHECK] ✅ Summary extracted:", {
          total_checks: summary.total_checks,
          passed: summary.passed,
          warnings: summary.warnings,
          critical_failures: summary.critical_failures,
          can_proceed: summary.can_proceed
        });

        setPreCheckSummary(summary);
        setCanProceedWithUpgrade(summary.can_proceed);

        console.log("[PRE-CHECK] ✅ State updated - Review tab is now enabled");
      } else {
        console.warn("[PRE-CHECK] ❌ PRE_CHECK_COMPLETE received but no summary data found:", finalPayload);
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

    if (finalPayload.event_type === "OPERATION_COMPLETE" ||
      finalPayload.type === "OPERATION_COMPLETE") {

      const finalStatus = finalPayload.data?.status || finalPayload.success;
      const operationType = finalPayload.data?.operation || currentPhase;

      console.log("[OPERATION] ⭐ Completion detected:", {
        status: finalStatus,
        operation: operationType,
        phase: currentPhase,
        has_pre_check_summary: preCheckSummary !== null,
        activeTab: activeTab
      });

      if (currentPhase === "pre_check" || operationType === "pre_check") {
        console.log("[PRE-CHECK] Operation complete - finalizing pre-check phase");

        if (!preCheckSummary && finalPayload.data?.final_results?.data?.pre_check_summary) {
          console.log("[TAB TRANSITION] 🎯 Extracting summary from OPERATION_COMPLETE (nested structure)");
          const extractedSummary = finalPayload.data.final_results.data.pre_check_summary;
          setPreCheckSummary(extractedSummary);
          setCanProceedWithUpgrade(extractedSummary.can_proceed);
          console.log("[TAB TRANSITION] ✅ Summary extracted and set:", extractedSummary);
        } else if (!preCheckSummary && finalPayload.data?.pre_check_summary) {
          console.log("[TAB TRANSITION] 🎯 Extracting summary from OPERATION_COMPLETE (direct structure)");
          setPreCheckSummary(finalPayload.data.pre_check_summary);
          setCanProceedWithUpgrade(finalPayload.data.pre_check_summary.can_proceed);
        }

        let finalSuccess = false;
        if (finalStatus === "SUCCESS" || finalStatus === true) {
          finalSuccess = true;
        } else if (finalPayload.data?.final_results?.success === true) {
          finalSuccess = true;
        } else if (finalPayload.data?.final_results?.data?.success === true) {
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

        console.log(`[TAB TRANSITION] Scheduling transition to REVIEW tab in ${TIMING.TAB_TRANSITION_DELAY}ms`);

        setTimeout(() => {
          console.log("[TAB TRANSITION] ⏰ Timer fired - executing transition to REVIEW tab NOW");

          setActiveTab(prevTab => {
            console.log(`[TAB TRANSITION] Changing activeTab from "${prevTab}" to "review"`);
            return "review";
          });

          setCurrentPhase(prevPhase => {
            console.log(`[TAB TRANSITION] Changing currentPhase from "${prevPhase}" to "review"`);
            return "review";
          });

          console.log("[TAB TRANSITION] ✅ Tab transition to REVIEW commands executed");
        }, TIMING.TAB_TRANSITION_DELAY);
      }
      else if (currentPhase === "upgrade" || operationType === "upgrade") {
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
  // RENDER
  // ==========================================================================

  return (
    <div className="p-8 pt-6">
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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-6">
          <TabsTrigger value="config" disabled={isRunning}>
            Configure
          </TabsTrigger>
          <TabsTrigger value="execute" disabled={currentPhase === "config"}>
            {currentPhase === "pre_check" ? "Pre-Check" : "Execute"}
          </TabsTrigger>
          <TabsTrigger
            value="review"
            disabled={!preCheckSummary && activeTab !== "review"}
            className={preCheckSummary ? "bg-green-50 border-green-200" : ""}
          >
            Review {preCheckSummary && "✅"}
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

        {/* ==================================================================
            TAB 2: EXECUTION
            ================================================================== */}
        <TabsContent value="execute">
          <div className="space-y-6 max-w-6xl">
            <Card className="border-gray-200">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl flex items-center gap-2">
                      {isRunning && <Loader2 className="h-5 w-5 animate-spin text-blue-600" />}
                      {isComplete && <CheckCircle className="h-5 w-5 text-green-600" />}
                      {hasError && <XCircle className="h-5 w-5 text-red-600" />}
                      {currentPhase === "pre_check" ? "Pre-Check Validation" : "Upgrade Execution"}
                    </CardTitle>
                    <CardDescription>
                      {isRunning && "Processing validation checks..."}
                      {isComplete && "All checks completed successfully"}
                      {hasError && "Validation encountered errors"}
                    </CardDescription>
                  </div>
                  {totalSteps > 0 && (
                    <Badge variant="outline" className="text-sm px-3 py-1">
                      {completedSteps} / {totalSteps} Steps
                    </Badge>
                  )}
                </div>
              </CardHeader>
            </Card>

            <Card className="border-gray-200">
              <CardContent className="pt-6">
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
              </CardContent>
            </Card>

            <Card className="border-gray-200">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Validation Steps</CardTitle>
                    <CardDescription>Real-time progress of pre-check validation</CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
                    className="text-xs"
                  >
                    <Terminal className="w-3 h-3 mr-1" />
                    {showTechnicalDetails ? 'Hide' : 'Show'} Technical Details
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-96">
                  <div ref={scrollAreaRef} className="space-y-2 pr-4">
                    {jobOutput.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                          <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {currentPhase === "pre_check"
                            ? "Initializing pre-check validation..."
                            : "Initializing upgrade process..."}
                        </p>
                      </div>
                    ) : (
                      jobOutput
                        .filter(log => showTechnicalDetails || !shouldFilterMessage(log))
                        .map((log, index, filteredArray) => {
                          let stepStatus = 'COMPLETE';
                          const isLast = index === filteredArray.length - 1;

                          if (isRunning && isLast) {
                            stepStatus = 'IN_PROGRESS';
                          } else if (log.level === 'error' || log.message?.includes('failed')) {
                            stepStatus = 'FAILED';
                          }

                          return (
                            <div
                              key={`${log.timestamp}-${index}`}
                              className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                              {stepStatus === 'COMPLETE' && (
                                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                              )}
                              {stepStatus === 'IN_PROGRESS' && (
                                <Loader2 className="w-5 h-5 animate-spin text-blue-600 flex-shrink-0" />
                              )}
                              {stepStatus === 'FAILED' && (
                                <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                              )}

                              <div className="flex-1 min-w-0">
                                <div className={`text-sm ${stepStatus === 'COMPLETE' ? 'text-gray-700' :
                                    stepStatus === 'IN_PROGRESS' ? 'text-black font-medium' :
                                      'text-red-600 font-medium'
                                  }`}>
                                  {log.message}
                                </div>

                                {(stepStatus === 'COMPLETE' || showTechnicalDetails) && (
                                  <div className="text-xs text-gray-400 mt-0.5 font-mono">
                                    {new Date(log.timestamp).toLocaleTimeString()}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })
                    )}

                    {isRunning && jobOutput.length > 0 && (
                      <div className="flex items-center gap-3 p-3 text-sm text-gray-500">
                        <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" />
                        <span>Processing validation checks...</span>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {!isRunning && jobOutput.length > 0 && (
              <Card className={`border-2 ${isComplete ? 'border-green-200 bg-green-50' :
                  hasError ? 'border-red-200 bg-red-50' :
                    'border-gray-200'
                }`}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    {isComplete && (
                      <>
                        <CheckCircle className="h-5 w-5 text-green-600" />
                        Validation Complete
                      </>
                    )}
                    {hasError && (
                      <>
                        <XCircle className="h-5 w-5 text-red-600" />
                        Validation Failed
                      </>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {isComplete && "All pre-check validations completed successfully"}
                    {hasError && "Some validations failed - review results before proceeding"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-3 bg-white rounded-lg border">
                      <div className="text-2xl font-bold text-blue-600">{completedSteps}</div>
                      <div className="text-xs text-gray-500 mt-1">Steps Completed</div>
                    </div>
                    <div className="text-center p-3 bg-white rounded-lg border">
                      <div className="text-2xl font-bold text-green-600">{progress}%</div>
                      <div className="text-xs text-gray-500 mt-1">Progress</div>
                    </div>
                    <div className="text-center p-3 bg-white rounded-lg border">
                      <div className="text-2xl font-bold text-gray-600">
                        {jobOutput.filter(log => !shouldFilterMessage(log)).length}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">Validation Checks</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {jobStatus === 'success' && currentPhase === 'pre_check' && preCheckSummary && (
              <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800 mb-2">
                  🛠 Debug Mode: Pre-check complete, testing tab transition
                </p>
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      console.log("[MANUAL DEBUG] Forcing tab transition");
                      setActiveTab("review");
                      setCurrentPhase("review");
                    }}
                    variant="outline"
                    size="sm"
                  >
                    🛠 Manual Transition to Review
                  </Button>
                  <Button
                    onClick={() => {
                      console.log("[DEBUG] Current State:", {
                        activeTab,
                        currentPhase,
                        jobStatus,
                        preCheckSummary: preCheckSummary !== null
                      });
                    }}
                    variant="outline"
                    size="sm"
                  >
                    🛠 Log Current State
                  </Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ==================================================================
            TAB 3: REVIEW
            ================================================================== */}
        <TabsContent value="review">
          <div className="space-y-6 max-w-7xl">
            {preCheckSummary ? (
              <>
                <div className={`relative overflow-hidden rounded-xl border-2 p-8 ${preCheckSummary.can_proceed
                  ? 'border-green-300 bg-gradient-to-br from-green-50 to-emerald-50'
                  : 'border-red-300 bg-gradient-to-br from-red-50 to-orange-50'
                  }`}>
                  <div className="relative z-10">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        {preCheckSummary.can_proceed ? (
                          <div className="p-3 bg-green-100 rounded-full">
                            <CheckCircle className="h-10 w-10 text-green-600" />
                          </div>
                        ) : (
                          <div className="p-3 bg-red-100 rounded-full">
                            <XCircle className="h-10 w-10 text-red-600" />
                          </div>
                        )}

                        <div>
                          <h2 className="text-3xl font-bold mb-2">
                            {preCheckSummary.can_proceed
                              ? 'Ready for Upgrade ✓'
                              : 'Cannot Proceed'}
                          </h2>
                          <p className="text-lg text-gray-700 max-w-2xl">
                            {preCheckSummary.can_proceed
                              ? 'All critical validations passed successfully. The device meets requirements for upgrade.'
                              : 'Critical issues must be resolved before upgrade can proceed safely.'}
                          </p>
                        </div>
                      </div>

                      <div className="hidden lg:flex flex-col items-center">
                        <div className="relative w-32 h-32">
                          <svg className="w-32 h-32 transform -rotate-90">
                            <circle
                              cx="64"
                              cy="64"
                              r="56"
                              stroke="currentColor"
                              strokeWidth="8"
                              fill="none"
                              className="text-gray-200"
                            />
                            <circle
                              cx="64"
                              cy="64"
                              r="56"
                              stroke="currentColor"
                              strokeWidth="8"
                              fill="none"
                              strokeDasharray={`${(preCheckSummary.passed / preCheckSummary.total_checks) * 351.86} 351.86`}
                              className={preCheckSummary.can_proceed ? "text-green-500" : "text-red-500"}
                              strokeLinecap="round"
                            />
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-3xl font-bold">
                              {Math.round((preCheckSummary.passed / preCheckSummary.total_checks) * 100)}%
                            </span>
                            <span className="text-xs text-gray-600">Success</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                      <div className="bg-white/60 backdrop-blur-sm rounded-lg p-4 border border-white/40">
                        <div className="flex items-center gap-2 mb-1">
                          <CheckCircle className="h-4 w-4 text-blue-600" />
                          <span className="text-sm font-medium text-gray-600">Total Checks</span>
                        </div>
                        <div className="text-2xl font-bold text-blue-600">{preCheckSummary.total_checks}</div>
                      </div>
                      <div className="bg-white/60 backdrop-blur-sm rounded-lg p-4 border border-white/40">
                        <div className="flex items-center gap-2 mb-1">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          <span className="text-sm font-medium text-gray-600">Passed</span>
                        </div>
                        <div className="text-2xl font-bold text-green-600">{preCheckSummary.passed}</div>
                      </div>
                      <div className="bg-white/60 backdrop-blur-sm rounded-lg p-4 border border-white/40">
                        <div className="flex items-center gap-2 mb-1">
                          <AlertTriangle className="h-4 w-4 text-orange-600" />
                          <span className="text-sm font-medium text-gray-600">Warnings</span>
                        </div>
                        <div className="text-2xl font-bold text-orange-600">{preCheckSummary.warnings}</div>
                      </div>
                      <div className="bg-white/60 backdrop-blur-sm rounded-lg p-4 border border-white/40">
                        <div className="flex items-center gap-2 mb-1">
                          <XCircle className="h-4 w-4 text-red-600" />
                          <span className="text-sm font-medium text-gray-600">Critical</span>
                        </div>
                        <div className="text-2xl font-bold text-red-600">{preCheckSummary.critical_failures}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {(() => {
                  const criticalChecks = preCheckSummary.results.filter(r => r.severity === 'critical');
                  const warningChecks = preCheckSummary.results.filter(r => r.severity === 'warning');
                  const passedChecks = preCheckSummary.results.filter(r => r.severity === 'pass');

                  return (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      <Card className={criticalChecks.length > 0 ? "border-red-200 bg-red-50/50" : "border-gray-200"}>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2 text-lg">
                            <XCircle className="h-5 w-5 text-red-600" />
                            Critical Issues
                            <Badge variant="destructive" className="ml-auto">{criticalChecks.length}</Badge>
                          </CardTitle>
                          <CardDescription>
                            {criticalChecks.length > 0
                              ? 'Must be resolved before upgrade'
                              : 'No critical issues detected'}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {criticalChecks.length > 0 ? criticalChecks.map((result, index) => {
                            const IconComponent = PRE_CHECK_ICONS[result.check_name] || XCircle;
                            return (
                              <div key={index} className="bg-white rounded-lg p-4 border border-red-200 shadow-sm">
                                <div className="flex items-start gap-3">
                                  <IconComponent className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <h4 className="font-semibold text-sm mb-1">{result.check_name}</h4>
                                    <p className="text-xs text-gray-700 mb-2">{result.message}</p>
                                    {result.recommendation && (
                                      <div className="bg-red-50 border-l-2 border-red-400 p-2 mt-2">
                                        <p className="text-xs text-red-800">
                                          <span className="font-semibold">Action: </span>
                                          {result.recommendation}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          }) : (
                            <div className="text-center py-8 text-gray-500">
                              <CheckCircle className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                              <p className="text-sm">All critical checks passed</p>
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      <Card className={warningChecks.length > 0 ? "border-orange-200 bg-orange-50/50" : "border-gray-200"}>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2 text-lg">
                            <AlertTriangle className="h-5 w-5 text-orange-600" />
                            Warnings
                            <Badge variant="secondary" className="ml-auto">{warningChecks.length}</Badge>
                          </CardTitle>
                          <CardDescription>
                            {warningChecks.length > 0
                              ? 'Review before proceeding'
                              : 'No warnings detected'}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {warningChecks.length > 0 ? warningChecks.map((result, index) => {
                            const IconComponent = PRE_CHECK_ICONS[result.check_name] || AlertTriangle;
                            return (
                              <div key={index} className="bg-white rounded-lg p-4 border border-orange-200 shadow-sm">
                                <div className="flex items-start gap-3">
                                  <IconComponent className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <h4 className="font-semibold text-sm mb-1">{result.check_name}</h4>
                                    <p className="text-xs text-gray-700 mb-2">{result.message}</p>
                                    {result.recommendation && (
                                      <div className="bg-orange-50 border-l-2 border-orange-400 p-2 mt-2">
                                        <p className="text-xs text-orange-800">
                                          <span className="font-semibold">Note: </span>
                                          {result.recommendation}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          }) : (
                            <div className="text-center py-8 text-gray-500">
                              <CheckCircle className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                              <p className="text-sm">No warnings to review</p>
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      <Card className="border-green-200 bg-green-50/50">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2 text-lg">
                            <CheckCircle className="h-5 w-5 text-green-600" />
                            Passed Checks
                            <Badge variant="default" className="ml-auto bg-green-600">{passedChecks.length}</Badge>
                          </CardTitle>
                          <CardDescription>
                            All validations successful
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <ScrollArea className="h-[400px] pr-4">
                            {passedChecks.map((result, index) => {
                              const IconComponent = PRE_CHECK_ICONS[result.check_name] || CheckCircle;
                              return (
                                <div key={index} className="bg-white rounded-lg p-3 border border-green-200 shadow-sm mb-2">
                                  <div className="flex items-center gap-3">
                                    <IconComponent className="h-4 w-4 text-green-600 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <h4 className="font-medium text-sm">{result.check_name}</h4>
                                      <p className="text-xs text-gray-600 truncate">{result.message}</p>
                                    </div>
                                    <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                                  </div>
                                </div>
                              );
                            })}
                          </ScrollArea>
                        </CardContent>
                      </Card>
                    </div>
                  );
                })()}

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

        {/* ==================================================================
            TAB 4: RESULTS
            ================================================================== */}
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
