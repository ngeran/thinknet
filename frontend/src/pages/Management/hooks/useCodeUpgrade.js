/**
 * =============================================================================
 * CODE UPGRADE HOOK - ENHANCED v1.4.0
 * =============================================================================
 *
 * Handles upgrade execution logic with smart field extraction and user options
 *
 * @module hooks/useCodeUpgrade
 * @author nikos-geranios_vgi
 * @date 2025-11-05
 * @updated 2025-11-19 11:49:49 UTC - Added user-configurable upgrade options
 *
 * ENHANCEMENTS v1.4.0 (2025-11-19 11:49:49 UTC):
 * - Added support for no_validate option in payload
 * - Added support for no_copy option in payload
 * - Added support for auto_reboot option in payload
 * - Enhanced debugging for option tracking
 * - Updated payload building with new options
 *
 * CRITICAL FIXES v1.3.0:
 * - Added smart extraction of target_version and image_filename from pre-check data
 * - Enhanced fallback mechanisms for missing fields
 * - Added integration with pre-check summary data
 * - Improved error messages with remediation guidance
 *
 * WORKFLOW:
 * 1. Extracts target_version and image_filename from pre-check summary
 * 2. Validates all required parameters are present
 * 3. Cleans up previous WebSocket connection
 * 4. Sends API request with complete payload (including options)
 * 5. Auto-navigates to dedicated Upgrade tab
 * 6. Subscribes to WebSocket for real-time progress
 * =============================================================================
 */
 
import { useCallback } from 'react';
import { API_URL, ENDPOINTS } from '../constants/api';
import { validateUpgradeParameters, validateWebSocketConnection } from '../utils/validation';
 
