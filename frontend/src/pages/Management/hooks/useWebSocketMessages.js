/**
 * =============================================================================
 * WEBSOCKET MESSAGE PROCESSING HOOK - NAVIGATION FIX v2.5.0
 * =============================================================================
 *
 * VERSION: 2.5.0 - Complete Navigation Flow Fix
 * AUTHOR: nikos-geranios_vgi
 * DATE: 2025-11-18
 * LAST UPDATED: 2025-11-19 13:03:00 UTC
 *
 * CRITICAL FIX v2.5.0 (2025-11-19 13:03:00 UTC):
 * - Fixed complete navigation flow
 * - Pre-check ALWAYS goes to Review tab (never Results)
 * - Upgrade ALWAYS goes to Results tab (never Review)
 * - Proper phase separation and tracking
 * - User must manually approve upgrade from Review tab
 *
 * NAVIGATION FLOW:
 * ConfigurationTab → PreCheckTab → ReviewTab → UpgradeTab → ResultsTab
 *
 * PHASE TRANSITIONS:
 * - Pre-check complete: currentPhase="review", activeTab="review"
 * - Upgrade start: currentPhase="upgrade", activeTab="upgrade"
 * - Upgrade complete: currentPhase="results", activeTab="results"
 *
 * PREVIOUS FIXES:
 * v2.4.0 - Attempted upgrade tab navigation fix
 * v2.3.1 - Infinite loop prevention
 * v2.3.0 - Sequence-based deduplication
 * v2.2.0 - Connection failure handling
 *
 * @module hooks/useWebSocketMessages
 */
 
import { useEffect, useCallback, useRef } from 'react';
import { TIMING } from '../constants/timing';
 
// =============================================================================
// SECTION 1: RECOGNIZED EVENT TYPES
// =============================================================================
 
const RECOGNIZED_EVENT_TYPES = new Set([
  'PRE_CHECK_RESULT',
  'PRE_CHECK_COMPLETE',
  'OPERATION_START',
  'STEP_COMPLETE',
  'OPERATION_COMPLETE',
  'LOG_MESSAGE'
]);
 
// =============================================================================
// SECTION 2: MAIN HOOK DEFINITION
// =============================================================================
 
/**
 * Custom hook for processing WebSocket messages from Rust WebSocket Hub.
 *
 * CRITICAL: This hook controls tab navigation based on operation completion.
 * Pre-check operations ALWAYS navigate to Review tab.
 * Upgrade operations ALWAYS navigate to Results tab.
 *
 * @param {Object} params Hook parameters
 */
