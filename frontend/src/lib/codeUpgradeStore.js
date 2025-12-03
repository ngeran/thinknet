/**
 * =============================================================================
 * CODE UPGRADE ZUSTAND STORE v1.0.0
 * =============================================================================
 *
 * Centralized state management for CodeUpgrades workflow
 * Created alongside existing hooks for gradual migration
 *
 * Location: src/lib/codeUpgradeStore.js
 * Author: nikos-geranios_vgi
 * Date: 2025-12-01
 * Version: 1.0.0 - Initial implementation for gradual migration
 * =============================================================================
 */

import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';

// =============================================================================
// CONSTANTS
// =============================================================================

export const WORKFLOW_STEPS = {
  CONFIGURE: 'configure',
  PRE_CHECK: 'pre_check',
  REVIEW: 'review',
  UPGRADE: 'upgrade',
  RESULTS: 'results'
};

// =============================================================================
// INITIAL STATE
// =============================================================================

const initialState = {
  // Workflow control
  currentStep: WORKFLOW_STEPS.CONFIGURE,
  isProcessing: false,
  canProceed: false,

  // Job tracking
  jobId: null,
  wsChannel: null,

  // Device configuration (mirrors existing useUpgradeState)
  deviceConfig: {
    hostname: '',
    username: '',
    password: '',
    selectedPreChecks: [],
    image_filename: '',
    target_version: '',
    no_validate: false,
    no_copy: false,
  },

  // Pre-check state (mirrors existing usePreCheck)
  preCheck: {
    isRunning: false,
    isComplete: false,
    progress: 0,
    logs: [],
    jobId: null,
    wsChannel: null,
    summary: null,
    results: []
  },

  // Upgrade state (mirrors existing useCodeUpgrade)
  upgrade: {
    isRunning: false,
    isComplete: false,
    progress: 0,
    logs: [],
    jobId: null,
    wsChannel: null,
    result: null
  },

  // Review state
  review: {
    preCheckData: null,
    canProceed: false
  },

  // Results state
  results: {
    preCheckResults: null,
    upgradeResults: null,
    finalStatus: null
  },

  // UI state
  error: null,
  lastUpdate: null
};

// =============================================================================
// ZUSTAND STORE
// =============================================================================

