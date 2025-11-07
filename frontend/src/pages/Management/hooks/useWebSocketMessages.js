/**
 * =============================================================================
 * WEBSOCKET MESSAGE PROCESSING HOOK - RUST WEBSOCKET COMPATIBLE
 * =============================================================================
 *
 * VERSION: 2.1.0 - Rust WebSocket Integration
 * AUTHOR: nikos-geranios_vgi
 * DATE: 2025-11-07
 *
 * ARCHITECTURE:
 * - Rust WebSocket sends: {"channel": "ws_channel:job:UUID", "data": "{...}"}
 * - This hook unwraps the outer structure and processes the inner event
 * - Backend events are clean JSON in the "data" field
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

  // ===========================================================================
  // SUBSECTION 2.2: CLEANUP UTILITIES
  // ===========================================================================

  const cleanupResources = useCallback(() => {
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }
  }, []);

  // ===========================================================================
  // SUBSECTION 2.3: RESET ON JOB CHANGE
  // ===========================================================================

  useEffect(() => {
    if (jobId) {
      console.log("[WEBSOCKET] New job detected, resetting processed events");
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

  // =============================================================================
  // SECTION 3: EVENT HANDLERS
  // =============================================================================

  /**
   * Handle PRE_CHECK_RESULT event
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
  }, [setState]);

  /**
   * Handle PRE_CHECK_COMPLETE event - CRITICAL for Review tab
   */
  const handlePreCheckComplete = useCallback((data) => {
    console.log("[PRE_CHECK_COMPLETE] ========================================");
    console.log("[PRE_CHECK_COMPLETE] 🎯 PRE-CHECK COMPLETE EVENT RECEIVED");
    console.log("[PRE_CHECK_COMPLETE] Enabling Review Tab");
    console.log("[PRE_CHECK_COMPLETE] ========================================");

    const summary = data.pre_check_summary || data;

    if (summary && (summary.total_checks !== undefined || summary.results)) {
      console.log("[PRE_CHECK_COMPLETE] ✅ Valid summary:", {
        total_checks: summary.total_checks,
        can_proceed: summary.can_proceed,
        results_count: summary.results?.length || 0
      });

      if (!summary.results) {
        summary.results = [];
      }

      setState({
        preCheckSummary: summary,
        canProceedWithUpgrade: summary.can_proceed !== false,
        jobStatus: summary.can_proceed === false ? "failed" : "success",
        isRunningPreCheck: false,
        progress: 100,
      });

      console.log("[PRE_CHECK_COMPLETE] ✅ State updated - Review tab enabled");

      setTimeout(() => {
        setState({
          activeTab: "review",
          currentPhase: "review",
        });
        console.log("[PRE_CHECK_COMPLETE] ✅ Transitioned to Review tab");
      }, 500);

    } else {
      console.warn("[PRE_CHECK_COMPLETE] ❌ Invalid summary data:", summary);
      setState({
        jobStatus: "failed",
        isRunningPreCheck: false,
        progress: 100
      });
    }
  }, [setState]);

  /**
   * Handle OPERATION_START event
   */
  const handleOperationStart = useCallback((data) => {
    console.log("[OPERATION_START] Operation started:", {
      operation: data.operation,
      total_steps: data.total_steps
    });

    setState({
      totalSteps: data.total_steps || 0,
      progress: 5,
    });
  }, [setState]);

  /**
   * Handle STEP_COMPLETE event
   */
  const handleStepComplete = useCallback((data) => {
    const stepNum = data.step;

    if (!refs?.processedStepsRef?.current) {
      console.warn("[STEP_COMPLETE] processedStepsRef not initialized");
      return;
    }

    if (!refs.processedStepsRef.current.has(stepNum)) {
      refs.processedStepsRef.current.add(stepNum);
      console.log(`[STEP_COMPLETE] Step ${stepNum}/${data.total_steps} completed`);

      setState(prevState => {
        const newCompleted = prevState.completedSteps + 1;
        const newProgress = data.percentage ||
          Math.min(99, Math.round((newCompleted / prevState.totalSteps) * 100));

        return {
          completedSteps: newCompleted,
          progress: newProgress,
        };
      });
    }
  }, [setState, refs]);

  /**
   * Handle OPERATION_COMPLETE event
   */
  const handleOperationComplete = useCallback((data) => {
    console.log("[OPERATION_COMPLETE] ========================================");
    console.log("[OPERATION_COMPLETE] ⭐ OPERATION COMPLETE");
    console.log("[OPERATION_COMPLETE] Status:", data.status);
    console.log("[OPERATION_COMPLETE] Operation:", data.operation);
    console.log("[OPERATION_COMPLETE] Success:", data.success);
    console.log("[OPERATION_COMPLETE] ========================================");

    const success = data.success || data.status === "SUCCESS";
    const operation = data.operation || currentPhase;

    if (operation === "pre_check" && currentPhase === "pre_check") {
      console.log("[OPERATION_COMPLETE] Finalizing pre-check operation");

      if (data.final_results && !preCheckSummary) {
        console.log("[OPERATION_COMPLETE] Extracting summary from final_results");
        handlePreCheckComplete({ pre_check_summary: data.final_results });
      }

      setState({
        isRunningPreCheck: false,
        progress: 100,
        jobStatus: success ? "success" : "failed"
      });

      if (wsChannel) {
        console.log(`[OPERATION_COMPLETE] Unsubscribing from ${wsChannel}`);
        sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
      }

    } else if (operation === "upgrade" && currentPhase === "upgrade") {
      console.log("[OPERATION_COMPLETE] Finalizing upgrade operation");

      setState({
        jobStatus: success ? "success" : "failed",
        finalResults: data,
        progress: 100,
      });

      if (wsChannel) {
        sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
      }

      transitionTimeoutRef.current = setTimeout(() => {
        setState({
          activeTab: "results",
          currentPhase: "results",
        });
        console.log("[OPERATION_COMPLETE] ✅ Transitioned to Results tab");
      }, TIMING.TAB_TRANSITION_DELAY);
    }
  }, [currentPhase, preCheckSummary, wsChannel, sendMessage, setState, handlePreCheckComplete]);

  /**
   * Handle LOG_MESSAGE event
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
  }, [setState, refs]);

  // =============================================================================
  // SECTION 4: MAIN MESSAGE PROCESSING
  // =============================================================================

  useEffect(() => {
    // ===========================================================================
    // SUBSECTION 4.1: VALIDATION
    // ===========================================================================

    if (!lastMessage || !jobId) {
      return;
    }

    console.log("[WEBSOCKET] ========================================");
    console.log("[WEBSOCKET] Raw message received");
    console.log("[WEBSOCKET] Length:", lastMessage.length);
    console.log("[WEBSOCKET] Preview:", lastMessage.substring(0, 300));
    console.log("[WEBSOCKET] ========================================");

    // ===========================================================================
    // SUBSECTION 4.2: PARSE RUST WEBSOCKET WRAPPER
    // ===========================================================================

    let rustWrapper;
    try {
      rustWrapper = JSON.parse(lastMessage);
    } catch (error) {
      console.error("[WEBSOCKET] Failed to parse Rust wrapper:", error);
      console.debug("[WEBSOCKET] Raw:", lastMessage.substring(0, 200));
      return;
    }

    // Validate Rust wrapper structure
    if (!rustWrapper || typeof rustWrapper !== 'object') {
      console.debug("[WEBSOCKET] Invalid Rust wrapper structure");
      return;
    }

    console.log("[WEBSOCKET] Rust wrapper parsed:", {
      channel: rustWrapper.channel,
      has_data: !!rustWrapper.data,
      data_length: rustWrapper.data?.length
    });

    // ===========================================================================
    // SUBSECTION 4.3: EXTRACT INNER EVENT FROM DATA FIELD
    // ===========================================================================

    // The actual event JSON is in the "data" field as a string
    if (!rustWrapper.data) {
      console.debug("[WEBSOCKET] No data field in Rust wrapper");
      return;
    }

    let event;
    try {
      // Parse the inner event JSON from the data string
      event = JSON.parse(rustWrapper.data);
    } catch (error) {
      console.error("[WEBSOCKET] Failed to parse inner event:", error);
      console.debug("[WEBSOCKET] Data field:", rustWrapper.data.substring(0, 200));
      return;
    }

    // ===========================================================================
    // SUBSECTION 4.4: VALIDATE EVENT STRUCTURE
    // ===========================================================================

    if (!event || typeof event !== 'object') {
      console.debug("[WEBSOCKET] Invalid event structure");
      return;
    }

    const eventType = event.event_type;

    if (!eventType) {
      console.debug("[WEBSOCKET] No event_type found");
      return;
    }

    if (!RECOGNIZED_EVENT_TYPES.has(eventType)) {
      console.debug("[WEBSOCKET] Unrecognized event type:", eventType);
      return;
    }

    // ===========================================================================
    // SUBSECTION 4.5: DEDUPLICATION
    // ===========================================================================

    const eventSignature = `${eventType}-${event.timestamp || Date.now()}`;

    if (processedEventsRef.current.has(eventSignature)) {
      console.debug("[WEBSOCKET] Duplicate event ignored:", eventSignature);
      return;
    }

    processedEventsRef.current.add(eventSignature);

    if (processedEventsRef.current.size > 1000) {
      const iterator = processedEventsRef.current.values();
      processedEventsRef.current.delete(iterator.next().value);
    }

    // ===========================================================================
    // SUBSECTION 4.6: LOGGING
    // ===========================================================================

    console.log("[WEBSOCKET] ✅ Event extracted and validated:", {
      type: eventType,
      job: event.job_id,
      level: event.level,
      has_data: !!event.data,
      channel: rustWrapper.channel
    });

    // ===========================================================================
    // SUBSECTION 4.7: EVENT ROUTING
    // ===========================================================================

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
        console.debug("[WEBSOCKET] Unhandled event type:", eventType);
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
