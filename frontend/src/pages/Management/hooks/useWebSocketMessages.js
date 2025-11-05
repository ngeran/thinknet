/**
 * =============================================================================
 * WEBSOCKET MESSAGE PROCESSING HOOK
 * =============================================================================
 *
 * Handles WebSocket message processing and state updates
 *
 * CRITICAL FIXES APPLIED:
 * 1. Implemented parsing logic for nested PRE_CHECK_COMPLETE JSON that is
 * incorrectly stringified and embedded in an ORCHESTRATOR_LOG message (e.g.,
 * 'PRE_CHECK_EVENT:{...}') directly in the main useEffect.
 * 2. Ensured the extracted PRE_CHECK_COMPLETE payload is passed to the specific
 * event handlers to correctly set the preCheckSummary state.
 *
 * @module hooks/useWebSocketMessages
 * @author nikos-geranios_vgi
 * @date 2025-11-05
 */

import { useEffect } from 'react';
import { extractNestedProgressData } from '../utils/jsonExtraction';
import { shouldFilterMessage, createLogSignature } from '../utils/messageFiltering';
import { formatStepMessage } from '../utils/messageFormatting';
import { TIMING } from '../constants/timing';

/**
 * Custom hook for processing WebSocket messages
 *
 * This is the heart of real-time progress tracking and state management.
 *
 * RESPONSIBILITIES:
 * 1. Receives and parses WebSocket messages
 * 2. Extracts nested JSON from ORCHESTRATOR_LOG messages (including the critical fix)
 * 3. Filters and deduplicates log entries
 * 4. Updates progress tracking
 * 5. Handles PRE_CHECK_COMPLETE to enable Review tab
 * 6. Handles OPERATION_COMPLETE for job finalization
 * 7. Manages tab transitions
 * 8. Updates job output for display
 *
 * @param {Object} params - Hook parameters
 * @param {string} params.lastMessage - Latest WebSocket message
 * @param {string} params.jobId - Current job ID
 * @param {string} params.wsChannel - Current WebSocket channel
 * @param {string} params.currentPhase - Current workflow phase
 * @param {Array} params.jobOutput - Current job output logs
 * @param {Object} params.preCheckSummary - Pre-check summary data
 * @param {number} params.totalSteps - Total steps in operation
 * @param {number} params.progress - Current progress percentage
 * @param {Function} params.sendMessage - Function to send WebSocket messages
 * @param {Function} params.setState - Function to update state
 * @param {Object} params.refs - Refs for persistent values
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

  useEffect(() => {
    if (!lastMessage || !jobId) return;

    const raw = lastMessage;

    // ======================================================================
    // RAW MESSAGE LOGGING (CONSOLE ONLY - NOT ADDED TO STATE)
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
    // ======================================================================
    if (parsed.channel && wsChannel && !parsed.channel.includes(wsChannel)) {
      console.debug("[WEBSOCKET] Ignoring message for different channel:", parsed.channel);
      return;
    }

    // ======================================================================
    // NESTED DATA EXTRACTION (Handles standard nested structures)
    // ======================================================================
    const { payload: finalPayload, isNested } = extractNestedProgressData(parsed, setState);
    let eventToHandle = finalPayload;

    // ======================================================================
    // CRITICAL FIX: Extract PRE_CHECK_COMPLETE from ORCHESTRATOR_LOG string
    // The backend sends the final structured result as a string prefixed with
    // 'PRE_CHECK_EVENT:' inside the ORCHESTRATOR_LOG's 'message' field.
    // We must manually parse it here.
    // ======================================================================
    if (eventToHandle.event_type === "ORCHESTRATOR_LOG" &&
      typeof eventToHandle.message === 'string' &&
      eventToHandle.message.startsWith("PRE_CHECK_EVENT:")) {
      try {
        const PREFIX = "PRE_CHECK_EVENT:";
        const nestedJsonString = eventToHandle.message.substring(PREFIX.length);
        const nestedPayload = JSON.parse(nestedJsonString);

        // If successfully parsed and is the expected final event, use it.
        if (nestedPayload && nestedPayload.event_type === "PRE_CHECK_COMPLETE") {
          console.log("[WEBSOCKET_FIX] 🎯 Successfully extracted nested PRE_CHECK_COMPLETE event.");
          eventToHandle = nestedPayload;
        } else {
          console.warn("[WEBSOCKET_FIX] Parsed nested payload, but it was not PRE_CHECK_COMPLETE. Using original payload.");
        }
      } catch (e) {
        console.error("[WEBSOCKET_FIX] ❌ Failed to parse nested PRE_CHECK_EVENT JSON:", e);
        // Fall through, continue using the original finalPayload to log the error message
      }
    }


    console.log("[WEBSOCKET_PROCESSED] Final payload analysis:", {
      event_type: eventToHandle.event_type,
      type: eventToHandle.type,
      isNested: isNested,
      currentPhase: currentPhase,
    });

    // ======================================================================
    // DEDUPLICATION LOGIC (Uses finalPayload for log signature)
    // ======================================================================
    const logSignature = createLogSignature(finalPayload);
    const shouldAddToOutput = !refs.loggedMessagesRef.current.has(logSignature);
    const shouldDisplay = !shouldFilterMessage(finalPayload);

    // ======================================================================
    // ADD TO JOB OUTPUT (WITH INFINITE LOOP PROTECTION)
    // ======================================================================
    if (shouldAddToOutput && shouldDisplay) {
      refs.loggedMessagesRef.current.add(logSignature);

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

      setState({
        jobOutput: prev => [...prev, logEntry]
      });

      // Update latest step message for progress bar
      if (logEntry.message && finalPayload.event_type !== "OPERATION_COMPLETE") {
        refs.latestStepMessageRef.current = logEntry.message;
      }

      // Auto-scroll to latest message
      if (refs.scrollAreaRef.current) {
        setTimeout(() => {
          if (refs.scrollAreaRef.current) {
            refs.scrollAreaRef.current.scrollTop = refs.scrollAreaRef.current.scrollHeight;
          }
        }, TIMING.AUTO_SCROLL_DELAY);
      }
    }

    // ======================================================================
    // EVENT-SPECIFIC HANDLERS
    // ======================================================================
    // Pass the potentially extracted event
    handleSpecificEvents(eventToHandle, {
      currentPhase,
      preCheckSummary,
      totalSteps,
      progress,
      wsChannel,
      sendMessage,
      setState,
      refs
    });

  }, [lastMessage, jobId, wsChannel, currentPhase, jobOutput, preCheckSummary, totalSteps, progress, sendMessage, setState, refs]);
}

/**
 * Handles specific WebSocket event types
 *
 * @param {Object} payload - Message payload (potentially extracted PRE_CHECK_COMPLETE)
 * @param {Object} context - Context with state and functions
 * @private
 */
