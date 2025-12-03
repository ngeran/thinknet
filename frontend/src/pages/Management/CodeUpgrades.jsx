/**
 * =============================================================================
 * CODE UPGRADES COMPONENT v2.0.0
 * =============================================================================
 *
 * Main orchestrator for device upgrade workflow
 * Clean architecture with Zustand store and centralized hooks
 *
 * ARCHITECTURE:
 * - Uses Zustand store for state management
 * - Uses useJobWebSocket for WebSocket connection
 * - Uses useCodeUpgradeWorkflow for business logic
 * - Uses useCodeUpgradeMessages for WebSocket processing
 * - Tabs access store directly (no prop drilling)
 *
 * WORKFLOW STEPS:
 * 1. CONFIGURE: Device setup, image selection, options
 * 2. PRE_CHECK: Pre-flight validation execution
 * 3. REVIEW: Pre-check results review
 * 4. UPGRADE: Software upgrade execution
 * 5. RESULTS: Final results and summary
 *
 * Location: frontend/src/pages/Management/CodeUpgrades.jsx
 * Author: nikos-geranios_vgi
 * Date: 2025-12-02
 * Version: 2.0.0 - Clean architecture
 * =============================================================================
 */

import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Hooks
import { useJobWebSocket } from '@/hooks/useJobWebSocket';
import { useCodeUpgradeWorkflow } from '@/hooks/useCodeUpgradeWorkflow';
import { useCodeUpgradeMessages } from '@/hooks/useCodeUpgradeMessages';
import { useCodeUpgradeStore, WORKFLOW_STEPS } from '@/lib/codeUpgradeStore';

// Tab components
import ConfigurationTab from './tabs/ConfigurationTab';
import ExecutionTab from './tabs/ExecutionTab';
import ReviewTab from './tabs/ReviewTab';
import UpgradeTab from './tabs/UpgradeTab';
import ResultsTab from './tabs/ResultsTab';

// =============================================================================
// SECTION 1: MAIN COMPONENT
// =============================================================================

/**
 * Code Upgrades Component
 *
 * Main workflow orchestrator that coordinates:
 * - WebSocket connection
 * - Workflow state management
 * - Message processing
 * - Tab navigation
 *
 * State comes from Zustand store
 * Business logic in useCodeUpgradeWorkflow
 * WebSocket handling in useCodeUpgradeMessages
 */
