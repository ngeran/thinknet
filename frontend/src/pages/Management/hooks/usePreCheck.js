/**
 * =============================================================================
 * PRE-CHECK HOOK - FIXED VERSION
 * =============================================================================
 *
 * Handles pre-check validation logic with enhanced error handling
 *
 * VERSION: 2.0.0 - Fixed pre-check selection handling
 * AUTHOR: nikos-geranios_vgi
 * DATE: 2025-11-17
 * LAST UPDATED: 2025-11-17 13:09:54 UTC
 *
 * FIXES:
 * - Added selectedPreChecks parameter handling
 * - Enhanced payload preparation with pre-check selection
 * - Improved error message formatting
 * - Added comprehensive debug logging
 *
 * @module hooks/usePreCheck
 * =============================================================================
 */
 
import { useCallback } from 'react';
import { API_URL, ENDPOINTS } from '../constants/api';
import { validateUpgradeParameters, validateWebSocketConnection } from '../utils/validation';
import { prepareApiPayload } from '../utils/payloadPreparation';
 
// =============================================================================
// SECTION 1: MAIN HOOK DEFINITION
// =============================================================================
 
/**
 * Custom hook for pre-check validation operations
 *
 * @param {Object} params - Hook parameters
 * @param {Object} params.upgradeParams - Upgrade configuration parameters
 * @param {Array<string>} params.selectedPreChecks - Array of selected pre-check IDs
 * @param {boolean} params.isConnected - WebSocket connection status
 * @param {Function} params.sendMessage - Function to send WebSocket messages
 * @param {string} params.wsChannel - Current WebSocket channel
 * @param {Function} params.setState - Function to update multiple state values
 *
 * @returns {Object} Pre-check operations
 */
