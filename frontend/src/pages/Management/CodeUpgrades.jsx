/**
 * =============================================================================
 * CODE UPGRADES COMPONENT - MAIN ORCHESTRATOR
 * =============================================================================
 *
 * @version 5.0.0 (Added Dedicated Upgrade Tab)
 * @last_updated 2025-11-18 17:20:18 UTC
 * @author nikos-geranios_vgi
 *
 * 🎯 UPDATES (v5.0.0):
 * - Added dedicated Upgrade tab for upgrade execution monitoring
 * - Separated pre-check execution (Execute tab) from upgrade execution (Upgrade tab)
 * - Improved UX with clear phase separation
 * - Enhanced workflow: Config → Execute (Pre-Check) → Review → Upgrade → Results
 * - Auto-navigation to appropriate tabs based on operation phase
 *
 * 🏗️ ARCHITECTURE:
 * - All business logic delegated to hooks
 * - All UI rendering delegated to tab components
 * - Main component coordinates workflow and manages prop passing
 * - Significantly reduced complexity and improved maintainability
 * - Five-tab workflow for complete upgrade lifecycle
 *
 * 📊 TAB WORKFLOW:
 * 1. Configure: Set parameters and select pre-checks
 * 2. Execute: Run and monitor pre-check validation
 * 3. Review: Review pre-check results and decide to proceed
 * 4. Upgrade: Monitor real-time upgrade execution (NEW)
 * 5. Results: View final upgrade results and summary
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
import UpgradeTab from './tabs/UpgradeTab';  // NEW - Dedicated upgrade tab
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
 
    // Pre-check selection
    selectedPreChecks,
    setSelectedPreChecks,
 
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
  // ==========================================================================
  const setState = useCallback((updates) => {
    if (typeof updates === 'function') {
      console.warn('[STATE] Functional updates not yet implemented in setState wrapper');
      return;
    }
 
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
        case 'selectedPreChecks': setSelectedPreChecks(value); break;
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
    setIsRunningPreCheck, setCanProceedWithUpgrade, setSelectedPreChecks,
    setStatistics, processedStepsRef, loggedMessagesRef
  ]);
 
  // ==========================================================================
  // PRE-CHECK HOOK
  // ==========================================================================
  const { startPreCheck } = usePreCheck({
    upgradeParams,
    selectedPreChecks,
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
   *
   * @param {string} name - Parameter name
   * @param {any} value - Parameter value
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
   * Handles pre-check selection changes
   *
   * @param {Array<string>} checkIds - Array of selected check IDs
   */
  const handlePreCheckSelectionChange = useCallback((checkIds) => {
    console.log(`[PRE_CHECK_SELECTION] Selected checks:`, checkIds);
    setSelectedPreChecks(checkIds);
  }, [setSelectedPreChecks]);
 
  /**
   * Resets the entire workflow to initial state
   */
  const resetWorkflow = useCallback(() => {
    console.log("[WORKFLOW] ===== INITIATING COMPLETE RESET =====");
    console.log("[WORKFLOW] Date: 2025-11-18 17:20:18 UTC");
    console.log("[WORKFLOW] User: nikos-geranios_vgi");
 
    if (wsChannel) {
      console.log(`[WEBSOCKET] Unsubscribing from channel: ${wsChannel}`);
      sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
    }
 
    resetState();
 
    console.log("[WORKFLOW] ✅ Reset complete - ready for new operation");
  }, [wsChannel, sendMessage, resetState]);
 
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
            TAB NAVIGATION - UPDATED TO 5 TABS
            ================================================================== */}
        <TabsList className="grid w-full grid-cols-5 mb-6">
          {/* Tab 1: Configuration */}
          <TabsTrigger value="config" disabled={isRunning}>
            Configure
          </TabsTrigger>
 
          {/* Tab 2: Execute (Pre-Check) */}
          <TabsTrigger value="execute" disabled={currentPhase === "config"}>
            Pre-Check
          </TabsTrigger>
 
          {/* Tab 3: Review */}
          <TabsTrigger
            value="review"
            disabled={!preCheckSummary && activeTab !== "review"}
            className={preCheckSummary ? "bg-green-50 border-green-200" : ""}
          >
            Review {preCheckSummary && "✅"}
          </TabsTrigger>
 
          {/* Tab 4: Upgrade (NEW) */}
          <TabsTrigger
            value="upgrade"
            disabled={currentPhase !== "upgrade"}
            className={currentPhase === "upgrade" ? "bg-blue-50 border-blue-200" : ""}
          >
            Upgrade
          </TabsTrigger>
 
          {/* Tab 5: Results */}
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
            selectedPreChecks={selectedPreChecks}
            onPreCheckSelectionChange={handlePreCheckSelectionChange}
          />
        </TabsContent>
 
        {/* ==================================================================
            TAB 2: EXECUTE (PRE-CHECK)
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
            jobStatus={jobStatus}
            isRunningPreCheck={isRunningPreCheck}
            onProceedWithUpgrade={startUpgradeExecution}
            onCancel={resetWorkflow}
            onForceReview={() => {}}
          />
        </TabsContent>
 
        {/* ==================================================================
            TAB 4: UPGRADE (NEW - DEDICATED UPGRADE EXECUTION TAB)
            ================================================================== */}
        <TabsContent value="upgrade">
          <UpgradeTab
            jobStatus={jobStatus}
            isRunning={isRunning && currentPhase === "upgrade"}
            isComplete={isComplete && currentPhase === "upgrade"}
            hasError={hasError && currentPhase === "upgrade"}
            progress={progress}
            completedSteps={completedSteps}
            totalSteps={totalSteps}
            jobOutput={jobOutput}
            showTechnicalDetails={showTechnicalDetails}
            onToggleTechnicalDetails={() => setShowTechnicalDetails(!showTechnicalDetails)}
            scrollAreaRef={scrollAreaRef}
          />
        </TabsContent>
 
        {/* ==================================================================
            TAB 5: RESULTS
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
