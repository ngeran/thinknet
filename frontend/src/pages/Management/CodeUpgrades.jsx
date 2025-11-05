/**
 * =============================================================================
 * CODE UPGRADES COMPONENT - MAIN ORCHESTRATOR
 * =============================================================================
 *
 * @version 4.7.0 (Modular Refactoring)
 * @last_updated 2025-11-05
 * @author nikos-geranios_vgi
 *
 * 🎯 REFACTORING NOTES:
 * - Extracted state management to useUpgradeState hook
 * - Separated pre-check logic to usePreCheck hook
 * - Separated upgrade logic to useCodeUpgrade hook
 * - Extracted WebSocket processing to useWebSocketMessages hook
 * - Moved utilities to dedicated modules
 * - Split UI into focused tab components
 * - This file now serves as orchestrator only
 *
 * 🏗️ ARCHITECTURE:
 * - All business logic delegated to hooks
 * - All UI rendering delegated to tab components
 * - Main component coordinates workflow and manages prop passing
 * - Significantly reduced complexity and improved maintainability
 */

import React, { useMemo, useCallback } from 'react';

// ============================================================================
// UI COMPONENT IMPORTS
// ============================================================================
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// ============================================================================
// CUSTOM HOOKS
// ============================================================================
import { useJobWebSocket } from '@/hooks/useJobWebSocket';
import { useUpgradeState } from './hooks/useUpgradeState';
import { usePreCheck } from './hooks/usePreCheck';
import { useCodeUpgrade } from './hooks/useCodeUpgrade';
import { useWebSocketMessages } from './hooks/useWebSocketMessages';

// ============================================================================
// TAB COMPONENTS
// ============================================================================
import ConfigurationTab from './tabs/ConfigurationTab';
import ExecutionTab from './tabs/ExecutionTab';
import ReviewTab from './tabs/ReviewTab';
import ResultsTab from './tabs/ResultsTab';

// ============================================================================
// UTILITIES
// ============================================================================
import { extractVersionFromImageFilename } from '@/utils/versionParser';

/**
 * =============================================================================
 * MAIN COMPONENT
 * =============================================================================
 */
