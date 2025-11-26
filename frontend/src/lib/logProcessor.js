/**
 * =============================================================================
 * FILE LOCATION: frontend/src/lib/logProcessor.js
 * DESCRIPTION:   Universal Log Processor with Enhanced Validation Event Support
 * VERSION:       2.0.2 - Fixed All Syntax Errors (Regex + Optional Chaining)
 * AUTHOR:        nikos-geranios_vgi
 * DATE:          2025-11-26
 * =============================================================================
 *
 * OVERVIEW:
 *   This module provides centralized log processing for all backend events.
 *   It handles multiple event formats from different sources:
 *     - Configuration operations (run. py via Ansible)
 *     - Storage validation (run_jsnapy_module.py via JSNAPy)
 *     - File uploads (run. py via SCP)
 *     - Generic orchestration events (fastapi_worker.py)
 *
 * VERSION HISTORY:
 *   v2.0.0 - Enhanced PRE_CHECK_COMPLETE handling, validation_passed extraction
 *   v2.0.1 - FIXED: Regex syntax error in extractLogPayload()
 *   v2.0.2 - FIXED: Optional chaining (?.) syntax not supported in older browsers
 *            Replaced all ? . with explicit null checks for compatibility
 *
 * =============================================================================
 */
 
// =============================================================================
// SECTION 1: NOISE DETECTION
// =============================================================================
 
/**
 * Checks if a message should be classified as technical noise.
 *
 * @param {string} message - The raw message text to evaluate
 * @returns {boolean} - True if message is technical noise, false if user-facing
 */
export function isNoise(message) {
  if (!message || typeof message !== 'string') return true;
  const lower = message.toLowerCase();
 
  // Raw JSON lines
  if (message.trim().startsWith('{"timestamp":') ||
      message.trim(). startsWith('{"type": "progress"') ||
      message.trim().startsWith('{"type":"progress"') ||
      message.trim(). startsWith('{"job_id":')) {
    return true;
  }
 
  // XML / NETCONF RPC noise
  if (message.includes('<?xml') ||
      message.includes('<rpc') ||
      message.includes(']]>]]>') ||
      message.includes('rpc-reply') ||
      message.includes('<nc:') ||
      message.includes('xmlns:')) return true;
 
  // SSH/Connection noise
  if (message.includes('Connected (version') ||
      lower.includes('authentication (publickey)') ||
      lower.includes('authentication (password)') ||
      message.includes('kex algos:') ||
      message.includes('server_host_key_type:') ||
      message.includes('cipher:') ||
      message.includes('mac:')) return true;
 
  // Python/Library internals
  if (lower.includes('ncclient. ') ||
      lower.includes('transport.ssh') ||
      lower.includes('paramiko. transport') ||
      lower.includes('paramiko.common') ||
      message.includes('DEBUG (connect):') ||
      message.includes('[DEBUG]')) return true;
 
  // JSNAPy internal processing
  if (lower.includes('jsnapy.') ||
      lower.includes('loading config') ||
      lower.includes('taking snapshot') ||
      lower.includes('comparing snapshots')) return true;
 
  // Empty or whitespace-only lines
  if (message.trim(). length === 0) return true;
 
  return false;
}
 
// =============================================================================
// SECTION 2: PAYLOAD EXTRACTION (FIXED - Both Regex and Optional Chaining)
// =============================================================================
 
/**
 * Extracts the meaningful payload from nested JSON wrappers.
 *
 * FIXED IN v2.0.2:
 *   - Removed optional chaining (?.) syntax for browser compatibility
 *   - All property accesses now use explicit null/undefined checks
 *
 * @param {string|object} rawData - The raw data received from WebSocket
 * @returns {object} - The extracted event payload
 */
