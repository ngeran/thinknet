/**
 * =============================================================================
 * VALIDATION UTILITIES
 * =============================================================================
 *
 * Pure functions for parameter validation
 *
 * @module utils/validation
 */

/**
 * Validates all required parameters before API calls
 *
 * @param {Object} params - The upgrade parameters to validate
 * @param {string} params.username - Device username
 * @param {string} params.password - Device password
 * @param {string} params.hostname - Device hostname
 * @param {string} params.inventory_file - Ansible inventory file
 * @param {string} params.image_filename - Software image filename
 * @param {string} params.target_version - Target version
 *
 * @returns {Array<string>} Array of error messages (empty if valid)
 *
 * @example
 * const errors = validateUpgradeParameters(upgradeParams);
 * if (errors.length > 0) {
 *   console.error('Validation failed:', errors);
 * }
 */
export function validateUpgradeParameters(params) {
  const errors = [];

  if (!params.username?.trim()) {
    errors.push('Username is required');
  }

  if (!params.password?.trim()) {
    errors.push('Password is required');
  }

  if (!params.hostname?.trim() && !params.inventory_file?.trim()) {
    errors.push('Either hostname or inventory file must be specified');
  }

  if (!params.image_filename?.trim()) {
    errors.push('Software image must be selected');
  }

  if (!params.target_version?.trim()) {
    errors.push('Target version is required (should be auto-extracted from image)');
  }

  return errors;
}

/**
 * Validates WebSocket connection is ready
 *
 * @param {boolean} isConnected - WebSocket connection status
 * @returns {Object} Validation result
 *
 * @example
 * const { valid, error } = validateWebSocketConnection(isConnected);
 */
export function validateWebSocketConnection(isConnected) {
  if (!isConnected) {
    return {
      valid: false,
      error: 'WebSocket not connected. Cannot start operation.',
    };
  }

  return { valid: true, error: null };
}
