/**
 * =============================================================================
 * UPGRADE STATE MANAGEMENT HOOK
 * =============================================================================
 *
 * Centralized state management for the entire upgrade workflow
 *
 * @module hooks/useUpgradeState
 * @author nikos-geranios_vgi
 * @date 2025-11-05
 */
 
import { useState, useRef } from 'react';
 
/**
 * Custom hook for managing upgrade workflow state
 *
 * Provides centralized state management for:
 * - Upgrade parameters
 * - Job tracking (IDs, status, progress)
 * - Pre-check results
 * - UI state (tabs, phases)
 * - Execution logs
 *
 * @returns {Object} State and state setters
 *
 * @example
 * const {
 *   upgradeParams,
 *   setUpgradeParams,
 *   jobStatus,
 *   setJobStatus,
 *   // ... other state
 * } = useUpgradeState();
 */
export function useUpgradeState() {
  // ==========================================================================
  // UPGRADE PARAMETERS STATE
  // ==========================================================================
  const [upgradeParams, setUpgradeParams] = useState({
    username: "",
    password: "",
    hostname: "",
    inventory_file: "",
    vendor: "",
    platform: "",
    target_version: "",
    image_filename: ""
  });
 
  // ==========================================================================
  // UI STATE
  // ==========================================================================
  const [activeTab, setActiveTab] = useState("config");
  const [jobStatus, setJobStatus] = useState("idle");
  const [currentPhase, setCurrentPhase] = useState("config");
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
 
  // ==========================================================================
  // PROGRESS TRACKING STATE
  // ==========================================================================
  const [progress, setProgress] = useState(0);
  const [jobOutput, setJobOutput] = useState([]);
  const [completedSteps, setCompletedSteps] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);
 
  // ==========================================================================
  // JOB IDENTIFIERS STATE
  // ==========================================================================
  const [jobId, setJobId] = useState(null);
  const [wsChannel, setWsChannel] = useState(null);
  const [finalResults, setFinalResults] = useState(null);
 
  // ==========================================================================
  // PRE-CHECK STATE
  // ==========================================================================
  const [preCheckJobId, setPreCheckJobId] = useState(null);
  const [preCheckResults, setPreCheckResults] = useState(null);
  const [preCheckSummary, setPreCheckSummary] = useState(null);
  const [isRunningPreCheck, setIsRunningPreCheck] = useState(false);
  const [canProceedWithUpgrade, setCanProceedWithUpgrade] = useState(false);
 
  // ==========================================================================
  // STATISTICS STATE
  // ==========================================================================
  const [statistics, setStatistics] = useState({
    total: 0,
    succeeded: 0,
    failed: 0
  });
 
  // ==========================================================================
  // REFS FOR PERSISTENT VALUES
  // ==========================================================================
  const processedStepsRef = useRef(new Set());
  const latestStepMessageRef = useRef("");
  const loggedMessagesRef = useRef(new Set());
  const scrollAreaRef = useRef(null);
 
  // ==========================================================================
  // RESET FUNCTION
  // ==========================================================================
 
  /**
   * Resets all state to initial values
   * Call this when starting a new upgrade workflow
   */
  const resetState = () => {
    setJobStatus("idle");
    setCurrentPhase("config");
    setProgress(0);
    setJobOutput([]);
    setJobId(null);
    setWsChannel(null);
    setFinalResults(null);
    setActiveTab("config");
    setCompletedSteps(0);
    setTotalSteps(0);
    setStatistics({ total: 0, succeeded: 0, failed: 0 });
    setPreCheckJobId(null);
    setPreCheckResults(null);
    setPreCheckSummary(null);
    setIsRunningPreCheck(false);
    setCanProceedWithUpgrade(false);
    setShowTechnicalDetails(false);
 
    processedStepsRef.current.clear();
    latestStepMessageRef.current = "";
    loggedMessagesRef.current.clear();
  };
 
  // ==========================================================================
  // RETURN STATE AND SETTERS
  // ==========================================================================
 
  return {
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
  };
}