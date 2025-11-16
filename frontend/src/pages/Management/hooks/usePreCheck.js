/**
 * =============================================================================
 * PRE-CHECK HOOK
 * =============================================================================
 *
 * Handles pre-check validation logic
 *
 * @module hooks/usePreCheck
 * @author nikos-geranios_vgi
 * @date 2025-11-05
 */

import { useCallback } from 'react';
import { API_URL, ENDPOINTS } from '../constants/api';
import { validateUpgradeParameters, validateWebSocketConnection } from '../utils/validation';
import { prepareApiPayload } from '../utils/payloadPreparation';

/**
 * Custom hook for pre-check validation operations
 *
 * @param {Object} params - Hook parameters
 * @param {Object} params.upgradeParams - Upgrade configuration parameters
 * @param {boolean} params.isConnected - WebSocket connection status
 * @param {Function} params.sendMessage - Function to send WebSocket messages
 * @param {string} params.wsChannel - Current WebSocket channel
 * @param {Function} params.setState - Function to update multiple state values
 *
 * @returns {Object} Pre-check operations
 */
export function usePreCheck({
  upgradeParams,
  isConnected,
  sendMessage,
  wsChannel,
  setState
}) {

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
  const startPreCheck = useCallback(async (e) => {
    e.preventDefault();

    console.log("[PRE_CHECK] ===== PRE-CHECK VALIDATION INITIATED =====");

    // ======================================================================
    // VALIDATION
    // ======================================================================
    const validationErrors = validateUpgradeParameters(upgradeParams);
    if (validationErrors.length > 0) {
      console.error("[PRE_CHECK] ❌ Validation failed:", validationErrors);

      // FIX: Convert validation errors to proper strings
      const errorMessages = validationErrors.map(error => {
        if (typeof error === 'object') {
          return error.message || JSON.stringify(error);
        }
        return error;
      });

      setState({
        jobOutput: prev => [...prev, ...errorMessages.map(error => ({
          timestamp: new Date().toISOString(),
          message: `Validation Error: ${error}`,
          level: 'error',
          event_type: 'VALIDATION_ERROR'
        }))]
      });
      return;
    }

    const wsValidation = validateWebSocketConnection(isConnected);
    if (!wsValidation.valid) {
      console.error("[PRE_CHECK] ❌ WebSocket not connected");
      setState({
        jobOutput: prev => [...prev, {
          timestamp: new Date().toISOString(),
          message: wsValidation.error,
          level: 'error',
          event_type: 'CONNECTION_ERROR'
        }]
      });
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
    setState({
      activeTab: "execute",
      currentPhase: "pre_check",
      isRunningPreCheck: true,
      jobStatus: "running",
      progress: 0,
      jobOutput: [],
      preCheckResults: null,
      preCheckSummary: null,
      canProceedWithUpgrade: false,
    });

    // Clear refs
    setState({
      processedStepsRef: new Set(),
      loggedMessagesRef: new Set(),
    });

    // ======================================================================
    // API CALL
    // ======================================================================
    const payload = prepareApiPayload(upgradeParams, 'pre-check');

    console.log("[PRE_CHECK] Submitting to API endpoint:", `${API_URL}${ENDPOINTS.PRE_CHECK}`);
    console.log("[PRE_CHECK] Payload being sent:", JSON.stringify(payload, null, 2));

    try {
      const response = await fetch(`${API_URL}${ENDPOINTS.PRE_CHECK}`, {
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
          console.log("[PRE_CHECK] Error response data:", errorData);

          // FIX: Handle different error response formats
          if (Array.isArray(errorData.detail)) {
            errorMessage = errorData.detail.map(err => {
              if (typeof err === 'object') {
                return err.msg || JSON.stringify(err);
              }
              return err;
            }).join(', ');
          } else if (typeof errorData.detail === 'string') {
            errorMessage = errorData.detail;
          } else if (errorData.message) {
            errorMessage = errorData.message;
          } else {
            errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          }
        } catch {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }

        throw new Error(`API error: ${errorMessage}`);
      }

      const data = await response.json();
      console.log("[PRE_CHECK] ✅ Job queued successfully:", {
        job_id: data.job_id,
        ws_channel: data.ws_channel,
        phase: data.phase
      });

      setState({
        preCheckJobId: data.job_id,
        jobId: data.job_id,
        wsChannel: data.ws_channel,
      });

      // Subscribe to WebSocket updates
      console.log(`[WEBSOCKET] Subscribing to channel: ${data.ws_channel}`);
      sendMessage({ type: 'SUBSCRIBE', channel: data.ws_channel });

      setState({
        jobOutput: prev => [...prev, {
          timestamp: new Date().toISOString(),
          message: `Pre-check validation started. Job ID: ${data.job_id}`,
          level: 'info',
          event_type: 'JOB_STARTED'
        }]
      });

    } catch (error) {
      console.error("[PRE_CHECK] ❌ API Call Failed:", error);

      setState({
        jobOutput: prev => [...prev, {
          timestamp: new Date().toISOString(),
          message: `Pre-check start failed: ${error.message}`,
          level: 'error',
          event_type: 'API_ERROR'
        }],
        jobStatus: "failed",
        isRunningPreCheck: false,
      });
    }
  }, [upgradeParams, isConnected, sendMessage, wsChannel, setState]);

  return {
    startPreCheck,
  };
}