export const useCodeUpgradeStore = create(
  devtools(
    subscribeWithSelector((set, get) => ({
      ...initialState,

      // =====================================================================
      // WORKFLOW CONTROL
      // =====================================================================

      setCurrentStep: (step) => {
        console.log('[CODE_UPGRADE_STORE] setCurrentStep called with:', step);
        console.log('[CODE_UPGRADE_STORE] Current step before change:', get().currentStep);
        set({ currentStep: step, lastUpdate: new Date().toISOString() });
      },

      setIsProcessing: (processing) => {
        set({ isProcessing: processing, lastUpdate: new Date().toISOString() });
      },

      // =====================================================================
      // DEVICE CONFIGURATION
      // =====================================================================

      updateDeviceConfig: (updates) => {
        set((state) => ({
          deviceConfig: { ...state.deviceConfig, ...updates },
          lastUpdate: new Date().toISOString()
        }));
      },

      resetDeviceConfig: () => {
        set({
          deviceConfig: initialState.deviceConfig,
          lastUpdate: new Date().toISOString()
        });
      },

      // =====================================================================
      // PRE-CHECK STATE MANAGEMENT
      // =====================================================================

      setPreCheckJobId: (jobId, wsChannel) =>
        set((state) => ({
          jobId,
          wsChannel,
          preCheck: { ...state.preCheck, jobId, wsChannel },
          lastUpdate: new Date().toISOString()
        })),

      startPreCheck: () =>
        set((state) => ({
          preCheck: {
            ...state.preCheck,
            isRunning: true,
            isComplete: false,
            progress: 0,
            logs: [],
            summary: null,
            results: []
          },
          currentStep: WORKFLOW_STEPS.PRE_CHECK,
          isProcessing: true,
          lastUpdate: new Date().toISOString()
        })),

      setPreCheckProgress: (progress) =>
        set((state) => {
          console.log('[ZUSTAND_STORE] 🎯 Setting PRE-CHECK progress:', progress, 'from:', state.preCheck.progress);
          const newState = {
            preCheck: { ...state.preCheck, progress },
            lastUpdate: new Date().toISOString()
          };
          console.log('[ZUSTAND_STORE] ✅ PRE-CHECK progress updated in store');
          return newState;
        }),

      addPreCheckLog: (log) =>
        set((state) => {
          console.log('[ZUSTAND_STORE] Adding pre-check log:', log);
          console.log('[ZUSTAND_STORE] Current logs count:', state.preCheck.logs.length);
          const newLogs = [...state.preCheck.logs, log];
          console.log('[ZUSTAND_STORE] New logs count:', newLogs.length);
          return {
            preCheck: {
              ...state.preCheck,
              logs: newLogs
            },
            lastUpdate: new Date().toISOString()
          };
        }),

      setPreCheckComplete: (summary) =>
        set((state) => ({
          preCheck: {
            ...state.preCheck,
            isRunning: false,
            isComplete: true,
            progress: 100,
            summary
          },
          isProcessing: false,
          lastUpdate: new Date().toISOString()
        })),

      updatePreCheckResults: (results) =>
        set((state) => ({
          preCheck: { ...state.preCheck, results },
          lastUpdate: new Date().toISOString()
        })),

      // =====================================================================
      // UPGRADE STATE MANAGEMENT
      // =====================================================================

      setUpgradeJobId: (jobId, wsChannel) =>
        set((state) => ({
          jobId,
          wsChannel,
          upgrade: { ...state.upgrade, jobId, wsChannel },
          lastUpdate: new Date().toISOString()
        })),

      startUpgrade: () =>
        set((state) => ({
          upgrade: {
            ...state.upgrade,
            isRunning: true,
            isComplete: false,
            progress: 0,
            logs: [],
            result: null
          },
          currentStep: WORKFLOW_STEPS.UPGRADE,
          isProcessing: true,
          lastUpdate: new Date().toISOString()
        })),

      setUpgradeProgress: (progress, phase) =>
        set((state) => ({
          upgrade: { ...state.upgrade, progress, phase },
          lastUpdate: new Date().toISOString()
        })),

      addUpgradeLog: (log) =>
        set((state) => ({
          upgrade: {
            ...state.upgrade,
            logs: [...state.upgrade.logs, log]
          },
          lastUpdate: new Date().toISOString()
        })),

      setUpgradeComplete: (result) =>
        set((state) => ({
          upgrade: {
            ...state.upgrade,
            isRunning: false,
            isComplete: true,
            progress: 100,
            result
          },
          isProcessing: false,
          lastUpdate: new Date().toISOString()
        })),

      // =====================================================================
      // REVIEW STATE MANAGEMENT
      // =====================================================================

      setReviewData: (preCheckData) =>
        set((state) => ({
          review: {
            preCheckData,
            canProceed: preCheckData?.summary?.can_proceed === true
          },
          lastUpdate: new Date().toISOString()
        })),

      moveToReview: (preCheckData) =>
        set((state) => ({
          currentStep: WORKFLOW_STEPS.REVIEW,
          review: {
            preCheckData,
            canProceed: preCheckData?.summary?.can_proceed === true
          },
          lastUpdate: new Date().toISOString()
        })),

      // =====================================================================
      // RESULTS STATE MANAGEMENT
      // =====================================================================

      setResults: (preCheckResults, upgradeResults) =>
        set((state) => ({
          results: {
            preCheckResults,
            upgradeResults,
            finalStatus: upgradeResults?.success ? 'SUCCESS' : 'FAILED'
          },
          currentStep: WORKFLOW_STEPS.RESULTS,
          lastUpdate: new Date().toISOString()
        })),

      moveToResults: (upgradeResults) =>
        set((state) => ({
          currentStep: WORKFLOW_STEPS.RESULTS,
          results: {
            ...state.results,
            upgradeResults,
            finalStatus: upgradeResults?.success ? 'SUCCESS' : 'FAILED'
          },
          lastUpdate: new Date().toISOString()
        })),

      // =====================================================================
      // ERROR MANAGEMENT
      // =====================================================================

      setError: (error) =>
        set({ error, lastUpdate: new Date().toISOString() }),

      clearError: () =>
        set({ error: null, lastUpdate: new Date().toISOString() }),

      // =====================================================================
      // RESET FUNCTION
      // =====================================================================

      reset: () => {
        set({
          ...initialState,
          lastUpdate: new Date().toISOString()
        });
      },

      // =====================================================================
      // SELECTORS (computed values)
      // =====================================================================

      // Tab accessibility
      isTabAccessible: (tab) => {
        const state = get();
        switch (tab) {
          case WORKFLOW_STEPS.CONFIGURE:
            return true;
          case WORKFLOW_STEPS.PRE_CHECK:
            return !state.preCheck.isRunning;
          case WORKFLOW_STEPS.REVIEW:
            return state.preCheck.isComplete && state.review.canProceed;
          case WORKFLOW_STEPS.UPGRADE:
            return state.preCheck.isComplete && state.review.canProceed && !state.upgrade.isRunning;
          case WORKFLOW_STEPS.RESULTS:
            return state.preCheck.isComplete || state.upgrade.isComplete;
          default:
            return false;
        }
      },

      // Can start pre-check
      canStartPreCheck: () => {
        const state = get();
        const { deviceConfig, preCheck } = state;
        return (
          !!deviceConfig.hostname?.trim() &&
          !!deviceConfig.username?.trim() &&
          !!deviceConfig.password?.trim() &&
          !!deviceConfig.image_filename?.trim() &&
          !!deviceConfig.target_version?.trim() &&
          deviceConfig.selectedPreChecks.length > 0 &&
          !preCheck.isRunning
        );
      },

      // Can start upgrade
      canStartUpgrade: () => {
        const state = get();
        return (
          state.preCheck.isComplete &&
          state.review.canProceed &&
          !state.upgrade.isRunning
        );
      },

      // Get current job info
      getCurrentJobInfo: () => {
        const state = get();
        if (state.currentStep === WORKFLOW_STEPS.PRE_CHECK) {
          return {
            jobId: state.preCheck.jobId,
            wsChannel: state.preCheck.wsChannel,
            isActive: state.preCheck.isRunning
          };
        } else if (state.currentStep === WORKFLOW_STEPS.UPGRADE) {
          return {
            jobId: state.upgrade.jobId,
            wsChannel: state.upgrade.wsChannel,
            isActive: state.upgrade.isRunning
          };
        }
        return { jobId: null, wsChannel: null, isActive: false };
      }
    })),
    {
      name: 'code-upgrade-store'
    }
  )
);

// Export the store for external access
export default useCodeUpgradeStore;