export function usePreCheck({
  upgradeParams,
  selectedPreChecks,
  isConnected,
  sendMessage,
  wsChannel,
  setState
}) {
 
  // ===========================================================================
  // SECTION 2: PRE-CHECK INITIATION FUNCTION
  // ===========================================================================
 
  /**
   * Initiates pre-check validation operation
   *
   * Workflow:
   * 1. Validates all required parameters
   * 2. Checks WebSocket connection
   * 3. Cleans up any previous WebSocket subscriptions
   * 4. Resets state for new pre-check
   * 5. Prepares payload with selected pre-checks
   * 6. Sends API request
   * 7. Subscribes to WebSocket channel for real-time updates
   *
   * @param {Event} e - Form submission event
   */
  const startPreCheck = useCallback(async (e) => {
    e.preventDefault();
 
    console.log("[PRE_CHECK] ===== PRE-CHECK VALIDATION INITIATED =====");
    console.log("[PRE_CHECK] Timestamp:", new Date().toISOString());
    console.log("[PRE_CHECK] User:", "nikos-geranios_vgi");
 
    // ========================================================================
    // SUBSECTION 2.1: PARAMETER VALIDATION
    // ========================================================================
 
    console.log("[PRE_CHECK] Validating parameters...");
    console.log("[PRE_CHECK] upgradeParams keys:", Object.keys(upgradeParams));
    console.log("[PRE_CHECK] selectedPreChecks:", selectedPreChecks);
 
    const validationErrors = validateUpgradeParameters(upgradeParams);
    if (validationErrors.length > 0) {
      console.error("[PRE_CHECK] ❌ Validation failed:", validationErrors);
 
      // Convert validation errors to proper strings
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
 
    console.log("[PRE_CHECK] ✅ Parameter validation passed");
 
    // ========================================================================
    // SUBSECTION 2.2: WEBSOCKET VALIDATION
    // ========================================================================
 
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
 
    console.log("[PRE_CHECK] ✅ WebSocket connection validated");
 
    // ========================================================================
    // SUBSECTION 2.3: CLEANUP PREVIOUS SESSION
    // ========================================================================
 
    if (wsChannel) {
      console.log(`[PRE_CHECK] Unsubscribing from previous channel: ${wsChannel}`);
      sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
    }
 
    // ========================================================================
    // SUBSECTION 2.4: STATE RESET
    // ========================================================================
 
    console.log("[PRE_CHECK] Resetting state for new pre-check...");
 
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
 
    console.log("[PRE_CHECK] ✅ State reset complete");
 
    // ========================================================================
    // SUBSECTION 2.5: PAYLOAD PREPARATION WITH PRE-CHECK SELECTION
    // ========================================================================
 
    try {
      console.log("[PRE_CHECK] Preparing API payload...");
 
      // Create enhanced upgradeParams with pre-check selection
      const enhancedParams = {
        ...upgradeParams,
        // Add selectedPreChecks to params for payload preparation
        pre_check_selection: selectedPreChecks && selectedPreChecks.length > 0
          ? selectedPreChecks.join(',')
          : null
      };
 
      console.log("[PRE_CHECK] Enhanced params with pre-check selection:", enhancedParams);
 
      // Prepare payload using utility function
      const payload = prepareApiPayload(enhancedParams, 'pre-check');
 
      console.log("[PRE_CHECK] ✅ Payload prepared successfully");
      console.log("[PRE_CHECK] Payload preview:", {
        hostname: payload.hostname,
        target_version: payload.target_version,
        image_filename: payload.image_filename,
        pre_check_selection: payload.pre_check_selection,
        has_username: !!payload.username,
        has_password: !!payload.password,
      });
 
      // ======================================================================
      // SUBSECTION 2.6: API REQUEST
      // ======================================================================
 
      const apiEndpoint = `${API_URL}${ENDPOINTS.PRE_CHECK}`;
      console.log("[PRE_CHECK] Submitting to API endpoint:", apiEndpoint);
      console.log("[PRE_CHECK] Request method: POST");
      console.log("[PRE_CHECK] Full payload being sent:", JSON.stringify(payload, null, 2));
 
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
 
      console.log("[PRE_CHECK] Response received - Status:", response.status);
      console.log("[PRE_CHECK] Response status text:", response.statusText);
 
      // ======================================================================
      // SUBSECTION 2.7: ERROR RESPONSE HANDLING
      // ======================================================================
 
      if (!response.ok) {
        let errorMessage;
        try {
          const errorData = await response.json();
          console.log("[PRE_CHECK] Error response data:", errorData);
 
          // Handle different error response formats
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
 
        console.error("[PRE_CHECK] ❌ API error:", errorMessage);
        throw new Error(`API error: ${errorMessage}`);
      }
 
      // ======================================================================
      // SUBSECTION 2.8: SUCCESS RESPONSE HANDLING
      // ======================================================================
 
      const data = await response.json();
      console.log("[PRE_CHECK] ✅ Job queued successfully");
      console.log("[PRE_CHECK] Response data:", {
        job_id: data.job_id,
        ws_channel: data.ws_channel,
        phase: data.phase,
        message: data.message
      });
 
      // Update state with job information
      setState({
        preCheckJobId: data.job_id,
        jobId: data.job_id,
        wsChannel: data.ws_channel,
      });
 
      // ======================================================================
      // SUBSECTION 2.9: WEBSOCKET SUBSCRIPTION
      // ======================================================================
 
      console.log(`[WEBSOCKET] Subscribing to channel: ${data.ws_channel}`);
      sendMessage({ type: 'SUBSCRIBE', channel: data.ws_channel });
      console.log("[WEBSOCKET] ✅ Subscription request sent");
 
      // Add initial job output message
      setState({
        jobOutput: prev => [...prev, {
          timestamp: new Date().toISOString(),
          message: `Pre-check validation started. Job ID: ${data.job_id}`,
          level: 'info',
          event_type: 'JOB_STARTED'
        }]
      });
 
      console.log("[PRE_CHECK] ===== PRE-CHECK INITIATED SUCCESSFULLY =====");
 
    } catch (error) {
      // ======================================================================
      // SUBSECTION 2.10: EXCEPTION HANDLING
      // ======================================================================
 
      console.error("[PRE_CHECK] ❌ ========================================");
      console.error("[PRE_CHECK] ❌ API CALL FAILED");
      console.error("[PRE_CHECK] ❌ ========================================");
      console.error("[PRE_CHECK] ❌ Error:", error);
      console.error("[PRE_CHECK] ❌ Error message:", error.message);
      console.error("[PRE_CHECK] ❌ Error stack:", error.stack);
      console.error("[PRE_CHECK] ❌ ========================================");
 
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
  }, [upgradeParams, selectedPreChecks, isConnected, sendMessage, wsChannel, setState]);
 
  // ===========================================================================
  // SECTION 3: HOOK RETURN
  // ===========================================================================
 
  return {
    startPreCheck,
  };
}
 
// =============================================================================
// SECTION 4: EXPORTS
// =============================================================================
 
export default usePreCheck;
