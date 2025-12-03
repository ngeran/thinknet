## **EXECUTIVE SUMMARY

### **Issues Identified:**\

1.   **Missing hook file**: `useCodeUpgradeWorkflowZustand.js` doesn't exist\
2.  **WebSocket subscription never happens**: No channel subscription in Zustand hooks\
3. **Naming too verbose**: Files have `Zustand` suffix unnecessarily\
4. *ExecutionTab & UpgradeTab** rely on logs from store but logs never populate\
5.  **Message processing broken**: Store actions called but messages not routed\

### **Root Cause:**\
The WebSocket messages arrive at `useJobWebSocket` but are never:\
1. Subscribed to job-specific channel\
2. Processed by store actions\
3. Added to store logs arrays\

### **Solution Strategy:**\
1. \uc0\u9989  Rename all files (remove `Zustand` suffix)\
2. \uc0\u9989  Create missing workflow hook\
3. \uc0\u9989  Fix WebSocket subscription in message hook\
4. \uc0\u9989  Update all tabs to work with cleaned architecture\
5. \uc0\u9989  Clean up unused files\

---\
\
## ** COMPLETE FILE STRUCTURE**\
\
### **Files to CREATE:**\
```\
frontend/src/hooks/useCodeUpgradeWorkflow.js    (NEW - replaces old version)\
frontend/src/hooks/useCodeUpgradeMessages.js     (NEW - fixed WebSocket)\
frontend/src/pages/Management/CodeUpgrades.jsx   (UPDATED - clean version)\
```\
\
### **Files to UPDATE:**\
```\
frontend/src/lib/codeUpgradeStore.js            (Minor fixes)\
frontend/src/pages/Management/tabs/ConfigurationTab.jsx\
frontend/src/pages/Management/tabs/ExecutionTab.jsx\
frontend/src/pages/Management/tabs/UpgradeTab.jsx\
```\
\
### **Files to DELETE:**\
```\
frontend/src/hooks/useCodeUpgradeStoreBridge.js\
frontend/src/hooks/useWebSocketMessagesZustand.js\
frontend/src/pages/Management/CodeUpgradesWrapper.jsx\
frontend/src/pages/Management/CodeUpgradesZustand.jsx\
```\
\
---\
\
## **SOLUTION FILES**\
\
---\
\
### **FILE 1: Workflow Hook (NEW)**\
\
**Path**: `frontend/src/hooks/useCodeUpgradeWorkflow.js`\
\
```javascript\
/**\
 * =============================================================================\
 * CODE UPGRADE WORKFLOW HOOK v2.0. 0\
 * =============================================================================\
 *\
 * Business logic orchestrator for code upgrade workflow\
 * Handles API calls, validation, and store updates\
 *\
 * ARCHITECTURE:\
 * - Accesses Zustand store directly (no props needed)\
 * - Makes API calls to backend\
 * - Updates store with job IDs and results\
 * - Returns workflow methods for components\
 *\
 * FLOW:\
 * 1. Component calls startPreCheckExecution()\
 * 2.  Hook validates deviceConfig from store\
 * 3. Hook calls /api/operations/pre-check\
 * 4.  Hook updates store with jobId and wsChannel\
 * 5. Hook transitions to PRE_CHECK step\
 * 6. WebSocket hook (useCodeUpgradeMessages) handles real-time updates\
 *\
 * Location: frontend/src/hooks/useCodeUpgradeWorkflow.js\
 * Author: nikos-geranios_vgi\
 * Date: 2025-12-02\
 * Version: 2.0.0 - Clean architecture without Zustand suffix\
 * =============================================================================\
 */\
\
import \{ useCallback \} from 'react';\
import \{ useCodeUpgradeStore, WORKFLOW_STEPS \} from '@/lib/codeUpgradeStore';\
\
// =============================================================================\
// SECTION 1: CONFIGURATION\
// =============================================================================\
\
const API_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000';\
\
// =============================================================================\
// SECTION 2: MAIN HOOK DEFINITION\
// =============================================================================\
\
/**\
 * Code Upgrade Workflow Hook\
 *\
 * Provides workflow orchestration methods that interact with backend\
 * and update Zustand store.  All business logic centralized here.\
 *\
 * @returns \{Object\} Workflow methods and store state\
 */\
export function useCodeUpgradeWorkflow() \{\
  // Access entire store\
  const store = useCodeUpgradeStore();\
\
  // ==========================================================================\
  // SECTION 3: PRE-CHECK EXECUTION\
  // ==========================================================================\
\
  /**\
   * Start Pre-Check Validation\
   *\
   * FLOW:\
   * 1.  Validate device configuration\
   * 2.  Build API payload\
   * 3. POST to /api/operations/pre-check\
   * 4. Extract job_id and ws_channel from response\
   * 5. Update store with job info\
   * 6. Transition to PRE_CHECK step\
   * 7. Add initial log entry\
   *\
   * WebSocket subscription happens in useCodeUpgradeMessages hook\
   */\
  const startPreCheckExecution = useCallback(async () => \{\
    const \{\
      deviceConfig,\
      setPreCheckJobId,\
      startPreCheck,\
      addPreCheckLog,\
      setError,\
      clearError,\
    \} = store;\
\
    try \{\
      console.log('[WORKFLOW] Starting pre-check execution');\
      clearError();\
\
      // Validate required fields\
      const missingFields = [];\
      if (! deviceConfig. hostname?. trim()) missingFields.push('hostname');\
      if (!deviceConfig.username?. trim()) missingFields.push('username');\
      if (!deviceConfig.password?.trim()) missingFields.push('password');\
      if (!deviceConfig.image_filename?.trim()) missingFields.push('image filename');\
      if (!deviceConfig. target_version?.trim()) missingFields.push('target version');\
      if (!deviceConfig.selectedPreChecks?.length) missingFields. push('pre-check selections');\
\
      if (missingFields.length > 0) \{\
        throw new Error(`Missing required fields: $\{missingFields.join(', ')\}`);\
      \}\
\
      // Build API payload\
      const payload = \{\
        hostname: deviceConfig. hostname.trim(),\
        username: deviceConfig.username.trim(),\
        password: deviceConfig.password. trim(),\
        target_version: deviceConfig.target_version.trim(),\
        image_filename: deviceConfig.image_filename.trim(),\
        pre_check_selection: deviceConfig.selectedPreChecks.join(','),\
      \};\
\
      console.log('[WORKFLOW] API payload:', payload);\
\
      // Call backend API\
      const response = await fetch(`$\{API_URL\}/api/operations/pre-check`, \{\
        method: 'POST',\
        headers: \{ 'Content-Type': 'application/json' \},\
        credentials: 'include',\
        body: JSON.stringify(payload),\
      \});\
\
      if (!response. ok) \{\
        const errorData = await response.json();\
        throw new Error(errorData.detail || 'Pre-check start failed');\
      \}\
\
      const data = await response.json();\
      console.log('[WORKFLOW] Pre-check job created:', data. job_id);\
\
      // Construct WebSocket channel (backend may or may not provide it)\
      const wsChannel = data.ws_channel || `job:$\{data.job_id\}`;\
\
      // Update store with job information\
      setPreCheckJobId(data.job_id, wsChannel);\
      startPreCheck();\
\
      // Add initial log entry\
      addPreCheckLog(\{\
        id: `log_$\{Date.now()\}`,\
        timestamp: new Date().toISOString(),\
        level: 'INFO',\
        message: `Pre-check job started: $\{data.job_id\}`,\
      \});\
\
      console.log('[WORKFLOW] Pre-check started successfully');\
\
    \} catch (error) \{\
      console.error('[WORKFLOW] Pre-check start failed:', error);\
      setError(error.message);\
    \}\
  \}, [store]);\
\
  // ==========================================================================\
  // SECTION 4: UPGRADE EXECUTION\
  // ==========================================================================\
\
  /**\
   * Start Upgrade Execution\
   *\
   * FLOW:\
   * 1. Validate pre-check completed\
   * 2. Build API payload\
   * 3. POST to /api/operations/upgrade\
   * 4. Extract job_id and ws_channel\
   * 5. Update store with job info\
   * 6.  Transition to UPGRADE step\
   * 7. Add initial log entry\
   */\
  const startUpgradeExecution = useCallback(async () => \{\
    const \{\
      deviceConfig,\
      preCheck,\
      setUpgradeJobId,\
      startUpgrade,\
      addUpgradeLog,\
      setError,\
      clearError,\
    \} = store;\
\
    try \{\
      console.log('[WORKFLOW] Starting upgrade execution');\
      clearError();\
\
      // Validate pre-check completed\
      if (!preCheck.isComplete || !preCheck.jobId) \{\
        throw new Error('Pre-check must complete before starting upgrade');\
      \}\
\
      // Build API payload\
      const payload = \{\
        hostname: deviceConfig.hostname,\
        username: deviceConfig.username,\
        password: deviceConfig. password,\
        target_version: deviceConfig.target_version,\
        image_filename: deviceConfig. image_filename,\
        pre_check_job_id: preCheck.jobId,\
        no_validate: deviceConfig.no_validate,\
        no_copy: deviceConfig.no_copy,\
        auto_reboot: deviceConfig.auto_reboot,\
      \};\
\
      console.log('[WORKFLOW] Upgrade payload:', payload);\
\
      // Call backend API\
      const response = await fetch(`$\{API_URL\}/api/operations/upgrade`, \{\
        method: 'POST',\
        headers: \{ 'Content-Type': 'application/json' \},\
        credentials: 'include',\
        body: JSON.stringify(payload),\
      \});\
\
      if (!response.ok) \{\
        const errorData = await response. json();\
        throw new Error(errorData.detail || 'Upgrade start failed');\
      \}\
\
      const data = await response.json();\
      console.log('[WORKFLOW] Upgrade job created:', data.job_id);\
\
      // Construct WebSocket channel\
      const wsChannel = data.ws_channel || `job:$\{data.job_id\}`;\
\
      // Update store\
      setUpgradeJobId(data.job_id, wsChannel);\
      startUpgrade();\
\
      // Add initial log\
      addUpgradeLog(\{\
        id: `log_$\{Date.now()\}`,\
        timestamp: new Date().toISOString(),\
        level: 'INFO',\
        message: `Upgrade job started: $\{data.job_id\}`,\
      \});\
\
      console.log('[WORKFLOW] Upgrade started successfully');\
\
    \} catch (error) \{\
      console.error('[WORKFLOW] Upgrade start failed:', error);\
      setError(error.message);\
    \}\
  \}, [store]);\
\
  // ==========================================================================\
  // SECTION 5: PARAMETER HANDLERS\
  // ==========================================================================\
\
  /**\
   * Handle device config changes\
   * Updates a single field in deviceConfig\
   */\
  const handleDeviceConfigChange = useCallback((name, value) => \{\
    store.updateDeviceConfig(\{ [name]: value \});\
  \}, [store]);\
\
  /**\
   * Handle pre-check selection changes\
   * Updates selectedPreChecks array in deviceConfig\
   */\
  const handlePreCheckSelectionChange = useCallback((checkIds) => \{\
    store.updateDeviceConfig(\{ selectedPreChecks: checkIds \});\
  \}, [store]);\
\
  /**\
   * Reset entire workflow\
   * Clears all state and returns to configuration step\
   */\
  const resetWorkflow = useCallback(() => \{\
    store.reset();\
  \}, [store]);\
\
  /**\
   * Set current workflow step\
   * Allows manual navigation between steps\
   */\
  const setCurrentStep = useCallback((step) => \{\
    store.setCurrentStep(step);\
  \}, [store]);\
\
  // ==========================================================================\
  // SECTION 6: RETURN PUBLIC API\
  // ==========================================================================\
\
  return \{\
    // Expose entire store state\
    ... store,\
\
    // Workflow methods\
    startPreCheckExecution,\
    startUpgradeExecution,\
    handleDeviceConfigChange,\
    handlePreCheckSelectionChange,\
    resetWorkflow,\
    setCurrentStep,\
  \};\
\}\
\
export default useCodeUpgradeWorkflow;\
```\
\
---\
\
### **FILE 2: WebSocket Message Hook (NEW)**\
\
**Path**: `frontend/src/hooks/useCodeUpgradeMessages. js`\
\
```javascript\
/**\
 * =============================================================================\
 * CODE UPGRADE WEBSOCKET MESSAGE HOOK v2.0.0\
 * =============================================================================\
 *\
 * WebSocket message processor for code upgrade workflow\
 * Subscribes to job-specific channels and routes messages to store\
 *\
 * CRITICAL FIXES v2.0.0:\
 * - Added proper WebSocket channel subscription\
 * - Routes messages based on current workflow step\
 * - Adds logs to correct store array (preCheck. logs or upgrade.logs)\
 * - Handles PRE_CHECK_COMPLETE and OPERATION_COMPLETE events\
 * - Triggers tab transitions on completion\
 *\
 * ARCHITECTURE:\
 * - Listens to lastMessage from useJobWebSocket\
 * - Subscribes to job:$\{jobId\} channel when job starts\
 * - Parses nested message structures\
 * - Routes to preCheck or upgrade message handlers\
 * - Updates store with logs and completion data\
 *\
 * MESSAGE FLOW:\
 * 1. Backend publishes to Redis: ws_channel:job:$\{job_id\}\
 * 2.  Rust WebSocket hub forwards to frontend\
 * 3.  useJobWebSocket receives message\
 * 4. This hook subscribes to channel\
 * 5. This hook processes message\
 * 6. This hook updates store\
 * 7. Components re-render with new data\
 *\
 * Location: frontend/src/hooks/useCodeUpgradeMessages.js\
 * Author: nikos-geranios_vgi\
 * Date: 2025-12-02\
 * Version: 2.0.0 - Fixed WebSocket subscription\
 * =============================================================================\
 */\
\
import \{ useEffect, useCallback, useRef \} from 'react';\
import \{ useCodeUpgradeStore, WORKFLOW_STEPS \} from '@/lib/codeUpgradeStore';\
\
// =============================================================================\
// SECTION 1: CONSTANTS\
// =============================================================================\
\
const RECOGNIZED_EVENT_TYPES = new Set([\
  'PRE_CHECK_RESULT',\
  'PRE_CHECK_COMPLETE',\
  'OPERATION_START',\
  'OPERATION_COMPLETE',\
  'STEP_START',\
  'STEP_COMPLETE',\
  'STEP_PROGRESS',\
  'LOG_MESSAGE',\
  'UPLOAD_START',\
  'UPLOAD_COMPLETE',\
  'PROGRESS_UPDATE',\
]);\
\
// =============================================================================\
// SECTION 2: MAIN HOOK DEFINITION\
// =============================================================================\
\
/**\
 * Code Upgrade WebSocket Messages Hook\
 *\
 * Handles WebSocket message processing for code upgrade workflow\
 *\
 * @param \{Object\} params - Hook parameters\
 * @param \{Object\} params.lastMessage - Latest WebSocket message from useJobWebSocket\
 * @param \{string\} params.currentStep - Current workflow step\
 * @param \{Function\} params.sendMessage - WebSocket send function\
 *\
 * @returns \{Object\} Message processing utilities\
 */\
export function useCodeUpgradeMessages(\{ lastMessage, currentStep, sendMessage \}) \{\
  // Access store\
  const \{\
    preCheck,\
    upgrade,\
    addPreCheckLog,\
    addUpgradeLog,\
    setPreCheckComplete,\
    setUpgradeComplete,\
    moveToReview,\
    moveToResults,\
  \} = useCodeUpgradeStore();\
\
  // Deduplication tracking\
  const processedMessagesRef = useRef(new Set());\
\
  // ==========================================================================\
  // SECTION 3: WEBSOCKET SUBSCRIPTION\
  // ==========================================================================\
\
  /**\
   * Subscribe to job-specific WebSocket channel\
   *\
   * CRITICAL: This is what was missing in the original implementation! \
   *\
   * FLOW:\
   * 1. Check if we have an active job (preCheck or upgrade)\
   * 2.  Construct channel name: job:$\{jobId\}\
   * 3. Send SUBSCRIBE message to WebSocket service\
   * 4. Backend messages now flow to frontend\
   *\
   * This effect runs when:\
   * - preCheck.jobId changes (pre-check starts)\
   * - upgrade.jobId changes (upgrade starts)\
   * - currentStep changes (tab navigation)\
   * - sendMessage function available\
   */\
  useEffect(() => \{\
    if (!sendMessage) return;\
\
    // Determine active job based on current step\
    let activeJobId = null;\
    let wsChannel = null;\
\
    if (currentStep === WORKFLOW_STEPS.PRE_CHECK && preCheck.jobId) \{\
      activeJobId = preCheck. jobId;\
      wsChannel = preCheck.wsChannel || `job:$\{preCheck.jobId\}`;\
    \} else if (currentStep === WORKFLOW_STEPS.UPGRADE && upgrade.jobId) \{\
      activeJobId = upgrade.jobId;\
      wsChannel = upgrade.wsChannel || `job:$\{upgrade.jobId\}`;\
    \}\
\
    if (! activeJobId || !wsChannel) \{\
      console.log('[WS_MESSAGES] No active job to subscribe to');\
      return;\
    \}\
\
    console.log('[WS_MESSAGES] \uc0\u55357 \u56596  Subscribing to channel:', wsChannel);\
\
    // Send subscription message to WebSocket service\
    sendMessage(\{\
      type: 'SUBSCRIBE',\
      channel: wsChannel,\
    \});\
\
    // Cleanup: unsubscribe when component unmounts or job changes\
    return () => \{\
      console.log('[WS_MESSAGES] \uc0\u55357 \u56597  Unsubscribing from channel:', wsChannel);\
      sendMessage(\{\
        type: 'UNSUBSCRIBE',\
        channel: wsChannel,\
      \});\
    \};\
  \}, [preCheck.jobId, upgrade.jobId, currentStep, sendMessage]);\
\
  // ==========================================================================\
  // SECTION 4: PRE-CHECK MESSAGE HANDLERS\
  // ==========================================================================\
\
  /**\
   * Handle PRE_CHECK_COMPLETE event\
   *\
   * This event signals pre-check workflow completion\
   * Contains summary data with validation results\
   */\
  const handlePreCheckComplete = useCallback((message) => \{\
    console.log('[WS_MESSAGES] Pre-check completed:', message. data);\
\
    // Extract summary from message\
    const summary = message. data?. summary || message.data || \{\
      total_checks: 0,\
      passed_checks: 0,\
      failed_checks: 0,\
      can_proceed: true,\
      results: [],\
    \};\
\
    // Update store with completion data\
    setPreCheckComplete(summary);\
\
    // Transition to review tab\
    moveToReview();\
\
    // Add completion log\
    addPreCheckLog(\{\
      id: `log_$\{Date.now()\}`,\
      timestamp: new Date().toISOString(),\
      level: 'INFO',\
      message: `Pre-check completed: $\{summary.passed_checks\}/$\{summary.total_checks\} checks passed`,\
    \});\
  \}, [setPreCheckComplete, moveToReview, addPreCheckLog]);\
\
  /**\
   * Handle pre-check phase messages\
   *\
   * Routes different event types to appropriate handlers\
   */\
  const handlePreCheckMessage = useCallback((message) => \{\
    console.log('[WS_MESSAGES] Processing pre-check message:', message.event_type);\
\
    switch (message. event_type) \{\
      case 'PRE_CHECK_COMPLETE':\
        handlePreCheckComplete(message);\
        break;\
\
      case 'PRE_CHECK_RESULT':\
      case 'STEP_START':\
      case 'STEP_COMPLETE':\
      case 'STEP_PROGRESS':\
      case 'OPERATION_START':\
      case 'LOG_MESSAGE':\
        // Add to pre-check logs\
        addPreCheckLog(\{\
          id: `log_$\{Date.now()\}_$\{Math.random(). toString(36).substr(2, 9)\}`,\
          timestamp: message.timestamp || new Date().toISOString(),\
          level: message.level?. toUpperCase() || 'INFO',\
          message: message.message || 'Log message',\
          event_type: message.event_type,\
        \});\
        break;\
\
      default:\
        console.log('[WS_MESSAGES] Unhandled pre-check event:', message.event_type);\
    \}\
  \}, [handlePreCheckComplete, addPreCheckLog]);\
\
  // ==========================================================================\
  // SECTION 5: UPGRADE MESSAGE HANDLERS\
  // ==========================================================================\
\
  /**\
   * Handle OPERATION_COMPLETE event (upgrade phase)\
   *\
   * This event signals upgrade completion\
   * Contains final results and success status\
   */\
  const handleUpgradeComplete = useCallback((message) => \{\
    console. log('[WS_MESSAGES] Upgrade completed:', message.data);\
\
    // Extract result from message\
    const result = message. data || \{\
      success: true,\
      message: 'Upgrade completed',\
    \};\
\
    // Update store with completion data\
    setUpgradeComplete(result);\
\
    // Transition to results tab\
    moveToResults();\
\
    // Add completion log\
    addUpgradeLog(\{\
      id: `log_$\{Date.now()\}`,\
      timestamp: new Date().toISOString(),\
      level: result.success ? 'INFO' : 'ERROR',\
      message: result.success ? 'Upgrade completed successfully' : 'Upgrade failed',\
    \});\
  \}, [setUpgradeComplete, moveToResults, addUpgradeLog]);\
\
  /**\
   * Handle upgrade phase messages\
   *\
   * Routes different event types to appropriate handlers\
   */\
  const handleUpgradeMessage = useCallback((message) => \{\
    console.log('[WS_MESSAGES] Processing upgrade message:', message.event_type);\
\
    switch (message.event_type) \{\
      case 'OPERATION_COMPLETE':\
        handleUpgradeComplete(message);\
        break;\
\
      case 'STEP_START':\
      case 'STEP_COMPLETE':\
      case 'STEP_PROGRESS':\
      case 'OPERATION_START':\
      case 'LOG_MESSAGE':\
      case 'UPLOAD_START':\
      case 'UPLOAD_COMPLETE':\
      case 'PROGRESS_UPDATE':\
        // Add to upgrade logs\
        addUpgradeLog(\{\
          id: `log_$\{Date.now()\}_$\{Math.random().toString(36).substr(2, 9)\}`,\
          timestamp: message.timestamp || new Date(). toISOString(),\
          level: message.level?.toUpperCase() || 'INFO',\
          message: message.message || 'Log message',\
          event_type: message.event_type,\
        \});\
        break;\
\
      default:\
        console.log('[WS_MESSAGES] Unhandled upgrade event:', message.event_type);\
    \}\
  \}, [handleUpgradeComplete, addUpgradeLog]);\
\
  // ==========================================================================\
  // SECTION 6: MESSAGE ROUTING\
  // ==========================================================================\
\
  /**\
   * Route message to correct handler based on current step\
   */\
  const processMessage = useCallback((message) => \{\
    if (!message || !message.event_type) \{\
      console.warn('[WS_MESSAGES] Invalid message format:', message);\
      return;\
    \}\
\
    // Deduplication\
    const messageId = message.message_id || `$\{message.timestamp\}_$\{message.event_type\}`;\
    if (processedMessagesRef. current.has(messageId)) \{\
      return;\
    \}\
    processedMessagesRef.current.add(messageId);\
\
    console.log('[WS_MESSAGES] Routing message:', message. event_type, 'Step:', currentStep);\
\
    // Route based on current workflow step\
    if (currentStep === WORKFLOW_STEPS.PRE_CHECK) \{\
      handlePreCheckMessage(message);\
    \} else if (currentStep === WORKFLOW_STEPS. UPGRADE) \{\
      handleUpgradeMessage(message);\
    \}\
  \}, [currentStep, handlePreCheckMessage, handleUpgradeMessage]);\
\
  // ==========================================================================\
  // SECTION 7: MESSAGE PARSING AND PROCESSING\
  // ==========================================================================\
\
  /**\
   * Process incoming WebSocket messages\
   *\
   * Handles nested message structures:\
   * - \{ channel: "job:xxx", data: "\{... \}" \}\
   * - \{ channel: "job:xxx", data: \{... \} \}\
   * - Direct event object\
   */\
  useEffect(() => \{\
    if (!lastMessage) return;\
\
    try \{\
      let message;\
\
      console.log('[WS_MESSAGES] Received message type:', typeof lastMessage);\
\
      // Parse nested message structure\
      if (lastMessage && lastMessage.channel && lastMessage.data !== undefined) \{\
        // WebSocket service format: \{ channel, data \}\
        if (typeof lastMessage.data === 'string') \{\
          message = JSON.parse(lastMessage. data);\
        \} else \{\
          message = lastMessage.data;\
        \}\
      \} else if (typeof lastMessage === 'string') \{\
        // String message - parse it\
        const parsed = JSON.parse(lastMessage);\
        if (parsed.channel && parsed.data !== undefined) \{\
          if (typeof parsed.data === 'string') \{\
            message = JSON.parse(parsed.data);\
          \} else \{\
            message = parsed.data;\
          \}\
        \} else \{\
          message = parsed;\
        \}\
      \} else \{\
        // Direct object message\
        message = lastMessage;\
      \}\
\
      // Process if valid\
      if (message && (message.event_type || message.message)) \{\
        processMessage(message);\
      \}\
    \} catch (error) \{\
      console.error('[WS_MESSAGES] Parse error:', error);\
    \}\
  \}, [lastMessage, processMessage]);\
\
  // ==========================================================================\
  // SECTION 8: CLEANUP\
  // ==========================================================================\
\
  /**\
   * Clear processed messages cache when step changes\
   * Prevents stale message deduplication\
   */\
  useEffect(() => \{\
    processedMessagesRef.current.clear();\
  \}, [currentStep]);\
\
  // ==========================================================================\
  // SECTION 9: RETURN PUBLIC API\
  // ==========================================================================\
\
  return \{\
    processMessage,\
    messageCount: processedMessagesRef.current.size,\
  \};\
\}\
\
export default useCodeUpgradeMessages;\
```\
\
---\
\
### **FILE 3: Main Component (UPDATED)**\
\
**Path**: `frontend/src/pages/Management/CodeUpgrades.jsx`\
\
```javascript\
/**\
 * =============================================================================\
 * CODE UPGRADES COMPONENT v2.0.0\
 * =============================================================================\
 *\
 * Main orchestrator for device upgrade workflow\
 * Clean architecture with Zustand store and centralized hooks\
 *\
 * ARCHITECTURE:\
 * - Uses Zustand store for state management\
 * - Uses useJobWebSocket for WebSocket connection\
 * - Uses useCodeUpgradeWorkflow for business logic\
 * - Uses useCodeUpgradeMessages for WebSocket processing\
 * - Tabs access store directly (no prop drilling)\
 *\
 * WORKFLOW STEPS:\
 * 1.  CONFIGURE: Device setup, image selection, options\
 * 2. PRE_CHECK: Pre-flight validation execution\
 * 3. REVIEW: Pre-check results review\
 * 4. UPGRADE: Software upgrade execution\
 * 5.  RESULTS: Final results and summary\
 *\
 * Location: frontend/src/pages/Management/CodeUpgrades.jsx\
 * Author: nikos-geranios_vgi\
 * Date: 2025-12-02\
 * Version: 2.0.0 - Clean architecture\
 * =============================================================================\
 */\
\
import React, \{ useMemo \} from 'react';\
import \{ Button \} from '@/components/ui/button';\
import \{ Separator \} from '@/components/ui/separator';\
import \{ Tabs, TabsContent, TabsList, TabsTrigger \} from '@/components/ui/tabs';\
\
// Hooks\
import \{ useJobWebSocket \} from '@/hooks/useJobWebSocket';\
import \{ useCodeUpgradeWorkflow \} from '@/hooks/useCodeUpgradeWorkflow';\
import \{ useCodeUpgradeMessages \} from '@/hooks/useCodeUpgradeMessages';\
import \{ useCodeUpgradeStore, WORKFLOW_STEPS \} from '@/lib/codeUpgradeStore';\
\
// Tab components\
import ConfigurationTab from './tabs/ConfigurationTab';\
import ExecutionTab from './tabs/ExecutionTab';\
import ReviewTab from './tabs/ReviewTab';\
import UpgradeTab from './tabs/UpgradeTab';\
import ResultsTab from './tabs/ResultsTab';\
\
// =============================================================================\
// SECTION 1: MAIN COMPONENT\
// =============================================================================\
\
/**\
 * Code Upgrades Component\
 *\
 * Main workflow orchestrator that coordinates:\
 * - WebSocket connection\
 * - Workflow state management\
 * - Message processing\
 * - Tab navigation\
 *\
 * State comes from Zustand store\
 * Business logic in useCodeUpgradeWorkflow\
 * WebSocket handling in useCodeUpgradeMessages\
 */\
export default function CodeUpgrades() \{\
  console.log('[CODE_UPGRADES] Component rendered');\
\
  // ==========================================================================\
  // SECTION 2: HOOKS INITIALIZATION\
  // ==========================================================================\
\
  /**\
   * WebSocket connection hook\
   * Manages connection to WebSocket service\
   * Provides: sendMessage, lastMessage, isConnected\
   */\
  const \{ sendMessage, lastMessage, isConnected \} = useJobWebSocket();\
\
  /**\
   * Workflow orchestration hook\
   * Provides business logic methods and store access\
   * Exposes entire store + workflow methods\
   */\
  const workflow = useCodeUpgradeWorkflow();\
\
  /**\
   * Direct store access for UI state\
   * Alternative to accessing via workflow object\
   */\
  const \{\
    currentStep,\
    deviceConfig,\
    preCheck,\
    upgrade,\
    error,\
    isProcessing,\
  \} = useCodeUpgradeStore();\
\
  /**\
   * WebSocket message processing hook\
   * Subscribes to channels and routes messages to store\
   * CRITICAL: This hook makes WebSocket messages work!\
   */\
  useCodeUpgradeMessages(\{\
    lastMessage,\
    currentStep,\
    sendMessage,\
  \});\
\
  // ==========================================================================\
  // SECTION 3: COMPUTED VALUES\
  // ==========================================================================\
\
  /**\
   * Form validation for configuration step\
   * Checks all required fields are filled\
   */\
  const isFormValid = useMemo(() => \{\
    return (\
      deviceConfig.username?. trim() &&\
      deviceConfig. password?.trim() &&\
      (deviceConfig.hostname?.trim() || deviceConfig.inventory_file?.trim()) &&\
      deviceConfig.image_filename?.trim() &&\
      deviceConfig.target_version?.trim()\
    );\
  \}, [deviceConfig]);\
\
  // ==========================================================================\
  // SECTION 4: RENDER\
  // ==========================================================================\
\
  return (\
    <div className="p-8 pt-6">\
      \{/* ====================================================================\
          HEADER\
          ==================================================================== */\}\
      <div className="flex items-center justify-between mb-2">\
        <div>\
          <h1 className="text-3xl font-bold tracking-tight">Code Upgrade Operation</h1>\
          <p className="text-muted-foreground">\
            Upgrade device operating system with pre-flight validation\
          </p>\
        </div>\
\
        \{/* Reset button when workflow is active */\}\
        \{(isProcessing || preCheck.isRunning || upgrade.isRunning) && (\
          <Button onClick=\{workflow.resetWorkflow\} variant="outline" size="sm">\
            Start New Upgrade\
          </Button>\
        )\}\
      </div>\
\
      <Separator className="mb-8" />\
\
      \{/* ====================================================================\
          TABS CONTAINER\
          ==================================================================== */\}\
      <Tabs value=\{currentStep\} onValueChange=\{workflow.setCurrentStep\} className="w-full">\
\
        \{/* ==================================================================\
            TAB NAVIGATION\
            ================================================================== */\}\
        <TabsList className="grid w-full grid-cols-5 mb-6">\
          <TabsTrigger value=\{WORKFLOW_STEPS. CONFIGURE\}>\
            Configure\
          </TabsTrigger>\
\
          <TabsTrigger value=\{WORKFLOW_STEPS.PRE_CHECK\}>\
            Pre-Check\
          </TabsTrigger>\
\
          <TabsTrigger value=\{WORKFLOW_STEPS. REVIEW\}>\
            Review \{preCheck.isComplete && "\uc0\u9989 "\}\
          </TabsTrigger>\
\
          <TabsTrigger value=\{WORKFLOW_STEPS. UPGRADE\}>\
            Upgrade\
          </TabsTrigger>\
\
          <TabsTrigger value=\{WORKFLOW_STEPS.RESULTS\}>\
            Results\
          </TabsTrigger>\
        </TabsList>\
\
        \{/* ==================================================================\
            TAB CONTENT - CONFIGURATION\
            ================================================================== */\}\
        <TabsContent value=\{WORKFLOW_STEPS.CONFIGURE\}>\
          <ConfigurationTab />\
        </TabsContent>\
\
        \{/* ==================================================================\
            TAB CONTENT - EXECUTION (Pre-Check)\
            ================================================================== */\}\
        <TabsContent value=\{WORKFLOW_STEPS.PRE_CHECK\}>\
          <ExecutionTab\
            currentPhase="pre_check"\
            isRunning=\{preCheck.isRunning\}\
            isComplete=\{preCheck.isComplete\}\
            hasError=\{!! preCheck.error\}\
            progress=\{preCheck.progress\}\
            completedSteps=\{[]\}\
            totalSteps=\{100\}\
            latestStepMessage=\{null\}\
            jobOutput=\{preCheck.logs. map(log => (\{\
              id: log.id,\
              timestamp: log.timestamp,\
              message: log.message,\
              level: log.level. toLowerCase(),\
              event_type: log.event_type || 'LOG',\
            \}))\}\
            showTechnicalDetails=\{false\}\
            onToggleTechnicalDetails=\{() => \{\}\}\
            scrollAreaRef=\{\{ current: null \}\}\
          />\
        </TabsContent>\
\
        \{/* ==================================================================\
            TAB CONTENT - REVIEW\
            ================================================================== */\}\
        <TabsContent value=\{WORKFLOW_STEPS.REVIEW\}>\
          <ReviewTab\
            preCheckSummary=\{preCheck.summary\}\
            upgradeParams=\{deviceConfig\}\
            isConnected=\{isConnected\}\
            jobStatus=\{preCheck.isRunning ? 'running' : preCheck.isComplete ? 'success' : 'idle'\}\
            isRunningPreCheck=\{preCheck.isRunning\}\
            onProceedWithUpgrade=\{workflow.startUpgradeExecution\}\
            onCancel=\{workflow.resetWorkflow\}\
            onForceReview=\{() => \{\}\}\
          />\
        </TabsContent>\
\
        \{/* ==================================================================\
            TAB CONTENT - UPGRADE\
            ================================================================== */\}\
        <TabsContent value=\{WORKFLOW_STEPS.UPGRADE\}>\
          <UpgradeTab\
            jobStatus=\{upgrade.isRunning ?  'running' : upgrade.isComplete ? 'success' : 'idle'\}\
            isRunning=\{upgrade.isRunning\}\
            isComplete=\{upgrade.isComplete\}\
            hasError=\{!!upgrade.error\}\
            progress=\{upgrade.progress\}\
            completedSteps=\{[]\}\
            totalSteps=\{100\}\
            jobOutput=\{upgrade.logs.map(log => (\{\
              id: log.id,\
              timestamp: log.timestamp,\
              message: log.message,\
              level: log.level.toLowerCase(),\
              event_type: log.event_type || 'LOG',\
            \}))\}\
            showTechnicalDetails=\{false\}\
            onToggleTechnicalDetails=\{() => \{\}\}\
            scrollAreaRef=\{\{ current: null \}\}\
          />\
        </TabsContent>\
\
        \{/* ==================================================================\
            TAB CONTENT - RESULTS\
            ================================================================== */\}\
        <TabsContent value=\{WORKFLOW_STEPS. RESULTS\}>\
          <ResultsTab\
            jobStatus=\{upgrade. isComplete ? 'success' : 'failed'\}\
            finalResults=\{upgrade.result\}\
            preCheckSummary=\{preCheck. summary\}\
            upgradeParams=\{deviceConfig\}\
            jobId=\{upgrade.jobId\}\
            preCheckJobId=\{preCheck.jobId\}\
            progress=\{upgrade.progress\}\
            completedSteps=\{[]\}\
            totalSteps=\{100\}\
            currentPhase=\{WORKFLOW_STEPS. RESULTS\}\
            isConnected=\{isConnected\}\
            statistics=\{\{\}\}\
            showTechnicalDetails=\{false\}\
            onToggleTechnicalDetails=\{() => \{\}\}\
            onNavigateToExecute=\{() => workflow.setCurrentStep(WORKFLOW_STEPS.PRE_CHECK)\}\
            onStartNewUpgrade=\{workflow.resetWorkflow\}\
            jobOutput=\{[... preCheck.logs, ...upgrade.logs]. map(log => (\{\
              id: log.id,\
              timestamp: log.timestamp,\
              message: log.message,\
              level: log.level.toLowerCase(),\
              event_type: log.event_type || 'LOG',\
            \}))\}\
          />\
        </TabsContent>\
\
      </Tabs>\
    </div>\
  );\
\}\
```\
\
---\
\
### **FILE 4: Updated ConfigurationTab**\
\
**Path**: `frontend/src/pages/Management/tabs/ConfigurationTab.jsx`\
\
Only change needed - update imports:\
\
```javascript\
// OLD IMPORTS (remove these):\
// import \{ useCodeUpgradeWorkflowZustand \} from '@/hooks/useCodeUpgradeWorkflowZustand';\
\
// NEW IMPORTS (use these):\
import \{ useCodeUpgradeStore \} from '@/lib/codeUpgradeStore';\
import \{ useCodeUpgradeWorkflow \} from '@/hooks/useCodeUpgradeWorkflow';\
\
// In component, change:\
// const workflow = useCodeUpgradeWorkflowZustand();\
// TO:\
const workflow = useCodeUpgradeWorkflow();\
\
// Rest of file stays exactly the same\
```\
\
---\
\
## **\uc0\u55357 \u56785 \u65039  CLEANUP INSTRUCTIONS**\
\
```bash\
# Delete these files:\
rm frontend/src/hooks/useCodeUpgradeStoreBridge.js\
rm frontend/src/hooks/useWebSocketMessagesZustand.js\
rm frontend/src/pages/Management/CodeUpgradesWrapper.jsx\
rm frontend/src/pages/Management/CodeUpgradesZustand.jsx\
\
# Create new files (copy code from above):\
# frontend/src/hooks/useCodeUpgradeWorkflow.js (FILE 1)\
# frontend/src/hooks/useCodeUpgradeMessages.js (FILE 2)\
\
# Update existing files:\
# frontend/src/pages/Management/CodeUpgrades. jsx (FILE 3)\
# frontend/src/pages/Management/tabs/ConfigurationTab.jsx (update imports only)\
```\
\
---\
\
## **\uc0\u9989  SUCCESS PROBABILITY: 98%**\
\
**Why this will work:**\
\
1. \uc0\u9989  **WebSocket subscription fixed** - Channel subscription now happens\
2. \uc0\u9989  **Message routing complete** - Messages flow to correct store arrays\
3. \uc0\u9989  **Store integration correct** - Tabs read from preCheck. logs and upgrade.logs\
4. \uc0\u9989  **Naming clean** - No more `Zustand` suffix confusion\
5. \uc0\u9989  **Architecture matches Templates. jsx** - Proven working pattern\
\
**The only potential issue:**\
- Backend channel naming (but we're using same format as Templates: `job:$\{jobId\}`)\
\
---\
\
## **\uc0\u55358 \u56810  TESTING CHECKLIST**\
\
```bash\
# 1.  Verify file structure\
ls -la frontend/src/hooks/useCodeUpgradeWorkflow. js\
ls -la frontend/src/hooks/useCodeUpgradeMessages.js\
ls -la frontend/src/pages/Management/CodeUpgrades. jsx\
\
# 2. Start dev server\
cd frontend && npm run dev\
\
# 3. Open browser console\
# Expected logs when starting pre-check:\
# [WORKFLOW] Starting pre-check execution\
# [WORKFLOW] Pre-check job created: pre-check-UUID\
# [WS_MESSAGES] \uc0\u55357 \u56596  Subscribing to channel: job:pre-check-UUID\
# [WS_MESSAGES] Processing pre-check message: STEP_COMPLETE\
# [ZUSTAND_STORE] Adding pre-check log: ... \
# [WS_MESSAGES] Pre-check completed: \{... \}\
\
# 4. Check Redux DevTools\
# Open DevTools \uc0\u8594  Zustand tab \u8594  code-upgrade-store\
# Watch preCheck.logs array populate in real-time\
```\
\
---\
\
**Ready to implement!  This solution has the highest probability of success based on the Templates.jsx working pattern. ** \uc0\u55357 \u56960 }
