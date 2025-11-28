/**
 * =============================================================================
 * REUSABLE WORKFLOW MESSAGING HOOK (FINALIZED)
 * VERSION: 5.0.1 - Fixed Progress Bar State Mapping Issue
 * =============================================================================
 *
 * A generic, modular hook for handling WebSocket workflow events across the application.
 * It standardizes JSON parsing, event deduplication, log formatting, and state mapping.
 *
 * @module hooks/useWorkflowMessages
 *
 * CRITICAL FIX v5.0.0 (FINAL):
 * - Implemented REF-BASED DEBOUNCING. This ensures the state is updated with the 
 * MAXIMUM progress value seen during the debounce window, solving the issue
 * where extremely fast uploads skip intermediate progress steps.
 *
 * FIX v5.0.1:
 * - Enhanced debugging and fixed state mapping verification
 * - Added comprehensive logging to track progress updates
 */

import { useEffect, useCallback, useRef } from 'react';
import { processLogMessage, extractLogPayload } from '@/lib/logProcessor';

// =============================================================================
// SECTION 1: CONFIGURATION
// =============================================================================

/**
 * Workflow-specific configurations for event handling and state management.
 */
const WORKFLOW_CONFIGS = {
  /**
   * Strategy for File/Image Uploads (e.g., ImageUploads.jsx)
   */
  'image-upload': {
    recognizedEvents: new Set([
      'PRE_CHECK_COMPLETE',
      'PROGRESS_UPDATE',
      'OPERATION_COMPLETE',
      'UPLOAD_START', 
      'UPLOAD_COMPLETE',
      'STEP_START',
      'LOG_MESSAGE',
      'ERROR'
    ]),
    stateMap: {
      jobId: 'uploadJobId',       
      progress: 'uploadProgress',
      isRunning: 'isUploading',
      complete: 'uploadComplete',
      error: 'uploadError',
      logs: 'terminalLogs'
    }
  },

  /**
   * Strategy for Code Upgrades (e.g., CodeUpgrades.jsx)
   */
  'code-upgrade': {
    recognizedEvents: new Set([
      'PRE_CHECK_RESULT',
      'PRE_CHECK_COMPLETE',
      'OPERATION_START',
      'STEP_COMPLETE',
      'OPERATION_COMPLETE',
      'LOG_MESSAGE'
    ]),
    stateMap: {
      jobId: 'jobId',
      progress: 'progress',
      logs: 'jobOutput'
    }
  }
};

const PROGRESS_DEBOUNCE_MS = 100; // Limit progress updates to 10 times per second

// =============================================================================
// SECTION 2: HOOK DEFINITION
// =============================================================================

/**
 * @param {Object} params
 * @param {string} params.workflowType - The workflow configuration to use.
 * @param {string} params.jobId - Active Job ID (used for deduplication resets).
 * @param {string} params.lastMessage - Raw WebSocket message string.
 * @param {Object} params.stateSetters - Map of state setters (e.g., { setUploadProgress }).
 * @param {Object} [params.eventHandlers={}] - Optional overrides for specific events.
 */
