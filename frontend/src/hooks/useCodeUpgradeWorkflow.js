/**
 * =============================================================================
 * CODE UPGRADE WORKFLOW HOOK
 * =============================================================================
 *
 * Business logic layer for code upgrade workflow
 * Handles API calls, validation, and workflow orchestration
 *
 * Location: src/hooks/useCodeUpgradeWorkflow.js
 * Author: nikos-geranios_vgi
 * Date: 2025-12-01
 * Version: 1.0.0
 * =============================================================================
 */

import { useCallback, useEffect } from 'react';
import { useCodeUpgradeStore, WORKFLOW_STEPS } from '@/lib/codeUpgradeStore';

export function useCodeUpgradeWorkflow() {
  // Access store
  const {
    deviceConfig,
    currentStep,
    preCheck,
    upgrade,
    error,
    moveToPreCheck,
    moveToReview,
    moveToUpgrade,
    moveToResults,
    setPreCheckJobId,
    setUpgradeJobId,
    addPreCheckLog,
    addUpgradeLog,
    updateUpgradeProgress,
    setPreCheckComplete,
    setUpgradeComplete,
    setError,
    clearError,
    reset,
    canStartPreCheck: storeCanStartPreCheck,
    canStartUpgrade: storeCanStartUpgrade,
  } = useCodeUpgradeStore();

  // ===========================================================================
  // PRE-CHECK WORKFLOW
  // ===========================================================================

  /**
   * Start pre-check validation
   *
   * Workflow:
   * 1. Validate device config
   * 2. Call API to start pre-check job
   * 3. Transition to PRE_CHECK tab
   * 4. Store job info for WebSocket handling
   */
  const startPreCheck = useCallback(async () => {
    try {
      clearError();

      // Enhanced validation with specific error messages
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

      // Build API payload with proper field names
      const payload = {
        hostname: deviceConfig.hostname.trim(),
        username: deviceConfig.username.trim(),
        password: deviceConfig.password.trim(),
        target_version: deviceConfig.target_version.trim(),
        image_filename: deviceConfig.image_filename.trim(),
        pre_check_selection: deviceConfig.selectedPreChecks.join(','),
      };

      console.log('[WORKFLOW] Starting pre-check with payload:', payload);

      // Call API
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

      // Update store with job info - construct ws_channel if not provided
      const wsChannel = data.ws_channel || `ws_channel:job:${data.job_id}`;
      setPreCheckJobId(data.job_id, wsChannel);

      // Transition to pre-check tab
      moveToPreCheck();

      // Add initial log
      addPreCheckLog({
        id: `log_${Date.now()}`,
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message: 'Pre-check validation started',
        details: `Job ID: ${data.job_id}`,
      });

      console.log('[WORKFLOW] Pre-check started:', data.job_id);

    } catch (error) {
      console.error('[WORKFLOW] Pre-check start failed:', error);
      setError(error.message);
    }
  }, [
    deviceConfig,
    storeCanStartPreCheck,
    setPreCheckJobId,
    moveToPreCheck,
    addPreCheckLog,
    clearError,
    setError,
  ]);

  // ===========================================================================
  // UPGRADE WORKFLOW
  // ===========================================================================

  /**
   * Start upgrade execution
   *
   * Workflow:
   * 1. Validate pre-check passed
   * 2. Call API to start upgrade job
   * 3. Transition to UPGRADE tab
   * 4. Store job info for WebSocket handling
   */
  const startUpgrade = useCallback(async (userOptions = {}) => {
    try {
      clearError();

      // Validation
      if (!storeCanStartUpgrade()) {
        throw new Error('Cannot proceed - pre-check validation failed or upgrade already running');
      }

      // Build API payload with user options
      const payload = {
        hostname: deviceConfig.hostname,
        username: deviceConfig.username,
        password: deviceConfig.password,
        target_version: deviceConfig.targetVersion,
        image_filename: deviceConfig.imageFilename,
        pre_check_job_id: preCheck.jobId,
        ...userOptions, // User-selected upgrade options
      };

      console.log('[WORKFLOW] Starting upgrade with payload:', payload);

      // Call API
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

      // Transition to upgrade tab
      moveToUpgrade();

      // Add initial log
      addUpgradeLog({
        id: `log_${Date.now()}`,
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message: 'Upgrade execution started',
        details: `Job ID: ${data.job_id}`,
      });

      console.log('[WORKFLOW] Upgrade started:', data.job_id);

    } catch (error) {
      console.error('[WORKFLOW] Upgrade start failed:', error);
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

  const cancelUpgrade = useCallback(() => {
    // Cancel current upgrade and reset state
    reset();
  }, [reset]);

  const retryPreCheck = useCallback(() => {
    // Clear current pre-check and restart
    moveToPreCheck();
  }, [moveToPreCheck]);

  // Auto-transition effects
  useEffect(() => {
    // Auto-transition to results when upgrade completes
    if (upgrade.result && currentStep === WORKFLOW_STEPS.UPGRADE) {
      moveToResults(upgrade.result);
    }
  }, [upgrade.result, currentStep, moveToResults]);

  // ===========================================================================
  // RETURN PUBLIC API
  // ===========================================================================

  return {
    // State
    currentStep,
    deviceConfig,
    preCheck,
    upgrade,
    error,

    // Actions
    startPreCheck,
    startUpgrade,
    cancelUpgrade,
    retryPreCheck,

    // Computed
    canStartPreCheck,
    canStartUpgrade,

    // Navigation
    moveToReview,
    moveToResults,

    // Utilities
    clearError,
    reset,
  };
}

export default useCodeUpgradeWorkflow;