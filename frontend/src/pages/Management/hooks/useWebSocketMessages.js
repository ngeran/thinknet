/**
 * =============================================================================
 * WEBSOCKET MESSAGE PROCESSING HOOK - RUST WEBSOCKET COMPATIBLE
 * =============================================================================
 *
 * VERSION: 2.2.0 - Enhanced Error Handling for Reachability Failures
 * AUTHOR: nikos
 * DATE: 2025-11-05
 * LAST UPDATED: 2025-11-10
 *
 * ARCHITECTURE:
 * - Rust WebSocket sends: {"channel": "ws_channel:job:UUID", "data": "{...}"}
 * - This hook unwraps the outer structure and processes the inner event
 * - Backend events are clean JSON in the "data" field
 *
 * CRITICAL FIXES (v2.2.0):
 * - Enhanced OPERATION_COMPLETE to handle reachability failures
 * - Added synthetic error summary creation for connection failures
 * - Implemented automatic transition to Review tab on failures
 * - Added safety timeout to prevent infinite loading states
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

  // ===========================================================================
  // SUBSECTION 2.5: SAFETY TIMEOUT FOR PRE-CHECK OPERATIONS
  // ===========================================================================

  /**
   * Safety timeout mechanism to prevent infinite loading states.
   * Forces error state if no completion message received within 2 minutes.
   *
   * This handles cases where:
   * - Backend crashes without sending completion
   * - Network connection drops mid-operation
   * - Messages are lost in transit
   */
  useEffect(() => {
    if (currentPhase === 'pre_check' && jobId && !preCheckSummary) {
      console.log("[WEBSOCKET] Starting pre-check safety timeout (120s)");

      safetyTimeoutRef.current = setTimeout(() => {
        console.warn("[WEBSOCKET] ⏰ PRE-CHECK TIMEOUT - No completion message received");

        // Double-check we're still waiting for results
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

          // Add timeout message to job output
          setState({
            jobOutput: prev => [...prev, {
              timestamp: new Date().toISOString(),
              message: "⏰ Operation timed out - no completion signal received",
              level: 'error',
              event_type: 'TIMEOUT'
            }]
          });

          // Transition to Review tab
          setTimeout(() => {
            setState({
              activeTab: "review",
              currentPhase: "review",
            });
            console.log("[WEBSOCKET] ⚠️ Forced transition to Review tab due to timeout");
          }, 800);
        }
      }, 120000); // 2 minutes

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
   *
   * CRITICAL UPDATE (v2.2.0):
   * Enhanced to handle reachability failures and connection errors.
   * Creates synthetic error summaries when operation fails without results.
   */
  const handleOperationComplete = useCallback((data) => {
    console.log("[OPERATION_COMPLETE] ========================================");
    console.log("[OPERATION_COMPLETE] ⭐ OPERATION COMPLETE");
    console.log("[OPERATION_COMPLETE] Status:", data.status);
    console.log("[OPERATION_COMPLETE] Operation:", data.operation);
    console.log("[OPERATION_COMPLETE] Success:", data.success);
    console.log("[OPERATION_COMPLETE] Has final_results:", !!data.final_results);
    console.log("[OPERATION_COMPLETE] Has error_message:", !!data.error_message);
    console.log("[OPERATION_COMPLETE] ========================================");

    const success = data.success || data.status === "SUCCESS";
    const operation = data.operation || currentPhase;

    // ========================================================================
    // PRE-CHECK COMPLETION HANDLING
    // ========================================================================
    if (operation === "pre_check" && currentPhase === "pre_check") {
      console.log("[OPERATION_COMPLETE] Finalizing pre-check operation");
      console.log("[OPERATION_COMPLETE] Success:", success);
      console.log("[OPERATION_COMPLETE] Current preCheckSummary:", !!preCheckSummary);

      // ======================================================================
      // CASE 1: FAILURE WITHOUT SUMMARY (Connection/Reachability Errors)
      // ======================================================================
      if (!success && !data.final_results && !preCheckSummary) {
        console.log("[OPERATION_COMPLETE] ⚠️ Pre-check failed without results");
        console.log("[OPERATION_COMPLETE] Creating synthetic error summary");

        // Extract error information from various possible locations
        const errorMessage =
          data.error_message ||
          data.message ||
          data.error ||
          "Pre-check operation failed. Device may be unreachable or connection timed out.";

        const errorDetails =
          data.error_details ||
          data.details ||
          "Common causes include: Device unreachable via network, SSH connection timeout, invalid credentials, NETCONF not enabled, or firewall blocking connection.";

        const errorType = data.error_type || "CONNECTION_ERROR";

        console.log("[OPERATION_COMPLETE] Error details:", {
          errorType,
          errorMessage,
          errorDetails
        });

        // Create synthetic error summary for UI display
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

        console.log("[OPERATION_COMPLETE] Created error summary:", errorSummary);

        // Update state with error information
        setState({
          preCheckSummary: errorSummary,
          canProceedWithUpgrade: false,
          jobStatus: "failed",
          isRunningPreCheck: false,
          progress: 100,
        });

        // Add error to job output for Execution tab visibility
        setState({
          jobOutput: prev => [...prev, {
            timestamp: new Date().toISOString(),
            message: `❌ Pre-check Failed: ${errorMessage}`,
            level: 'error',
            event_type: 'OPERATION_COMPLETE'
          }]
        });

        // Unsubscribe from WebSocket channel
        if (wsChannel) {
          console.log(`[OPERATION_COMPLETE] Unsubscribing from ${wsChannel}`);
          sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
        }

        // Transition to Review tab to show error details
        console.log("[OPERATION_COMPLETE] Scheduling transition to Review tab");
        setTimeout(() => {
          setState({
            activeTab: "review",
            currentPhase: "review",
          });
          console.log("[OPERATION_COMPLETE] ✅ Transitioned to Review tab (error state)");
        }, 800);

        // Exit early - failure case fully handled
        return;
      }

      // ======================================================================
      // CASE 2: SUCCESS WITH RESULTS
      // ======================================================================
      if (data.final_results && !preCheckSummary) {
        console.log("[OPERATION_COMPLETE] Extracting summary from final_results");
        handlePreCheckComplete({ pre_check_summary: data.final_results });

        // Unsubscribe from WebSocket
        if (wsChannel) {
          console.log(`[OPERATION_COMPLETE] Unsubscribing from ${wsChannel}`);
          sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
        }

        // handlePreCheckComplete will handle the transition
        return;
      }

      // ======================================================================
      // CASE 3: COMPLETION WITH EXISTING SUMMARY
      // ======================================================================
      console.log("[OPERATION_COMPLETE] Updating pre-check status (summary exists)");

      setState({
        isRunningPreCheck: false,
        progress: 100,
        jobStatus: success ? "success" : "failed"
      });

      if (wsChannel) {
        console.log(`[OPERATION_COMPLETE] Unsubscribing from ${wsChannel}`);
        sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
      }

      // If we have a summary already, ensure we're on Review tab
      if (preCheckSummary) {
        console.log("[OPERATION_COMPLETE] Summary exists, transitioning to Review");
        setTimeout(() => {
          setState({
            activeTab: "review",
            currentPhase: "review",
          });
        }, 500);
      }
    }

    // ========================================================================
    // UPGRADE COMPLETION HANDLING
    // ========================================================================
    else if (operation === "upgrade" && currentPhase === "upgrade") {
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