function handleSpecificEvents(payload, context) {
  const {
    currentPhase,
    preCheckSummary,
    totalSteps,
    progress,
    wsChannel,
    sendMessage,
    setState,
    refs
  } = context;

  // ==========================================================================
  // PRE_CHECK_RESULT
  // ==========================================================================
  if (payload.event_type === "PRE_CHECK_RESULT") {
    console.log("[PRE_CHECK] Individual result received:", {
      check_name: payload.check_name,
      severity: payload.severity,
      message: payload.message
    });

    setState({
      preCheckResults: prev => {
        const updated = prev ? [...prev] : [];
        updated.push(payload);
        return updated;
      }
    });
  }

  // ==========================================================================
  // PRE_CHECK_COMPLETE - CRITICAL FOR REVIEW TAB
  // This handler is now guaranteed to receive the clean PRE_CHECK_COMPLETE
  // payload thanks to the fix in the useEffect block.
  // ==========================================================================
  if (payload.event_type === "PRE_CHECK_COMPLETE" ||
    (payload.type === "PRE_CHECK_COMPLETE" && payload.data)) {

    console.log("[PRE_CHECK] ========================================");
    console.log("[PRE_CHECK] 🎯 PRE_CHECK_COMPLETE EVENT DETECTED");
    console.log("[PRE_CHECK] THIS ENABLES THE REVIEW TAB");
    console.log("[PRE_CHECK] ========================================");

    // Extract the final summary data, checking 'data' field first
    let summaryData = payload.data || payload;

    // EXTRACT THE NESTED pre_check_summary IF PRESENT, OTHERWISE USE THE DATA OBJECT ITSELF
    const actualSummary = summaryData.pre_check_summary || summaryData;

    if (actualSummary && (actualSummary.total_checks !== undefined || actualSummary.results)) {
      console.log("[PRE_CHECK] ✅ SUCCESS: Summary extracted:", {
        total_checks: actualSummary.total_checks,
        can_proceed: actualSummary.can_proceed,
        results_count: actualSummary.results?.length || 0
      });

      setState({
        preCheckSummary: actualSummary,
        canProceedWithUpgrade: actualSummary.can_proceed,
        jobStatus: "success",
        isRunningPreCheck: false,
        progress: 100,
      });

      console.log("[PRE_CHECK] ✅ State updated successfully - Review tab should now show results");
    } else {
      console.warn("[PRE_CHECK] ❌ PRE_CHECK_COMPLETE without valid summary data. This is unexpected but handled.", {
        actualSummary,
      });
    }
  }

  // ==========================================================================
  // OPERATION_START
  // ==========================================================================
  if (payload.event_type === "OPERATION_START" &&
    typeof payload.data?.total_steps === "number") {

    console.log("[PROGRESS] Operation started:", {
      total_steps: payload.data.total_steps,
      operation: payload.data.operation
    });

    setState({
      totalSteps: payload.data.total_steps,
      progress: 5,
    });
  }

  // ==========================================================================
  // STEP_COMPLETE
  // ==========================================================================
  if (payload.event_type === "STEP_COMPLETE" &&
    typeof payload.data?.step === "number") {

    const stepNum = payload.data.step;

    if (!refs.processedStepsRef.current.has(stepNum)) {
      refs.processedStepsRef.current.add(stepNum);
      console.log(`[PROGRESS] Step ${stepNum} completed`);

      setState(prevState => {
        const newCompleted = prevState.completedSteps + 1;
        let newProgress = progress;

        if (totalSteps > 0) {
          newProgress = Math.min(99, Math.round((newCompleted / totalSteps) * 100));
        } else {
          newProgress = Math.min(99, progress + 25);
        }

        console.log(`[PROGRESS] Progress update: ${newCompleted}/${totalSteps} steps (${newProgress}%)`);

        return {
          completedSteps: newCompleted,
          progress: newProgress,
        };
      });
    }
  }

  // ==========================================================================
  // OPERATION_COMPLETE
  // ==========================================================================
  if (payload.event_type === "OPERATION_COMPLETE" ||
    payload.type === "OPERATION_COMPLETE") {

    handleOperationComplete(payload, {
      currentPhase,
      preCheckSummary,
      totalSteps,
      wsChannel,
      sendMessage,
      setState,
    });
  }
}

