/**
 * =============================================================================
 * CODE UPGRADES COMPONENT - PRODUCTION READY v4.6.0 (COMPLETE FIX)
 * =============================================================================
 *
 * @version 4.6.0
 * @last_updated 2025-11-05
 * @author nikos-geranios_vgi
 *
 * 🔧 CRITICAL FIXES IN THIS VERSION:
 * ✅ FIXED: PRE_CHECK_EVENT extraction with robust JSON parsing
 * ✅ FIXED: Brace-counting algorithm for nested JSON in log messages
 * ✅ FIXED: Review tab now appears reliably with proper state management
 * ✅ FIXED: Enhanced error visibility in UI for debugging
 * ✅ FIXED: Never filter critical WebSocket events
 * ✅ FIXED: Parse errors now visible to user in job output
 *
 * 🎯 IMPROVEMENTS:
 * ✅ WebSocket Message Inspector for real-time debugging
 * ✅ Enhanced logging with structured output
 * ✅ Robust JSON extraction from embedded log messages
 * ✅ Better error recovery and user feedback
 * ✅ Comprehensive state debugging utilities
 *
 * 🏗️ ARCHITECTURE:
 * - Configuration Tab: Device setup and image selection
 * - Execute Tab: Real-time pre-check validation progress
 * - Review Tab: Pre-check results with pass/warning/fail categorization
 * - Results Tab: Final upgrade execution results
 *
 * 🔄 WORKFLOW:
 * 1. User configures device and selects image
 * 2. Pre-check validation runs with real-time WebSocket updates
 * 3. PRE_CHECK_EVENT messages are extracted from ORCHESTRATOR_LOG
 * 4. Review tab displays comprehensive validation results
 * 5. User proceeds with upgrade or resolves issues
 * 6. Final results displayed after upgrade completion
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
  Terminal,
  Bug,
  Eye
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
 
/**
 * Timing constants for UI transitions and updates
 */
const TIMING = {
  AUTO_SCROLL_DELAY: 50,              // Delay before auto-scrolling to latest message
  TAB_TRANSITION_DELAY: 1500,         // Delay before automatic tab transitions
  PROGRESS_UPDATE_INTERVAL: 100       // Interval for progress bar updates
};
 
/**
 * Icon mapping for pre-check validation categories
 * Maps check names to their corresponding Lucide icons
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
// PARAMETER VALIDATION UTILITIES
// ============================================================================
 
/**
 * Validates all required parameters before API calls
 *
 * @param {Object} params - The upgrade parameters to validate
 * @returns {Array<string>} Array of error messages (empty if valid)
 *
 * @example
 * const errors = validateUpgradeParameters(upgradeParams);
 * if (errors.length > 0) {
 *   // Handle validation errors
 * }
 */
const validateUpgradeParameters = (params) => {
  const errors = [];
 
  if (!params.username?.trim()) {
    errors.push('Username is required');
  }
 
  if (!params.password?.trim()) {
    errors.push('Password is required');
  }
 
  if (!params.hostname?.trim() && !params.inventory_file?.trim()) {
    errors.push('Either hostname or inventory file must be specified');
  }
 
  if (!params.image_filename?.trim()) {
    errors.push('Software image must be selected');
  }
 
  if (!params.target_version?.trim()) {
    errors.push('Target version is required (should be auto-extracted from image)');
  }
 
  return errors;
};
 
/**
 * Enhanced parameter transformation with debugging
 * Ensures consistent parameter naming between frontend and backend
 *
 * @param {Object} params - Raw parameters from form
 * @param {string} operationType - Type of operation ('pre-check' or 'upgrade')
 * @returns {Object} Formatted payload ready for API submission
 *
 * @example
 * const payload = prepareApiPayload(upgradeParams, 'pre-check');
 * // Returns properly formatted payload with operation-specific fields
 */
const prepareApiPayload = (params, operationType = 'pre-check') => {
  console.log(`[PAYLOAD_PREP] Preparing ${operationType} payload with params:`, {
    hostname: params.hostname,
    image_filename: params.image_filename,
    target_version: params.target_version,
    vendor: params.vendor,
    platform: params.platform
  });
 
  const basePayload = {
    hostname: params.hostname?.trim() || '',
    inventory_file: params.inventory_file?.trim() || '',
    username: params.username,
    password: params.password,
    vendor: params.vendor,
    platform: params.platform,
    target_version: params.target_version,
    image_filename: params.image_filename,
  };
 
  // Add operation-specific parameters
  if (operationType === 'pre-check') {
    Object.assign(basePayload, {
      skip_storage_check: false,
      skip_snapshot_check: false,
      require_snapshot: false,
    });
  } else if (operationType === 'upgrade') {
    Object.assign(basePayload, {
      command: "code_upgrade",
      pre_check_job_id: params.pre_check_job_id,
      skip_pre_check: false,
      force_upgrade: false,
    });
  }
 
  console.log(`[PAYLOAD_PREP] Final ${operationType} payload:`, {
    ...basePayload,
    password: '***REDACTED***'
  });
 
  return basePayload;
};
// ============================================================================
// MESSAGE FILTERING UTILITY - ENHANCED VERSION
// ============================================================================
 
/**
 * 🎯 CRITICAL: Determines if a WebSocket message should be filtered from display
 *
 * NEVER filters critical events that are essential for workflow:
 * - PRE_CHECK_COMPLETE: Triggers Review tab
 * - PRE_CHECK_EVENT: Contains validation results
 * - OPERATION_COMPLETE: Signals job completion
 * - OPERATION_START: Initializes progress tracking
 * - STEP_COMPLETE: Updates progress
 * - PRE_CHECK_RESULT: Individual check results
 * - PARSE_ERROR: User-facing error messages
 *
 * Only filters truly verbose messages like debug logs, heartbeats, etc.
 *
 * @param {Object} log - Log entry to evaluate
 * @returns {boolean} True if message should be filtered out
 */
const shouldFilterMessage = (log) => {
  // 🎯 NEVER filter these critical event types
  const criticalEvents = [
    'PRE_CHECK_COMPLETE',
    'PRE_CHECK_EVENT',
    'OPERATION_COMPLETE',
    'OPERATION_START',
    'STEP_COMPLETE',
    'PRE_CHECK_RESULT',
    'PARSE_ERROR',
    'RAW_WEBSOCKET'  // Keep for debugging
  ];
 
  if (criticalEvents.includes(log.event_type)) {
    console.log("[FILTER_DEBUG] CRITICAL EVENT - NOT FILTERING:", log.event_type);
    return false;
  }
 
  // Only filter truly verbose/redundant messages
  const message = log.message?.toLowerCase() || '';
  const shouldFilter = (
    message.includes('[debug]') ||
    message.includes('heartbeat') ||
    message.includes('keepalive') ||
    message.includes('ping') ||
    message.includes('pong')
  );
 
  if (shouldFilter) {
    console.log("[FILTER_DEBUG] Filtering verbose message:", message.substring(0, 50));
  }
 
  return shouldFilter;
};
 
// ============================================================================
// MESSAGE FORMATTING UTILITIES
// ============================================================================
 
/**
 * Formats step messages for consistent display
 *
 * Transforms technical log messages into user-friendly descriptions:
 * - Removes hostname prefixes ([hostname])
 * - Converts technical function names to readable descriptions
 * - Adds status indicators (✅, ⚠️, ❌)
 * - Optionally prepends step numbers
 *
 * @param {string} message - Raw message from WebSocket
 * @param {number|null} stepNumber - Optional step number to prepend
 * @returns {string} Formatted, user-friendly message
 *
 * @example
 * formatStepMessage("[router1] _check_storage_space: pass", 3)
 * // Returns: "Step 3: Storage Space Verification ✅"
 */