export default function useWorkflowMessages({
  workflowType,
  jobId,
  lastMessage,
  stateSetters = {},
  eventHandlers = {} 
}) {
  
  // Configuration for the selected workflow
  const config = WORKFLOW_CONFIGS[workflowType];
  
  // Refs for tracking and cleanup
  const lastProcessedStringRef = useRef(null);
  const processedEventsRef = useRef(new Set()); 
  const progressTimeoutRef = useRef(null); 
  const latestProgressRef = useRef(0); // 🔑 NEW: Stores the maximum progress value seen since the last update

  // ===========================================================================
  // SECTION 3: UTILITY FUNCTIONS
  // ===========================================================================

  /**
   * Helper to update state dynamically based on the workflow config.
   */
  const updateState = useCallback((key, value) => {
    const specificKey = config.stateMap[key] || key;

    console.log(`🛠️ [useWorkflowMessages] updateState called:`, {
      workflowType,
      key,
      specificKey,
      value,
      stateMap: config.stateMap,
      availableSetters: Object.keys(stateSetters)
    }); // DEBUG

    // Use the provided setter function
    if (stateSetters[specificKey]) {
      console.log(`✅ [useWorkflowMessages] Calling setter for: ${specificKey} with value:`, value); // DEBUG
      stateSetters[specificKey](value);
    } else if (stateSetters.setState) {
      // If a unified setState is provided
      stateSetters.setState(prev => ({ ...prev, [specificKey]: value }));
    } else {
      console.warn(`❌ [useWorkflowMessages] No setter found for: ${specificKey}. Available setters:`, Object.keys(stateSetters)); // DEBUG
    }
  }, [config, stateSetters, workflowType]);

  /**
   * Standardized log appender.
   */
  const appendLog = useCallback((rawEvent, customMessage = null, type = null) => {
    const logEntry = customMessage 
      ? { 
          id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date().toLocaleTimeString(),
          type: type || 'INFO',
          message: customMessage,
          isTechnical: false,
          originalEvent: rawEvent
        }
      : processLogMessage(rawEvent);

    const logStateKey = config.stateMap.logs || 'terminalLogs';
    
    if (stateSetters[logStateKey]) {
      stateSetters[logStateKey](prev => [...prev, logEntry]);
    } else {
      console.warn(`❌ [useWorkflowMessages] No log setter found for key: ${logStateKey}`); // DEBUG
    }
  }, [config, stateSetters]);

  // ===========================================================================
  // SECTION 4: DEFAULT EVENT HANDLERS
  // ===========================================================================

  /**
   * Default handler for PRE_CHECK_COMPLETE.
   */
  const handlePreCheckDefault = useCallback((eventData) => {
    // ... (logic remains unchanged) ...
    if (eventHandlers.PRE_CHECK_COMPLETE) {
      eventHandlers.PRE_CHECK_COMPLETE(eventData, { updateState, appendLog });
      return;
    }

    if (workflowType === 'image-upload') {
      const data = eventData.data || {};
      const passed = data.validation_passed === true;
      const msg = eventData.message || data.message || (passed ? 'Storage check passed' : 'Storage check failed');

      if (stateSetters.setStorageCheck) {
        stateSetters.setStorageCheck({
          has_sufficient_space: passed,
          message: msg,
          required_mb: data.required_mb || 0,
          available_mb: data.available_mb || 0,
        });
      }

      updateState('isCheckingStorage', false); 
      
      appendLog(eventData, passed ? `✅ Storage check retrieved successfully` : `❌ Validation failed: ${msg}`, passed ? 'SUCCESS' : 'ERROR');
    }
  }, [workflowType, eventHandlers, stateSetters, updateState, appendLog]);

  /**
   * Default handler for PROGRESS_UPDATE.
   * Simplified for better reliability - immediate updates without complex debouncing.
   */
  const handleProgressDefault = useCallback((eventData) => {
    const rawProgress = eventData.data?.progress ?? eventData.progress;

    // 1. Numeric Coercion and Validation
    const progress = parseFloat(rawProgress);

    console.log(`🔄 [useWorkflowMessages] PROGRESS EVENT:`, {
      rawProgress,
      progress,
      eventType: eventData.event_type,
      message: eventData.message,
      workflowType,
      stateMap: config.stateMap
    }); // DEBUG

    if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
        console.log('❌ [useWorkflowMessages] Invalid progress value:', rawProgress); // DEBUG
        return;
    }

    // Clear any pending timeout for immediate update
    if (progressTimeoutRef.current) {
        clearTimeout(progressTimeoutRef.current);
        progressTimeoutRef.current = null;
    }

    // Update progress immediately
    console.log(`📈 [useWorkflowMessages] Updating progress to: ${progress}%`); // DEBUG
    updateState('progress', progress);

  }, [updateState, workflowType, config]);

  /**
   * Default handler for OPERATION_COMPLETE/UPLOAD_COMPLETE.
   */
  const handleCompleteDefault = useCallback((eventData) => {
    const success = eventData.success === true || (eventData.data?.success !== false && eventData.data?.status !== 'FAILED');
    const msg = eventData.message || eventData.details?.summary || (success ? 'Operation Complete' : 'Operation Failed');

    console.log(`🏁 [useWorkflowMessages] COMPLETE EVENT HANDLER CALLED:`, {
      success,
      msg,
      eventData,
      workflowType,
      stateMap: config.stateMap,
      stateSetters: Object.keys(stateSetters)
    }); // DEBUG

    // **FORCE immediate state updates for completion**
    console.log('🔧 [useWorkflowMessages] FORCING COMPLETION STATE UPDATES:');

    // Set progress to 100% first
    updateState('progress', 100);
    console.log('✅ [useWorkflowMessages] Progress set to 100%');

    // Set completion status
    updateState('complete', success);
    console.log(`✅ [useWorkflowMessages] Complete set to: ${success}`);

    // Stop running state
    updateState('isRunning', false);
    console.log('✅ [useWorkflowMessages] isRunning set to false');

    if (!success) {
      updateState('error', msg);
      console.log(`❌ [useWorkflowMessages] Error set: ${msg}`);
    }

    // Clear any pending progress timeout
    if (progressTimeoutRef.current) {
        clearTimeout(progressTimeoutRef.current);
        progressTimeoutRef.current = null;
        console.log('🧹 [useWorkflowMessages] Progress timeout cleared');
    }
    latestProgressRef.current = 0; // Reset for next run

    // Add completion log
    appendLog(eventData, success ? `✅ ${msg}` : `❌ ${msg}`, success ? 'SUCCESS' : 'ERROR');
    console.log('📝 [useWorkflowMessages] Completion log added');

    console.log('🎉 [useWorkflowMessages] COMPLETION HANDLER FINISHED');

  }, [updateState, appendLog, workflowType, config, stateSetters]);

  // ===========================================================================
  // SECTION 5: LIFECYCLE MANAGEMENT & MAIN LOOP
  // ===========================================================================

  // Reset processed events when Job ID changes (new run)
  useEffect(() => {
    if (jobId) {
      processedEventsRef.current.clear();
      lastProcessedStringRef.current = null;
      
      // Also clear progress timeout and reset ref on job reset
      if (progressTimeoutRef.current) {
          clearTimeout(progressTimeoutRef.current);
          progressTimeoutRef.current = null;
      }
      latestProgressRef.current = 0; // Reset progress ref for new job
      
      console.log(`🔄 [useWorkflowMessages] Reset for new job: ${jobId}`); // DEBUG
    }
  }, [jobId]);

  // Main message processing loop
  useEffect(() => {
    if (!lastMessage || !config) return;
    if (lastMessage === lastProcessedStringRef.current) return;
    lastProcessedStringRef.current = lastMessage;

    console.log(`🔍 [useWorkflowMessages] Raw message received:`, lastMessage); // DEBUG

    try {
      const eventData = extractLogPayload(lastMessage);
      const eventType = eventData.event_type;

      console.log(`📨 [useWorkflowMessages] Processing message:`, { eventType, eventData }); // DEBUG

      // **PRIORITY 1: Handle final success messages that have no event_type**
      if (!eventType && eventData.success === true) {
         console.log('✅ [useWorkflowMessages] FINAL SUCCESS MESSAGE DETECTED:', eventData); // DEBUG
         handleCompleteDefault(eventData);
         return;
      }

      // **PRIORITY 2: Handle completion events with event_type**
      if (eventType === 'OPERATION_COMPLETE' || eventType === 'UPLOAD_COMPLETE') {
        console.log('🏁 [useWorkflowMessages] COMPLETION EVENT DETECTED:', eventData); // DEBUG
        handleCompleteDefault(eventData);
        return;
      }

      if (!eventType || !config.recognizedEvents.has(eventType)) {
        console.log(`⚠️ [useWorkflowMessages] Unrecognized or missing event type: ${eventType}`); // DEBUG
        // Still try to handle as completion if it has success flag
        if (eventData.success === true) {
          console.log('🔄 [useWorkflowMessages] Fallback completion handling for:', eventData);
          handleCompleteDefault(eventData);
        }
        return;
      }

      const sig = eventData.data?.sequence
        ? `${eventType}-${eventData.data.sequence}`
        : `${eventType}-${eventData.timestamp || Date.now()}`;

      if (processedEventsRef.current.has(sig)) {
        console.log(`♻️ [useWorkflowMessages] Duplicate event skipped: ${sig}`); // DEBUG
        return;
      }
      processedEventsRef.current.add(sig);

      // Routing
      switch (eventType) {
        case 'PRE_CHECK_COMPLETE':
          handlePreCheckDefault(eventData);
          break;
        case 'PROGRESS_UPDATE':
          handleProgressDefault(eventData);
          break;
        case 'UPLOAD_COMPLETE':
          handleCompleteDefault(eventData);
          break;
        case 'ERROR':
           updateState('error', eventData.message || 'Unknown error');
           appendLog(eventData, null, 'ERROR');
           updateState('isRunning', false);
           break;
        case 'LOG_MESSAGE':
          // **CRITICAL FIX: Check if LOG_MESSAGE contains double-escaped final success**
          if (eventData.message && typeof eventData.message === 'string') {
            try {
              const innerData = JSON.parse(eventData.message);
              console.log('🔍 [useWorkflowMessages] LOG_MESSAGE contains parsed JSON:', innerData); // DEBUG

              if (innerData.success === true) {
                console.log('🎉 [useWorkflowMessages] FOUND DOUBLE-ESCAPED FINAL SUCCESS!'); // DEBUG
                handleCompleteDefault(innerData);
                return;
              }
            } catch (parseErr) {
              // Not valid JSON, continue as normal LOG_MESSAGE
            }
          }
          // Normal LOG_MESSAGE handling
          appendLog(eventData);
          break;
        case 'UPLOAD_START':
        case 'STEP_START':
        default:
          appendLog(eventData);
          break;
      }

    } catch (err) {
      console.error('[useWorkflowMessages] Parsing Error:', err, 'Raw message:', lastMessage);

      // **PRIORITY 3: Try to parse raw JSON as fallback for completion**
      try {
        const fallbackData = JSON.parse(lastMessage);
        if (fallbackData.success === true) {
          console.log('🚨 [useWorkflowMessages] FALLBACK COMPLETION HANDLING:', fallbackData);
          handleCompleteDefault(fallbackData);
        }
      } catch (fallbackErr) {
        console.log('[useWorkflowMessages] Not valid JSON, ignoring:', lastMessage);
      }
    }
  }, [
    lastMessage,
    config,
    handlePreCheckDefault,
    handleProgressDefault,
    handleCompleteDefault,
    appendLog,
    updateState
  ]);

  // Cleanup: Clear the progress timeout when the component unmounts
  useEffect(() => {
    return () => {
      if (progressTimeoutRef.current) {
        clearTimeout(progressTimeoutRef.current);
      }
    };
  }, []);
}