export function extractLogPayload(rawData) {
  let currentPayload = rawData;
 
  // =========================================================================
  // STEP 1: Parse string to JSON if needed
  // =========================================================================
  if (typeof currentPayload === 'string') {
    try {
      currentPayload = JSON.parse(currentPayload);
    } catch (e) {
      return { message: currentPayload, event_type: 'LOG_MESSAGE' };
    }
  }
 
  // =========================================================================
  // STEP 2: Unwrap 'data' wrapper (FastAPI Worker format)
  // =========================================================================
  if (currentPayload && currentPayload.data) {
    try {
      const nestedData = typeof currentPayload.data === 'string'
        ? JSON. parse(currentPayload.data)
        : currentPayload. data;
      currentPayload = nestedData;
    } catch (e) {
      // Keep existing payload
    }
  }
 
  // =========================================================================
  // STEP 3: Unwrap ORCHESTRATOR_LOG (Standard Output Wrapper)
  // =========================================================================
  if (currentPayload &&
      currentPayload.event_type === "ORCHESTRATOR_LOG" &&
      currentPayload.message) {
    try {
      const regexPattern = '\\[(STDOUT|STDERR)(?:_RAW)? \\]\\s*(\\{.*\\})';
      const jsonMatch = currentPayload.message.match(new RegExp(regexPattern, 's'));
 
      if (jsonMatch && jsonMatch[2]) {
        try {
          return JSON.parse(jsonMatch[2]);
        } catch (parseError) {
          console.warn('Failed to parse ORCHESTRATOR_LOG nested JSON:', parseError);
        }
      }
    } catch (regexError) {
      console. warn('Regex matching failed in ORCHESTRATOR_LOG processing:', regexError);
    }
  }
 
  return currentPayload;
}
 
// =============================================================================
// SECTION 3: MESSAGE FORMATTING (FIXED - Removed Optional Chaining)
// =============================================================================
 
/**
 * Processes a raw event and returns a standardized log object for UI display.
 *
 * FIXED IN v2.0.2:
 *   - Replaced all optional chaining (?.) with explicit checks
 *   - Compatible with older JavaScript environments
 *
 * @param {string|object} rawEvent - Raw event from WebSocket
 * @returns {object} - Standardized log object
 */
