
/**
 * =============================================================================
 * CODE UPGRADES COMPONENT - MAIN ORCHESTRATOR v5.1.0
 * =============================================================================
 *
 * Centralized orchestration for device upgrade workflow
 *
 * ENHANCEMENTS v5.1.0 (2025-11-20 15:25:23 UTC):
 * - Fixed Upgrade tab remaining accessible after completion
 * - Tab no longer disables after upgrade completes
 * - User can review messages in Upgrade tab even after transitioning to Results
 * - Improved tab navigation logic for better UX
 *
 * WORKFLOW:
 * Configuration → Pre-Check (Execute) → Review → Upgrade → Results
 * Tabs remain accessible for reviewing respective phase outputs
 */

import React, { useMemo, useCallback } from 'react';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { useJobWebSocket } from '@/hooks/useJobWebSocket';
import { useUpgradeState } from './hooks/useUpgradeState';
import { usePreCheck } from './hooks/usePreCheck';
import { useCodeUpgrade } from './hooks/useCodeUpgrade';
import { useWebSocketMessages } from './hooks/useWebSocketMessages';

import ConfigurationTab from './tabs/ConfigurationTab';
import ExecutionTab from './tabs/ExecutionTab';
import ReviewTab from './tabs/ReviewTab';
import UpgradeTab from './tabs/UpgradeTab';
import ResultsTab from './tabs/ResultsTab';

import { extractVersionFromImageFilename } from '@/utils/versionParser';

/**
 * =============================================================================
 * MAIN COMPONENT
 * =============================================================================
 */
export default function CodeUpgrades() {

  // ==========================================================================
  // SECTION 1: WEBSOCKET CONNECTION
  // ==========================================================================
  const { sendMessage, lastMessage, isConnected } = useJobWebSocket();

  // ==========================================================================
  // SECTION 2: CENTRALIZED STATE MANAGEMENT
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
  // SECTION 3: STATE SETTER WRAPPER
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
  // SECTION 4: CUSTOM HOOKS
  // ==========================================================================
  const { startPreCheck } = usePreCheck({
    upgradeParams,
    selectedPreChecks,
    isConnected,
    sendMessage,
    wsChannel,
    setState,
  });

  const { startUpgradeExecution } = useCodeUpgrade({
    upgradeParams,
    preCheckJobId,
    preCheckSummary,
    isConnected,
    sendMessage,
    wsChannel,
    setState,
  });

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
  // SECTION 5: EVENT HANDLERS
  // ==========================================================================

  const handleParamChange = useCallback((name, value) => {
    console.log(`[PARAM_CHANGE] ${name}: ${value}`);
    setUpgradeParams(prev => ({ ...prev, [name]: value }));

    // Auto-extract version when image is selected
    if (name === 'image_filename' && value) {
      const preciseVersion = extractVersionFromImageFilename(value);
      if (preciseVersion) {
        console.log(`[VERSION_EXTRACTION] ✅ Extracted "${preciseVersion}" from "${value}"`);
        setUpgradeParams(prev => ({ ...prev, target_version: preciseVersion }));
      }
    }
  }, [setUpgradeParams]);

  const handlePreCheckSelectionChange = useCallback((checkIds) => {
    console.log(`[PRE_CHECK_SELECTION] Selected checks:`, checkIds);
    setSelectedPreChecks(checkIds);
  }, [setSelectedPreChecks]);

  const resetWorkflow = useCallback(() => {
    console.log("[WORKFLOW] Initiating complete reset");

    if (wsChannel) {
      console.log(`[WEBSOCKET] Unsubscribing from channel: ${wsChannel}`);
      sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
    }

    resetState();
    console.log("[WORKFLOW] Reset complete");
  }, [wsChannel, sendMessage, resetState]);

  // ==========================================================================
  // SECTION 6: DERIVED STATE
  // ==========================================================================

  const isRunning = jobStatus === 'running';
  const isComplete = jobStatus === 'success';
  const hasError = jobStatus === 'failed';

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
  // SECTION 7: TAB ACCESSIBILITY LOGIC - FIXED v5.1.0
  // ==========================================================================

  /**
   * Determine if tab should be disabled
   *
   * CRITICAL FIX v5.1.0:
   * - Upgrade tab now remains accessible even after completion
   * - User can review messages in Upgrade tab from Results tab
   * - Only disable tabs that haven't been reached yet
   */
  const isTabDisabled = (tabValue) => {
    switch (tabValue) {
      case 'config':
        return isRunning; // Disable during any operation
      case 'execute':
        return currentPhase === 'config'; // Disable if pre-check hasn't started
      case 'review':
        return !preCheckSummary && activeTab !== 'review'; // Disable if no pre-check results
      case 'upgrade':
        // FIXED v5.1.0: Never disable upgrade tab after it's been accessed
        // Allow user to return and review messages
        return currentPhase === 'config' || currentPhase === 'pre_check' || currentPhase === 'review';
      case 'results':
        return currentPhase !== 'results'; // Only enable on completion
      default:
        return false;
    }
  };

  // ==========================================================================
  // SECTION 8: RENDER
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
            TAB NAVIGATION - 5 TABS WITH IMPROVED ACCESSIBILITY
            ================================================================== */}
        <TabsList className="grid w-full grid-cols-5 mb-6">
          {/* Tab 1: Configuration */}
          <TabsTrigger value="config" disabled={isTabDisabled('config')}>
            Configure
          </TabsTrigger>

          {/* Tab 2: Pre-Check Execution */}
          <TabsTrigger value="execute" disabled={isTabDisabled('execute')}>
            Pre-Check
          </TabsTrigger>

          {/* Tab 3: Review */}
          <TabsTrigger
            value="review"
            disabled={isTabDisabled('review')}
            className={preCheckSummary ? "bg-green-50 border-green-200" : ""}
          >
            Review {preCheckSummary && "✅"}
          </TabsTrigger>

          {/* Tab 4: Upgrade - NOW REMAINS ACCESSIBLE */}
          <TabsTrigger
            value="upgrade"
            disabled={isTabDisabled('upgrade')}
            className={currentPhase === "upgrade" || activeTab === "upgrade" ? "bg-blue-50 border-blue-200" : ""}
          >
            Upgrade
          </TabsTrigger>

          {/* Tab 5: Results */}
          <TabsTrigger value="results" disabled={isTabDisabled('results')}>
            Results
          </TabsTrigger>
        </TabsList>

        {/* ==================================================================
            TAB CONTENT - CONFIGURATION
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
            TAB CONTENT - EXECUTION (PRE-CHECK)
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
            TAB CONTENT - REVIEW
            ================================================================== */}
        <TabsContent value="review">
          <ReviewTab
            preCheckSummary={preCheckSummary}
            upgradeParams={upgradeParams}
            isConnected={isConnected}
            jobStatus={jobStatus}
            isRunningPreCheck={isRunningPreCheck}
            onProceedWithUpgrade={startUpgradeExecution}
            onCancel={resetWorkflow}
            onForceReview={() => { }}
          />
        </TabsContent>

        {/* ==================================================================
            TAB CONTENT - UPGRADE (REAL-TIME MONITORING)
            ================================================================== */}
        <TabsContent value="upgrade">
          <UpgradeTab
            jobStatus={jobStatus}
            isRunning={isRunning && currentPhase === "upgrade"}
            isComplete={isComplete}
            hasError={hasError}
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
            TAB CONTENT - RESULTS
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
