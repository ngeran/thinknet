/**
 * =============================================================================
 * CODE UPGRADE STORE BRIDGE HOOK v1.0.0
 * =============================================================================
 *
 * Bridges existing hooks with Zustand store for gradual migration
 * Allows testing new store alongside current implementation
 *
 * Location: src/hooks/useCodeUpgradeStoreBridge.js
 * Author: nikos-geranios_vgi
 * Date: 2025-12-01
 * Version: 1.0.0 - Initial bridge implementation
 * =============================================================================
 */

import { useEffect, useCallback } from 'react';
import { useCodeUpgradeStore } from '@/lib/codeUpgradeStore';

// Import existing hooks for comparison
import { useUpgradeState } from '@/pages/Management/hooks/useUpgradeState';
import { usePreCheck } from '@/pages/Management/hooks/usePreCheck';
import { useCodeUpgrade } from '@/pages/Management/hooks/useCodeUpgrade';
import { useWebSocketMessages } from '@/pages/Management/hooks/useWebSocketMessages';

/**
 * Bridge hook that synchronizes Zustand store with existing hooks
 * Allows parallel testing of both implementations
 *
 * NOTE: This is a READ-ONLY bridge that monitors existing state
 * It does NOT call existing hooks directly to avoid parameter conflicts
 */
export const useCodeUpgradeStoreBridge = () => {
  // Existing state management (current implementation)
  const existingState = useUpgradeState();

  // Zustand store (new implementation)
  const zustandState = useCodeUpgradeStore();

  // Synchronization functions
  const syncToDeviceConfig = useCallback(() => {
    console.log('🔄 [BRIDGE] Syncing device config');
    zustandState.updateDeviceConfig({
      hostname: existingState.upgradeParams.hostname,
      username: existingState.upgradeParams.username,
      password: existingState.upgradeParams.password,
      selectedPreChecks: existingState.selectedPreChecks,
      image_filename: existingState.upgradeParams.image_filename,
      target_version: existingState.upgradeParams.target_version,
      no_validate: existingState.upgradeParams.no_validate,
      no_copy: existingState.upgradeParams.no_copy,
    });
  }, [existingState.upgradeParams, existingState.selectedPreChecks, zustandState]);

  const syncToPreCheck = useCallback(() => {
    console.log('🔄 [BRIDGE] Syncing pre-check state');
    if (existingState.isRunningPreCheck) {
      zustandState.startPreCheck();
      zustandState.setPreCheckJobId(
        existingState.preCheckJobId,
        existingState.wsChannel
      );
    }

    if (existingState.progress !== undefined) {
      zustandState.setPreCheckProgress(existingState.progress);
    }

    if (existingState.preCheckSummary) {
      zustandState.setPreCheckComplete(existingState.preCheckSummary);
      zustandState.updatePreCheckResults(existingState.preCheckResults || []);
    }
  }, [existingState, zustandState]);

  const syncToUpgrade = useCallback(() => {
    console.log('🔄 [BRIDGE] Syncing upgrade state');
    // Note: For upgrade state, we'll need to check if we're in the upgrade phase
    // Use jobStatus and currentPhase from existing state
    if (existingState.jobStatus === 'running' && existingState.currentPhase === 'upgrade') {
      zustandState.startUpgrade();
      zustandState.setUpgradeJobId(
        existingState.jobId,
        existingState.wsChannel
      );
    }

    if (existingState.progress !== undefined && existingState.currentPhase === 'upgrade') {
      zustandState.setUpgradeProgress(existingState.progress, existingState.currentPhase);
    }

    if (existingState.finalResults) {
      zustandState.setUpgradeComplete(existingState.finalResults);
    }
  }, [existingState, zustandState]);

  const syncToWorkflow = useCallback(() => {
    console.log('🔄 [BRIDGE] Syncing workflow state');

    // Detect current step from existing implementation
    let currentStep = 'configure';
    if (existingState.currentPhase === 'pre_check' || existingState.isRunningPreCheck) {
      currentStep = 'pre_check';
    } else if (existingState.currentPhase === 'upgrade' || (existingState.jobStatus === 'running' && existingState.currentPhase === 'upgrade')) {
      currentStep = 'upgrade';
    } else if (existingState.currentPhase === 'results' || existingState.jobStatus === 'success') {
      currentStep = 'results';
    }

    zustandState.setCurrentStep(currentStep);

    // Sync review data if available
    if (existingState.preCheckSummary && existingState.currentPhase === 'review') {
      zustandState.moveToReview({
        summary: existingState.preCheckSummary,
        results: existingState.preCheckResults || []
      });
    }
  }, [existingState, zustandState]);

  // NOTE: Auto-sync removed to prevent infinite loops
 // Bridge is now READ-ONLY - sync only called manually via bridge.syncAll()

  // Log comparison data (single time on mount)
  useEffect(() => {
    console.log('📊 [BRIDGE] Initial State Comparison:');
    console.log('  Existing Upgrade Params:', existingState.upgradeParams);
    console.log('  Zustand Device Config:', zustandState.deviceConfig);
    console.log('  Existing PreCheck Running:', existingState.isRunningPreCheck);
    console.log('  Zustand PreCheck Running:', zustandState.preCheck.isRunning);
    console.log('  Existing Current Phase:', existingState.currentPhase);
    console.log('  Zustand Current Step:', zustandState.currentStep);
    console.log('  Existing Job Status:', existingState.jobStatus);
  }, []); // Empty dependency array - run only once on mount

  // Manual sync functions for testing (use with caution - can cause infinite loops)
  const manualSync = {
    syncAll: () => {
      console.log('⚠️ [BRIDGE] Manual sync disabled - prevents infinite loops');
      // Manual sync functions disabled to prevent infinite loops
      // Use only for specific testing scenarios
    },
    syncDeviceConfig: () => {
      console.log('⚠️ [BRIDGE] Device config sync disabled - prevents infinite loops');
    },
    syncPreCheck: () => {
      console.log('⚠️ [BRIDGE] Pre-check sync disabled - prevents infinite loops');
    },
    syncUpgrade: () => {
      console.log('⚠️ [BRIDGE] Upgrade sync disabled - prevents infinite loops');
    },
    syncWorkflow: () => {
      console.log('⚠️ [BRIDGE] Workflow sync disabled - prevents infinite loops');
    },
  };

  // Return both implementations for comparison
  return {
    // Existing implementation (current)
    existing: {
      state: existingState,
    },

    // Zustand implementation (new)
    store: zustandState,

    // Bridge utilities
    bridge: manualSync,

    // Comparison helpers (simplified to prevent infinite loops)
    isSynced: {
      deviceConfig: false, // Manual comparison only - prevents infinite loops
      preCheckRunning: existingState.isRunningPreCheck === zustandState.preCheck.isRunning,
      upgradeRunning: (existingState.jobStatus === 'running' && existingState.currentPhase === 'upgrade') === zustandState.upgrade.isRunning,
      currentStep: zustandState.currentStep !== 'configure', // simplified check
    },
  };
};

export default useCodeUpgradeStoreBridge;