const formatStepMessage = (message, stepNumber = null) => {
  if (!message) return message;
 
  // Remove hostname prefix: [hostname] text -> text
  const hostnameMatch = message.match(/\[([^\]]+)\]/);
  let cleanMessage = message.replace(/\[[^\]]+\]\s*/, '');
 
  // Pattern mapping: technical names -> user-friendly descriptions
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
 
  // Apply pattern transformations and add status indicators
  for (const [pattern, replacement] of Object.entries(checkPatterns)) {
    if (cleanMessage.includes(pattern)) {
      if (pattern.startsWith('_check_')) {
        // Add status emoji based on result
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
 
  // Prepend step number if provided and not already present
  if (stepNumber && !cleanMessage.toLowerCase().startsWith('step')) {
    return `Step ${stepNumber}: ${cleanMessage}`;
  }
 
  return cleanMessage;
};
// ============================================================================
// NESTED DATA EXTRACTION - CRITICAL COMPONENT
// ============================================================================
 
/**
 * 🎯 CRITICAL FUNCTION: Extracts nested JSON from WebSocket messages
 *
 * Backend sends PRE_CHECK_EVENT embedded in ORCHESTRATOR_LOG like this:
 * "[STDOUT] PRE_CHECK_EVENT:{...json...}"
 *
 * This function:
 * 1. Identifies embedded JSON patterns
 * 2. Extracts JSON using brace-counting algorithm
 * 3. Handles trailing text after JSON objects
 * 4. Provides comprehensive error logging
 * 5. Adds parse errors to UI for user visibility
 *
 * IMPROVEMENTS IN v4.6.0:
 * - Brace-counting algorithm handles complex nested JSON
 * - String escape handling prevents false brace matches
 * - Parse errors visible in job output
 * - Extensive logging for debugging
 * - Fallback extraction methods
 *
 * @param {Object} initialParsed - Initially parsed WebSocket message
 * @param {Function} setJobOutput - State setter to add error messages to UI
 * @returns {Object} { payload: extractedData, isNested: boolean }
 *
 * @example
 * const { payload, isNested } = extractNestedProgressData(parsedMessage, setJobOutput);
 * if (payload.event_type === 'PRE_CHECK_COMPLETE') {
 *   // Handle pre-check completion
 * }
 */
const extractNestedProgressData = (initialParsed, setJobOutput) => {
  let currentPayload = initialParsed;
 
  // ========================================================================
  // HANDLE ORCHESTRATOR_LOG WITH EMBEDDED JSON
  // ========================================================================
  if (initialParsed.event_type === "ORCHESTRATOR_LOG" && initialParsed.message) {
    const message = initialParsed.message;
 
    console.log("[NESTED_EXTRACTION] Full ORCHESTRATOR_LOG message:", message);
 
    // ======================================================================
    // PRE_CHECK_EVENT EXTRACTION
    // ======================================================================
    if (message.includes("PRE_CHECK_EVENT:")) {
      console.log("[NESTED_EXTRACTION] 🔍 Found PRE_CHECK_EVENT in message");
 
      try {
        // Find where JSON starts
        const jsonStartIndex = message.indexOf("PRE_CHECK_EVENT:") + "PRE_CHECK_EVENT:".length;
        let jsonString = message.substring(jsonStartIndex).trim();
 
        console.log("[NESTED_EXTRACTION] Raw JSON string length:", jsonString.length);
        console.log("[NESTED_EXTRACTION] First 200 chars:", jsonString.substring(0, 200));
 
        // ====================================================================
        // 🎯 BRACE-COUNTING ALGORITHM
        // Extracts complete JSON object even with trailing text
        // ====================================================================
        let braceCount = 0;
        let jsonEndIndex = -1;
        let inString = false;
        let escapeNext = false;
 
        for (let i = 0; i < jsonString.length; i++) {
          const char = jsonString[i];
 
          // Handle escape sequences in strings
          if (escapeNext) {
            escapeNext = false;
            continue;
          }
 
          if (char === '\\') {
            escapeNext = true;
            continue;
          }
 
          // Track string boundaries to ignore braces in strings
          if (char === '"' && !escapeNext) {
            inString = !inString;
            continue;
          }
 
          // Count braces only outside of strings
          if (!inString) {
            if (char === '{') {
              braceCount++;
            } else if (char === '}') {
              braceCount--;
              // Found matching closing brace
              if (braceCount === 0) {
                jsonEndIndex = i + 1;
                console.log("[NESTED_EXTRACTION] Found complete JSON object at index:", jsonEndIndex);
                break;
              }
            }
          }
        }
 
        // Extract clean JSON if end was found
        if (jsonEndIndex > 0) {
          jsonString = jsonString.substring(0, jsonEndIndex);
          console.log("[NESTED_EXTRACTION] ✅ Extracted clean JSON (length: " + jsonString.length + ")");
        } else {
          console.warn("[NESTED_EXTRACTION] ⚠️ Could not find end of JSON object, using full string");
        }
 
        console.log("[NESTED_EXTRACTION] Final JSON to parse:", jsonString.substring(0, 300) + "...");
 
        // Parse the extracted JSON
        const preCheckData = JSON.parse(jsonString);
 
        console.log("[NESTED_EXTRACTION] 🎯 SUCCESS: Extracted PRE_CHECK_EVENT data");
        console.log("[NESTED_EXTRACTION] Event type:", preCheckData.event_type);
        console.log("[NESTED_EXTRACTION] Full parsed data:", JSON.stringify(preCheckData, null, 2));
 
        // Verify critical data is present
        if (preCheckData.data?.pre_check_summary) {
          console.log("[NESTED_EXTRACTION] ✅ pre_check_summary found:", {
            total_checks: preCheckData.data.pre_check_summary.total_checks,
            passed: preCheckData.data.pre_check_summary.passed,
            warnings: preCheckData.data.pre_check_summary.warnings,
            critical_failures: preCheckData.data.pre_check_summary.critical_failures,
            can_proceed: preCheckData.data.pre_check_summary.can_proceed
          });
        } else if (preCheckData.pre_check_summary) {
          console.log("[NESTED_EXTRACTION] ✅ pre_check_summary found at root level");
        } else {
          console.warn("[NESTED_EXTRACTION] ⚠️ pre_check_summary NOT found in data");
          console.warn("[NESTED_EXTRACTION] Available keys:", Object.keys(preCheckData.data || preCheckData));
        }
 
        return { payload: preCheckData, isNested: true };
 
      } catch (parseError) {
        // ====================================================================
        // ERROR HANDLING - MAKE ERRORS VISIBLE TO USER
        // ====================================================================
        console.error('[NESTED_EXTRACTION] ❌ Failed to parse PRE_CHECK_EVENT JSON');
        console.error('[NESTED_EXTRACTION] Error message:', parseError.message);
        console.error('[NESTED_EXTRACTION] Error stack:', parseError.stack);
        console.error('[NESTED_EXTRACTION] Raw message:', message);
 
        // 🎯 CRITICAL: Add parse error to job output so user can see it
        setJobOutput(prev => [...prev, {
          timestamp: new Date().toISOString(),
          message: `⚠️ JSON Parse Error: ${parseError.message}`,
          level: 'error',
          event_type: 'PARSE_ERROR',
          data: {
            raw_message: message.substring(0, 500),
            error: parseError.message
          }
        }]);
      }
    }
 
    // ======================================================================
    // OPERATION_COMPLETE EXTRACTION (backup method)
    // ======================================================================
    if (message.includes("OPERATION_COMPLETE")) {
      console.log("[NESTED_EXTRACTION] 🔍 Found OPERATION_COMPLETE in message");
      const operationMatch = message.match(/OPERATION_COMPLETE.*?(\{.*\})/s);
      if (operationMatch && operationMatch[1]) {
        try {
          const operationData = JSON.parse(operationMatch[1]);
          console.log("[NESTED_EXTRACTION] 🎯 Extracted OPERATION_COMPLETE");
          return { payload: operationData, isNested: true };
        } catch (parseError) {
          console.error('[NESTED_EXTRACTION] Failed to parse OPERATION_COMPLETE:', parseError);
        }
      }
    }
  }
 
  // ========================================================================
  // HANDLE NESTED DATA STRUCTURE (backup method)
  // ========================================================================
  if (initialParsed.data) {
    try {
      const dataPayload = typeof initialParsed.data === 'string'
        ? JSON.parse(initialParsed.data)
        : initialParsed.data;
 
      console.log("[NESTED_EXTRACTION] Processing nested data structure");
      return { payload: dataPayload, isNested: true };
    } catch (error) {
      console.debug('[NESTED_EXTRACTION] Data field is not valid JSON:', error);
    }
  }
 
  // Return original payload if no extraction needed
  return { payload: currentPayload, isNested: false };
};
// ============================================================================
// MAIN COMPONENT
// ============================================================================
 
export default function CodeUpgrades() {
 
  // ==========================================================================
  // STATE MANAGEMENT
  // ==========================================================================
 
  /**
   * Upgrade parameters from user input
   * These are bound to form fields and validated before API calls
   */
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
 
  /**
   * UI state
   * - activeTab: Current visible tab
   * - jobStatus: Overall job status (idle, running, success, failed)
   * - currentPhase: Current workflow phase (config, pre_check, review, upgrade, results)
   * - showTechnicalDetails: Toggle for detailed logging
   */
  const [activeTab, setActiveTab] = useState("config");
  const [jobStatus, setJobStatus] = useState("idle");
  const [currentPhase, setCurrentPhase] = useState("config");
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
 
  /**
   * Progress tracking
   * - progress: Percentage completion (0-100)
   * - jobOutput: Array of log messages for display
   * - completedSteps: Number of steps completed
   * - totalSteps: Total number of steps in operation
   */
  const [progress, setProgress] = useState(0);
  const [jobOutput, setJobOutput] = useState([]);
  const [completedSteps, setCompletedSteps] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);
 
  /**
   * Job identifiers and results
   * - jobId: Current job ID from backend
   * - wsChannel: WebSocket channel name for this job
   * - finalResults: Complete results after job completion
   */
  const [jobId, setJobId] = useState(null);
  const [wsChannel, setWsChannel] = useState(null);
  const [finalResults, setFinalResults] = useState(null);
 
  /**
   * Pre-check specific state
   * - preCheckJobId: Job ID for pre-check operation
   * - preCheckResults: Individual pre-check results as they arrive
   * - preCheckSummary: 🎯 CRITICAL - Complete summary that enables Review tab
   * - isRunningPreCheck: Boolean flag for pre-check execution
   * - canProceedWithUpgrade: Whether pre-check passed and upgrade can proceed
   */
  const [preCheckJobId, setPreCheckJobId] = useState(null);
  const [preCheckResults, setPreCheckResults] = useState(null);
  const [preCheckSummary, setPreCheckSummary] = useState(null);
  const [isRunningPreCheck, setIsRunningPreCheck] = useState(false);
  const [canProceedWithUpgrade, setCanProceedWithUpgrade] = useState(false);
 
  /**
   * Statistics for results display
   */
  const [statistics, setStatistics] = useState({
    total: 0,
    succeeded: 0,
    failed: 0
  });
 
  // ==========================================================================
  // REFS - PERSISTENT VALUES ACROSS RENDERS
  // ==========================================================================
 
  /**
   * Tracks which step numbers have been processed to prevent duplicates
   * @type {React.MutableRefObject<Set<number>>}
   */
  const processedStepsRef = useRef(new Set());
 
  /**
   * Stores the latest step message for display in progress bar
   * @type {React.MutableRefObject<string>}
   */
  const latestStepMessageRef = useRef("");
 
  /**
   * Prevents duplicate log messages using signature-based deduplication
   * @type {React.MutableRefObject<Set<string>>}
   */
  const loggedMessagesRef = useRef(new Set());
 
  /**
   * Reference to scroll area for auto-scrolling to latest messages
   * @type {React.MutableRefObject<HTMLDivElement>}
   */
  const scrollAreaRef = useRef(null);
 
  // ==========================================================================
  // WEBSOCKET HOOK
  // ==========================================================================
 
  /**
   * Custom hook for WebSocket communication
   * - sendMessage: Function to send messages to WebSocket server
   * - lastMessage: Most recent message received
   * - isConnected: Connection status
   */
  const { sendMessage, lastMessage, isConnected } = useJobWebSocket();
    // ==========================================================================
  // EVENT HANDLERS
  // ==========================================================================
 
  /**
   * Handles parameter changes from form inputs
   *
   * Special handling for image_filename:
   * - Automatically extracts target_version from filename
   * - Uses versionParser utility for reliable version extraction
   *
   * @param {string} name - Parameter name
   * @param {*} value - New parameter value
   */
  const handleParamChange = (name, value) => {
    console.log(`[PARAM_CHANGE] ${name}: ${value}`);
    setUpgradeParams(prev => ({ ...prev, [name]: value }));
 
    // Auto-extract version when image is selected
    if (name === 'image_filename' && value) {
      const preciseVersion = extractVersionFromImageFilename(value);
      if (preciseVersion) {
        console.log(`[VERSION_EXTRACTION] ✅ Extracted "${preciseVersion}" from "${value}"`);
        setUpgradeParams(prev => ({ ...prev, target_version: preciseVersion }));
      } else {
        console.warn(`[VERSION_EXTRACTION] ⚠️ Could not extract version from "${value}"`);
      }
    }
  };
 
  /**
   * Resets the entire workflow to initial state
   *
   * Cleans up:
   * - WebSocket subscriptions
   * - All state variables
   * - Refs and caches
   * - Returns UI to configuration tab
   *
   * Call this when user wants to start a new upgrade operation
   */
  const resetWorkflow = () => {
    console.log("[WORKFLOW] ===== INITIATING COMPLETE RESET =====");
 
    // Unsubscribe from WebSocket channel
    if (wsChannel) {
      console.log(`[WEBSOCKET] Unsubscribing from channel: ${wsChannel}`);
      sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
    }
 
    // Reset all state
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
 
    // Clear refs
    processedStepsRef.current.clear();
    latestStepMessageRef.current = "";
    loggedMessagesRef.current.clear();
 
    console.log("[WORKFLOW] ✅ Reset complete - ready for new operation");
  };
 
  // ==========================================================================
  // PRE-CHECK HANDLER
  // ==========================================================================
 
  /**
   * Initiates pre-check validation operation
   *
   * Workflow:
   * 1. Validates all required parameters
   * 2. Checks WebSocket connection
   * 3. Cleans up any previous WebSocket subscriptions
   * 4. Resets state for new pre-check
   * 5. Prepares and sends API request
   * 6. Subscribes to WebSocket channel for real-time updates
   *
   * @param {Event} e - Form submission event
   */
  const startPreCheck = async (e) => {
    e.preventDefault();
 
    console.log("[PRE_CHECK] ===== PRE-CHECK VALIDATION INITIATED =====");
 
    // ======================================================================
    // VALIDATION
    // ======================================================================
    const validationErrors = validateUpgradeParameters(upgradeParams);
    if (validationErrors.length > 0) {
      console.error("[PRE_CHECK] ❌ Validation failed:", validationErrors);
      setJobOutput(prev => [...prev, ...validationErrors.map(error => ({
        timestamp: new Date().toISOString(),
        message: `Validation Error: ${error}`,
        level: 'error',
        event_type: 'VALIDATION_ERROR'
      }))]);
      return;
    }
 
    if (!isConnected) {
      console.error("[PRE_CHECK] ❌ WebSocket not connected");
      setJobOutput(prev => [...prev, {
        timestamp: new Date().toISOString(),
        message: "WebSocket not connected. Cannot start pre-check.",
        level: 'error',
        event_type: 'CONNECTION_ERROR'
      }]);
      return;
    }
 
    // ======================================================================
    // CLEANUP
    // ======================================================================
    if (wsChannel) {
      console.log(`[PRE_CHECK] Unsubscribing from previous channel: ${wsChannel}`);
      sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
    }
 
    // ======================================================================
    // STATE RESET
    // ======================================================================
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
 
    // ======================================================================
    // API CALL
    // ======================================================================
    const payload = prepareApiPayload(upgradeParams, 'pre-check');
 
    console.log("[PRE_CHECK] Submitting to API endpoint:", `${API_URL}/api/operations/pre-check`);
 
    try {
      const response = await fetch(`${API_URL}/api/operations/pre-check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
 
      console.log("[PRE_CHECK] Response status:", response.status);
 
      if (!response.ok) {
        let errorMessage;
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || errorData.message || `HTTP ${response.status}`;
        } catch {
          const errorText = await response.text();
          errorMessage = errorText || `HTTP ${response.status}`;
        }
 
        throw new Error(`API error: ${errorMessage}`);
      }
 
      const data = await response.json();
      console.log("[PRE_CHECK] ✅ Job queued successfully:", {
        job_id: data.job_id,
        ws_channel: data.ws_channel,
        phase: data.phase
      });
 
      setPreCheckJobId(data.job_id);
      setJobId(data.job_id);
      setWsChannel(data.ws_channel);
 
      // Subscribe to WebSocket updates
      console.log(`[WEBSOCKET] Subscribing to channel: ${data.ws_channel}`);
      sendMessage({ type: 'SUBSCRIBE', channel: data.ws_channel });
 
      setJobOutput(prev => [...prev, {
        timestamp: new Date().toISOString(),
        message: `Pre-check validation started. Job ID: ${data.job_id}`,
        level: 'info',
        event_type: 'JOB_STARTED'
      }]);
 
    } catch (error) {
      console.error("[PRE_CHECK] ❌ API Call Failed:", error);
 
      setJobOutput(prev => [...prev, {
        timestamp: new Date().toISOString(),
        message: `Pre-check start failed: ${error.message}`,
        level: 'error',
        event_type: 'API_ERROR'
      }]);
 
      setJobStatus("failed");
      setIsRunningPreCheck(false);
    }
  };
 
  // ==========================================================================
  // UPGRADE EXECUTION HANDLER
  // ==========================================================================
 
  /**
   * Initiates upgrade execution operation
   *
   * Prerequisites:
   * - Pre-check must have completed successfully
   * - Pre-check job ID must be available
   * - All validations must pass
   *
   * Workflow:
   * 1. Validates parameters and pre-check completion
   * 2. Cleans up previous WebSocket connection
   * 3. Resets state for upgrade phase
   * 4. Sends API request with pre-check job ID
   * 5. Subscribes to WebSocket for real-time progress
   */
  const startUpgradeExecution = async () => {
    console.log("[UPGRADE] ===== UPGRADE EXECUTION INITIATED =====");
    console.log("[UPGRADE] Pre-check job ID:", preCheckJobId);
 
    // ======================================================================
    // VALIDATION
    // ======================================================================
    const validationErrors = validateUpgradeParameters(upgradeParams);
    if (validationErrors.length > 0) {
      console.error("[UPGRADE] ❌ Validation failed:", validationErrors);
      setJobOutput(prev => [...prev, ...validationErrors.map(error => ({
        timestamp: new Date().toISOString(),
        message: `Validation Error: ${error}`,
        level: 'error',
        event_type: 'VALIDATION_ERROR'
      }))]);
      return;
    }
 
    if (!isConnected) {
      console.error("[UPGRADE] ❌ WebSocket not connected");
      setJobOutput(prev => [...prev, {
        timestamp: new Date().toISOString(),
        message: "WebSocket not connected. Cannot start upgrade.",
        level: 'error',
        event_type: 'CONNECTION_ERROR'
      }]);
      return;
    }
 
    // ======================================================================
    // CLEANUP
    // ======================================================================
    if (wsChannel) {
      console.log(`[UPGRADE] Unsubscribing from previous channel: ${wsChannel}`);
      sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
    }
 
    // ======================================================================
    // STATE RESET
    // ======================================================================
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
 
    // ======================================================================
    // API CALL
    // ======================================================================
    const payload = prepareApiPayload({
      ...upgradeParams,
      pre_check_job_id: preCheckJobId
    }, 'upgrade');
 
    console.log("[UPGRADE] Submitting to API endpoint:", `${API_URL}/api/operations/execute`);
 
    try {
      const response = await fetch(`${API_URL}/api/operations/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
 
      console.log("[UPGRADE] Response status:", response.status);
 
      if (!response.ok) {
        let errorMessage;
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || errorData.message || `HTTP ${response.status}`;
        } catch {
          const errorText = await response.text();
          errorMessage = errorText || `HTTP ${response.status}`;
        }
 
        throw new Error(`API error: ${errorMessage}`);
      }
 
      const data = await response.json();
 
      console.log("[UPGRADE] ✅ Job queued successfully:", {
        job_id: data.job_id,
        ws_channel: data.ws_channel,
        phase: data.phase
      });
 
      setJobId(data.job_id);
      setWsChannel(data.ws_channel);
 
      // Subscribe to WebSocket updates
      console.log(`[WEBSOCKET] Subscribing to channel: ${data.ws_channel}`);
      sendMessage({ type: 'SUBSCRIBE', channel: data.ws_channel });
 
      setJobOutput(prev => [...prev, {
        timestamp: new Date().toISOString(),
        message: `Upgrade job started successfully. Job ID: ${data.job_id}`,
        level: 'info',
        event_type: 'JOB_STARTED'
      }]);
 
    } catch (error) {
      console.error("[UPGRADE] ❌ API Call Failed:", error);
 
      setJobOutput(prev => [...prev, {
        timestamp: new Date().toISOString(),
        message: `Upgrade start failed: ${error.message}`,
        level: 'error',
        event_type: 'API_ERROR'
      }]);
 
      setJobStatus("failed");
      setActiveTab("results");
    }
  };
    // ==========================================================================
  // WEBSOCKET MESSAGE HANDLER - CRITICAL COMPONENT
  // ==========================================================================
 
  /**
   * 🎯 CRITICAL: Main WebSocket message processing effect
   *
   * This is the heart of real-time progress tracking and state management.
   *
   * RESPONSIBILITIES:
   * 1. Receives and parses WebSocket messages
   * 2. Extracts nested JSON from ORCHESTRATOR_LOG messages
   * 3. Filters and deduplicates log entries
   * 4. Updates progress tracking
   * 5. Handles PRE_CHECK_COMPLETE to enable Review tab
   * 6. Handles OPERATION_COMPLETE for job finalization
   * 7. Manages tab transitions
   * 8. Updates job output for display
   *
   * CRITICAL EVENTS HANDLED:
   * - PRE_CHECK_EVENT: Contains validation results
   * - PRE_CHECK_COMPLETE: Triggers Review tab (🎯 KEY FOR YOUR ISSUE)
   * - OPERATION_COMPLETE: Finalizes job and transitions to results
   * - OPERATION_START: Initializes progress tracking
   * - STEP_COMPLETE: Updates progress percentage
   * - PRE_CHECK_RESULT: Individual check results
   *
   * @dependencies lastMessage, jobId, wsChannel, sendMessage, totalSteps,
   *               progress, completedSteps, currentPhase, activeTab, jobOutput
   */
  useEffect(() => {
    if (!lastMessage || !jobId) return;
 
    const raw = lastMessage;
 
    // ======================================================================
    // RAW MESSAGE LOGGING
    // ======================================================================
    console.log("[WEBSOCKET_RAW] ========================================");
    console.log("[WEBSOCKET_RAW] New message received");
    console.log("[WEBSOCKET_RAW] Length:", raw.length);
    console.log("[WEBSOCKET_RAW] Preview:", raw.substring(0, 500) + (raw.length > 500 ? '...' : ''));
    console.log("[WEBSOCKET_RAW] ========================================");
 
    // Validate message format
    if (typeof raw !== 'string' || (!raw.startsWith('{') && !raw.startsWith('['))) {
      console.debug("[WEBSOCKET] Ignoring non-JSON message");
      return;
    }
 
    // ======================================================================
    // INITIAL PARSING
    // ======================================================================
    let parsed;
    try {
      parsed = JSON.parse(raw);
      console.log("[WEBSOCKET_PARSED] Successfully parsed message structure:", {
        event_type: parsed.event_type || 'N/A',
        type: parsed.type || 'N/A',
        has_data: !!parsed.data,
        message_length: parsed.message?.length || 0,
        channel: parsed.channel || 'N/A'
      });
    } catch (error) {
      console.debug("[WEBSOCKET] Failed to parse message as JSON:", error);
      return;
    }
 
    // ======================================================================
    // CHANNEL FILTERING
    // Ensure message belongs to current job's channel
    // ======================================================================
    if (parsed.channel && wsChannel && !parsed.channel.includes(wsChannel)) {
      console.debug("[WEBSOCKET] Ignoring message for different channel:", parsed.channel);
      return;
    }
 
    // ======================================================================
    // NESTED DATA EXTRACTION
    // 🎯 CRITICAL: This is where PRE_CHECK_EVENT is extracted
    // ======================================================================
    const { payload: finalPayload, isNested } = extractNestedProgressData(parsed, setJobOutput);
 
    // Enhanced debug logging for all events
    console.log("[WEBSOCKET_PROCESSED] Final payload analysis:", {
      event_type: finalPayload.event_type,
      type: finalPayload.type,
      isNested: isNested,
      currentPhase: currentPhase,
      has_preCheckSummary: !!preCheckSummary,
      activeTab: activeTab,
      jobStatus: jobStatus
    });
 
    // ======================================================================
    // DEDUPLICATION LOGIC
    // ======================================================================
 
    /**
     * Creates a unique signature for each log message
     * Used to prevent duplicate entries in job output
     *
     * @param {Object} payload - Message payload
     * @returns {string} Unique signature
     */
    const createLogSignature = (payload) => {
      const msg = payload.message || '';
      const eventType = payload.event_type || 'unknown';
      const timestamp = payload.timestamp || '';
      return `${eventType}::${timestamp}::${msg.substring(0, 100)}`;
    };
 
    const logSignature = createLogSignature(finalPayload);
 
    // Check if message should be added to job output
    const shouldAddToOutput = !loggedMessagesRef.current.has(logSignature);
    const shouldDisplay = !shouldFilterMessage(finalPayload);
 
    // ======================================================================
    // ADD TO JOB OUTPUT
    // ======================================================================
    if (shouldAddToOutput && shouldDisplay) {
      loggedMessagesRef.current.add(logSignature);
 
      // Calculate step number for display
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
 
      console.log(`[WEBSOCKET_LOG] Adding to job output (Step ${currentStepNumber}):`, logEntry.message);
      setJobOutput(prev => [...prev, logEntry]);
 
      // Update latest step message for progress bar
      if (logEntry.message && finalPayload.event_type !== "OPERATION_COMPLETE") {
        latestStepMessageRef.current = logEntry.message;
      }
 
      // Auto-scroll to latest message
      if (scrollAreaRef.current) {
        setTimeout(() => {
          if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
          }
        }, TIMING.AUTO_SCROLL_DELAY);
      }
    }
 
    // ======================================================================
    // EVENT-SPECIFIC HANDLERS
    // ======================================================================
 
    // ======================================================================
    // PRE_CHECK_RESULT - Individual validation results
    // ======================================================================
    if (finalPayload.event_type === "PRE_CHECK_RESULT") {
      console.log("[PRE_CHECK] Individual result received:", {
        check_name: finalPayload.check_name,
        severity: finalPayload.severity,
        message: finalPayload.message
      });
 
      setPreCheckResults(prev => {
        const updated = prev ? [...prev] : [];
        updated.push(finalPayload);
        return updated;
      });
    }
 
    // ======================================================================
    // PRE_CHECK_COMPLETE - CRITICAL FOR REVIEW TAB
    // 🎯 THIS IS THE KEY EVENT THAT ENABLES THE REVIEW TAB
    // ======================================================================
    if (finalPayload.event_type === "PRE_CHECK_COMPLETE" ||
        (finalPayload.type === "PRE_CHECK_COMPLETE" && finalPayload.data)) {
 
      console.log("[PRE_CHECK] ========================================");
      console.log("[PRE_CHECK] 🎯 PRE_CHECK_COMPLETE EVENT DETECTED");
      console.log("[PRE_CHECK] THIS ENABLES THE REVIEW TAB");
      console.log("[PRE_CHECK] ========================================");
 
      // Debug: Log complete payload structure
      console.log("[PRE_CHECK_DEBUG] Full PRE_CHECK_COMPLETE payload:",
        JSON.stringify(finalPayload, null, 2));
 
      // Extract summary data from various possible locations
      let summaryData = finalPayload.data;
      if (!summaryData && finalPayload.pre_check_summary) {
        summaryData = { pre_check_summary: finalPayload.pre_check_summary };
      }
 
      // ====================================================================
      // SUMMARY EXTRACTION AND STATE UPDATE
      // ====================================================================
      if (summaryData && summaryData.pre_check_summary) {
        const summary = summaryData.pre_check_summary;
 
        console.log("[PRE_CHECK] ✅ SUCCESS: Summary extracted:", {
          total_checks: summary.total_checks,
          passed: summary.passed,
          warnings: summary.warnings,
          critical_failures: summary.critical_failures,
          can_proceed: summary.can_proceed,
          results_count: summary.results?.length || 0
        });
 
        // 🎯 CRITICAL: Set summary state IMMEDIATELY
        // This must happen BEFORE OPERATION_COMPLETE to prevent race condition
        setPreCheckSummary(summary);
        setCanProceedWithUpgrade(summary.can_proceed);
 
        // Set job status to success regardless of check results
        // The summary shows the real status (can_proceed flag)
        setJobStatus("success");
        setIsRunningPreCheck(false);
        setProgress(100);
 
        console.log("[PRE_CHECK] ✅ State updated successfully");
        console.log("[PRE_CHECK] Review tab should now be enabled");
 
        // Verify state was set (async check)
        setTimeout(() => {
          console.log("[PRE_CHECK_DEBUG] State verification after 100ms:", {
            preCheckSummary_isSet: preCheckSummary !== null,
            canProceedWithUpgrade: canProceedWithUpgrade,
            reviewTabShouldBeEnabled: !!preCheckSummary
          });
        }, 100);
 
      } else {
        console.warn("[PRE_CHECK] ========================================");
        console.warn("[PRE_CHECK] ❌ PRE_CHECK_COMPLETE without summary data");
        console.warn("[PRE_CHECK] Available keys:", Object.keys(finalPayload));
        if (finalPayload.data) {
          console.warn("[PRE_CHECK] Data keys:", Object.keys(finalPayload.data));
        }
        console.warn("[PRE_CHECK] ========================================");
      }
    }
 
    // ======================================================================
    // PROGRESS TRACKING EVENTS
    // ======================================================================
 
    /**
     * OPERATION_START - Initializes progress tracking
     * Sets total steps for accurate percentage calculation
     */
    if (finalPayload.event_type === "OPERATION_START" &&
        typeof finalPayload.data?.total_steps === "number") {
 
      console.log("[PROGRESS] Operation started:", {
        total_steps: finalPayload.data.total_steps,
        operation: finalPayload.data.operation
      });
 
      setTotalSteps(finalPayload.data.total_steps);
      setProgress(5); // Initial progress
    }
 
    /**
     * STEP_COMPLETE - Updates progress as steps complete
     * Prevents duplicate counting using processedStepsRef
     */
    if (finalPayload.event_type === "STEP_COMPLETE" &&
        typeof finalPayload.data?.step === "number") {
 
      const stepNum = finalPayload.data.step;
 
      if (!processedStepsRef.current.has(stepNum)) {
        processedStepsRef.current.add(stepNum);
        console.log(`[PROGRESS] Step ${stepNum} completed`);
 
        setCompletedSteps(prevCompleted => {
          const newCompleted = prevCompleted + 1;
          let newProgress = progress;
 
          if (totalSteps > 0) {
            // Calculate percentage based on completed/total
            newProgress = Math.min(99, Math.round((newCompleted / totalSteps) * 100));
          } else {
            // Fallback: increment by fixed amount
            newProgress = Math.min(99, progress + 25);
          }
 
          console.log(`[PROGRESS] Progress update: ${newCompleted}/${totalSteps} steps (${newProgress}%)`);
          setProgress(newProgress);
          return newCompleted;
        });
      } else {
        console.log(`[PROGRESS] Step ${stepNum} already processed, skipping`);
      }
    }
 
    // ======================================================================
    // OPERATION_COMPLETE - JOB FINALIZATION
    // ======================================================================
    if (finalPayload.event_type === "OPERATION_COMPLETE" ||
        finalPayload.type === "OPERATION_COMPLETE") {
 
      const finalStatus = finalPayload.data?.status || finalPayload.success;
      const operationType = finalPayload.data?.operation || currentPhase;
 
      console.log("[OPERATION] ========================================");
      console.log("[OPERATION] ⭐ OPERATION_COMPLETE DETECTED");
      console.log("[OPERATION] Status:", finalStatus);
      console.log("[OPERATION] Operation:", operationType);
      console.log("[OPERATION] Phase:", currentPhase);
      console.log("[OPERATION] Has pre_check_summary:", preCheckSummary !== null);
      console.log("[OPERATION] ========================================");
 
      // ====================================================================
      // PRE-CHECK COMPLETION HANDLING
      // ====================================================================
      if (currentPhase === "pre_check" || operationType === "pre_check") {
        console.log("[PRE_CHECK] Operation complete - finalizing pre-check phase");
 
        // 🎯 CRITICAL: Don't override status if PRE_CHECK_COMPLETE already set it
        // The summary is more authoritative than the exit code
        if (!preCheckSummary) {
          console.log("[PRE_CHECK] No summary found yet, extracting from OPERATION_COMPLETE as fallback");
 
          // Try to extract summary from various nested structures
          if (finalPayload.data?.final_results?.data?.pre_check_summary) {
            console.log("[PRE_CHECK] 🎯 Extracting summary from nested final_results");
            const extractedSummary = finalPayload.data.final_results.data.pre_check_summary;
            setPreCheckSummary(extractedSummary);
            setCanProceedWithUpgrade(extractedSummary.can_proceed);
            setJobStatus("success");
          } else if (finalPayload.data?.pre_check_summary) {
            console.log("[PRE_CHECK] 🎯 Extracting summary from direct data structure");
            setPreCheckSummary(finalPayload.data.pre_check_summary);
            setCanProceedWithUpgrade(finalPayload.data.pre_check_summary.can_proceed);
            setJobStatus("success");
          } else {
            // No summary available - mark as failed
            console.warn("[PRE_CHECK] ❌ No summary available in OPERATION_COMPLETE");
            setJobStatus("failed");
          }
        } else {
          console.log("[PRE_CHECK] ✅ Summary already set by PRE_CHECK_COMPLETE");
          console.log("[PRE_CHECK] Preserving existing success status");
          // Don't change status - PRE_CHECK_COMPLETE already set it correctly
        }
 
        setIsRunningPreCheck(false);
        setProgress(100);
 
        // Ensure completed steps matches total
        if (totalSteps > 0) {
          setCompletedSteps(totalSteps);
        }
 
        // Clean up WebSocket subscription
        if (wsChannel) {
          console.log(`[WEBSOCKET] Pre-check complete, unsubscribing from ${wsChannel}`);
          sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
        }
 
        // Schedule automatic transition to Review tab
        console.log(`[TAB_TRANSITION] Scheduling transition to REVIEW in ${TIMING.TAB_TRANSITION_DELAY}ms`);
        setTimeout(() => {
          console.log("[TAB_TRANSITION] ========================================");
          console.log("[TAB_TRANSITION] ⏰ Executing transition to REVIEW tab");
          console.log("[TAB_TRANSITION] Pre-transition state:", {
            activeTab,
            currentPhase,
            preCheckSummary: preCheckSummary !== null,
            canProceedWithUpgrade
          });
 
          setActiveTab("review");
          setCurrentPhase("review");
 
          console.log("[TAB_TRANSITION] ✅ Transition to REVIEW completed");
          console.log("[TAB_TRANSITION] ========================================");
        }, TIMING.TAB_TRANSITION_DELAY);
      }
 
      // ====================================================================
      // UPGRADE COMPLETION HANDLING
      // ====================================================================
      else if (currentPhase === "upgrade" || operationType === "upgrade") {
        console.log("[UPGRADE] Operation complete - finalizing upgrade phase");
 
        // Determine final success status from various sources
        let finalSuccess = false;
        if (finalPayload.success === true ||
            finalPayload.data?.final_results?.success === true) {
          finalSuccess = true;
        } else if (finalPayload.data?.status === "SUCCESS") {
          finalSuccess = true;
        } else if (finalPayload.message && (
          finalPayload.message.includes('success: True') ||
          finalPayload.message.includes('completed successfully')
        )) {
          finalSuccess = true;
        }
 
        console.log("[UPGRADE] Final Status:", finalSuccess ? "✅ SUCCESS" : "❌ FAILED");
 
        setJobStatus(finalSuccess ? "success" : "failed");
        setFinalResults(finalPayload);
        setProgress(100);
 
        // Ensure completed steps matches total
        if (totalSteps > 0) {
          setCompletedSteps(totalSteps);
        }
 
        // Clean up WebSocket subscription
        if (wsChannel) {
          console.log(`[WEBSOCKET] Upgrade complete, unsubscribing from ${wsChannel}`);
          sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
        }
 
        // Schedule automatic transition to Results tab
        console.log("[UPGRADE] Scheduling transition to results tab");
        setTimeout(() => {
          setActiveTab("results");
          setCurrentPhase("results");
          console.log("[UPGRADE] ✅ Transitioned to results tab");
        }, TIMING.TAB_TRANSITION_DELAY);
      }
    }
 
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessage, jobId, wsChannel, sendMessage, totalSteps, progress,
      completedSteps, currentPhase, activeTab]);
 
  // ==========================================================================
  // DERIVED STATE
  // ==========================================================================
 
  /**
   * Computed values based on current state
   * Used throughout the component for conditional rendering
   */
  const isRunning = jobStatus === 'running';
  const isComplete = jobStatus === 'success';
  const hasError = jobStatus === 'failed';
 
  /**
   * Form validation - checks if all required fields are filled
   * Used to enable/disable the Start Pre-Check button
   */
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
  // DEBUG UTILITIES
  // ==========================================================================
 
  /**
   * Logs complete current state to console
   * Useful for troubleshooting state-related issues
   */
  const logCurrentState = () => {
    console.log("[DEBUG] ========================================");
    console.log("[DEBUG] CURRENT COMPONENT STATE");
    console.log("[DEBUG] ========================================");
    console.log("[DEBUG] UI State:", {
      activeTab,
      currentPhase,
      jobStatus,
      showTechnicalDetails
    });
    console.log("[DEBUG] Pre-check State:", {
      preCheckSummary: preCheckSummary !== null ? "SET" : "NULL",
      canProceedWithUpgrade,
      preCheckJobId,
      isRunningPreCheck
    });
    console.log("[DEBUG] Job State:", {
      jobId,
      wsChannel,
      isConnected,
      isFormValid
    });
    console.log("[DEBUG] Progress:", {
      progress,
      completedSteps,
      totalSteps,
      isRunning,
      isComplete,
      hasError
    });
    console.log("[DEBUG] ========================================");
  };
 
  /**
   * Manually enables Review tab with test data
   * Useful for UI development and testing
   */
  const forceReviewTab = () => {
    console.log("[DEBUG] ========================================");
    console.log("[DEBUG] Manually forcing Review tab for testing");
    console.log("[DEBUG] ========================================");
 
    const testSummary = {
      total_checks: 8,
      passed: 7,
      warnings: 1,
      critical_failures: 0,
      can_proceed: true,
      results: [
        { check_name: "Device Connectivity", severity: "pass", message: "Device is reachable" },
        { check_name: "Storage Space", severity: "pass", message: "Sufficient storage available" },
        { check_name: "System State", severity: "pass", message: "System is stable" },
        { check_name: "Redundancy Status", severity: "pass", message: "Redundancy checks passed" },
        { check_name: "Image Availability", severity: "pass", message: "Image is available" },
        { check_name: "Version Compatibility", severity: "pass", message: "Version is compatible" },
        { check_name: "Snapshot Availability", severity: "warning", message: "Snapshot may take longer" },
        { check_name: "Resource Utilization", severity: "pass", message: "Resources are adequate" }
      ]
    };
 
    setPreCheckSummary(testSummary);
    setCanProceedWithUpgrade(true);
    setActiveTab("review");
    setCurrentPhase("review");
    setJobStatus("success");
 
    console.log("[DEBUG] ✅ Review tab manually enabled with test data");
  };
    // ==========================================================================
  // RENDER
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
 
        {/* Reset button - only show when job is active */}
        {jobStatus !== 'idle' && (
          <Button onClick={resetWorkflow} variant="outline" size="sm">
            Start New Upgrade
          </Button>
        )}
      </div>
 
      <Separator className="mb-8" />
 
      {/* ====================================================================
          MAIN TABS CONTAINER
          ==================================================================== */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
 
        {/* ==================================================================
            TAB NAVIGATION
            ================================================================== */}
        <TabsList className="grid w-full grid-cols-4 mb-6">
          {/* Configuration Tab */}
          <TabsTrigger value="config" disabled={isRunning}>
            Configure
          </TabsTrigger>
 
          {/* Execute Tab - enabled after configuration */}
          <TabsTrigger value="execute" disabled={currentPhase === "config"}>
            {currentPhase === "pre_check" ? "Pre-Check" : "Execute"}
          </TabsTrigger>
 
          {/* Review Tab - 🎯 CRITICAL: Only enabled when preCheckSummary is set */}
          <TabsTrigger
            value="review"
            disabled={!preCheckSummary && activeTab !== "review"}
            className={preCheckSummary ? "bg-green-50 border-green-200" : ""}
          >
            Review {preCheckSummary && "✅"}
          </TabsTrigger>
 
          {/* Results Tab - enabled after upgrade execution */}
          <TabsTrigger value="results" disabled={currentPhase !== "results"}>
            Results
          </TabsTrigger>
        </TabsList>
 
        {/* ==================================================================
            TAB 1: CONFIGURATION
            ================================================================== */}
        <TabsContent value="config">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 max-w-7xl">
 
            {/* ==============================================================
                LEFT COLUMN: IMAGE SELECTION
                ============================================================== */}
            <div className="xl:col-span-1">
              <SelectImageRelease
                parameters={upgradeParams}
                onParamChange={handleParamChange}
              />
            </div>
 
            {/* ==============================================================
                RIGHT COLUMN: DEVICE CONFIGURATION & ACTIONS
                ============================================================== */}
            <div className="xl:col-span-2 space-y-6">
 
              {/* Device Configuration Form */}
              <CodeUpgradeForm
                parameters={upgradeParams}
                onParamChange={handleParamChange}
              />
 
              {/* ============================================================
                  PRE-CHECK ACTION CARD
                  ============================================================ */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
 
                    {/* Status Information */}
                    <div className="flex-1">
                      <h4 className="text-lg font-semibold mb-2 flex items-center gap-2">
                        <Shield className="h-5 w-5 text-blue-600" />
                        Ready for Pre-Check Validation
                      </h4>
 
                      <div className="space-y-1 text-sm text-gray-600">
                        {/* Display configured parameters */}
                        {upgradeParams.image_filename && (
                          <p className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span className="font-medium">
                              Image: {upgradeParams.image_filename}
                            </span>
                          </p>
                        )}
 
                        {upgradeParams.target_version && (
                          <p className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span>
                              Target Version: <strong>{upgradeParams.target_version}</strong>
                            </span>
                          </p>
                        )}
 
                        {upgradeParams.hostname && (
                          <p className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span>Device: {upgradeParams.hostname}</span>
                          </p>
                        )}
 
                        {/* Validation errors - show what's missing */}
                        {!isFormValid && (
                          <div className="text-orange-600 text-sm mt-2 space-y-1">
                            {!upgradeParams.image_filename && (
                              <p>• Select a software image</p>
                            )}
                            {!upgradeParams.target_version && (
                              <p>• Target version will be auto-extracted from image</p>
                            )}
                            {!upgradeParams.hostname && !upgradeParams.inventory_file && (
                              <p>• Configure device target</p>
                            )}
                            {(!upgradeParams.username || !upgradeParams.password) && (
                              <p>• Provide authentication credentials</p>
                            )}
                          </div>
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
 
              {/* ============================================================
                  DEBUG PANEL - ENHANCED FOR TROUBLESHOOTING
                  ============================================================ */}
              <Card className="border-yellow-200 bg-yellow-50">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Bug className="h-4 w-4" />
                    Debug Panel
                  </CardTitle>
                  <CardDescription>
                    Troubleshooting tools for WebSocket and state issues
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Debug Action Buttons */}
                  <div className="flex gap-2 flex-wrap mb-4">
                    <Button
                      onClick={logCurrentState}
                      variant="outline"
                      size="sm"
                    >
                      <Terminal className="h-3 w-3 mr-1" />
                      Log Current State
                    </Button>
                    <Button
                      onClick={forceReviewTab}
                      variant="outline"
                      size="sm"
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      Force Review Tab
                    </Button>
                    <Button
                      onClick={() => setActiveTab("review")}
                      variant="outline"
                      size="sm"
                      disabled={!preCheckSummary}
                    >
                      <ArrowRight className="h-3 w-3 mr-1" />
                      Go to Review Tab
                    </Button>
                    <Button
                      onClick={() => console.log("WebSocket:", {
                        isConnected,
                        wsChannel,
                        jobId,
                        lastMessageLength: lastMessage?.length
                      })}
                      variant="outline"
                      size="sm"
                    >
                      <Activity className="h-3 w-3 mr-1" />
                      Check WebSocket
                    </Button>
                  </div>
 
                  {/* Real-time State Display */}
                  <div className="grid grid-cols-2 gap-2 text-xs text-yellow-800 bg-yellow-100 p-3 rounded">
                    <div>
                      <strong>Pre-check Summary:</strong>{' '}
                      <span className={preCheckSummary ? "text-green-700 font-semibold" : "text-red-700"}>
                        {preCheckSummary ? "✅ SET" : "❌ NULL"}
                      </span>
                    </div>
                    <div>
                      <strong>WebSocket:</strong>{' '}
                      <span className={isConnected ? "text-green-700 font-semibold" : "text-red-700"}>
                        {isConnected ? "✅ Connected" : "❌ Disconnected"}
                      </span>
                    </div>
                    <div>
                      <strong>Current Tab:</strong> {activeTab}
                    </div>
                    <div>
                      <strong>Current Phase:</strong> {currentPhase}
                    </div>
                    <div>
                      <strong>Job Status:</strong> {jobStatus}
                    </div>
                    <div>
                      <strong>Can Proceed:</strong>{' '}
                      <span className={canProceedWithUpgrade ? "text-green-700" : "text-gray-600"}>
                        {canProceedWithUpgrade ? "✅ Yes" : "⏸️ No"}
                      </span>
                    </div>
                    <div>
                      <strong>Job ID:</strong>{' '}
                      <span className="font-mono text-xs">
                        {jobId ? jobId.substring(0, 8) + '...' : 'None'}
                      </span>
                    </div>
                    <div>
                      <strong>Channel:</strong>{' '}
                      <span className="font-mono text-xs">
                        {wsChannel ? wsChannel.substring(0, 12) + '...' : 'None'}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
 
              {/* ============================================================
                  WEBSOCKET MESSAGE INSPECTOR
                  🎯 NEW: Real-time message monitoring
                  ============================================================ */}
              <Card className="border-purple-200 bg-purple-50">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Activity className="h-4 w-4" />
                        WebSocket Message Inspector
                      </CardTitle>
                      <CardDescription>
                        Real-time WebSocket message monitoring (last 20 messages)
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="font-mono text-xs">
                      {jobOutput.filter(log => log.event_type === 'RAW_WEBSOCKET').length} messages
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-64">
                    <div className="space-y-1">
                      {jobOutput
                        .filter(log => log.event_type === 'RAW_WEBSOCKET')
                        .slice(-20) // Show last 20 messages
                        .map((log, idx) => (
                          <div
                            key={idx}
                            className="text-xs font-mono bg-white p-2 rounded border border-purple-100 hover:border-purple-300 transition-colors"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-purple-600 font-semibold">
                                {new Date(log.timestamp).toLocaleTimeString()}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {log.data?.full_message?.length || 0} chars
                              </Badge>
                            </div>
                            <div className="text-gray-700 break-all text-xs leading-relaxed">
                              {log.message}
                            </div>
                            {/* Show if message contains critical events */}
                            {log.data?.full_message && (
                              <div className="mt-1 flex gap-1 flex-wrap">
                                {log.data.full_message.includes('PRE_CHECK_EVENT') && (
                                  <Badge className="text-xs bg-green-100 text-green-800">
                                    PRE_CHECK_EVENT
                                  </Badge>
                                )}
                                {log.data.full_message.includes('PRE_CHECK_COMPLETE') && (
                                  <Badge className="text-xs bg-blue-100 text-blue-800">
                                    PRE_CHECK_COMPLETE
                                  </Badge>
                                )}
                                {log.data.full_message.includes('OPERATION_COMPLETE') && (
                                  <Badge className="text-xs bg-purple-100 text-purple-800">
                                    OPERATION_COMPLETE
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
 
                      {/* Empty state */}
                      {jobOutput.filter(log => log.event_type === 'RAW_WEBSOCKET').length === 0 && (
                        <div className="text-center py-8 text-purple-400">
                          <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">No WebSocket messages yet</p>
                          <p className="text-xs mt-1">Start a pre-check to see real-time messages</p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
 
            </div>
          </div>
        </TabsContent>
                {/* ==================================================================
            TAB 2: EXECUTION
            Real-time progress monitoring for pre-check and upgrade operations
            ================================================================== */}
        <TabsContent value="execute">
          <div className="space-y-6 max-w-6xl">
 
            {/* ==============================================================
                OPERATION STATUS HEADER
                ============================================================== */}
            <Card className="border-gray-200">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl flex items-center gap-2">
                      {/* Dynamic status icon */}
                      {isRunning && <Loader2 className="h-5 w-5 animate-spin text-blue-600" />}
                      {isComplete && <CheckCircle className="h-5 w-5 text-green-600" />}
                      {hasError && <XCircle className="h-5 w-5 text-red-600" />}
 
                      {/* Dynamic title based on phase */}
                      {currentPhase === "pre_check" ? "Pre-Check Validation" : "Upgrade Execution"}
                    </CardTitle>
 
                    <CardDescription>
                      {isRunning && "Processing validation checks..."}
                      {isComplete && "All checks completed successfully"}
                      {hasError && "Validation encountered errors"}
                    </CardDescription>
                  </div>
 
                  {/* Step counter badge */}
                  {totalSteps > 0 && (
                    <Badge variant="outline" className="text-sm px-3 py-1">
                      {completedSteps} / {totalSteps} Steps
                    </Badge>
                  )}
                </div>
              </CardHeader>
            </Card>
 
            {/* ==============================================================
                ENHANCED PROGRESS BAR
                ============================================================== */}
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
 
            {/* ==============================================================
                VALIDATION STEPS LOG
                ============================================================== */}
            <Card className="border-gray-200">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Validation Steps</CardTitle>
                    <CardDescription>
                      Real-time progress of pre-check validation
                    </CardDescription>
                  </div>
 
                  {/* Technical details toggle */}
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
 
                    {/* Empty state - waiting for messages */}
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
                      /* Step messages display */
                      jobOutput
                        .filter(log => showTechnicalDetails || !shouldFilterMessage(log))
                        .map((log, index, filteredArray) => {
                          // Determine step status
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
                              {/* Status icon */}
                              {stepStatus === 'COMPLETE' && (
                                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                              )}
                              {stepStatus === 'IN_PROGRESS' && (
                                <Loader2 className="w-5 h-5 animate-spin text-blue-600 flex-shrink-0" />
                              )}
                              {stepStatus === 'FAILED' && (
                                <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                              )}
 
                              {/* Message content */}
                              <div className="flex-1 min-w-0">
                                <div className={`text-sm ${
                                  stepStatus === 'COMPLETE' ? 'text-gray-700' :
                                  stepStatus === 'IN_PROGRESS' ? 'text-black font-medium' :
                                  'text-red-600 font-medium'
                                }`}>
                                  {log.message}
                                </div>
 
                                {/* Timestamp (shown for completed steps or in technical mode) */}
                                {(stepStatus === 'COMPLETE' || showTechnicalDetails) && (
                                  <div className="text-xs text-gray-400 mt-0.5 font-mono">
                                    {new Date(log.timestamp).toLocaleTimeString()}
                                  </div>
                                )}
 
                                {/* Event type badge in technical mode */}
                                {showTechnicalDetails && log.event_type && (
                                  <Badge variant="outline" className="mt-1 text-xs">
                                    {log.event_type}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          );
                        })
                    )}
 
                    {/* Processing indicator while running */}
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
 
            {/* ==============================================================
                COMPLETION SUMMARY CARD
                Shows statistics when validation completes
                ============================================================== */}
            {!isRunning && jobOutput.length > 0 && (
              <Card className={`border-2 ${
                isComplete ? 'border-green-200 bg-green-50' :
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
                    {/* Steps completed */}
                    <div className="text-center p-3 bg-white rounded-lg border">
                      <div className="text-2xl font-bold text-blue-600">
                        {completedSteps}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">Steps Completed</div>
                    </div>
 
                    {/* Progress percentage */}
                    <div className="text-center p-3 bg-white rounded-lg border">
                      <div className="text-2xl font-bold text-green-600">
                        {progress}%
                      </div>
                      <div className="text-xs text-gray-500 mt-1">Progress</div>
                    </div>
 
                    {/* Total validation checks */}
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
          </div>
        </TabsContent>
                {/* ==================================================================
            TAB 3: REVIEW
            🎯 CRITICAL TAB: Displays pre-check results and allows upgrade proceed
            This tab only becomes enabled when preCheckSummary state is set
            ================================================================== */}
        <TabsContent value="review">
          <div className="space-y-6 max-w-7xl">
 
            {/* ==============================================================
                CASE 1: Pre-check summary is available
                ============================================================== */}
            {preCheckSummary ? (
              <>
                {/* ==========================================================
                    SUMMARY HEADER CARD
                    Large visual summary with pass/fail status
                    ========================================================== */}
                <div className={`relative overflow-hidden rounded-xl border-2 p-8 ${
                  preCheckSummary.can_proceed
                    ? 'border-green-300 bg-gradient-to-br from-green-50 to-emerald-50'
                    : 'border-red-300 bg-gradient-to-br from-red-50 to-orange-50'
                }`}>
                  <div className="relative z-10">
                    <div className="flex items-start justify-between">
 
                      {/* Left side: Status message */}
                      <div className="flex items-start gap-4">
                        {/* Status icon */}
                        {preCheckSummary.can_proceed ? (
                          <div className="p-3 bg-green-100 rounded-full">
                            <CheckCircle className="h-10 w-10 text-green-600" />
                          </div>
                        ) : (
                          <div className="p-3 bg-red-100 rounded-full">
                            <XCircle className="h-10 w-10 text-red-600" />
                          </div>
                        )}
 
                        {/* Status text */}
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
 
                      {/* Right side: Circular progress indicator */}
                      <div className="hidden lg:flex flex-col items-center">
                        <div className="relative w-32 h-32">
                          {/* Background circle */}
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
                            {/* Progress circle */}
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
                          {/* Center text */}
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-3xl font-bold">
                              {Math.round((preCheckSummary.passed / preCheckSummary.total_checks) * 100)}%
                            </span>
                            <span className="text-xs text-gray-600">Success</span>
                          </div>
                        </div>
                      </div>
                    </div>
 
                    {/* =======================================================
                        STATISTICS GRID
                        ======================================================= */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                      {/* Total checks */}
                      <div className="bg-white/60 backdrop-blur-sm rounded-lg p-4 border border-white/40">
                        <div className="flex items-center gap-2 mb-1">
                          <CheckCircle className="h-4 w-4 text-blue-600" />
                          <span className="text-sm font-medium text-gray-600">Total Checks</span>
                        </div>
                        <div className="text-2xl font-bold text-blue-600">
                          {preCheckSummary.total_checks}
                        </div>
                      </div>
 
                      {/* Passed */}
                      <div className="bg-white/60 backdrop-blur-sm rounded-lg p-4 border border-white/40">
                        <div className="flex items-center gap-2 mb-1">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          <span className="text-sm font-medium text-gray-600">Passed</span>
                        </div>
                        <div className="text-2xl font-bold text-green-600">
                          {preCheckSummary.passed}
                        </div>
                      </div>
 
                      {/* Warnings */}
                      <div className="bg-white/60 backdrop-blur-sm rounded-lg p-4 border border-white/40">
                        <div className="flex items-center gap-2 mb-1">
                          <AlertTriangle className="h-4 w-4 text-orange-600" />
                          <span className="text-sm font-medium text-gray-600">Warnings</span>
                        </div>
                        <div className="text-2xl font-bold text-orange-600">
                          {preCheckSummary.warnings}
                        </div>
                      </div>
 
                      {/* Critical failures */}
                      <div className="bg-white/60 backdrop-blur-sm rounded-lg p-4 border border-white/40">
                        <div className="flex items-center gap-2 mb-1">
                          <XCircle className="h-4 w-4 text-red-600" />
                          <span className="text-sm font-medium text-gray-600">Critical</span>
                        </div>
                        <div className="text-2xl font-bold text-red-600">
                          {preCheckSummary.critical_failures}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
 
                {/* ==========================================================
                    DETAILED RESULTS - THREE COLUMN LAYOUT
                    Critical Issues | Warnings | Passed Checks
                    ========================================================== */}
                {(() => {
                  // Categorize results by severity
                  const criticalChecks = preCheckSummary.results.filter(r => r.severity === 'critical');
                  const warningChecks = preCheckSummary.results.filter(r => r.severity === 'warning');
                  const passedChecks = preCheckSummary.results.filter(r => r.severity === 'pass');
 
                  return (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
 
                      {/* ====================================================
                          COLUMN 1: CRITICAL ISSUES
                          ==================================================== */}
                      <Card className={criticalChecks.length > 0 ? "border-red-200 bg-red-50/50" : "border-gray-200"}>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2 text-lg">
                            <XCircle className="h-5 w-5 text-red-600" />
                            Critical Issues
                            <Badge variant="destructive" className="ml-auto">
                              {criticalChecks.length}
                            </Badge>
                          </CardTitle>
                          <CardDescription>
                            {criticalChecks.length > 0
                              ? 'Must be resolved before upgrade'
                              : 'No critical issues detected'}
                          </CardDescription>
                        </CardHeader>
 
                        <CardContent className="space-y-3">
                          {criticalChecks.length > 0 ? (
                            criticalChecks.map((result, index) => {
                              const IconComponent = PRE_CHECK_ICONS[result.check_name] || XCircle;
                              return (
                                <div
                                  key={index}
                                  className="bg-white rounded-lg p-4 border border-red-200 shadow-sm"
                                >
                                  <div className="flex items-start gap-3">
                                    <IconComponent className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <h4 className="font-semibold text-sm mb-1">
                                        {result.check_name}
                                      </h4>
                                      <p className="text-xs text-gray-700 mb-2">
                                        {result.message}
                                      </p>
                                      {/* Recommendation box */}
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
                            })
                          ) : (
                            /* Empty state - no critical issues */
                            <div className="text-center py-8 text-gray-500">
                              <CheckCircle className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                              <p className="text-sm">All critical checks passed</p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
 
                      {/* ====================================================
                          COLUMN 2: WARNINGS
                          ==================================================== */}
                      <Card className={warningChecks.length > 0 ? "border-orange-200 bg-orange-50/50" : "border-gray-200"}>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2 text-lg">
                            <AlertTriangle className="h-5 w-5 text-orange-600" />
                            Warnings
                            <Badge variant="secondary" className="ml-auto">
                              {warningChecks.length}
                            </Badge>
                          </CardTitle>
                          <CardDescription>
                            {warningChecks.length > 0
                              ? 'Review before proceeding'
                              : 'No warnings detected'}
                          </CardDescription>
                        </CardHeader>
 
                        <CardContent className="space-y-3">
                          {warningChecks.length > 0 ? (
                            warningChecks.map((result, index) => {
                              const IconComponent = PRE_CHECK_ICONS[result.check_name] || AlertTriangle;
                              return (
                                <div
                                  key={index}
                                  className="bg-white rounded-lg p-4 border border-orange-200 shadow-sm"
                                >
                                  <div className="flex items-start gap-3">
                                    <IconComponent className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <h4 className="font-semibold text-sm mb-1">
                                        {result.check_name}
                                      </h4>
                                      <p className="text-xs text-gray-700 mb-2">
                                        {result.message}
                                      </p>
                                      {/* Note box */}
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
                            })
                          ) : (
                            /* Empty state - no warnings */
                            <div className="text-center py-8 text-gray-500">
                              <CheckCircle className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                              <p className="text-sm">No warnings to review</p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
 
                      {/* ====================================================
                          COLUMN 3: PASSED CHECKS
                          ==================================================== */}
                      <Card className="border-green-200 bg-green-50/50">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2 text-lg">
                            <CheckCircle className="h-5 w-5 text-green-600" />
                            Passed Checks
                            <Badge variant="default" className="ml-auto bg-green-600">
                              {passedChecks.length}
                            </Badge>
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
                                <div
                                  key={index}
                                  className="bg-white rounded-lg p-3 border border-green-200 shadow-sm mb-2"
                                >
                                  <div className="flex items-center gap-3">
                                    <IconComponent className="h-4 w-4 text-green-600 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <h4 className="font-medium text-sm">
                                        {result.check_name}
                                      </h4>
                                      <p className="text-xs text-gray-600 truncate">
                                        {result.message}
                                      </p>
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
 
                {/* ==========================================================
                    ACTION CARD - PROCEED OR CANCEL
                    ========================================================== */}
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
 
                      {/* Decision message */}
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
 
                      {/* Action buttons */}
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
 
                    {/* Alert: Cannot proceed (critical failures) */}
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
 
                    {/* Alert: Can proceed but has warnings */}
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
 
              /* ==============================================================
                  CASE 2: No pre-check summary available (loading state)
                  ============================================================== */
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-12">
                    <Loader2 className="h-12 w-12 animate-spin mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground mb-4">
                      Loading pre-check results...
                    </p>
                    <p className="text-sm text-gray-500 mb-4">
                      If results don't appear, check the WebSocket Message Inspector in the Configuration tab
                    </p>
 
                    {/* Debug button for testing */}
                    <Button
                      onClick={forceReviewTab}
                      variant="outline"
                      className="mt-4"
                      size="sm"
                    >
                      <Bug className="h-3 w-3 mr-2" />
                      Debug: Force Load Test Results
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
                {/* ==================================================================
            TAB 4: RESULTS
            Final upgrade execution results and comprehensive summary
            ================================================================== */}
        <TabsContent value="results">
          <div className="space-y-6 max-w-6xl">
 
            {/* ==============================================================
                MAIN RESULTS CARD
                ============================================================== */}
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
 
            {/* ==============================================================
                PRE-CHECK VALIDATION SUMMARY
                Re-display pre-check results for reference
                ============================================================== */}
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
 
                  {/* Detailed pre-check results expandable section */}
                  {preCheckSummary.results && preCheckSummary.results.length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
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
 
            {/* ==============================================================
                SOFTWARE IMAGE DETAILS
                ============================================================== */}
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
 
            {/* ==============================================================
                EXECUTION DETAILS & CONFIGURATION
                Two-column grid layout
                ============================================================== */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 
              {/* EXECUTION DETAILS */}
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
 
              {/* CONFIGURATION SUMMARY */}
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
 
            {/* ==============================================================
                STATISTICS CARD (if available)
                ============================================================== */}
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
 
            {/* ==============================================================
                FINAL RESULTS DEBUG CARD (Development Only)
                Shows raw JSON response for debugging
                ============================================================== */}
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
 
            {/* ==============================================================
                ACTION BUTTONS - START NEW UPGRADE
                ============================================================== */}
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
                      onClick={() => setActiveTab("execute")}
                      variant="outline"
                      size="lg"
                    >
                      <Terminal className="h-4 w-4 mr-2" />
                      View Logs
                    </Button>
 
                    {/* Start new upgrade button */}
                    <Button
                      onClick={resetWorkflow}
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
 
            {/* ==============================================================
                JOB OUTPUT VIEWER (Optional - for detailed troubleshooting)
                ============================================================== */}
            {showTechnicalDetails && jobOutput.length > 0 && (
              <Card className="border-gray-300">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Terminal className="h-4 w-4" />
                    Complete Job Output Log
                  </CardTitle>
                  <CardDescription>
                    Full execution log with all events and messages
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-96">
                    <div className="space-y-1 font-mono text-xs">
                      {jobOutput.map((log, index) => (
                        <div
                          key={index}
                          className={`p-2 rounded ${
                            log.level === 'error' ? 'bg-red-50 text-red-800' :
                            log.level === 'warning' ? 'bg-orange-50 text-orange-800' :
                            log.level === 'info' ? 'bg-blue-50 text-blue-800' :
                            'bg-gray-50 text-gray-800'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <span className="text-gray-500 text-xs">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {log.event_type || log.level}
                            </Badge>
                            <span className="flex-1">{log.message}</span>
                          </div>
                        </div>
                      ))}
                    </div>
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
 
// ============================================================================
// END OF COMPONENT
// ============================================================================
 
/**
 * =============================================================================
 * IMPLEMENTATION NOTES FOR v4.6.0
 * =============================================================================
 *
 * 🎯 KEY FIXES IMPLEMENTED:
 *
 * 1. ROBUST JSON EXTRACTION:
 *    - Brace-counting algorithm handles nested JSON in log messages
 *    - String escape handling prevents false matches
 *    - Handles trailing text after JSON objects
 *
 * 2. ENHANCED ERROR VISIBILITY:
 *    - Parse errors now appear in job output
 *    - WebSocket Message Inspector shows all raw messages
 *    - Debug panel provides real-time state information
 *
 * 3. CRITICAL EVENT PRESERVATION:
 *    - shouldFilterMessage never filters PRE_CHECK_EVENT
 *    - PRE_CHECK_COMPLETE always processed
 *    - OPERATION_COMPLETE handled correctly
 *
 * 4. REVIEW TAB ENABLEMENT:
 *    - preCheckSummary state is the single source of truth
 *    - State set immediately when PRE_CHECK_COMPLETE arrives
 *    - Fallback extraction from OPERATION_COMPLETE
 *
 * 5. COMPREHENSIVE DEBUGGING:
 *    - Raw WebSocket messages logged to separate array
 *    - State logging utility for troubleshooting
 *    - Force review tab function for testing
 *    - Message inspector with event detection
 *
 * =============================================================================
 * TROUBLESHOOTING GUIDE:
 * =============================================================================
 *
 * If Review Tab Doesn't Appear:
 * 1. Check WebSocket Message Inspector for PRE_CHECK_EVENT messages
 * 2. Use "Log Current State" to verify preCheckSummary is null
 * 3. Check browser console for [NESTED_EXTRACTION] errors
 * 4. Verify WebSocket connection status
 * 5. Use "Force Review Tab" to test UI rendering
 *
 * Expected Console Output for Successful Pre-Check:
 * [WEBSOCKET_RAW] New message received
 * [WEBSOCKET_PARSED] Successfully parsed message structure
 * [NESTED_EXTRACTION] Found PRE_CHECK_EVENT in message
 * [NESTED_EXTRACTION] SUCCESS: Extracted PRE_CHECK_EVENT data
 * [PRE_CHECK] PRE_CHECK_COMPLETE EVENT DETECTED
 * [PRE_CHECK] SUCCESS: Summary extracted
 * [TAB_TRANSITION] Executing transition to REVIEW tab
 *
 * =============================================================================
 * MAINTENANCE NOTES:
 * =============================================================================
 *
 * When updating this component:
 * - Never modify shouldFilterMessage to filter critical events
 * - Preserve extractNestedProgressData brace-counting logic
 * - Keep Debug Panel and Message Inspector for troubleshooting
 * - Maintain comprehensive console logging
 * - Test with actual WebSocket messages from backend
 *
 * =============================================================================
 */