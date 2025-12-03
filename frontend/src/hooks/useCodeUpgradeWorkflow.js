/**
 * =============================================================================
 * CODE UPGRADE WORKFLOW HOOK v2.0.0
 * =============================================================================
 *
 * Business logic orchestrator for code upgrade workflow
 * Handles API calls, validation, and store updates
 *
 * ARCHITECTURE:
 * - Accesses Zustand store directly (no props needed)
 * - Makes API calls to backend
 * - Updates store with job IDs and results
 * - Returns workflow methods for components
 *
 * FLOW:
 * 1. Component calls startPreCheckExecution()
 * 2. Hook validates deviceConfig from store
 * 3. Hook calls /api/operations/pre-check
 * 4. Hook updates store with jobId and wsChannel
 * 5. Hook transitions to PRE_CHECK step
 * 6. WebSocket hook (useCodeUpgradeMessages) handles real-time updates
 *
 * Location: frontend/src/hooks/useCodeUpgradeWorkflow.js
 * Author: nikos-geranios_vgi
 * Date: 2025-12-02
 * Version: 2.0.0 - Clean architecture without Zustand suffix
 * =============================================================================
 */

import { useCallback } from 'react';
import { useCodeUpgradeStore, WORKFLOW_STEPS } from '@/lib/codeUpgradeStore';

// =============================================================================
// SECTION 1: CONFIGURATION
// =============================================================================

const API_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000';

// =============================================================================
// SECTION 2: MAIN HOOK DEFINITION
// =============================================================================

/**
 * Code Upgrade Workflow Hook
 *
 * Provides workflow orchestration methods that interact with backend
 * and update Zustand store. All business logic centralized here.
 *
 * @returns {Object} Workflow methods and store state
 */