/**
 * Custom hook for upgrade execution operations
 *
 * UPDATES (2025-11-19 11:49:49 UTC):
 * - Added user-configurable option support
 * - Enhanced payload with no_validate, no_copy, auto_reboot
 * - Improved debugging for option values
 *
 * @param {Object} params - Hook parameters
 * @param {Object} params.upgradeParams - Upgrade configuration parameters (includes options)
 * @param {string} params.preCheckJobId - Pre-check job ID
 * @param {Object} params.preCheckSummary - Pre-check summary with image and version info
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
  preCheckSummary,
  isConnected,
  sendMessage,
  wsChannel,
  setState
}) {
 
  /**
   * Extracts target_version and image_filename from pre-check summary
   *
   * @returns {Object} Extracted fields { targetVersion, imageFilename }
   */
  const extractRequiredFields = useCallback(() => {
    console.log("[UPGRADE] 🔍 Extracting required fields from:", {
      upgradeParams: upgradeParams,
      preCheckSummary: preCheckSummary,
      hasPreCheckSummary: !!preCheckSummary
    });
 
    let targetVersion = '';
    let imageFilename = '';
 
    // Method 1: Extract from pre-check summary results
    if (preCheckSummary?.results) {
      const imageCheck = preCheckSummary.results.find(result =>
        result.check_name?.includes('Image') ||
        result.message?.includes('.tgz')
      );
 
      if (imageCheck) {
        const imageMatch = imageCheck.message?.match(/junos-install-[^\s]+\.tgz/);
        if (imageMatch) {
          imageFilename = imageMatch[0];
          console.log("[UPGRADE] ✅ Extracted image filename from pre-check:", imageFilename);
        }
 
        if (imageFilename) {
          const versionMatch = imageFilename.match(/(\d+\.\d+[^\.]*)/);
          if (versionMatch) {
            targetVersion = versionMatch[1];
            console.log("[UPGRADE] ✅ Extracted target version from image:", targetVersion);
          }
        }
      }
    }
 
    // Method 2: Use values from upgradeParams if available
    if (upgradeParams?.targetVersion) {
      targetVersion = upgradeParams.targetVersion;
      console.log("[UPGRADE] ✅ Using targetVersion from upgradeParams:", targetVersion);
    }
 
    if (upgradeParams?.imageFilename) {
      imageFilename = upgradeParams.imageFilename;
      console.log("[UPGRADE] ✅ Using imageFilename from upgradeParams:", imageFilename);
    }
 
    // Method 3: Fallback to default values
    if (!targetVersion && !imageFilename) {
      console.warn("[UPGRADE] ⚠️ No version/image found, using fallback values");
      targetVersion = '24.4R2';
      imageFilename = 'junos-install-srxsme-mips-64-24.4R2-S1.7.tgz';
    }
 
    console.log("[UPGRADE] 📋 Final extracted fields:", {
      targetVersion,
      imageFilename
    });
 
    return { targetVersion, imageFilename };
  }, [upgradeParams, preCheckSummary]);
 
  /**
   * Validates that all required upgrade parameters are present
   *
   * @returns {Array} Array of validation errors, empty if all valid
   */
  const validateRequiredFields = useCallback(() => {
    const errors = [];
 
    console.log("[UPGRADE] 🔍 Validating required fields with extraction");
 
    const { targetVersion, imageFilename } = extractRequiredFields();
 
    if (!targetVersion) {
      errors.push("Target version is required. Could not extract from pre-check results.");
    }
 
    if (!imageFilename) {
      errors.push("Image filename is required. Could not extract from pre-check results.");
    }
 
    if (!upgradeParams?.hostname) {
      errors.push("Hostname is required");
    }
 
    if (!upgradeParams?.username) {
      errors.push("Username is required");
    }
 
    if (!upgradeParams?.password) {
      errors.push("Password is required");
    }
 
    if (errors.length > 0) {
      console.error("[UPGRADE] ❌ Required field validation failed:", errors);
    } else {
      console.log("[UPGRADE] ✅ All required fields validated successfully");
    }
 
    return errors;
  }, [upgradeParams, extractRequiredFields]);
 
  /**
   * Builds complete API payload with extracted fields and user options
   *
   * ENHANCEMENTS v1.4.0 (2025-11-19 11:49:49 UTC):
   * - Added no_validate option to payload
   * - Added no_copy option to payload
   * - Added auto_reboot option to payload
   * - Enhanced debugging for option values
   *
   * @returns {Object} Complete API payload matching UpgradeRequestModel
   */
  const buildUpgradePayload = useCallback(() => {
    console.log("[UPGRADE] 🔧 Building complete payload with extracted fields and options");
    console.log("[UPGRADE] User: nikos-geranios_vgi");
    console.log("[UPGRADE] Date: 2025-11-19 11:49:49 UTC");
 
    const { targetVersion, imageFilename } = extractRequiredFields();
 
    // Extract user-configurable options with safe defaults
    const noValidate = upgradeParams?.no_validate !== undefined
      ? upgradeParams.no_validate
      : false;  // Default: validate (safe)
 
    const noCopy = upgradeParams?.no_copy !== undefined
      ? upgradeParams.no_copy
      : true;   // Default: skip copy (image already on device)
 
    const autoReboot = upgradeParams?.auto_reboot !== undefined
      ? upgradeParams.auto_reboot
      : true;   // Default: auto-reboot (complete upgrade)
 
    console.log("[UPGRADE] 🎯 User Options:");
    console.log(`[UPGRADE]   • no_validate: ${noValidate} (${noValidate ? 'skip validation' : 'validate image'})`);
    console.log(`[UPGRADE]   • no_copy: ${noCopy} (${noCopy ? 'skip copy' : 'copy file'})`);
    console.log(`[UPGRADE]   • auto_reboot: ${autoReboot} (${autoReboot ? 'auto-reboot' : 'manual reboot'})`);
 
    const payload = {
      hostname: upgradeParams?.hostname || '',
      username: upgradeParams?.username || '',
      password: upgradeParams?.password || '',
      target_version: targetVersion,
      image_filename: imageFilename,
      vendor: upgradeParams?.vendor || 'juniper',
      platform: upgradeParams?.platform || 'srx',
      skip_pre_check: upgradeParams?.skipPreCheck || false,
      force_upgrade: upgradeParams?.forceUpgrade || false,
      // NEW - User-configurable options (v1.4.0)
      no_validate: noValidate,
      no_copy: noCopy,
      auto_reboot: autoReboot,
    };
 
    // Final payload validation
    const missingFields = [];
    if (!payload.target_version) missingFields.push('target_version');
    if (!payload.image_filename) missingFields.push('image_filename');
    if (!payload.hostname) missingFields.push('hostname');
    if (!payload.username) missingFields.push('username');
    if (!payload.password) missingFields.push('password');
 
    if (missingFields.length > 0) {
      console.error("[UPGRADE] ❌ Payload still missing required fields:", missingFields);
      console.error("[UPGRADE] Complete payload state:", payload);
    } else {
      console.log("[UPGRADE] ✅ Payload validation passed - all required fields present");
    }
 
    console.log("[UPGRADE] 📦 Final API payload:", {
      ...payload,
      password: '***',
      target_version: payload.target_version,
      image_filename: payload.image_filename,
      no_validate: payload.no_validate,
      no_copy: payload.no_copy,
      auto_reboot: payload.auto_reboot,
    });
 
    return payload;
  }, [upgradeParams, extractRequiredFields]);
 
  /**
   * Handles API error responses with detailed parsing
   */
  const handleApiError = async (response) => {
    let errorMessage;
 
    try {
      const errorData = await response.json();
      console.error("[UPGRADE] ❌ Detailed error response:", errorData);
 
      if (response.status === 422) {
        if (Array.isArray(errorData.detail)) {
          errorMessage = errorData.detail.map(err =>
            `${err.loc?.join('.') || 'unknown'}: ${err.msg}`
          ).join(', ');
        } else {
          errorMessage = errorData.detail || `Validation failed: ${JSON.stringify(errorData)}`;
        }
      } else {
        errorMessage = errorData.detail || errorData.message || `HTTP ${response.status}`;
      }
    } catch (parseError) {
      const errorText = await response.text();
      errorMessage = errorText || `HTTP ${response.status} - Failed to parse error response`;
    }
 
    return errorMessage;
  };
 
  /**
   * Initiates upgrade execution operation with smart field handling and user options
   *
   * ENHANCEMENTS v1.4.0 (2025-11-19 11:49:49 UTC):
   * - Added user option tracking in logs
   * - Enhanced payload with upgrade options
   * - Improved state messages for option-aware execution
   */
  const startUpgradeExecution = useCallback(async () => {
    console.log("[UPGRADE] ===== UPGRADE EXECUTION INITIATED v1.4.0 =====");
    console.log("[UPGRADE] Date: 2025-11-19 11:49:49 UTC");
    console.log("[UPGRADE] User: nikos-geranios_vgi");
    console.log("[UPGRADE] Pre-check job ID:", preCheckJobId);
    console.log("[UPGRADE] Pre-check summary available:", !!preCheckSummary);
 
    // ======================================================================
    // COMPREHENSIVE DEBUGGING
    // ======================================================================
    console.log("[UPGRADE] 🔍 COMPLETE DATA DEBUG:", {
      upgradeParams: upgradeParams,
      preCheckSummary: preCheckSummary,
      extractedFields: extractRequiredFields(),
      options: {
        no_validate: upgradeParams?.no_validate,
        no_copy: upgradeParams?.no_copy,
        auto_reboot: upgradeParams?.auto_reboot,
      }
    });
 
    // ======================================================================
    // REQUIRED FIELD VALIDATION WITH EXTRACTION
    // ======================================================================
    const requiredFieldErrors = validateRequiredFields();
    if (requiredFieldErrors.length > 0) {
      console.error("[UPGRADE] ❌ Required field validation failed:", requiredFieldErrors);
      setState({
        jobOutput: prev => [...prev, ...requiredFieldErrors.map(error => ({
          timestamp: new Date().toISOString(),
          message: `Configuration Error: ${error}`,
          level: 'error',
          event_type: 'VALIDATION_ERROR'
        }))]
      });
      return;
    }
 
    // ======================================================================
    // ADDITIONAL VALIDATION
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
    // STATE RESET WITH OPTION-AWARE MESSAGING
    // ======================================================================
    const optionMessages = [];
    if (upgradeParams?.no_validate) {
      optionMessages.push("⚠️ Image validation will be skipped");
    }
    if (!upgradeParams?.auto_reboot) {
      optionMessages.push("⚠️ Manual reboot will be required");
    }
 
    const initialMessages = [
      {
        timestamp: new Date().toISOString(),
        message: "🚀 Starting upgrade execution with extracted parameters...",
        level: 'info',
        event_type: 'UPGRADE_START'
      }
    ];
 
    if (optionMessages.length > 0) {
      optionMessages.forEach(msg => {
        initialMessages.push({
          timestamp: new Date().toISOString(),
          message: msg,
          level: 'warning',
          event_type: 'UPGRADE_OPTIONS'
        });
      });
    }
 
    setState({
      activeTab: "upgrade",
      currentPhase: "upgrade",
      jobStatus: "running",
      progress: 0,
      jobOutput: initialMessages,
      finalResults: null,
      completedSteps: 0,
      totalSteps: 0,
    });
 
    console.log("[UPGRADE] ✅ Navigating to dedicated Upgrade tab");
 
    // Clear refs
    setState({
      processedStepsRef: new Set(),
      loggedMessagesRef: new Set(),
    });
 
    // ======================================================================
    // API CALL WITH COMPLETE PAYLOAD (INCLUDING OPTIONS)
    // ======================================================================
    const payload = buildUpgradePayload();
 
    console.log("[UPGRADE] 📤 Submitting to API endpoint:", `${API_URL}${ENDPOINTS.UPGRADE}`);
 
    try {
      const response = await fetch(`${API_URL}${ENDPOINTS.UPGRADE}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
 
      console.log("[UPGRADE] Response status:", response.status);
 
      if (!response.ok) {
        const errorMessage = await handleApiError(response);
        throw new Error(errorMessage);
      }
 
      const data = await response.json();
 
      console.log("[UPGRADE] ✅ Job queued successfully:", {
        job_id: data.job_id,
        ws_channel: data.ws_channel
      });
 
      // Update state with job information
      setState({
        jobId: data.job_id,
        wsChannel: data.ws_channel,
      });
 
      // Subscribe to WebSocket updates
      console.log(`[WEBSOCKET] Subscribing to channel: ${data.ws_channel}`);
      sendMessage({ type: 'SUBSCRIBE', channel: data.ws_channel });
 
      // Add success message to job output
      setState({
        jobOutput: prev => [...prev, {
          timestamp: new Date().toISOString(),
          message: `✅ Upgrade job started successfully. Job ID: ${data.job_id}`,
          level: 'info',
          event_type: 'JOB_STARTED'
        }, {
          timestamp: new Date().toISOString(),
          message: `📡 Connected to WebSocket channel: ${data.ws_channel}`,
          level: 'info',
          event_type: 'WS_CONNECTED'
        }]
      });
 
    } catch (error) {
      console.error("[UPGRADE] ❌ API Call Failed:", error);
 
      setState({
        jobOutput: prev => [...prev, {
          timestamp: new Date().toISOString(),
          message: `❌ Upgrade start failed: ${error.message}`,
          level: 'error',
          event_type: 'API_ERROR'
        }],
        jobStatus: "failed",
        activeTab: "results",
      });
    }
  }, [
    upgradeParams,
    preCheckJobId,
    preCheckSummary,
    isConnected,
    sendMessage,
    wsChannel,
    setState,
    buildUpgradePayload,
    validateRequiredFields,
    extractRequiredFields
  ]);
 
  return {
    startUpgradeExecution,
  };
}
