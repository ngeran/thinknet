/**
 * =============================================================================
 * WEBSOCKET MESSAGE PROCESSING HOOK - ZUSTAND VERSION v1.0.0
 * =============================================================================
 *
 * WebSocket message processing for Zustand-based CodeUpgrades implementation
 * Integrates directly with centralized Zustand store instead of prop drilling
 *
 * Location: src/hooks/useWebSocketMessagesZustand.js
 * Author: nikos-geranios_vgi
 * Date: 2025-12-01
 * Version: 1.0.0 - Phase 5 Implementation
 *
 * RECOGNIZED EVENT TYPES:
 * - PRE_CHECK_RESULT: Pre-check validation results
 * - PRE_CHECK_COMPLETE: Pre-check workflow completion
 * - OPERATION_START: Operation started
 * - STEP_COMPLETE: Individual step completion
 * - OPERATION_COMPLETE: Operation finished
 * - LOG_MESSAGE: General log messages
 *
 * INTEGRATION:
 * - Direct store updates via Zustand actions
 * - Automatic phase transitions
 * - Progress tracking and log management
 * =============================================================================
 */

import { useEffect, useCallback, useRef } from 'react';
import { useCodeUpgradeStore, WORKFLOW_STEPS } from '@/lib/codeUpgradeStore';

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
 * Zustand-based WebSocket message processing hook
 *
 * Processes WebSocket messages and updates the centralized Zustand store
 * Replaces the complex useWebSocketMessages hook with store-based approach
 *
 * @param {Object} params - Hook parameters
 * @param {Object} params.lastMessage - Latest WebSocket message
 * @param {string} params.currentStep - Current workflow step
 * @param {Function} params.sendMessage - WebSocket send function
 *
 * @returns {Object} Message processing utilities
 */