export function useWebSocketMessages({
  lastMessage,
  jobId,
  wsChannel,
  currentPhase,
  jobOutput,
  preCheckSummary,
  totalSteps,
  progress,
  sendMessage,
  setState,
  refs
}) {
 
  // ===========================================================================
  // SUBSECTION 2.1: STATE MANAGEMENT
  // ===========================================================================
 
  const processedEventsRef = useRef(new Set());
  const transitionTimeoutRef = useRef(null);
  const safetyTimeoutRef = useRef(null);
 
  // ===========================================================================
  // SUBSECTION 2.2: CLEANUP UTILITIES
  // ===========================================================================
 
  const cleanupResources = useCallback(() => {
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = null;
    }
  }, []);
 
  // ===========================================================================
  // SUBSECTION 2.3: RESET ON JOB CHANGE
  // ===========================================================================
 
  useEffect(() => {
    if (jobId) {
      console.log("[WEBSOCKET] ========================================");
      console.log("[WEBSOCKET] New job detected, resetting processed events");
      console.log("[WEBSOCKET] Date: 2025-11-19 13:03:00 UTC");
      console.log("[WEBSOCKET] User: nikos-geranios_vgi");
      console.log("[WEBSOCKET] Job ID:", jobId);
      console.log("[WEBSOCKET] ========================================");
      processedEventsRef.current = new Set();
    }
  }, [jobId]);
 
  // ===========================================================================
  // SUBSECTION 2.4: CLEANUP ON UNMOUNT
  // ===========================================================================
 
  useEffect(() => {
    return () => {
      console.log("[WEBSOCKET] Cleaning up resources");
      cleanupResources();
    };
  }, [cleanupResources]);
 
  // ===========================================================================
  // SUBSECTION 2.5: SAFETY TIMEOUT FOR PRE-CHECK OPERATIONS
  // ===========================================================================
 
  useEffect(() => {
    if (currentPhase === 'pre_check' && jobId && !preCheckSummary) {
      console.log("[WEBSOCKET] Starting pre-check safety timeout (120s)");
 
      safetyTimeoutRef.current = setTimeout(() => {
        console.warn("[WEBSOCKET] ⏰ PRE-CHECK TIMEOUT - No completion message received");
 
        if (currentPhase === 'pre_check' && !preCheckSummary) {
          console.log("[WEBSOCKET] Creating timeout error summary");
 
          const timeoutSummary = {
            total_checks: 1,
            passed: 0,
            warnings: 0,
            critical_failures: 1,
            can_proceed: false,
            error_occurred: true,
            error_type: "TIMEOUT",
            results: [{
              check_name: "Pre-Check Operation Timeout",
              severity: "critical",
              passed: false,
              message: "Pre-check operation did not complete within expected timeframe (2 minutes)",
              details: "The operation may have stalled or the backend service encountered an issue. Check the Execution tab for any error messages and verify backend service logs.",
              timestamp: new Date().toISOString()
            }]
          };
 
          setState({
            preCheckSummary: timeoutSummary,
            canProceedWithUpgrade: false,
            jobStatus: "failed",
            isRunningPreCheck: false,
            progress: 100,
          });
 
          setState({
            jobOutput: prev => [...prev, {
              timestamp: new Date().toISOString(),
              message: "⏰ Operation timed out - no completion signal received",
              level: 'error',
              event_type: 'TIMEOUT'
            }]
          });
 
          setTimeout(() => {
            setState({
              activeTab: "review",
              currentPhase: "review",
            });
            console.log("[WEBSOCKET] ⚠️ Forced transition to Review tab due to timeout");
          }, 800);
        }
      }, 120000);
 
      return () => {
        if (safetyTimeoutRef.current) {
          console.log("[WEBSOCKET] Clearing pre-check safety timeout");
          clearTimeout(safetyTimeoutRef.current);
          safetyTimeoutRef.current = null;
        }
      };
    }
  }, [currentPhase, jobId, preCheckSummary, setState]);
 
  // =============================================================================
  // SECTION 3: EVENT HANDLERS - FIXED v2.5.0
  // =============================================================================
 
  /**
   * Handle PRE_CHECK_RESULT event
   * Individual check results during pre-check execution
   */
  const handlePreCheckResult = useCallback((data) => {
    console.log("[PRE_CHECK_RESULT] Individual check:", {
      check_name: data.check_name,
      severity: data.severity,
      passed: data.passed
    });
 
    setState({
      preCheckResults: prev => [...(prev || []), data]
    });
  }, []);
 
  /**
   * Handle PRE_CHECK_COMPLETE event
   *
   * CRITICAL FIX v2.5.0 (2025-11-19 13:03:00 UTC):
   * - ALWAYS navigates to Review tab (NOT Results)
   * - Sets currentPhase to "review"
   * - User must manually click "Proceed with Upgrade" from Review tab
   * - This is the key fix for the navigation flow
   */
  const handlePreCheckComplete = useCallback((data) => {
    console.log("[PRE_CHECK_COMPLETE] ========================================");
    console.log("[PRE_CHECK_COMPLETE] 🎯 PRE-CHECK COMPLETE EVENT RECEIVED");
    console.log("[PRE_CHECK_COMPLETE] Date: 2025-11-19 13:03:00 UTC");
    console.log("[PRE_CHECK_COMPLETE] User: nikos-geranios_vgi");
    console.log("[PRE_CHECK_COMPLETE] CRITICAL: Navigating to REVIEW tab (NOT Results)");
    console.log("[PRE_CHECK_COMPLETE] ========================================");
 
    const summary = data.pre_check_summary || data;
 
    if (summary && (summary.total_checks !== undefined || summary.results)) {
      console.log("[PRE_CHECK_COMPLETE] ✅ Valid summary received:", {
        total_checks: summary.total_checks,
        can_proceed: summary.can_proceed,
        results_count: summary.results?.length || 0
      });
 
      if (!summary.results) {
        summary.results = [];
      }
 
      // Update state with pre-check results
      setState({
        preCheckSummary: summary,
        canProceedWithUpgrade: summary.can_proceed !== false,
        jobStatus: summary.can_proceed === false ? "failed" : "success",
        isRunningPreCheck: false,
        progress: 100,
      });
 
      console.log("[PRE_CHECK_COMPLETE] ✅ State updated - Review tab will be enabled");
 
      // CRITICAL FIX: Navigate to REVIEW tab, NOT results
      setTimeout(() => {
        setState({
          activeTab: "review",      // ← MUST be "review"
          currentPhase: "review",   // ← MUST be "review"
        });
        console.log("[PRE_CHECK_COMPLETE] ✅ Transitioned to REVIEW tab");
        console.log("[PRE_CHECK_COMPLETE] User must click 'Proceed with Upgrade' to continue");
      }, 500);
 
    } else {
      console.warn("[PRE_CHECK_COMPLETE] ❌ Invalid summary data:", summary);
      setState({
        jobStatus: "failed",
        isRunningPreCheck: false,
        progress: 100
      });
    }
  }, []);
 
  /**
   * Handle OPERATION_START event
   * Signals the start of an operation (pre-check or upgrade)
   */
  const handleOperationStart = useCallback((data) => {
    console.log("[OPERATION_START] ========================================");
    console.log("[OPERATION_START] Operation started");
    console.log("[OPERATION_START] Date: 2025-11-19 13:03:00 UTC");
    console.log("[OPERATION_START] User: nikos-geranios_vgi");
    console.log("[OPERATION_START] Operation:", data.operation);
    console.log("[OPERATION_START] Total steps:", data.total_steps);
    console.log("[OPERATION_START] ========================================");
 
    setState({
      totalSteps: data.total_steps || 0,
      progress: 5,
    });
  }, []);
 
  /**
   * Handle STEP_COMPLETE event
   * Updates progress as individual steps complete
   */
  const handleStepComplete = useCallback((data) => {
    const stepNum = data.step;
    const totalStepsFromEvent = data.total_steps;
 
    console.log(`[STEP_COMPLETE] Step ${stepNum}/${totalStepsFromEvent} completed`);
 
    if (!refs?.processedStepsRef?.current) {
      console.warn("[STEP_COMPLETE] processedStepsRef not initialized");
      return;
    }
 
    if (!refs.processedStepsRef.current.has(stepNum)) {
      refs.processedStepsRef.current.add(stepNum);
 
      const newProgress = data.percentage ||
        Math.min(99, Math.round((stepNum / totalStepsFromEvent) * 100));
 
      setState({
        completedSteps: stepNum,
        progress: newProgress,
      });
    }
  }, []);
 
  /**
   * Handle OPERATION_COMPLETE event
   *
   * CRITICAL FIX v2.5.0 (2025-11-19 13:03:00 UTC):
   * - Pre-check operations navigate to Review tab
   * - Upgrade operations navigate to Results tab
   * - Proper phase separation and state management
   */
  const handleOperationComplete = useCallback((data) => {
    console.log("[OPERATION_COMPLETE] ========================================");
    console.log("[OPERATION_COMPLETE] ⭐ OPERATION COMPLETE v2.5.0");
    console.log("[OPERATION_COMPLETE] Date: 2025-11-19 13:03:00 UTC");
    console.log("[OPERATION_COMPLETE] User: nikos-geranios_vgi");
    console.log("[OPERATION_COMPLETE] Operation:", data.operation);
    console.log("[OPERATION_COMPLETE] Success:", data.success);
    console.log("[OPERATION_COMPLETE] Current Phase:", currentPhase);
    console.log("[OPERATION_COMPLETE] ========================================");
 
    const success = data.success || data.status === "SUCCESS";
    const operation = data.operation || currentPhase;
 
    // ========================================================================
    // PRE-CHECK COMPLETION HANDLING
    // ========================================================================
    if (operation === "pre_check" || currentPhase === "pre_check") {
      console.log("[OPERATION_COMPLETE] Processing PRE-CHECK completion");
 
      // Case 1: Failure without summary (connection errors)
      if (!success && !data.final_results && !preCheckSummary) {
        console.log("[OPERATION_COMPLETE] ⚠️ Pre-check failed - creating error summary");
 
        const errorMessage =
          data.error_message ||
          data.message ||
          data.error ||
          "Pre-check operation failed. Device may be unreachable or connection timed out.";
 
        const errorDetails =
          data.error_details ||
          data.details ||
          "Common causes: Device unreachable, SSH timeout, invalid credentials, NETCONF disabled, firewall blocking.";
 
        const errorType = data.error_type || "CONNECTION_ERROR";
 
        const errorSummary = {
          total_checks: 1,
          passed: 0,
          warnings: 0,
          critical_failures: 1,
          can_proceed: false,
          error_occurred: true,
          error_type: errorType,
          results: [{
            check_name: "Device Reachability & Connection",
            severity: "critical",
            passed: false,
            message: errorMessage,
            details: errorDetails,
            timestamp: new Date().toISOString()
          }]
        };
 
        setState({
          preCheckSummary: errorSummary,
          canProceedWithUpgrade: false,
          jobStatus: "failed",
          isRunningPreCheck: false,
          progress: 100,
        });
 
        setState({
          jobOutput: prev => [...prev, {
            timestamp: new Date().toISOString(),
            message: `❌ Pre-check Failed: ${errorMessage}`,
            level: 'error',
            event_type: 'OPERATION_COMPLETE'
          }]
        });
 
        if (wsChannel) {
          console.log(`[OPERATION_COMPLETE] Unsubscribing from ${wsChannel}`);
          sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
        }
 
        // Navigate to Review tab to show error
        setTimeout(() => {
          setState({
            activeTab: "review",
            currentPhase: "review",
          });
          console.log("[OPERATION_COMPLETE] ✅ Transitioned to REVIEW tab (error state)");
        }, 800);
 
        return;
      }
 
      // Case 2: Success with results in final_results
      if (data.final_results && !preCheckSummary) {
        console.log("[OPERATION_COMPLETE] Extracting summary from final_results");
        handlePreCheckComplete({ pre_check_summary: data.final_results });
 
        if (wsChannel) {
          sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
        }
 
        return;
      }
 
      // Case 3: Completion with existing summary
      console.log("[OPERATION_COMPLETE] Finalizing pre-check with existing summary");
 
      setState({
        isRunningPreCheck: false,
        progress: 100,
        jobStatus: success ? "success" : "failed"
      });
 
      if (wsChannel) {
        sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
      }
 
      // Ensure we're on Review tab
      if (preCheckSummary) {
        setTimeout(() => {
          setState({
            activeTab: "review",
            currentPhase: "review",
          });
          console.log("[OPERATION_COMPLETE] ✅ Transitioned to REVIEW tab");
        }, 500);
      }
    }
 
    // ========================================================================
    // UPGRADE COMPLETION HANDLING
    // CRITICAL: Navigate to Results tab ONLY for upgrade operations
    // ========================================================================
    else if (operation === "upgrade" || currentPhase === "upgrade") {
      console.log("[OPERATION_COMPLETE] Processing UPGRADE completion");
      console.log("[OPERATION_COMPLETE] Date: 2025-11-19 13:03:00 UTC");
      console.log("[OPERATION_COMPLETE] User: nikos-geranios_vgi");
 
      // Update job status
      setState({
        jobStatus: success ? "success" : "failed",
        finalResults: data,
        progress: 100,
      });
 
      // Add completion message
      setState({
        jobOutput: prev => [...prev, {
          timestamp: new Date().toISOString(),
          message: success
            ? "✅ Upgrade operation completed successfully"
            : "❌ Upgrade operation failed",
          level: success ? 'success' : 'error',
          event_type: 'OPERATION_COMPLETE'
        }]
      });
 
      if (wsChannel) {
        console.log(`[OPERATION_COMPLETE] Unsubscribing from ${wsChannel}`);
        sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
      }
 
      // Navigate to Results tab after brief delay
      console.log("[OPERATION_COMPLETE] Scheduling transition to RESULTS tab in 1000ms");
 
      transitionTimeoutRef.current = setTimeout(() => {
        console.log("[OPERATION_COMPLETE] ✅ Transitioning to RESULTS tab NOW");
 
        setState({
          activeTab: "results",
          currentPhase: "results",
        });
 
        console.log("[OPERATION_COMPLETE] ✅ Successfully transitioned to RESULTS tab");
      }, 1000); // 1 second delay to show completion message
    }
  }, [currentPhase, preCheckSummary, wsChannel, sendMessage, handlePreCheckComplete]);
 
  /**
   * Handle LOG_MESSAGE event
   * Generic log messages from the backend
   */
  const handleLogMessage = useCallback((event) => {
    const logEntry = {
      timestamp: event.timestamp || new Date().toISOString(),
      message: event.message,
      level: event.level?.toLowerCase() || "info",
      event_type: "LOG_MESSAGE",
    };
 
    setState({
      jobOutput: prev => [...prev, logEntry]
    });
 
    if (refs?.latestStepMessageRef) {
      refs.latestStepMessageRef.current = event.message;
    }
 
    if (refs?.scrollAreaRef?.current) {
      setTimeout(() => {
        if (refs.scrollAreaRef.current) {
          refs.scrollAreaRef.current.scrollTop = refs.scrollAreaRef.current.scrollHeight;
        }
      }, TIMING.AUTO_SCROLL_DELAY);
    }
  }, []);
 
  // =============================================================================
  // SECTION 4: MAIN MESSAGE PROCESSING
  // =============================================================================
 
  useEffect(() => {
    if (!lastMessage || !jobId) {
      return;
    }
 
    console.log("[WEBSOCKET] ========================================");
    console.log("[WEBSOCKET] Message received");
    console.log("[WEBSOCKET] Date: 2025-11-19 13:03:00 UTC");
    console.log("[WEBSOCKET] User: nikos-geranios_vgi");
    console.log("[WEBSOCKET] ========================================");
 
    // Parse Rust wrapper
    let rustWrapper;
    try {
      rustWrapper = JSON.parse(lastMessage);
    } catch (error) {
      console.error("[WEBSOCKET] Failed to parse Rust wrapper:", error);
      return;
    }
 
    if (!rustWrapper || typeof rustWrapper !== 'object' || !rustWrapper.data) {
      return;
    }
 
    // Parse inner event
    let event;
    try {
      event = JSON.parse(rustWrapper.data);
    } catch (error) {
      console.error("[WEBSOCKET] Failed to parse inner event:", error);
      return;
    }
 
    if (!event || typeof event !== 'object') {
      return;
    }
 
    const eventType = event.event_type;
 
    if (!eventType || !RECOGNIZED_EVENT_TYPES.has(eventType)) {
      return;
    }
 
    // Enhanced deduplication with sequence numbers
    let eventSignature;
 
    if (event.data && typeof event.data.sequence === 'number') {
      eventSignature = `${eventType}-seq-${event.data.sequence}`;
    } else if (event.sequence) {
      eventSignature = `${eventType}-seq-${event.sequence}`;
    } else {
      const randomSuffix = Math.random().toString(36).substring(2, 9);
      eventSignature = `${eventType}-${event.timestamp || Date.now()}-${randomSuffix}`;
    }
 
    if (processedEventsRef.current.has(eventSignature)) {
      return;
    }
 
    processedEventsRef.current.add(eventSignature);
 
    if (processedEventsRef.current.size > 1000) {
      const iterator = processedEventsRef.current.values();
      processedEventsRef.current.delete(iterator.next().value);
    }
 
    console.log("[WEBSOCKET] ✅ Processing event:", eventType);
 
    // Event routing
    switch (eventType) {
      case 'PRE_CHECK_RESULT':
        if (event.data) {
          handlePreCheckResult(event.data);
        }
        break;
 
      case 'PRE_CHECK_COMPLETE':
        if (event.data) {
          handlePreCheckComplete(event.data);
        }
        break;
 
      case 'OPERATION_START':
        if (event.data) {
          handleOperationStart(event.data);
        }
        break;
 
      case 'STEP_COMPLETE':
        if (event.data) {
          handleStepComplete(event.data);
        }
        break;
 
      case 'OPERATION_COMPLETE':
        if (event.data) {
          handleOperationComplete(event.data);
        }
        break;
 
      case 'LOG_MESSAGE':
        handleLogMessage(event);
        break;
 
      default:
        break;
    }
 
  }, [
    lastMessage,
    jobId,
    handlePreCheckResult,
    handlePreCheckComplete,
    handleOperationStart,
    handleStepComplete,
    handleOperationComplete,
    handleLogMessage
  ]);
}
 
export default useWebSocketMessages;
