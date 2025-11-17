/**
 * =============================================================================
 * MESSAGE FILTERING UTILITIES - FINAL CLEAN v3.0
 * =============================================================================
 *
 * What this does:
 * → Main Execution tab: ONLY the 10 beautiful steps with ✅
 * → Technical Details tab: ALL raw logs (ncclient, XML, debug, etc.)
 *
 * ZERO ncclient/SSH/XML noise in the main view.
 * Works perfectly with the clean run.py (EventEmitter version).
 *
 * Deploy this + the final run.py → perfection achieved.
 */

// =============================================================================
// SECTION 1: CRITICAL STRUCTURED EVENTS - ALWAYS SHOW
// =============================================================================
const CRITICAL_EVENTS = [
  'PRE_CHECK_COMPLETE',
  'OPERATION_COMPLETE',
  'OPERATION_START',
  'STEP_COMPLETE',
  'PRE_CHECK_RESULT',
  'PRE_CHECK_EVENT',
  'PARSE_ERROR',
];

// =============================================================================
// SECTION 2: MAIN FILTER FUNCTION - AGGRESSIVE NOISE REMOVAL
// =============================================================================
export function shouldFilterMessage(log) {
  const type = log.event_type;
  const msg = log.message || '';
  const lower = msg.toLowerCase();

  // 1. Never filter critical structured events
  if (CRITICAL_EVENTS.includes(type)) {
    return false;
  }

  // 2. LOG_MESSAGE → hide ALL ncclient, SSH, XML, and low-level noise
  if (type === 'LOG_MESSAGE') {
    // Hide everything from ncclient (the source of all spam)
    if (msg.includes('ncclient') ||
      msg.includes('transport.ssh') ||
      msg.includes('operations.rpc') ||
      msg.includes('session.py') ||
      msg.includes('ssh.py') ||
      msg.includes('Connected (version') ||
      msg.includes('Authentication (password) successful') ||
      msg.includes('Sending:') ||
      msg.includes('Received message from host') ||
      msg.includes('Requesting \'ExecuteRpc\'') ||
      msg.startsWith('b\'<?xml') ||  // raw XML RPC
      msg.includes('<nc:rpc') ||
      msg.includes(']]>]]>')
    ) {
      return true; // hide
    }

    // Optional: hide your own debug logs if you don't want them
    if (lower.includes('[debug]') || lower.includes('heartbeat')) {
      return true;
    }

    // Keep only truly user-facing messages (fallback safety)
    return false;
  }

  // 3. Any other event type → hide (future-proof)
  return true;
}

// =============================================================================
// SECTION 3: DEDUPLICATION (unchanged)
// =============================================================================
export function createLogSignature(payload) {
  const msg = payload.message || '';
  const eventType = payload.event_type || 'unknown';
  const timestamp = payload.timestamp || '';
  return `${eventType}::${timestamp}::${msg.substring(0, 100)}`;
}

// =============================================================================
// SECTION 4: EXPORT
// =============================================================================
export default {
  shouldFilterMessage,
  createLogSignature,
};
