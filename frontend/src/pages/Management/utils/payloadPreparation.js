/**
 * =============================================================================
 * PAYLOAD PREPARATION UTILITIES
 * =============================================================================
 *
 * Transforms frontend parameters into API-ready payloads
 *
 * @module utils/payloadPreparation
 * @author nikos-geranios_vgi
 * @date 2025-11-05
 */
 
/**
 * Enhanced parameter transformation with debugging
 * Ensures consistent parameter naming between frontend and backend
 *
 * @param {Object} params - Raw parameters from form
 * @param {string} params.hostname - Device hostname
 * @param {string} params.inventory_file - Ansible inventory file path
 * @param {string} params.username - Device username
 * @param {string} params.password - Device password
 * @param {string} params.vendor - Device vendor
 * @param {string} params.platform - Device platform
 * @param {string} params.target_version - Target software version
 * @param {string} params.image_filename - Software image filename
 * @param {string} params.pre_check_job_id - Pre-check job ID (for upgrade only)
 * @param {string} operationType - Type of operation ('pre-check' or 'upgrade')
 *
 * @returns {Object} Formatted payload ready for API submission
 *
 * @example
 * const payload = prepareApiPayload(upgradeParams, 'pre-check');
 * // Returns properly formatted payload with operation-specific fields
 */
export function prepareApiPayload(params, operationType = 'pre-check') {
  console.log(`[PAYLOAD_PREP] Preparing ${operationType} payload with params:`, {
    hostname: params.hostname,
    image_filename: params.image_filename,
    target_version: params.target_version,
    vendor: params.vendor,
    platform: params.platform
  });
 
  const basePayload = {
    hostname: params.hostname?.trim() || '',
    inventory_file: params.inventory_file?.trim() || '',
    username: params.username,
    password: params.password,
    vendor: params.vendor,
    platform: params.platform,
    target_version: params.target_version,
    image_filename: params.image_filename,
  };
 
  // Add operation-specific parameters
  if (operationType === 'pre-check') {
    Object.assign(basePayload, {
      skip_storage_check: false,
      skip_snapshot_check: false,
      require_snapshot: false,
    });
  } else if (operationType === 'upgrade') {
    Object.assign(basePayload, {
      command: "code_upgrade",
      pre_check_job_id: params.pre_check_job_id,
      skip_pre_check: false,
      force_upgrade: false,
    });
  }
 
  console.log(`[PAYLOAD_PREP] Final ${operationType} payload:`, {
    ...basePayload,
    password: '***REDACTED***'
  });
 
  return basePayload;
}
 
/**
 * Sanitizes payload for logging (removes sensitive data)
 *
 * @param {Object} payload - Payload to sanitize
 * @returns {Object} Sanitized payload safe for logging
 */
export function sanitizePayloadForLogging(payload) {
  return {
    ...payload,
    password: '***REDACTED***',
  };
}