export function processLogMessage(rawEvent) {
  const payload = extractLogPayload(rawEvent);
 
  let eventType = payload.event_type || 'UNKNOWN';
  let message = payload.message || JSON.stringify(payload);
  const originalMessage = message;
  let uiType = 'INFO';
 
  // =========================================================================
  // VALIDATION EVENTS - PRE_CHECK_COMPLETE
  // =========================================================================
 
  if (eventType === 'PRE_CHECK_COMPLETE') {
    // FIXED: Replaced payload.data?. validation_passed with explicit check
    const validationPassed = payload.data && payload.data.validation_passed;
 
    if (validationPassed === true) {
      uiType = 'SUCCESS';
 
      // FIXED: Replaced payload.data?.required_mb with explicit checks
      if (payload.data &&
          payload.data.required_mb !== undefined &&
          payload.data.available_mb !== undefined) {
        message = '✅ Storage validation passed\n' +
                  '   Required: ' + payload.data. required_mb. toFixed(2) + ' MB\n' +
                  '   Available: ' + payload.data.available_mb.toFixed(2) + ' MB';
      } else if (payload.message) {
        message = payload. message;
      } else {
        message = '✅ Storage validation passed';
      }
 
    } else if (validationPassed === false) {
      uiType = 'ERROR';
 
      if (payload.message) {
        message = payload. message;
      } else if (payload.data &&
                 payload.data.results_by_host &&
                 payload.data. results_by_host[0] &&
                 payload. data.results_by_host[0].test_results &&
                 payload.data. results_by_host[0]. test_results[0] &&
                 payload.data. results_by_host[0]. test_results[0].error) {
        message = '❌ ' + payload.data.results_by_host[0].test_results[0].error;
      } else {
        message = '❌ Storage validation failed';
      }
 
      // FIXED: Replaced payload.data?.recommendations with explicit check
      if (payload.data &&
          payload.data.recommendations &&
          payload.data.recommendations.length > 0) {
        message += '\n\nRecommendations:\n' +
                   payload.data.recommendations.map(function(r) { return '  • ' + r; }).join('\n');
      }
 
    } else {
      uiType = 'INFO';
      message = payload.message || 'Validation check completed';
    }
  }
 
  // =========================================================================
  // VALIDATION INTERMEDIATE EVENTS
  // =========================================================================
 
  else if (eventType === 'VALIDATION_RESULT') {
    uiType = 'INFO';
    message = payload.message || 'Validation in progress';
  }
 
  else if (eventType === 'SCRIPT_BOOT') {
    uiType = 'INFO';
    message = payload.message || 'Script initialized';
  }
 
  // =========================================================================
  // STEP EVENTS
  // =========================================================================
 
  else if (eventType === 'STEP_START' && payload.data) {
    uiType = 'STEP_PROGRESS';
 
    if (payload.message) {
      message = payload. message;
    } else if (payload.data. description || payload.data.name) {
      const stepNum = payload.data.step || '';
      const stepName = payload.data.description || payload.data.name;
      message = stepNum ?  'Step ' + stepNum + ': ' + stepName : stepName;
    } else if (payload.data.step) {
      message = 'Step ' + payload.data.step + ': Processing';
    } else {
      message = 'Processing... ';
    }
  }
 
  else if (eventType === 'STEP_COMPLETE' && payload.data) {
    uiType = 'SUCCESS';
 
    const duration = payload.data.duration
      ? '(' + payload.data.duration. toFixed(2) + 's)'
      : '';
 
    const stepName = payload.data.name ||
                     payload.data.description ||
                     (payload.data.step ? 'Step ' + payload.data. step : 'Step');
 
    message = ('✅ Completed: ' + stepName + ' ' + duration). trim();
  }
 
  // =========================================================================
  // OPERATION LIFECYCLE EVENTS
  // =========================================================================
 
  else if (eventType === 'OPERATION_START') {
    uiType = 'INFO';
    // FIXED: Replaced payload.data?.operation with explicit check
    const operation = payload.data && payload.data.operation ?  payload.data.operation : 'Unknown';
    message = payload.message || ('Starting operation: ' + operation);
  }
 
  else if (eventType === 'OPERATION_COMPLETE') {
    // FIXED: Replaced payload.data?.success with explicit checks
    const dataSuccess = payload.data && payload. data.success;
    const dataStatus = payload.data && payload.data.status;
    const success = dataSuccess !== false && dataStatus !== 'FAILED';
 
    uiType = success ? 'SUCCESS' : 'ERROR';
 
    if (success) {
      message = payload.message || '✅ Operation completed successfully';
    } else {
      // FIXED: Replaced payload.data?.error with explicit checks
      const dataError = payload.data && payload.data.error;
      const dataMessage = payload.data && payload.data.message;
      const errorMsg = payload.message || dataError || dataMessage || 'Operation failed';
      message = '❌ ' + errorMsg;
    }
  }
 
  // =========================================================================
  // UPLOAD EVENTS
  // =========================================================================
 
  else if (eventType === 'UPLOAD_START') {
    uiType = 'INFO';
    message = payload.message || 'File upload starting... ';
  }
 
  else if (eventType === 'UPLOAD_COMPLETE') {
    uiType = 'SUCCESS';
    message = payload.message || '✅ File upload completed';
  }
 
  else if (eventType === 'PROGRESS_UPDATE') {
    uiType = 'INFO';
 
    // FIXED: Replaced payload.data?.progress with explicit check
    if (payload.data && payload.data.progress !== undefined) {
      const progress = payload.data.progress. toFixed(1);
      message = payload.message || ('Progress: ' + progress + '%');
    } else {
      message = payload.message || 'Processing... ';
    }
  }
 
  // =========================================================================
  // ERROR AND WARNING EVENTS
  // =========================================================================
 
  else if (eventType. includes('ERROR') || payload.success === false) {
    uiType = 'ERROR';
 
    if (payload.message) {
      message = payload.message;
    } else if (payload. data && payload.data.error) {
      message = '❌ ' + payload.data.error;
    } else if (payload.data && payload.data.message) {
      message = '❌ ' + payload. data.message;
    } else {
      message = '❌ An error occurred';
    }
  }
 
  else if (eventType.includes('WARN')) {
    uiType = 'INFO';
    message = payload.message || 'Warning';
  }
 
  // =========================================================================
  // SUCCESS EVENTS
  // =========================================================================
 
  else if (eventType. includes('SUCCESS') || payload.success === true) {
    uiType = 'SUCCESS';
    message = payload.message || '✅ Operation successful';
  }
 
  // =========================================================================
  // GENERIC LOG MESSAGES
  // =========================================================================
 
  else if (eventType === 'LOG_MESSAGE') {
    // FIXED: Replaced payload.level?.toUpperCase() with explicit check
    const level = payload.level ? payload.level.toUpperCase() : null;
 
    if (level === 'ERROR' || level === 'CRITICAL') {
      uiType = 'ERROR';
    } else if (level === 'WARNING') {
      uiType = 'INFO';
    } else if (level === 'SUCCESS') {
      uiType = 'SUCCESS';
    } else {
      uiType = 'INFO';
    }
 
    message = payload.message || 'Log message';
  }
 
  // =========================================================================
  // NOISE CLASSIFICATION
  // =========================================================================
 
  const structuralEvents = [
    'STEP_START',
    'STEP_COMPLETE',
    'OPERATION_START',
    'OPERATION_COMPLETE',
    'PRE_CHECK_COMPLETE',
    'VALIDATION_RESULT',
    'UPLOAD_START',
    'UPLOAD_COMPLETE',
    'ERROR',
    'SUCCESS'
  ];
 
  const isStructuralEvent = structuralEvents.includes(eventType);
  const isTechnical = ! isStructuralEvent && isNoise(originalMessage);
 
  // =========================================================================
  // BUILD STANDARDIZED LOG OBJECT
  // =========================================================================
 
  return {
    id: payload.id || (Date.now() + '-' + Math.random(). toString(36).substr(2, 9)),
    timestamp: new Date(). toLocaleTimeString(),
    type: uiType,
    message: message,
    isTechnical: isTechnical,
    originalEvent: payload
  };
}
 
// =============================================================================
// SECTION 4: MODULE EXPORTS
// =============================================================================
 
export default {
  processLogMessage,
  isNoise,
  extractLogPayload
};
 
// =============================================================================
// CHANGELOG
// =============================================================================
/**
 * v2.0.2 (2025-11-26):
 *   - FIXED: Removed all optional chaining (?.) syntax
 *   - Replaced with explicit null/undefined checks
 *   - Compatible with ES2019 and older JavaScript environments
 *   - Resolves: "Unexpected token '. '" error at line 309
 *   - All instances of ? . replaced with explicit checks:
 *     * payload.data?.validation_passed → payload.data && payload.data.validation_passed
 *     * payload.data?. required_mb → payload.data && payload.data.required_mb
 *     * payload.data?.recommendations → payload.data && payload.data.recommendations
 *     * payload.level?.toUpperCase() → payload. level ?  payload.level.toUpperCase() : null
 *
 * v2.0.1 (2025-11-26):
 *   - FIXED: Regex syntax error in extractLogPayload()
 *   - Changed to RegExp constructor with proper escaping
 *
 * v2.0.0 (2025-11-26):
 *   - Enhanced PRE_CHECK_COMPLETE event handling
 *   - Added validation_passed boolean extraction
 */