export function useWebSocketMessagesZustand({
  lastMessage,
  currentStep,
  sendMessage
}) {
  // Access store actions
  const {
    preCheck,
    upgrade,
    setCurrentStep,
    addPreCheckLog,
    addUpgradeLog,
    setPreCheckComplete,
    setUpgradeComplete,
    moveToReview,
    moveToResults,
    reset
  } = useCodeUpgradeStore();

  // Refs for deduplication and tracking
  const processedMessagesRef = useRef(new Set());
  const lastProcessedMessageRef = useRef(null);

  // ==========================================================================
  // SECTION 3: MESSAGE PROCESSING FUNCTIONS
  // ==========================================================================

  /**
   * Process pre-check phase messages
   */
  const processPreCheckMessage = useCallback((message) => {
    console.log('[ZUSTAND_WS] Processing pre-check message:', message.event_type);

    switch (message.event_type) {
      case 'PRE_CHECK_RESULT':
        handlePreCheckResult(message);
        break;

      case 'PRE_CHECK_COMPLETE':
        handlePreCheckComplete(message);
        break;

      case 'STEP_COMPLETE':
        handlePreCheckStepComplete(message);
        break;

      case 'OPERATION_START':
        handlePreCheckOperationStart(message);
        break;

      case 'OPERATION_COMPLETE':
        handlePreCheckOperationComplete(message);
        break;

      case 'LOG_MESSAGE':
        handlePreCheckLogMessage(message);
        break;

      default:
        console.log('[ZUSTAND_WS] Unhandled pre-check message type:', message.event_type);
    }
  }, []);

  /**
   * Process upgrade phase messages
   */
  const processUpgradeMessage = useCallback((message) => {
    console.log('[ZUSTAND_WS] Processing upgrade message:', message.event_type);

    switch (message.event_type) {
      case 'OPERATION_START':
        handleUpgradeOperationStart(message);
        break;

      case 'STEP_COMPLETE':
        handleUpgradeStepComplete(message);
        break;

      case 'OPERATION_COMPLETE':
        handleUpgradeOperationComplete(message);
        break;

      case 'LOG_MESSAGE':
        handleUpgradeLogMessage(message);
        break;

      default:
        console.log('[ZUSTAND_WS] Unhandled upgrade message type:', message.event_type);
    }
  }, []);

  // ==========================================================================
  // SECTION 4: PRE-CHECK MESSAGE HANDLERS
  // ==========================================================================

  const handlePreCheckResult = useCallback((message) => {
    console.log('[ZUSTAND_WS] Pre-check result received:', message.data);

    // Store pre-check results for review phase
    // This will be used in the ReviewTab
  }, []);

  const handlePreCheckComplete = useCallback((message) => {
    console.log('[ZUSTAND_WS] Pre-check completed:', message.data);

    const summary = message.data?.summary || {
      total_checks: 0,
      passed_checks: 0,
      failed_checks: 0,
      can_proceed: true,
      results: []
    };

    // Update store with completion data
    setPreCheckComplete(summary);
    moveToReview();

    // Add completion log
    addPreCheckLog({
      id: `log_${Date.now()}`,
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message: 'Pre-check validation completed',
      details: `Passed: ${summary.passed_checks}/${summary.total_checks} checks`
    });
  }, [setPreCheckComplete, moveToReview, addPreCheckLog]);

  const handlePreCheckStepComplete = useCallback((message) => {
    console.log('[ZUSTAND_WS] Pre-check step completed:', message.data);

    // Update progress (simplified - could implement step tracking)
    const progress = message.data?.progress || 0;
    // TODO: Implement progress update in store
  }, []);

  const handlePreCheckOperationStart = useCallback((message) => {
    console.log('[ZUSTAND_WS] Pre-check operation started:', message.data);

    addPreCheckLog({
      id: `log_${Date.now()}`,
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message: 'Pre-check operation started',
      details: message.data?.description || 'Validation in progress'
    });
  }, [addPreCheckLog]);

  const handlePreCheckOperationComplete = useCallback((message) => {
    console.log('[ZUSTAND_WS] Pre-check operation completed:', message.data);

    // This might be called instead of PRE_CHECK_COMPLETE in some cases
    handlePreCheckComplete(message);
  }, [handlePreCheckComplete]);

  const handlePreCheckLogMessage = useCallback((message) => {
    const logEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: message.timestamp || new Date().toISOString(),
      level: message.level?.toUpperCase() || 'INFO',
      message: message.message || 'Log message',
      details: message.details || null
    };

    addPreCheckLog(logEntry);
  }, [addPreCheckLog]);

  // ==========================================================================
  // SECTION 5: UPGRADE MESSAGE HANDLERS
  // ==========================================================================

  const handleUpgradeOperationStart = useCallback((message) => {
    console.log('[ZUSTAND_WS] Upgrade operation started:', message.data);

    addUpgradeLog({
      id: `log_${Date.now()}`,
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message: 'Upgrade operation started',
      details: message.data?.description || 'Software upgrade in progress'
    });
  }, [addUpgradeLog]);

  const handleUpgradeStepComplete = useCallback((message) => {
    console.log('[ZUSTAND_WS] Upgrade step completed:', message.data);

    // Update progress (simplified - could implement step tracking)
    const progress = message.data?.progress || 0;
    // TODO: Implement progress update in store
  }, []);

  const handleUpgradeOperationComplete = useCallback((message) => {
    console.log('[ZUSTAND_WS] Upgrade operation completed:', message.data);

    const result = message.data || {
      success: true,
      message: 'Upgrade completed successfully'
    };

    // Update store with completion data
    setUpgradeComplete(result);
    moveToResults();

    // Add completion log
    addUpgradeLog({
      id: `log_${Date.now()}`,
      timestamp: new Date().toISOString(),
      level: result.success ? 'INFO' : 'ERROR',
      message: result.success ? 'Upgrade completed successfully' : 'Upgrade failed',
      details: result.message
    });
  }, [setUpgradeComplete, moveToResults, addUpgradeLog]);

  const handleUpgradeLogMessage = useCallback((message) => {
    const logEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: message.timestamp || new Date().toISOString(),
      level: message.level?.toUpperCase() || 'INFO',
      message: message.message || 'Log message',
      details: message.details || null
    };

    addUpgradeLog(logEntry);
  }, [addUpgradeLog]);

  // ==========================================================================
  // SECTION 6: MESSAGE ROUTING AND PROCESSING
  // ==========================================================================

  /**
   * Main message processing function
   */
  const processMessage = useCallback((message) => {
    if (!message || !message.event_type) {
      console.warn('[ZUSTAND_WS] Invalid message format:', message);
      return;
    }

    // Deduplication
    const messageId = message.message_id || `${message.timestamp}_${message.event_type}`;
    if (processedMessagesRef.current.has(messageId)) {
      console.log('[ZUSTAND_WS] Duplicate message ignored:', messageId);
      return;
    }

    processedMessagesRef.current.add(messageId);
    lastProcessedMessageRef.current = message;

    console.log('[ZUSTAND_WS] Processing message:', message.event_type, 'in step:', currentStep);

    // Route message based on current workflow step
    if (currentStep === WORKFLOW_STEPS.PRE_CHECK) {
      processPreCheckMessage(message);
    } else if (currentStep === WORKFLOW_STEPS.UPGRADE) {
      processUpgradeMessage(message);
    } else {
      console.log('[ZUSTAND_WS] Message received in non-processing step:', currentStep);
    }
  }, [currentStep, processPreCheckMessage, processUpgradeMessage]);

  // ==========================================================================
  // SECTION 7: WEBSOCKET MESSAGE EFFECT
  // ==========================================================================

  // Process incoming WebSocket messages
  useEffect(() => {
    if (!lastMessage) {
      console.log('[ZUSTAND_WS] No lastMessage available');
      return;
    }

    console.log('[ZUSTAND_WS] Received WebSocket message:', lastMessage);
    console.log('[ZUSTAND_WS] Message type:', typeof lastMessage);
    console.log('[ZUSTAND_WS] Current workflow step:', currentStep);

    try {
      // Handle nested WebSocket message structure
      let message;
      console.log('[ZUSTAND_WS] Raw lastMessage structure:', lastMessage);
      console.log('[ZUSTAND_WS] lastMessage type:', typeof lastMessage);

      // Check if lastMessage itself has the channel and data structure
      if (lastMessage && lastMessage.channel && lastMessage.data !== undefined) {
        console.log('[ZUSTAND_WS] Found channel message with data:', lastMessage.data);
        console.log('[ZUSTAND_WS] lastMessage.data type:', typeof lastMessage.data);

        // Parse the nested data string if it's a string, otherwise use as-is
        if (typeof lastMessage.data === 'string') {
          try {
            message = JSON.parse(lastMessage.data);
          } catch (parseError) {
            console.warn('[ZUSTAND_WS] Failed to parse nested data as JSON, using as-is:', parseError);
            message = { message: lastMessage.data, event_type: 'LOG_MESSAGE' };
          }
        } else {
          message = lastMessage.data;
        }
      } else if (typeof lastMessage === 'string') {
        // Handle string message directly
        try {
          const parsed = JSON.parse(lastMessage);
          console.log('[ZUSTAND_WS] Parsed string message:', parsed);

          // Check if this is a channel message with nested data
          if (parsed.channel && parsed.data !== undefined) {
            console.log('[ZUSTAND_WS] Found channel message with nested data:', parsed.data);
            // Parse the nested data string if it's a string
            if (typeof parsed.data === 'string') {
              try {
                message = JSON.parse(parsed.data);
              } catch (parseError) {
                console.warn('[ZUSTAND_WS] Failed to parse nested data as JSON, using as-is:', parseError);
                message = { message: parsed.data, event_type: 'LOG_MESSAGE' };
              }
            } else {
              message = parsed.data;
            }
          } else {
            // Direct message
            message = parsed;
          }
        } catch (stringParseError) {
          console.warn('[ZUSTAND_WS] Failed to parse string message, treating as raw message:', stringParseError);
          message = { message: lastMessage, event_type: 'LOG_MESSAGE' };
        }
      } else if (lastMessage && typeof lastMessage === 'object') {
        // Direct object message - check if it has event_type
        if (lastMessage.event_type) {
          console.log('[ZUSTAND_WS] Using direct object message with event_type');
          message = lastMessage;
        } else {
          console.log('[ZUSTAND_WS] Using direct object message without event_type, adding default');
          message = { ...lastMessage, event_type: 'LOG_MESSAGE' };
        }
      } else {
        console.warn('[ZUSTAND_WS] Unexpected message format:', lastMessage);
        // Create a fallback message to prevent complete failure
        message = {
          event_type: 'LOG_MESSAGE',
          message: String(lastMessage || 'Unknown message'),
          timestamp: new Date().toISOString()
        };
      }

      console.log('[ZUSTAND_WS] Final parsed message:', message);

      // Ensure message has required fields before processing
      if (message && (message.event_type || message.message)) {
        processMessage(message);
      } else {
        console.warn('[ZUSTAND_WS] Message missing required fields, skipping:', message);
      }
    } catch (error) {
      console.error('[ZUSTAND_WS] Failed to parse WebSocket message:', error);
      console.error('[ZUSTAND_WS] Raw message data:', lastMessage);
    }
  }, [lastMessage, processMessage]);

  // ==========================================================================
  // SECTION 8: CLEANUP AND UTILITIES
  // ==========================================================================

  // Cleanup processed messages on step change
  useEffect(() => {
    console.log('[ZUSTAND_WS] Step changed to:', currentStep, 'clearing message cache');
    processedMessagesRef.current.clear();
    lastProcessedMessageRef.current = null;
  }, [currentStep]);

  /**
   * Clear message history
   */
  const clearMessageHistory = useCallback(() => {
    processedMessagesRef.current.clear();
    lastProcessedMessageRef.current = null;
    console.log('[ZUSTAND_WS] Message history cleared');
  }, []);

  // ==========================================================================
  // SECTION 9: RETURN PUBLIC API
  // ==========================================================================

  return {
    // Message processing
    processMessage,
    clearMessageHistory,

    // Status
    lastProcessedMessage: lastProcessedMessageRef.current,
    messageCount: processedMessagesRef.current.size,

    // Store access (for debugging)
    currentStep,
    preCheck,
    upgrade,
  };
}

export default useWebSocketMessagesZustand;