export default function CodeUpgrades() {
  console.log('[CODE_UPGRADES] Component rendered');

  // ==========================================================================
  // SECTION 2: HOOKS INITIALIZATION
  // ==========================================================================

  /**
   * WebSocket connection hook
   * Manages connection to WebSocket service
   * Provides: sendMessage, lastMessage, isConnected
   */
  const { sendMessage, lastMessage, isConnected } = useJobWebSocket();

  /**
   * Workflow orchestration hook
   * Provides business logic methods and store access
   * Exposes entire store + workflow methods
   */
  const workflow = useCodeUpgradeWorkflow();

  /**
   * Direct store access for UI state
   * Alternative to accessing via workflow object
   */
  const {
    currentStep,
    deviceConfig,
    preCheck,
    upgrade,
    error,
    isProcessing,
  } = useCodeUpgradeStore();

  /**
   * WebSocket message processing hook
   * Subscribes to channels and routes messages to store
   * CRITICAL: This hook makes WebSocket messages work!
   */
  useCodeUpgradeMessages({
    lastMessage,
    currentStep,
    sendMessage,
  });

  // ==========================================================================
  // SECTION 3: COMPUTED VALUES
  // ==========================================================================

  /**
   * Form validation for configuration step
   * Checks all required fields are filled
   */
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
  // SECTION 4: RENDER
  // ==========================================================================

  return (
    <div className="p-8 pt-6">
      {/* ====================================================================
          HEADER
          ==================================================================== */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Code Upgrade Operation</h1>
          <p className="text-muted-foreground">
            Upgrade device operating system with pre-flight validation
          </p>
        </div>

        {/* Reset button when workflow is active */}
        {(isProcessing || preCheck.isRunning || upgrade.isRunning) && (
          <Button onClick={workflow.resetWorkflow} variant="outline" size="sm">
            Start New Upgrade
          </Button>
        )}
      </div>

      <Separator className="mb-8" />

      {/* ====================================================================
          TABS CONTAINER
          ==================================================================== */}
      <Tabs value={currentStep} onValueChange={(value) => {
        console.log('[CODE_UPGRADES] Tab navigation attempt:', value);
        console.log('[CODE_UPGRADES] Current step before change:', currentStep);
        workflow.setCurrentStep(value);
      }} className="w-full">

        {/* ==================================================================
            TAB NAVIGATION
            ================================================================== */}
        <TabsList className="grid w-full grid-cols-5 mb-6">
          <TabsTrigger value={WORKFLOW_STEPS.CONFIGURE}>
            Configure
          </TabsTrigger>

          <TabsTrigger value={WORKFLOW_STEPS.PRE_CHECK}>
            Pre-Check
          </TabsTrigger>

          <TabsTrigger value={WORKFLOW_STEPS.REVIEW}>
            Review {preCheck.isComplete && "✅"}
          </TabsTrigger>

          <TabsTrigger value={WORKFLOW_STEPS.UPGRADE}>
            Upgrade {upgrade.isRunning && "🔄"} {upgrade.isComplete && "✅"}
          </TabsTrigger>

          <TabsTrigger value={WORKFLOW_STEPS.RESULTS}>
            Results
          </TabsTrigger>
        </TabsList>

        {/* ==================================================================
            TAB CONTENT - CONFIGURATION
            ================================================================== */}
        <TabsContent value={WORKFLOW_STEPS.CONFIGURE}>
          <ConfigurationTab />
        </TabsContent>

        {/* ==================================================================
            TAB CONTENT - EXECUTION (Pre-Check)
            ================================================================== */}
        <TabsContent value={WORKFLOW_STEPS.PRE_CHECK}>
          <ExecutionTab
            currentPhase="pre_check"
            isRunning={preCheck.isRunning}
            isComplete={preCheck.isComplete}
            hasError={!!preCheck.error}
            progress={preCheck.progress}
            completedSteps={[]}
            totalSteps={100}
            latestStepMessage={null}
            jobOutput={preCheck.logs.map(log => ({
              id: log.id,
              timestamp: log.timestamp,
              message: log.message,
              level: log.level.toLowerCase(),
              event_type: log.event_type || 'LOG',
            }))}
            showTechnicalDetails={false}
            onToggleTechnicalDetails={() => {}}
            scrollAreaRef={{ current: null }}
          />
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
            onCancel={workflow.resetWorkflow}
            onForceReview={() => {}}
          />
        </TabsContent>

        {/* ==================================================================
            TAB CONTENT - UPGRADE
            ================================================================== */}
        <TabsContent value={WORKFLOW_STEPS.UPGRADE}>
          <UpgradeTab
            jobStatus={upgrade.isRunning ? 'running' : upgrade.isComplete ? 'success' : 'idle'}
            isRunning={upgrade.isRunning}
            isComplete={upgrade.isComplete}
            hasError={!!upgrade.error}
            progress={upgrade.progress}
            completedSteps={Math.floor(upgrade.logs.filter(log => log.step_name).length)}
            totalSteps={8} // Approximate number of upgrade phases
            currentPhase={upgrade.phase}
            jobOutput={upgrade.logs.map(log => ({
              id: log.id,
              timestamp: log.timestamp,
              message: log.message,
              level: log.level.toLowerCase(),
              event_type: log.event_type || 'LOG',
              step_name: log.step_name,
              phase: log.phase,
              progress: log.progress,
            }))}
            showTechnicalDetails={false}
            onToggleTechnicalDetails={() => {}}
            scrollAreaRef={{ current: null }}
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
            completedSteps={[]}
            totalSteps={100}
            currentPhase={WORKFLOW_STEPS.RESULTS}
            isConnected={isConnected}
            statistics={{}}
            showTechnicalDetails={false}
            onToggleTechnicalDetails={() => {}}
            onNavigateToExecute={() => workflow.setCurrentStep(WORKFLOW_STEPS.PRE_CHECK)}
            onStartNewUpgrade={workflow.resetWorkflow}
            jobOutput={[...preCheck.logs, ...upgrade.logs].map(log => ({
              id: log.id,
              timestamp: log.timestamp,
              message: log.message,
              level: log.level.toLowerCase(),
              event_type: log.event_type || 'LOG',
            }))}
          />
        </TabsContent>

      </Tabs>
    </div>
  );
}