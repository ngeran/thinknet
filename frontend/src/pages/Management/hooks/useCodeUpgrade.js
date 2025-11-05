/**
 * =============================================================================
 * CODE UPGRADE HOOK
 * =============================================================================
 *
 * Handles upgrade execution logic
 *
 * @module hooks/useCodeUpgrade
 * @author nikos-geranios_vgi
 * @date 2025-11-05
 */
 
import { useCallback } from 'react';
import { API_URL, ENDPOINTS } from '../constants/api';
import { validateUpgradeParameters, validateWebSocketConnection } from '../utils/validation';
import { prepareApiPayload } from '../utils/payloadPreparation';
 
/**
 * Custom hook for upgrade execution operations
 *
 * @param {Object} params - Hook parameters
 * @param {Object} params.upgradeParams - Upgrade configuration parameters
 * @param {string} params.preCheckJobId - Pre-check job ID
 * @param {boolean} params.isConnected - WebSocket connection status
 * @param {Function} params.sendMessage - Function to send WebSocket messages
 * @param {string} params.wsChannel - Current WebSocket channel
 * @param {Function} params.setState - Function to update multiple state values
 *
 * @returns {Object} Upgrade operations
 */
export function useCodeUpgrade({
  upgradeParams,
  preCheckJobId,
  isConnected,
  sendMessage,
  wsChannel,
  setState
}) {
 
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
  const startUpgradeExecution = useCallback(async () => {
    console.log("[UPGRADE] ===== UPGRADE EXECUTION INITIATED =====");
    console.log("[UPGRADE] Pre-check job ID:", preCheckJobId);
 
    // ======================================================================
    // VALIDATION
    // ======================================================================
    const validationErrors = validateUpgradeParameters(upgradeParams);
    if (validationErrors.length > 0) {
      console.error("[UPGRADE] ❌ Validation failed:", validationErrors);
      setState({
        jobOutput: prev => [...prev, ...validationErrors.map(error => ({
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
      console.error("[UPGRADE] ❌ WebSocket not connected");
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
      console.log(`[UPGRADE] Unsubscribing from previous channel: ${wsChannel}`);
      sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
    }
 
    // ======================================================================
    // STATE RESET
    // ======================================================================
    setState({
      activeTab: "execute",
      currentPhase: "upgrade",
      jobStatus: "running",
      progress: 0,
      jobOutput: [],
      finalResults: null,
      completedSteps: 0,
      totalSteps: 0,
    });
 
    // Clear refs
    setState({
      processedStepsRef: new Set(),
      loggedMessagesRef: new Set(),
    });
 
    // ======================================================================
    // API CALL
    // ======================================================================
    const payload = prepareApiPayload({
      ...upgradeParams,
      pre_check_job_id: preCheckJobId
    }, 'upgrade');
 
    console.log("[UPGRADE] Submitting to API endpoint:", `${API_URL}${ENDPOINTS.EXECUTE}`);
 
    try {
      const response = await fetch(`${API_URL}${ENDPOINTS.EXECUTE}`, {
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
 
      setState({
        jobId: data.job_id,
        wsChannel: data.ws_channel,
      });
 
      // Subscribe to WebSocket updates
      console.log(`[WEBSOCKET] Subscribing to channel: ${data.ws_channel}`);
      sendMessage({ type: 'SUBSCRIBE', channel: data.ws_channel });
 
      setState({
        jobOutput: prev => [...prev, {
          timestamp: new Date().toISOString(),
          message: `Upgrade job started successfully. Job ID: ${data.job_id}`,
          level: 'info',
          event_type: 'JOB_STARTED'
        }]
      });
 
    } catch (error) {
      console.error("[UPGRADE] ❌ API Call Failed:", error);
 
      setState({
        jobOutput: prev => [...prev, {
          timestamp: new Date().toISOString(),
          message: `Upgrade start failed: ${error.message}`,
          level: 'error',
          event_type: 'API_ERROR'
        }],
        jobStatus: "failed",
        activeTab: "results",
      });
    }
  }, [upgradeParams, preCheckJobId, isConnected, sendMessage, wsChannel, setState]);
 
  return {
    startUpgradeExecution,
  };
}