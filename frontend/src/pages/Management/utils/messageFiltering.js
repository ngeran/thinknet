/**
 * =============================================================================
 * MESSAGE FILTERING UTILITIES
 * =============================================================================
 *
 * Determines which WebSocket messages should be displayed in the UI
 *
 * @module utils/messageFiltering
 */
 
/**
 * List of critical event types that should NEVER be filtered
 * These events are essential for the workflow to function correctly
 */
const CRITICAL_EVENTS = [
  'PRE_CHECK_COMPLETE',
  'PRE_CHECK_EVENT',
  'OPERATION_COMPLETE',
  'OPERATION_START',
  'STEP_COMPLETE',
  'PRE_CHECK_RESULT',
  'PARSE_ERROR',
  'RAW_WEBSOCKET',
];
 
/**
 * Determines if a WebSocket message should be filtered from display
 *
 * NEVER filters critical events that are essential for workflow:
 * - PRE_CHECK_COMPLETE: Triggers Review tab
 * - PRE_CHECK_EVENT: Contains validation results
 * - OPERATION_COMPLETE: Signals job completion
 * - OPERATION_START: Initializes progress tracking
 * - STEP_COMPLETE: Updates progress
 * - PRE_CHECK_RESULT: Individual check results
 * - PARSE_ERROR: User-facing error messages
 *
 * Only filters truly verbose messages like debug logs, heartbeats, etc.
 *
 * @param {Object} log - Log entry to evaluate
 * @param {string} log.event_type - Type of event
 * @param {string} log.message - Log message content
 *
 * @returns {boolean} True if message should be filtered out
 *
 * @example
 * if (!shouldFilterMessage(logEntry)) {
 *   displayMessage(logEntry);
 * }
 */
export function shouldFilterMessage(log) {
  // Never filter critical event types
  if (CRITICAL_EVENTS.includes(log.event_type)) {
    console.log("[FILTER_DEBUG] CRITICAL EVENT - NOT FILTERING:", log.event_type);
    return false;
  }
 
  // Only filter truly verbose/redundant messages
  const message = log.message?.toLowerCase() || '';
  const shouldFilter = (
    message.includes('[debug]') ||
    message.includes('heartbeat') ||
    message.includes('keepalive') ||
    message.includes('ping') ||
    message.includes('pong')
  );
 
  if (shouldFilter) {
    console.log("[FILTER_DEBUG] Filtering verbose message:", message.substring(0, 50));
  }
 
  return shouldFilter;
}
 
/**
 * Creates a unique signature for a log message
 * Used for deduplication
 *
 * @param {Object} payload - Message payload
 * @returns {string} Unique signature
 */
export function createLogSignature(payload) {
  const msg = payload.message || '';
  const eventType = payload.event_type || 'unknown';
  const timestamp = payload.timestamp || '';
  return `${eventType}::${timestamp}::${msg.substring(0, 100)}`;
}
