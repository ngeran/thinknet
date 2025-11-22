
/**
 * =============================================================================
 * MESSAGE FORMATTING UTILITIES
 * =============================================================================
 *
 * Transforms technical log messages into user-friendly descriptions
 *
 * @module utils/messageFormatting
 */
 
/**
 * Pattern mapping: technical names -> user-friendly descriptions
 */
const CHECK_PATTERNS = {
  '_check_image_availability': 'Image Availability Check',
  '_check_storage_space': 'Storage Space Verification',
  '_check_configuration_committed': 'Configuration State Check',
  '_check_system_alarms': 'System Alarms Check',
  'Current version:': 'Detected Current Version:',
  'PHASE: PRE_CHECK': 'Initiating Pre-Check Validation',
  'PHASE: UPGRADE': 'Starting Upgrade Process',
  'Pre-check validation started': 'Pre-Check Job Queued',
  'Upgrade job started': 'Upgrade Job Queued',
};
 
/**
 * Formats step messages for consistent display
 *
 * Transforms technical log messages into user-friendly descriptions:
 * - Removes hostname prefixes ([hostname])
 * - Converts technical function names to readable descriptions
 * - Adds status indicators (✅, ⚠️, ❌)
 * - Optionally prepends step numbers
 *
 * @param {string} message - Raw message from WebSocket
 * @param {number|null} stepNumber - Optional step number to prepend
 *
 * @returns {string} Formatted, user-friendly message
 *
 * @example
 * formatStepMessage("[router1] _check_storage_space: pass", 3)
 * // Returns: "Step 3: Storage Space Verification ✅"
 */
export function formatStepMessage(message, stepNumber = null) {
  if (!message) return message;
 
  // Remove hostname prefix: [hostname] text -> text
  let cleanMessage = message.replace(/\[[^\]]+\]\s*/, '');
 
  // Apply pattern transformations and add status indicators
  for (const [pattern, replacement] of Object.entries(CHECK_PATTERNS)) {
    if (cleanMessage.includes(pattern)) {
      if (pattern.startsWith('_check_')) {
        // Add status emoji based on result
        const status = cleanMessage.includes('pass') ? '✅' :
                      cleanMessage.includes('warning') ? '⚠️' :
                      cleanMessage.includes('fail') ? '❌' : '';
        return stepNumber
          ? `Step ${stepNumber}: ${replacement} ${status}`
          : `${replacement} ${status}`;
      }
      cleanMessage = cleanMessage.replace(pattern, replacement);
      break;
    }
  }
 
  // Prepend step number if provided and not already present
  if (stepNumber && !cleanMessage.toLowerCase().startsWith('step')) {
    return `Step ${stepNumber}: ${cleanMessage}`;
  }
 
  return cleanMessage;
}