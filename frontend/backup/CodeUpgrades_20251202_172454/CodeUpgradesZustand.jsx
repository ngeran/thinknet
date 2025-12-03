/**
 * =============================================================================
 * CODE UPGRADES COMPONENT - ZUSTAND VERSION v1.0.0
 * =============================================================================
 *
 * Clean, simplified orchestration for device upgrade workflow using Zustand store
 * Replaces complex hook-based architecture with centralized state management
 *
 * VERSION: 1.0.0 - Phase 4 Implementation (2025-12-01)
 * AUTHOR: nikos-geranios_vgi
 *
 * COMPARISON:
 * - Original: 650+ lines, 25+ useState hooks, complex prop drilling
 * - Zustand: ~200 lines, centralized state, clean architecture
 *
 * WORKFLOW:
 * Configuration → Pre-Check → Review → Upgrade → Results
 * All state managed centrally in Zustand store
 */

import React, { useMemo, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { useJobWebSocket } from '@/hooks/useJobWebSocket';
import { useCodeUpgradeWorkflowZustand } from '@/hooks/useCodeUpgradeWorkflowZustand';
import { useWebSocketMessagesZustand } from '@/hooks/useWebSocketMessagesZustand';
import { useCodeUpgradeStore, WORKFLOW_STEPS } from '@/lib/codeUpgradeStore';

import ConfigurationTab from './tabs/ConfigurationTab';
import ExecutionTab from './tabs/ExecutionTab';
import ReviewTab from './tabs/ReviewTab';
import UpgradeTab from './tabs/UpgradeTab';
import ResultsTab from './tabs/ResultsTab';

/**
 * =============================================================================
 * MAIN COMPONENT - ZUSTAND VERSION
 * =============================================================================
 */
export default function CodeUpgradesZustand() {

  // ==========================================================================
  // SECTION 1: WEBSOCKET CONNECTION (Same as original)
  // ==========================================================================
  const { sendMessage, lastMessage, isConnected } = useJobWebSocket();

  // ==========================================================================
  // SECTION 2: ZUSTAND WORKFLOW & STATE (Clean Architecture)
  // ==========================================================================

  /**
   * All business logic and state management through Zustand
   * Replaces: useUpgradeState, usePreCheck, useCodeUpgrade, useWebSocketMessages
   */
  const workflow = useCodeUpgradeWorkflowZustand();

  // Direct store access for UI state
  const {
    currentStep,
    deviceConfig,
    preCheck,
    upgrade,
    error,
    isProcessing,
    isTabAccessible,
  } = useCodeUpgradeStore();

  // ==========================================================================
  // SECTION 3: DERIVED STATE (Simplified)
  // ==========================================================================

  const isRunning = isProcessing;
  const isComplete = upgrade.isComplete;
  const hasError = !!error;

  const isFormValid = useMemo(() => {
    return (
      deviceConfig.username?.trim() &&
      deviceConfig.password?.trim() &&
      (deviceConfig.hostname?.trim() || deviceConfig.inventory_file?.trim()) &&
      deviceConfig.image_filename?.trim() &&
      deviceConfig.target_version?.trim()
    );
  }, [deviceConfig]);

  // ==========================================================================
  // SECTION 4: TAB ACCESSIBILITY (Simplified Logic)
  // ==========================================================================

  const isTabDisabled = (tabValue) => {
    return !isTabAccessible(tabValue);
  };

  // ==========================================================================
  // SECTION 5: EVENT HANDLERS (Clean Implementation)
  // ==========================================================================

  const handleReset = () => {
    console.log('[ZUSTAND] Resetting workflow');
    workflow.resetWorkflow();
  };

  const handlePreCheckSelectionChange = (checkIds) => {
    workflow.handlePreCheckSelectionChange(checkIds);
  };

  // ==========================================================================
  // SECTION 6: WEBSOCKET MESSAGE HANDLING (Zustand Integration)
  // ==========================================================================

  /**
   * Zustand-based WebSocket message processing
   * Replaces the complex useWebSocketMessages hook with clean store integration
   */
  const webSocketMessages = useWebSocketMessagesZustand({
    lastMessage,
    currentStep,
    sendMessage
  });

  // ==========================================================================
  // SECTION 7: RENDER
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
          <p className="text-xs text-green-600 mt-1">
            🟢 Zustand Version - Clean Architecture
          </p>
        </div>

        {/* Reset button - only show when workflow is active */}
        {(isProcessing || preCheck.isRunning || upgrade.isRunning) && (
          <Button onClick={handleReset} variant="outline" size="sm">
            Start New Upgrade
          </Button>
        )}
      </div>

      <Separator className="mb-8" />

      {/* ====================================================================
          MAIN TABS CONTAINER
          ==================================================================== */}
      <Tabs value={currentStep} onValueChange={workflow.setCurrentStep} className="w-full">

        {/* ==================================================================
            TAB NAVIGATION - Clean Implementation
            ================================================================== */}
        <TabsList className="grid w-full grid-cols-5 mb-6">
          {/* Tab 1: Configuration */}
          <TabsTrigger
            value={WORKFLOW_STEPS.CONFIGURE}
            disabled={isTabDisabled(WORKFLOW_STEPS.CONFIGURE)}
          >
            Configure
          </TabsTrigger>

          {/* Tab 2: Pre-Check Execution */}
          <TabsTrigger
            value={WORKFLOW_STEPS.PRE_CHECK}
            disabled={isTabDisabled(WORKFLOW_STEPS.PRE_CHECK)}
          >
            Pre-Check
          </TabsTrigger>

          {/* Tab 3: Review */}
          <TabsTrigger
            value={WORKFLOW_STEPS.REVIEW}
            disabled={isTabDisabled(WORKFLOW_STEPS.REVIEW)}
            className={preCheck.isComplete ? "bg-green-50 border-green-200" : ""}
          >
            Review {preCheck.isComplete && "✅"}
          </TabsTrigger>

          {/* Tab 4: Upgrade */}
          <TabsTrigger
            value={WORKFLOW_STEPS.UPGRADE}
            disabled={isTabDisabled(WORKFLOW_STEPS.UPGRADE)}
            className={currentStep === WORKFLOW_STEPS.UPGRADE ? "bg-blue-50 border-blue-200" : ""}
          >
            Upgrade
          </TabsTrigger>

          {/* Tab 5: Results */}
          <TabsTrigger
            value={WORKFLOW_STEPS.RESULTS}
            disabled={isTabDisabled(WORKFLOW_STEPS.RESULTS)}
          >
            Results
          </TabsTrigger>
        </TabsList>

        {/* ==================================================================
            TAB CONTENT - CONFIGURATION (Direct Store Access)
            ================================================================== */}
        <TabsContent value={WORKFLOW_STEPS.CONFIGURE}>
          <ConfigurationTab />
        </TabsContent>

        {/* ==================================================================
            TAB CONTENT - EXECUTION (Pre-Check)
            ================================================================== */}
        <TabsContent value={WORKFLOW_STEPS.PRE_CHECK}>
          {(() => {
            console.log('[CODE_UPGRADES] PreCheck state:', preCheck);
            console.log('[CODE_UPGRADES] PreCheck logs count:', preCheck.logs.length);
            const jobOutput = preCheck.logs.map(log => ({
              timestamp: log.timestamp,
              message: log.message,
              level: log.level.toLowerCase(),
              event_type: 'PRE_CHECK_LOG'
            }));
            console.log('[CODE_UPGRADES] JobOutput for ExecutionTab:', jobOutput);
            return (
              <ExecutionTab
                currentPhase="pre_check"
                isRunning={preCheck.isRunning}
                isComplete={preCheck.isComplete}
                hasError={!!preCheck.error}
                progress={preCheck.progress}
                completedSteps={[]} // TODO: Implement step tracking in store
                totalSteps={100} // TODO: Implement step tracking in store
                latestStepMessage={null} // TODO: Implement in store
                jobOutput={jobOutput}
                showTechnicalDetails={false} // TODO: Implement in store
                onToggleTechnicalDetails={() => {}} // TODO: Implement in store
                scrollAreaRef={{ current: null }} // TODO: Implement in store
              />
            );
          })()}
        </TabsContent>

        {/* ==================================================================
            TAB CONTENT - REVIEW
            ================================================================== */}
        <TabsContent value={WORKFLOW_STEPS.REVIEW}>
          <ReviewTab
            preCheckSummary={preCheck.summary}
            upgradeParams={deviceConfig}
            isConnected={isConnected}
            jobStatus={preCheck.isRunning ? 'running' : preCheck.isComplete ? 'success' : 'idle'}
            isRunningPreCheck={preCheck.isRunning}
            onProceedWithUpgrade={workflow.startUpgradeExecution}
            onCancel={handleReset}
            onForceReview={() => {}}
          />
        </TabsContent>

        {/* ==================================================================
            TAB CONTENT - UPGRADE (Real-time Monitoring)
            ================================================================== */}
        <TabsContent value={WORKFLOW_STEPS.UPGRADE}>
          <UpgradeTab
            jobStatus={upgrade.isRunning ? 'running' : upgrade.isComplete ? 'success' : 'idle'}
            isRunning={upgrade.isRunning}
            isComplete={upgrade.isComplete}
            hasError={!!upgrade.error}
            progress={upgrade.progress}
            completedSteps={[]} // TODO: Implement step tracking in store
            totalSteps={100} // TODO: Implement step tracking in store
            jobOutput={upgrade.logs.map(log => ({
              timestamp: log.timestamp,
              message: log.message,
              level: log.level.toLowerCase(),
              event_type: 'UPGRADE_LOG'
            }))}
            showTechnicalDetails={false} // TODO: Implement in store
            onToggleTechnicalDetails={() => {}} // TODO: Implement in store
            scrollAreaRef={{ current: null }} // TODO: Implement in store
          />
        </TabsContent>

        {/* ==================================================================
            TAB CONTENT - RESULTS
            ================================================================== */}
        <TabsContent value={WORKFLOW_STEPS.RESULTS}>
          <ResultsTab
            jobStatus={upgrade.isComplete ? 'success' : 'failed'}
            finalResults={upgrade.result}
            preCheckSummary={preCheck.summary}
            upgradeParams={deviceConfig}
            jobId={upgrade.jobId}
            preCheckJobId={preCheck.jobId}
            progress={upgrade.progress}
            completedSteps={[]} // TODO: Implement step tracking in store
            totalSteps={100} // TODO: Implement step tracking in store
            currentPhase={WORKFLOW_STEPS.RESULTS}
            isConnected={isConnected}
            statistics={[]} // TODO: Implement in store
            showTechnicalDetails={false} // TODO: Implement in store
            onToggleTechnicalDetails={() => {}} // TODO: Implement in store
            onNavigateToExecute={() => workflow.setCurrentStep(WORKFLOW_STEPS.PRE_CHECK)}
            onStartNewUpgrade={handleReset}
            jobOutput={[...preCheck.logs, ...upgrade.logs].map(log => ({
              timestamp: log.timestamp,
              message: log.message,
              level: log.level.toLowerCase(),
              event_type: log.level === 'INFO' ? 'JOB_LOG' : 'ERROR'
            }))}
          />
        </TabsContent>

      </Tabs>
    </div>
  );
}