export default function CodeUpgrades() {

  // ==========================================================================
  // WEBSOCKET CONNECTION
  // ==========================================================================
  const { sendMessage, lastMessage, isConnected } = useJobWebSocket();

  // ==========================================================================
  // CENTRALIZED STATE MANAGEMENT
  // ==========================================================================
  const {
    // Upgrade parameters
    upgradeParams,
    setUpgradeParams,

    // UI state
    activeTab,
    setActiveTab,
    jobStatus,
    setJobStatus,
    currentPhase,
    setCurrentPhase,
    showTechnicalDetails,
    setShowTechnicalDetails,

    // Progress tracking
    progress,
    setProgress,
    jobOutput,
    setJobOutput,
    completedSteps,
    setCompletedSteps,
    totalSteps,
    setTotalSteps,

    // Job identifiers
    jobId,
    setJobId,
    wsChannel,
    setWsChannel,
    finalResults,
    setFinalResults,

    // Pre-check state
    preCheckJobId,
    setPreCheckJobId,
    preCheckResults,
    setPreCheckResults,
    preCheckSummary,
    setPreCheckSummary,
    isRunningPreCheck,
    setIsRunningPreCheck,
    canProceedWithUpgrade,
    setCanProceedWithUpgrade,

    // Statistics
    statistics,
    setStatistics,

    // Refs
    processedStepsRef,
    latestStepMessageRef,
    loggedMessagesRef,
    scrollAreaRef,

    // Utility functions
    resetState,
  } = useUpgradeState();

  // ==========================================================================
  // STATE SETTER WRAPPER
  // Provides a single function to update multiple state values at once
  // Used by hooks to update state without needing individual setters
  // ==========================================================================
  const setState = useCallback((updates) => {
    if (typeof updates === 'function') {
      // Handle functional updates
      console.warn('[STATE] Functional updates not yet implemented in setState wrapper');
      return;
    }

    // Apply each update
    Object.entries(updates).forEach(([key, value]) => {
      switch (key) {
        case 'upgradeParams': setUpgradeParams(value); break;
        case 'activeTab': setActiveTab(value); break;
        case 'jobStatus': setJobStatus(value); break;
        case 'currentPhase': setCurrentPhase(value); break;
        case 'showTechnicalDetails': setShowTechnicalDetails(value); break;
        case 'progress': setProgress(value); break;
        case 'jobOutput': setJobOutput(value); break;
        case 'completedSteps': setCompletedSteps(value); break;
        case 'totalSteps': setTotalSteps(value); break;
        case 'jobId': setJobId(value); break;
        case 'wsChannel': setWsChannel(value); break;
        case 'finalResults': setFinalResults(value); break;
        case 'preCheckJobId': setPreCheckJobId(value); break;
        case 'preCheckResults': setPreCheckResults(value); break;
        case 'preCheckSummary': setPreCheckSummary(value); break;
        case 'isRunningPreCheck': setIsRunningPreCheck(value); break;
        case 'canProceedWithUpgrade': setCanProceedWithUpgrade(value); break;
        case 'statistics': setStatistics(value); break;
        case 'processedStepsRef':
          if (value instanceof Set) {
            processedStepsRef.current = value;
          }
          break;
        case 'loggedMessagesRef':
          if (value instanceof Set) {
            loggedMessagesRef.current = value;
          }
          break;
        default:
          console.warn(`[STATE] Unknown state key: ${key}`);
      }
    });
  }, [
    setUpgradeParams, setActiveTab, setJobStatus, setCurrentPhase,
    setShowTechnicalDetails, setProgress, setJobOutput, setCompletedSteps,
    setTotalSteps, setJobId, setWsChannel, setFinalResults,
    setPreCheckJobId, setPreCheckResults, setPreCheckSummary,
    setIsRunningPreCheck, setCanProceedWithUpgrade, setStatistics,
    processedStepsRef, loggedMessagesRef
  ]);

  // ==========================================================================
  // PRE-CHECK HOOK
  // ==========================================================================
  const { startPreCheck } = usePreCheck({
    upgradeParams,
    isConnected,
    sendMessage,
    wsChannel,
    setState,
  });

  // ==========================================================================
  // UPGRADE EXECUTION HOOK
  // ==========================================================================
  const { startUpgradeExecution } = useCodeUpgrade({
    upgradeParams,
    preCheckJobId,
    isConnected,
    sendMessage,
    wsChannel,
    setState,
  });

  // ==========================================================================
  // WEBSOCKET MESSAGE PROCESSING
  // ==========================================================================
  useWebSocketMessages({
    lastMessage,
    jobId,
    wsChannel,
    currentPhase,
    jobOutput,
    preCheckSummary,
    totalSteps,
    progress,
    sendMessage,
    setState,
    refs: {
      processedStepsRef,
      latestStepMessageRef,
      loggedMessagesRef,
      scrollAreaRef,
    },
  });

  // ==========================================================================
  // EVENT HANDLERS
  // ==========================================================================

  /**
   * Handles parameter changes from form inputs
   * Special handling for image_filename to auto-extract version
   */
  const handleParamChange = useCallback((name, value) => {
    console.log(`[PARAM_CHANGE] ${name}: ${value}`);
    setUpgradeParams(prev => ({ ...prev, [name]: value }));

    // Auto-extract version when image is selected
    if (name === 'image_filename' && value) {
      const preciseVersion = extractVersionFromImageFilename(value);
      if (preciseVersion) {
        console.log(`[VERSION_EXTRACTION] ✅ Extracted "${preciseVersion}" from "${value}"`);
        setUpgradeParams(prev => ({ ...prev, target_version: preciseVersion }));
      } else {
        console.warn(`[VERSION_EXTRACTION] ⚠️ Could not extract version from "${value}"`);
      }
    }
  }, [setUpgradeParams]);

  /**
   * Resets the entire workflow to initial state
   */
  const resetWorkflow = useCallback(() => {
    console.log("[WORKFLOW] ===== INITIATING COMPLETE RESET =====");

    // Unsubscribe from WebSocket channel
    if (wsChannel) {
      console.log(`[WEBSOCKET] Unsubscribing from channel: ${wsChannel}`);
      sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
    }

    // Reset all state using the centralized reset function
    resetState();

    console.log("[WORKFLOW] ✅ Reset complete - ready for new operation");
  }, [wsChannel, sendMessage, resetState]);

  // ==========================================================================
  // DEBUG UTILITIES
  // ==========================================================================

  /**
   * Logs complete current state to console for debugging
   */
  const logCurrentState = useCallback(() => {
    console.log("[DEBUG] ========================================");
    console.log("[DEBUG] CURRENT COMPONENT STATE");
    console.log("[DEBUG] ========================================");
    console.log("[DEBUG] UI State:", {
      activeTab,
      currentPhase,
      jobStatus,
      showTechnicalDetails
    });
    console.log("[DEBUG] Pre-check State:", {
      preCheckSummary: preCheckSummary !== null ? "SET" : "NULL",
      canProceedWithUpgrade,
      preCheckJobId,
      isRunningPreCheck
    });
    console.log("[DEBUG] Job State:", {
      jobId,
      wsChannel,
      isConnected,
    });
    console.log("[DEBUG] Progress:", {
      progress,
      completedSteps,
      totalSteps,
    });
    console.log("[DEBUG] ========================================");
  }, [
    activeTab, currentPhase, jobStatus, showTechnicalDetails,
    preCheckSummary, canProceedWithUpgrade, preCheckJobId, isRunningPreCheck,
    jobId, wsChannel, isConnected, progress, completedSteps, totalSteps
  ]);

  /**
   * Manually enables Review tab with test data for development
   */
  const forceReviewTab = useCallback(() => {
    console.log("[DEBUG] ========================================");
    console.log("[DEBUG] Manually forcing Review tab for testing");
    console.log("[DEBUG] ========================================");

    const testSummary = {
      total_checks: 8,
      passed: 7,
      warnings: 1,
      critical_failures: 0,
      can_proceed: true,
      results: [
        { check_name: "Device Connectivity", severity: "pass", message: "Device is reachable" },
        { check_name: "Storage Space", severity: "pass", message: "Sufficient storage available" },
        { check_name: "System State", severity: "pass", message: "System is stable" },
        { check_name: "Redundancy Status", severity: "pass", message: "Redundancy checks passed" },
        { check_name: "Image Availability", severity: "pass", message: "Image is available" },
        { check_name: "Version Compatibility", severity: "pass", message: "Version is compatible" },
        { check_name: "Snapshot Availability", severity: "warning", message: "Snapshot may take longer" },
        { check_name: "Resource Utilization", severity: "pass", message: "Resources are adequate" }
      ]
    };

    setPreCheckSummary(testSummary);
    setCanProceedWithUpgrade(true);
    setActiveTab("review");
    setCurrentPhase("review");
    setJobStatus("success");

    console.log("[DEBUG] ✅ Review tab manually enabled with test data");
  }, [setPreCheckSummary, setCanProceedWithUpgrade, setActiveTab, setCurrentPhase, setJobStatus]);

  // ==========================================================================
  // DERIVED STATE
  // ==========================================================================

  const isRunning = jobStatus === 'running';
  const isComplete = jobStatus === 'success';
  const hasError = jobStatus === 'failed';

  /**
   * Form validation - checks if all required fields are filled
   */
  const isFormValid = useMemo(() => {
    return (
      upgradeParams.username.trim() &&
      upgradeParams.password.trim() &&
      (upgradeParams.hostname.trim() || upgradeParams.inventory_file.trim()) &&
      upgradeParams.image_filename.trim() &&
      upgradeParams.target_version.trim()
    );
  }, [upgradeParams]);

  // ==========================================================================
  // DEBUG HANDLERS FOR COMPONENTS
  // ==========================================================================

  const debugHandlers = {
    onLogState: logCurrentState,
    onForceReview: forceReviewTab,
    onNavigateReview: () => setActiveTab("review"),
    onCheckWebSocket: () => {
      console.log("[DEBUG] WebSocket Status:", {
        isConnected,
        wsChannel,
        jobId,
        lastMessageLength: lastMessage?.length
      });
    },
  };

  const debugState = {
    preCheckSummary,
    isConnected,
    activeTab,
    currentPhase,
    jobStatus,
    canProceedWithUpgrade,
    jobId,
    wsChannel,
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <div className="p-8 pt-6">
      {/* ====================================================================
          HEADER SECTION
          ==================================================================== */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Code Upgrade Operation</h1>
          <p className="text-muted-foreground">
            Upgrade device operating system with pre-flight validation
          </p>
        </div>

        {/* Reset button - only show when job is active */}
        {jobStatus !== 'idle' && (
          <Button onClick={resetWorkflow} variant="outline" size="sm">
            Start New Upgrade
          </Button>
        )}
      </div>

      <Separator className="mb-8" />

      {/* ====================================================================
          MAIN TABS CONTAINER
          ==================================================================== */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">

        {/* ==================================================================
            TAB NAVIGATION
            ================================================================== */}
        <TabsList className="grid w-full grid-cols-4 mb-6">
          <TabsTrigger value="config" disabled={isRunning}>
            Configure
          </TabsTrigger>

          <TabsTrigger value="execute" disabled={currentPhase === "config"}>
            {currentPhase === "pre_check" ? "Pre-Check" : "Execute"}
          </TabsTrigger>

          <TabsTrigger
            value="review"
            disabled={!preCheckSummary && activeTab !== "review"}
            className={preCheckSummary ? "bg-green-50 border-green-200" : ""}
          >
            Review {preCheckSummary && "✅"}
          </TabsTrigger>

          <TabsTrigger value="results" disabled={currentPhase !== "results"}>
            Results
          </TabsTrigger>
        </TabsList>

        {/* ==================================================================
            TAB 1: CONFIGURATION
            ================================================================== */}
        <TabsContent value="config">
          <ConfigurationTab
            upgradeParams={upgradeParams}
            onParamChange={handleParamChange}
            onStartPreCheck={startPreCheck}
            isFormValid={isFormValid}
            isRunning={isRunning}
            isConnected={isConnected}
            debugState={debugState}
            debugHandlers={debugHandlers}
            jobOutput={jobOutput}
          />
        </TabsContent>

        {/* ==================================================================
            TAB 2: EXECUTION
            ================================================================== */}
        <TabsContent value="execute">
          <ExecutionTab
            currentPhase={currentPhase}
            isRunning={isRunning}
            isComplete={isComplete}
            hasError={hasError}
            progress={progress}
            completedSteps={completedSteps}
            totalSteps={totalSteps}
            latestStepMessage={latestStepMessageRef.current}
            jobOutput={jobOutput}
            showTechnicalDetails={showTechnicalDetails}
            onToggleTechnicalDetails={() => setShowTechnicalDetails(!showTechnicalDetails)}
            scrollAreaRef={scrollAreaRef}
          />
        </TabsContent>

        {/* ==================================================================
            TAB 3: REVIEW
            ================================================================== */}
        <TabsContent value="review">
          <ReviewTab
            preCheckSummary={preCheckSummary}
            isConnected={isConnected}
            onProceedWithUpgrade={startUpgradeExecution}
            onCancel={resetWorkflow}
            onForceReview={forceReviewTab}
          />
        </TabsContent>

        {/* ==================================================================
            TAB 4: RESULTS
            ================================================================== */}
        <TabsContent value="results">
          <ResultsTab
            jobStatus={jobStatus}
            finalResults={finalResults}
            preCheckSummary={preCheckSummary}
            upgradeParams={upgradeParams}
            jobId={jobId}
            preCheckJobId={preCheckJobId}
            progress={progress}
            completedSteps={completedSteps}
            totalSteps={totalSteps}
            currentPhase={currentPhase}
            isConnected={isConnected}
            statistics={statistics}
            showTechnicalDetails={showTechnicalDetails}
            onToggleTechnicalDetails={() => setShowTechnicalDetails(!showTechnicalDetails)}
            onNavigateToExecute={() => setActiveTab("execute")}
            onStartNewUpgrade={resetWorkflow}
            jobOutput={jobOutput}
          />
        </TabsContent>

      </Tabs>
    </div>
  );
}

/**
 * =============================================================================
 * IMPLEMENTATION NOTES FOR v4.7.0
 * =============================================================================
 *
 * 🎯 MODULAR REFACTORING BENEFITS:
 *
 * 1. MAINTAINABILITY:
 *    - Each module has single, clear responsibility
 *    - Easy to locate and fix bugs
 *    - Changes isolated to specific files
 *
 * 2. TESTABILITY:
 *    - Hooks can be tested independently
 *    - Components can be tested in isolation
 *    - Utilities are pure functions
 *
 * 3. REUSABILITY:
 *    - Hooks can be used in other components
 *    - Utilities can be shared across features
 *    - Components can be composed differently
 *
 * 4. READABILITY:
 *    - Main component is < 400 lines (was 2500+)
 *    - Clear separation of concerns
 *    - Easy to understand workflow
 *
 * 5. SCALABILITY:
 *    - Easy to add new features
 *    - Simple to extend functionality
 *    - Clear structure for new developers
 *
 * =============================================================================
 * FILE ORGANIZATION:
 * =============================================================================
 *
 * /hooks - Business logic (4 files)
 * /utils - Pure functions (5 files)
 * /constants - Configuration (3 files)
 * /components/tabs - Main UI (4 files)
 * /components/review - Review sub-components (4 files)
 * /components/debug - Debug tools (2 files)
 *
 * Total: 22 focused, maintainable files vs 1 monolithic file
 *
 * =============================================================================
 */