/**
 * Handles OPERATION_COMPLETE event
 *
 * @param {Object} payload - Message payload
 * @param {Object} context - Context with state and functions
 * @private
 */
function handleOperationComplete(payload, context) {
  const {
    currentPhase,
    preCheckSummary,
    totalSteps,
    wsChannel,
    sendMessage,
    setState
  } = context;

  const finalStatus = payload.data?.status || payload.success;
  const operationType = payload.data?.operation || currentPhase;

  console.log("[OPERATION] ========================================");
  console.log("[OPERATION] ⭐ OPERATION_COMPLETE DETECTED");
  console.log("[OPERATION] Status:", finalStatus);
  console.log("[OPERATION] Operation:", operationType);
  console.log("[OPERATION] Phase:", currentPhase);
  console.log("[OPERATION] ========================================");

  // ==========================================================================
  // PRE-CHECK COMPLETION
  // ==========================================================================
  if (currentPhase === "pre_check" || operationType === "pre_check") {
    console.log("[PRE_CHECK] Operation complete - finalizing pre-check phase");

    // If we don't have summary from PRE_CHECK_COMPLETE, try to extract from OPERATION_COMPLETE
    if (!preCheckSummary) {
      console.log("[PRE_CHECK] No summary found yet, attempting extraction from OPERATION_COMPLETE payload...");

      // Try multiple possible locations for the summary data (as a fallback)
      const possibleSummary =
        payload.data?.final_results?.data?.pre_check_summary ||
        payload.data?.pre_check_summary ||
        payload.data?.final_results?.pre_check_summary;

      if (possibleSummary && (possibleSummary.total_checks !== undefined || possibleSummary.results)) {
        console.log("[PRE_CHECK] ✅ Found summary in OPERATION_COMPLETE (Fallback success):", {
          total_checks: possibleSummary.total_checks,
          can_proceed: possibleSummary.can_proceed
        });

        setState({
          preCheckSummary: possibleSummary,
          canProceedWithUpgrade: possibleSummary.can_proceed,
          jobStatus: "success",
        });
      } else {
        console.warn("[PRE_CHECK] ❌ No summary available in OPERATION_COMPLETE. State may be inconsistent.");
        setState({ jobStatus: "failed" });
      }
    }

    setState({
      isRunningPreCheck: false,
      progress: 100,
      completedSteps: totalSteps > 0 ? totalSteps : undefined,
    });

    if (wsChannel) {
      console.log(`[WEBSOCKET] Pre-check complete, unsubscribing from ${wsChannel}`);
      sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
    }

    // Schedule tab transition
    console.log(`[TAB_TRANSITION] Scheduling transition to REVIEW in ${TIMING.TAB_TRANSITION_DELAY}ms`);
    setTimeout(() => {
      setState({
        activeTab: "review",
        currentPhase: "review",
      });
      console.log("[TAB_TRANSITION] ✅ Transition to REVIEW completed");
    }, TIMING.TAB_TRANSITION_DELAY);
  }

  // ==========================================================================
  // UPGRADE COMPLETION
  // ==========================================================================
  else if (currentPhase === "upgrade" || operationType === "upgrade") {
    console.log("[UPGRADE] Operation complete - finalizing upgrade phase");

    let finalSuccess = false;
    if (payload.success === true ||
      payload.data?.final_results?.success === true ||
      payload.data?.status === "SUCCESS") {
      finalSuccess = true;
    }

    console.log("[UPGRADE] Final Status:", finalSuccess ? "✅ SUCCESS" : "❌ FAILED");

    setState({
      jobStatus: finalSuccess ? "success" : "failed",
      finalResults: payload,
      progress: 100,
      completedSteps: totalSteps > 0 ? totalSteps : undefined,
    });

    if (wsChannel) {
      console.log(`[WEBSOCKET] Upgrade complete, unsubscribing from ${wsChannel}`);
      sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
    }

    setTimeout(() => {
      setState({
        activeTab: "results",
        currentPhase: "results",
      });
      console.log("[UPGRADE] ✅ Transitioned to results tab");
    }, TIMING.TAB_TRANSITION_DELAY);
  }
}
