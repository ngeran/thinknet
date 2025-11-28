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
   * Implements the CRITICAL FIX: ref-based progress tracking and debouncing.
   */
  const handleProgressDefault = useCallback((eventData) => {
    const rawProgress = eventData.data?.progress ?? eventData.progress;
    
    // 1. Numeric Coercion and Validation
    const progress = parseFloat(rawProgress);

    console.log(`🔄 [useWorkflowMessages] PROGRESS EVENT:`, { 
      rawProgress, 
      progress, 
      eventType: eventData.event_type,
      message: eventData.message 
    }); // DEBUG

    if (!Number.isFinite(progress)) {
        console.log('❌ [useWorkflowMessages] Invalid progress value:', rawProgress); // DEBUG
        return;
    }
    
    // 2. CRITICAL FIX: Always store the maximum progress value seen so far.
    // This captures intermediate progress during an extremely fast burst.
    latestProgressRef.current = Math.max(latestProgressRef.current, progress);

    console.log(`📈 [useWorkflowMessages] Latest progress ref updated to:`, latestProgressRef.current); // DEBUG

    // 3. Priority 1: Update to 100% immediately (clears all pending updates)
    if (progress >= 100.0) {
        if (progressTimeoutRef.current) {
            clearTimeout(progressTimeoutRef.current);
            progressTimeoutRef.current = null;
        }
        console.log('✅ [useWorkflowMessages] Setting progress to 100% immediately'); // DEBUG
        updateState('progress', 100.0);
        latestProgressRef.current = 100.0; // Reset ref for the next job
        return;
    }

    // 4. Priority 2: Implement Debouncing
    // If a timeout is NOT already scheduled, schedule one to fire after 100ms.
    if (!progressTimeoutRef.current) {
        console.log('⏰ [useWorkflowMessages] Scheduling progress update'); // DEBUG
        progressTimeoutRef.current = setTimeout(() => {
            const valueToUpdate = latestProgressRef.current;
            console.log(`🚀 [useWorkflowMessages] Actually updating progress to: ${valueToUpdate}%`); // DEBUG
            updateState('progress', valueToUpdate);
            progressTimeoutRef.current = null;
        }, PROGRESS_DEBOUNCE_MS);
    }
  }, [updateState]);

  /**
   * Default handler for OPERATION_COMPLETE/UPLOAD_COMPLETE.
   */
  const handleCompleteDefault = useCallback((eventData) => {
    const success = eventData.success === true || (eventData.data?.success !== false && eventData.data?.status !== 'FAILED');
    const msg = eventData.message || eventData.details?.summary || (success ? 'Operation Complete' : 'Operation Failed');

    console.log(`🏁 [useWorkflowMessages] COMPLETE EVENT:`, { success, msg }); // DEBUG

    // Ensure state reflects completion
    updateState('isRunning', false);
    updateState('progress', 100);
    updateState('complete', success);
    
    if (!success) {
      updateState('error', msg);
    }

    // Clear any pending progress debounce timeout and reset ref
    if (progressTimeoutRef.current) {
        clearTimeout(progressTimeoutRef.current);
        progressTimeoutRef.current = null;
    }
    latestProgressRef.current = 0; // Reset for a new run

    appendLog(eventData, success ? `✅ ${msg}` : `❌ ${msg}`, success ? 'SUCCESS' : 'ERROR');
  }, [updateState, appendLog]);

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

    try {
      const eventData = extractLogPayload(lastMessage);
      const eventType = eventData.event_type;

      console.log(`📨 [useWorkflowMessages] Processing message:`, { eventType, eventData }); // DEBUG

      if (!eventType && eventData.success === true) {
         handleCompleteDefault(eventData);
         return;
      }

      if (!eventType || !config.recognizedEvents.has(eventType)) {
        console.log(`⚠️ [useWorkflowMessages] Unrecognized or missing event type: ${eventType}`); // DEBUG
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
        case 'OPERATION_COMPLETE':
        case 'UPLOAD_COMPLETE':
          handleCompleteDefault(eventData);
          break;
        case 'ERROR':
           updateState('error', eventData.message || 'Unknown error');
           appendLog(eventData, null, 'ERROR');
           updateState('isRunning', false);
           break;
        case 'LOG_MESSAGE':
        case 'UPLOAD_START':
        case 'STEP_START':
        default:
          appendLog(eventData);
          break;
      }

    } catch (err) {
      console.error('[useWorkflowMessages] Parsing Error:', err);
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
