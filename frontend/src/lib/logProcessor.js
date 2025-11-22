/**
 * =============================================================================
 * FILE LOCATION: frontend/src/lib/logProcessor.js
 * DESCRIPTION:   Universal Log Processor.
 *                - Handles Configuration Events (run.py)
 *                - Handles Validation Events (jsnapy_runner.py)
 *                - Filters noise and formats text for LiveLogViewer
 * =============================================================================
 */

/**
 * Determines if a raw message is "technical noise" that should be hidden
 * behind the "Debug Mode" toggle.
 */
export function isNoise(message) {
  if (!message || typeof message !== 'string') return true;
  const lower = message.toLowerCase();

  // 1. Raw JSON Lines (Backend machinery)
  // Catches standard "timestamp" logs AND JSNAPy "type: progress" logs
  if (message.trim().startsWith('{"timestamp":') || 
      message.trim().startsWith('{"type": "progress"') ||
      message.trim().startsWith('{"job_id":')) {
    return true; 
  }

  // 2. XML / NETCONF RPC Noise
  if (message.includes('<?xml') || 
      message.includes('<rpc') || 
      message.includes(']]>]]>') ||
      message.includes('rpc-reply')) return true;

  // 3. SSH/Connection Noise
  if (message.includes('Connected (version') || 
      lower.includes('authentication (publickey)') ||
      message.includes('kex algos:')) return true;

  // 4. Python/Library Internals
  if (lower.includes('ncclient.') || 
      lower.includes('transport.ssh') || 
      message.includes('DEBUG (connect):') ||
      message.includes('paramiko.transport')) return true;

  return false;
}

/**
 * Recursively extracts the meaningful payload from nested JSON wrappers.
 */
export function extractLogPayload(rawData) {
  let currentPayload = rawData;

  // 1. Attempt to parse string to JSON
  if (typeof currentPayload === 'string') {
    try {
      currentPayload = JSON.parse(currentPayload);
    } catch (e) {
      // If not JSON, treat as simple text log
      return { message: currentPayload, event_type: 'LOG_MESSAGE' };
    }
  }

  // 2. Unwrap 'data' wrapper (FastAPI Worker format)
  if (currentPayload.data) {
    try {
      // Sometimes data is a string (double encoded), sometimes object
      const nestedData = typeof currentPayload.data === 'string' 
        ? JSON.parse(currentPayload.data) 
        : currentPayload.data;
      currentPayload = nestedData;
    } catch (e) {
      // Keep existing payload if inner parse fails
    }
  }

  // 3. Unwrap ORCHESTRATOR_LOG (Standard Output Wrapper from Ansible/Scripts)
  if (currentPayload.event_type === "ORCHESTRATOR_LOG" && currentPayload.message) {
    // Regex to find JSON inside [STDOUT] tags
    const jsonMatch = currentPayload.message.match(/\[(STDOUT|STDERR)(?:_RAW)?\]\s*(\{.*\})/s);
    if (jsonMatch && jsonMatch[2]) {
      try {
        return JSON.parse(jsonMatch[2]); 
      } catch {
        // Failed to parse nested JSON, return wrapper
      }
    }
  }

  return currentPayload;
}

/**
 * Factory function that creates a standardized Log Object for the UI.
 */
export function processLogMessage(rawEvent) {
  const payload = extractLogPayload(rawEvent);
  
  let eventType = payload.event_type || 'UNKNOWN';
  // Use provided message, or stringify payload if missing
  let message = payload.message || JSON.stringify(payload);
  const originalMessage = message; // Keep raw message for noise check
  
  // --- SMART FORMATTING LOGIC ---
  let uiType = 'INFO';

  // Case A: Step Started (Spinner)
  if (eventType === 'STEP_START' && payload.data) {
    // Priority: Explicit Message -> "Step X: Name" -> "Step X"
    if (payload.message) {
      message = payload.message;
    } else {
      message = `Step ${payload.data.step}: ${payload.data.description || payload.data.name || 'Processing'}`;
    }
    uiType = 'STEP_PROGRESS'; 
  }
  // Case B: Step Completed (Green Check)
  else if (eventType === 'STEP_COMPLETE' && payload.data) {
    const duration = payload.data.duration ? `(${payload.data.duration.toFixed(2)}s)` : '';
    // Ensure we don't print "undefined" if name is missing
    const stepName = payload.data.name || payload.data.description || `Step ${payload.data.step}`;
    message = `Completed: ${stepName} ${duration}`;
    uiType = 'SUCCESS'; 
  }
  // Case C: Operation Start
  else if (eventType === 'OPERATION_START') {
    message = payload.message || `Starting Operation: ${payload.data?.operation || 'Unknown'}`;
  }
  // Case D: Success/Error Results
  else if (eventType.includes('ERROR') || payload.success === false) {
    uiType = 'ERROR';
    // Ensure error messages are readable
    if (payload.message) message = payload.message;
  }
  else if (eventType.includes('SUCCESS') || payload.success === true) {
    uiType = 'SUCCESS';
  }

  // --- NOISE CHECK ---
  // We force show structural events (Steps, Errors, Success)
  // Everything else passes through the noise filter
  const isTechnical = isNoise(originalMessage) && 
                      !['STEP_START', 'STEP_COMPLETE', 'OPERATION_COMPLETE', 'ERROR', 'SUCCESS'].includes(eventType);

  return {
    id: payload.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toLocaleTimeString(),
    type: uiType,
    message: message,        // Clean, formatted message
    isTechnical: isTechnical,// UI toggle flag
    originalEvent: payload   // Access to raw data (diffs, details)
  };
}

export default {
  processLogMessage,
  isNoise,
  extractLogPayload
};