export function useCodeUpgradeWorkflow() {
  // Access entire store
  const store = useCodeUpgradeStore();

  // ==========================================================================
  // SECTION 3: PRE-CHECK EXECUTION
  // ==========================================================================

  /**
   * Start Pre-Check Validation
   *
   * FLOW:
   * 1. Validate device configuration
   * 2. Build API payload
   * 3. POST to /api/operations/pre-check
   * 4. Extract job_id and ws_channel from response
   * 5. Update store with job info
   * 6. Transition to PRE_CHECK step
   * 7. Add initial log entry
   *
   * WebSocket subscription happens in useCodeUpgradeMessages hook
   */
  const startPreCheckExecution = useCallback(async () => {
    const {
      deviceConfig,
      setPreCheckJobId,
      startPreCheck,
      addPreCheckLog,
      setError,
      clearError,
    } = store;

    try {
      console.log('[WORKFLOW] Starting pre-check execution');
      clearError();

      // Validate required fields
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

      // Build API payload
      const payload = {
        hostname: deviceConfig.hostname.trim(),
        username: deviceConfig.username.trim(),
        password: deviceConfig.password.trim(),
        target_version: deviceConfig.target_version.trim(),
        image_filename: deviceConfig.image_filename.trim(),
        pre_check_selection: deviceConfig.selectedPreChecks.join(','),
      };

      console.log('[WORKFLOW] 🚀 API payload being sent:', {
        selectedPreChecks: deviceConfig.selectedPreChecks,
        pre_check_selection: payload.pre_check_selection,
        payload
      });

      // Call backend API
      const response = await fetch(`${API_URL}/api/operations/pre-check`, {
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
      console.log('[WORKFLOW] Pre-check job created:', data.job_id);

      // Construct WebSocket channel (backend may or may not provide it)
      const wsChannel = data.ws_channel || `job:${data.job_id}`;

      // Update store with job information
      setPreCheckJobId(data.job_id, wsChannel);
      startPreCheck();

      // Add initial log entry
      addPreCheckLog({
        id: `log_${Date.now()}`,
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message: `Pre-check job started: ${data.job_id}`,
      });

      console.log('[WORKFLOW] Pre-check started successfully');

    } catch (error) {
      console.error('[WORKFLOW] Pre-check start failed:', error);
      setError(error.message);
    }
  }, [store]);

  // ==========================================================================
  // SECTION 4: UPGRADE EXECUTION
  // ==========================================================================

  /**
   * Start Upgrade Execution
   *
   * FLOW:
   * 1. Validate pre-check completed
   * 2. Build API payload
   * 3. POST to /api/operations/upgrade
   * 4. Extract job_id and ws_channel
   * 5. Update store with job info
   * 6. Transition to UPGRADE step
   * 7. Add initial log entry
   */
  const startUpgradeExecution = useCallback(async () => {
    const {
      deviceConfig,
      preCheck,
      setUpgradeJobId,
      startUpgrade,
      addUpgradeLog,
      setError,
      clearError,
    } = store;

    try {
      console.log('[WORKFLOW] Starting upgrade execution');
      clearError();

      // Validate pre-check completed
      if (!preCheck.isComplete || !preCheck.jobId) {
        throw new Error('Pre-check must complete before starting upgrade');
      }

      // Build API payload
      const payload = {
        hostname: deviceConfig.hostname?.trim() || '',
        username: deviceConfig.username?.trim() || '',
        password: deviceConfig.password?.trim() || '',
        target_version: deviceConfig.target_version?.trim() || '',
        image_filename: deviceConfig.image_filename?.trim() || '',
        no_validate: deviceConfig.no_validate || false,
        no_copy: deviceConfig.no_copy || false,
        auto_reboot: deviceConfig.auto_reboot || false,
      };

      console.log('[WORKFLOW] Upgrade payload:', JSON.stringify(payload, null, 2));
      console.log('[WORKFLOW] Pre-check job ID:', preCheck.jobId);

      // Call backend API
      const response = await fetch(`${API_URL}/api/operations/upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('[WORKFLOW] Upgrade API error details:', JSON.stringify(errorData, null, 2));
        throw new Error(errorData.detail || JSON.stringify(errorData) || 'Upgrade start failed');
      }

      const data = await response.json();
      console.log('[WORKFLOW] Upgrade job created:', data.job_id);

      // Construct WebSocket channel
      const wsChannel = data.ws_channel || `job:${data.job_id}`;

      // Update store
      setUpgradeJobId(data.job_id, wsChannel);
      startUpgrade();

      // Add initial log
      addUpgradeLog({
        id: `log_${Date.now()}`,
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message: `Upgrade job started: ${data.job_id}`,
      });

      console.log('[WORKFLOW] Upgrade started successfully');

    } catch (error) {
      console.error('[WORKFLOW] Upgrade start failed:', error);
      setError(error.message);
    }
  }, [store]);

  // ==========================================================================
  // SECTION 5: PARAMETER HANDLERS
  // ==========================================================================

  /**
   * Handle device config changes
   * Updates a single field in deviceConfig
   */
  const handleDeviceConfigChange = useCallback((name, value) => {
    store.updateDeviceConfig({ [name]: value });
  }, [store]);

  /**
   * Handle pre-check selection changes
   * Updates selectedPreChecks array in deviceConfig
   */
  const handlePreCheckSelectionChange = useCallback((checkIds) => {
    store.updateDeviceConfig({ selectedPreChecks: checkIds });
  }, [store]);

  /**
   * Reset entire workflow
   * Clears all state and returns to configuration step
   */
  const resetWorkflow = useCallback(() => {
    store.reset();
  }, [store]);

  /**
   * Set current workflow step
   * Allows manual navigation between steps
   */
  const setCurrentStep = useCallback((step) => {
    store.setCurrentStep(step);
  }, [store]);

  // ==========================================================================
  // SECTION 6: RETURN PUBLIC API
  // ==========================================================================

  return {
    // Expose entire store state
    ...store,

    // Workflow methods
    startPreCheckExecution,
    startUpgradeExecution,
    handleDeviceConfigChange,
    handlePreCheckSelectionChange,
    resetWorkflow,
    setCurrentStep,
  };
}

export default useCodeUpgradeWorkflow;