/**
 * =============================================================================
 * CODE UPGRADE WORKFLOW HOOK - ZUSTAND VERSION
 * =============================================================================
 *
 * Business logic layer for code upgrade workflow using Zustand store
 * Provides the same interface as existing hooks but uses centralized state
 *
 * Location: src/hooks/useCodeUpgradeWorkflowZustand.js
 * Author: nikos-geranios_vgi
 * Date: 2025-12-01
 * Version: 1.0.0 - Phase 3 implementation
 * =============================================================================
 */

import { useCallback } from 'react';
import { useCodeUpgradeStore, WORKFLOW_STEPS } from '@/lib/codeUpgradeStore';

/**
 * Zustand-based workflow hook for code upgrade operations
 *
 * This hook provides the same business logic functions as the existing
 * usePreCheck and useCodeUpgrade hooks, but uses the Zustand store
 * for state management instead of prop drilling.
 *
 * @param {Object} params - Hook parameters
 * @param {Function} params.sendMessage - WebSocket send function
 *
 * @returns {Object} Workflow operations and state
 */
export function useCodeUpgradeWorkflowZustand({ sendMessage } = {}) {
  // Access store
  const {
    deviceConfig,
    currentStep,
    preCheck,
    upgrade,
    error,
    isProcessing,

    // Actions
    updateDeviceConfig,
    setCurrentStep,
    startPreCheck,
    moveToReview,
    moveToUpgrade,
    moveToResults,
    setPreCheckJobId,
    setUpgradeJobId,
    addPreCheckLog,
    addUpgradeLog,
    setPreCheckComplete,
    setUpgradeComplete,
    setError,
    clearError,
    reset,

    // Selectors
    canStartPreCheck: storeCanStartPreCheck,
    canStartUpgrade: storeCanStartUpgrade,
    isTabAccessible,
  } = useCodeUpgradeStore();

  // ===========================================================================
  // DEVICE CONFIG MANAGEMENT (Zustand version)
  // ===========================================================================

  /**
   * Handle device configuration changes
   * Mirrors the existing handleParamChange functionality
   */
  const handleDeviceConfigChange = useCallback((name, value) => {
    console.log(`[ZUSTAND_WORKFLOW] Device config change: ${name} = ${value}`);

    // Update device config in store
    updateDeviceConfig({ [name]: value });

    // Auto-extract version when image is selected (same logic as original)
    if (name === 'image_filename' && value) {
      // For now, we'll skip version extraction since it requires the utility function
      // This can be added later when needed
      console.log(`[ZUSTAND_WORKFLOW] Image selected: ${value}`);
    }
  }, [updateDeviceConfig]);

  /**
   * Handle pre-check selection changes
   */
  const handlePreCheckSelectionChange = useCallback((checkIds) => {
    console.log(`[ZUSTAND_WORKFLOW] Pre-check selection:`, checkIds);
    updateDeviceConfig({ selectedPreChecks: checkIds });
  }, [updateDeviceConfig]);

  // ===========================================================================
  // PRE-CHECK WORKFLOW (Zustand version)
  // ===========================================================================

  /**
   * Start pre-check validation using Zustand store
   * Replaces the existing usePreCheck().startPreCheck function
   */
  const startPreCheckExecution = useCallback(async () => {
    try {
      clearError();

      // Validation using store data
      const missingFields = [];
      if (!deviceConfig.hostname?.trim()) missingFields.push('hostname');
      if (!deviceConfig.username?.trim()) missingFields.push('username');
      if (!deviceConfig.password?.trim()) missingFields.push('password');
      if (!deviceConfig.image_filename?.trim()) missingFields.push('image filename');
      if (!deviceConfig.target_version?.trim()) missingFields.push('target version');
      if (!deviceConfig.selectedPreChecks?.length) missingFields.push('pre-check selections');

      if (missingFields.length > 0) {
        throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
      }

      // Build API payload using store data
      const payload = {
        hostname: deviceConfig.hostname.trim(),
        username: deviceConfig.username.trim(),
        password: deviceConfig.password.trim(),
        target_version: deviceConfig.target_version.trim(),
        image_filename: deviceConfig.image_filename.trim(),
        pre_check_selection: deviceConfig.selectedPreChecks.join(','),
      };

      console.log('[ZUSTAND_WORKFLOW] Starting pre-check with payload:', payload);

      // Call API (same endpoint as existing implementation)
      const response = await fetch('http://localhost:8000/api/operations/pre-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Pre-check start failed');
      }

      const data = await response.json();

      // Update store with job info
      const wsChannel = data.ws_channel || `ws_channel:job:${data.job_id}`;
      setPreCheckJobId(data.job_id, wsChannel);
      setCurrentStep('pre_check');

      // Subscribe to WebSocket channel for real-time updates
      if (sendMessage && wsChannel) {
        console.log('[ZUSTAND_WORKFLOW] Subscribing to WebSocket channel:', wsChannel);
        const subscribeMessage = { type: 'SUBSCRIBE', channel: wsChannel };
        console.log('[ZUSTAND_WORKFLOW] Sending subscription message:', subscribeMessage);
        sendMessage(subscribeMessage);
      } else {
        console.warn('[ZUSTAND_WORKFLOW] Cannot subscribe to WebSocket - missing sendMessage or wsChannel');
        console.log('[ZUSTAND_WORKFLOW] sendMessage:', !!sendMessage, 'wsChannel:', wsChannel);
      }

      // Add initial log
      addPreCheckLog({
        id: `log_${Date.now()}`,
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message: 'Pre-check validation started',
        details: `Job ID: ${data.job_id}`,
      });

      console.log('[ZUSTAND_WORKFLOW] Pre-check started:', data.job_id);

    } catch (error) {
      console.error('[ZUSTAND_WORKFLOW] Pre-check start failed:', error);
      setError(error.message);
    }
  }, [
    deviceConfig,
    storeCanStartPreCheck,
    setPreCheckJobId,
    setCurrentStep,
    addPreCheckLog,
    clearError,
    setError,
  ]);

  // ===========================================================================
  // UPGRADE WORKFLOW (Zustand version)
  // ===========================================================================

  /**
   * Start upgrade execution using Zustand store
   * Replaces the existing useCodeUpgrade().startUpgradeExecution function
   */
  const startUpgradeExecution = useCallback(async (userOptions = {}) => {
    try {
      clearError();

      // Validation
      if (!storeCanStartUpgrade()) {
        throw new Error('Cannot proceed - pre-check validation failed or upgrade already running');
      }

      // Build API payload using store data
      const payload = {
        hostname: deviceConfig.hostname,
        username: deviceConfig.username,
        password: deviceConfig.password,
        target_version: deviceConfig.target_version,
        image_filename: deviceConfig.image_filename,
        pre_check_job_id: preCheck.jobId,
        ...userOptions, // User-selected upgrade options
      };

      console.log('[ZUSTAND_WORKFLOW] Starting upgrade with payload:', payload);

      // Call API (same endpoint as existing implementation)
      const response = await fetch('http://localhost:8000/api/operations/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Upgrade start failed');
      }

      const data = await response.json();

      // Update store with job info
      setUpgradeJobId(data.job_id, data.ws_channel);
      moveToUpgrade();

      // Add initial log
      addUpgradeLog({
        id: `log_${Date.now()}`,
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message: 'Upgrade execution started',
        details: `Job ID: ${data.job_id}`,
      });

      console.log('[ZUSTAND_WORKFLOW] Upgrade started:', data.job_id);

    } catch (error) {
      console.error('[ZUSTAND_WORKFLOW] Upgrade start failed:', error);
      setError(error.message);
    }
  }, [
    deviceConfig,
    preCheck.jobId,
    storeCanStartUpgrade,
    setUpgradeJobId,
    moveToUpgrade,
    addUpgradeLog,
    clearError,
    setError,
  ]);

  // ===========================================================================
  // HELPER FUNCTIONS
  // ===========================================================================

  const canStartPreCheck = useCallback(() => {
    return storeCanStartPreCheck();
  }, [storeCanStartPreCheck]);

  const canStartUpgrade = useCallback(() => {
    return storeCanStartUpgrade();
  }, [storeCanStartUpgrade]);

  const cancelWorkflow = useCallback(() => {
    reset();
  }, [reset]);

  const resetWorkflow = useCallback(() => {
    console.log('[ZUSTAND_WORKFLOW] Resetting workflow');
    reset();
  }, [reset]);

  // ===========================================================================
  // RETURN PUBLIC API
  // ===========================================================================

  return {
    // State (from store)
    currentStep,
    deviceConfig,
    preCheck,
    upgrade,
    error,
    isProcessing,

    // Actions (Zustand versions)
    handleDeviceConfigChange,
    handlePreCheckSelectionChange,
    startPreCheckExecution,
    startUpgradeExecution,
    cancelWorkflow,
    resetWorkflow,

    // Computed
    canStartPreCheck,
    canStartUpgrade,

    // Navigation
    moveToReview,
    moveToResults,
    setCurrentStep,

    // Utilities
    clearError,

    // Tab accessibility
    isTabAccessible,
  };
}

export default useCodeUpgradeWorkflowZustand;