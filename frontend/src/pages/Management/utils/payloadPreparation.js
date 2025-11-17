
/**
 * =============================================================================
 * PAYLOAD PREPARATION UTILITIES - FIXED VERSION
 * =============================================================================
 *
 * Prepares API payloads for different operations with robust property mapping
 *
 * VERSION: 2.0.0 - Fixed naming convention mismatch
 * AUTHOR: nikos-geranios_vgi
 * DATE: 2025-11-17
 * LAST UPDATED: 2025-11-17 13:09:54 UTC
 *
 * FIXES:
 * - Added dual property name checking (camelCase and snake_case)
 * - Enhanced validation error messages
 * - Added comprehensive debug logging
 * - Fixed target_version and image_filename mapping issues
 *
 * @module utils/payloadPreparation
 * =============================================================================
 */
 
// =============================================================================
// SECTION 1: VALIDATION FUNCTIONS
// =============================================================================
 
/**
 * Validates that all required fields are present in payload
 *
 * @param {Object} payload - The payload to validate
 * @returns {Object} Validation result with isValid flag and missingFields array
 */
function validatePayload(payload) {
  const requiredFields = [
    'username',
    'password',
    'target_version',
    'image_filename'
  ];
 
  const missingFields = requiredFields.filter(field => !payload[field]);
 
  // Either hostname OR inventory_file must be present
  if (!payload.hostname && !payload.inventory_file) {
    missingFields.push('hostname or inventory_file');
  }
 
  return {
    isValid: missingFields.length === 0,
    missingFields
  };
}
 
// =============================================================================
// SECTION 2: PROPERTY MAPPING FUNCTIONS
// =============================================================================
 
/**
 * Safely extracts property value with fallback to multiple naming conventions
 *
 * Handles inconsistencies between camelCase (frontend) and snake_case (backend)
 *
 * @param {Object} source - Source object
 * @param {string} snakeCaseName - Property name in snake_case
 * @param {string} camelCaseName - Property name in camelCase
 * @param {*} defaultValue - Default value if property not found
 * @returns {*} Property value or default
 */
function getPropertyValue(source, snakeCaseName, camelCaseName, defaultValue = null) {
  // Try snake_case first (backend format)
  if (source[snakeCaseName] !== undefined && source[snakeCaseName] !== null && source[snakeCaseName] !== '') {
    return source[snakeCaseName];
  }
 
  // Try camelCase (frontend format)
  if (source[camelCaseName] !== undefined && source[camelCaseName] !== null && source[camelCaseName] !== '') {
    return source[camelCaseName];
  }
 
  // Return default value
  return defaultValue;
}
 
/**
 * Maps upgradeParams to base payload with robust property resolution
 *
 * @param {Object} upgradeParams - Upgrade parameters from state
 * @returns {Object} Base payload with snake_case properties
 */
function mapBasePayload(upgradeParams) {
  return {
    // Simple properties (already consistent)
    hostname: upgradeParams.hostname || null,
    username: upgradeParams.username || null,
    password: upgradeParams.password || null,
    vendor: upgradeParams.vendor || 'juniper',
    platform: upgradeParams.platform || 'srx',
 
    // Properties that might use different naming conventions
    inventory_file: getPropertyValue(upgradeParams, 'inventory_file', 'inventoryFile'),
    target_version: getPropertyValue(upgradeParams, 'target_version', 'targetVersion'),
    image_filename: getPropertyValue(upgradeParams, 'image_filename', 'imageFilename'),
    pre_check_selection: getPropertyValue(upgradeParams, 'pre_check_selection', 'preCheckSelection'),
  };
}
 
// =============================================================================
// SECTION 3: MAIN PAYLOAD PREPARATION FUNCTION
// =============================================================================
 
/**
 * Prepares API payload for different operations with validation
 *
 * Handles both pre-check and upgrade operations with appropriate field mapping
 *
 * @param {Object} upgradeParams - Upgrade parameters from state
 * @param {string} operationType - Type of operation ('pre-check' or 'upgrade')
 * @returns {Object} Prepared and validated payload
 * @throws {Error} If required fields are missing
 */
export function prepareApiPayload(upgradeParams, operationType) {
  console.log("[PAYLOAD_PREP] ===== PAYLOAD PREPARATION STARTED =====");
  console.log("[PAYLOAD_PREP] Operation Type:", operationType);
  console.log("[PAYLOAD_PREP] Original upgradeParams:", upgradeParams);
  console.log("[PAYLOAD_PREP] Available keys:", Object.keys(upgradeParams));
 
  // Map base payload with robust property resolution
  const basePayload = mapBasePayload(upgradeParams);
 
  console.log("[PAYLOAD_PREP] Base payload after mapping:", basePayload);
  console.log("[PAYLOAD_PREP] ✓ target_version:", basePayload.target_version);
  console.log("[PAYLOAD_PREP] ✓ image_filename:", basePayload.image_filename);
  console.log("[PAYLOAD_PREP] ✓ pre_check_selection:", basePayload.pre_check_selection);
 
  let finalPayload;
 
  // ==========================================================================
  // SUBSECTION 3.1: PRE-CHECK OPERATION PAYLOAD
  // ==========================================================================
  if (operationType === 'pre-check') {
    finalPayload = {
      ...basePayload,
      skip_storage_check: getPropertyValue(upgradeParams, 'skip_storage_check', 'skipStorageCheck', false),
      skip_snapshot_check: getPropertyValue(upgradeParams, 'skip_snapshot_check', 'skipSnapshotCheck', false),
      require_snapshot: getPropertyValue(upgradeParams, 'require_snapshot', 'requireSnapshot', false),
    };
 
    console.log("[PAYLOAD_PREP] Pre-check specific fields added");
  }
  // ==========================================================================
  // SUBSECTION 3.2: UPGRADE OPERATION PAYLOAD
  // ==========================================================================
  else if (operationType === 'upgrade') {
    finalPayload = {
      command: 'code_upgrade',
      ...basePayload,
      pre_check_job_id: getPropertyValue(upgradeParams, 'pre_check_job_id', 'preCheckJobId'),
      skip_pre_check: getPropertyValue(upgradeParams, 'skip_pre_check', 'skipPreCheck', false),
      force_upgrade: getPropertyValue(upgradeParams, 'force_upgrade', 'forceUpgrade', false),
    };
 
    console.log("[PAYLOAD_PREP] Upgrade specific fields added");
  }
  // ==========================================================================
  // SUBSECTION 3.3: GENERIC OPERATION PAYLOAD
  // ==========================================================================
  else {
    finalPayload = basePayload;
    console.log("[PAYLOAD_PREP] Using base payload for generic operation");
  }
 
  // ==========================================================================
  // SUBSECTION 3.4: PAYLOAD VALIDATION
  // ==========================================================================
  const validation = validatePayload(finalPayload);
 
  if (!validation.isValid) {
    console.error("[PAYLOAD_PREP] ❌ ========================================");
    console.error("[PAYLOAD_PREP] ❌ VALIDATION FAILED");
    console.error("[PAYLOAD_PREP] ❌ ========================================");
    console.error("[PAYLOAD_PREP] ❌ Missing required fields:", validation.missingFields);
    console.error("[PAYLOAD_PREP] ❌ Current payload:", finalPayload);
    console.error("[PAYLOAD_PREP] ❌ Original upgradeParams:", upgradeParams);
    console.error("[PAYLOAD_PREP] ❌ ========================================");
 
    // Provide helpful debugging information
    console.error("[PAYLOAD_PREP] 💡 DEBUG HINTS:");
    validation.missingFields.forEach(field => {
      console.error(`[PAYLOAD_PREP] 💡 - Check if upgradeParams has: ${field} or ${toCamelCase(field)}`);
    });
 
    throw new Error(`Pre-check failed: missing required fields: ${validation.missingFields.join(', ')}`);
  }
 
  console.log("[PAYLOAD_PREP] ✅ Payload validation passed");
  console.log("[PAYLOAD_PREP] ✅ Final payload:", finalPayload);
  console.log("[PAYLOAD_PREP] ===== PAYLOAD PREPARATION COMPLETED =====");
 
  return finalPayload;
}
 
// =============================================================================
// SECTION 4: UTILITY FUNCTIONS
// =============================================================================
 
/**
 * Converts snake_case to camelCase for debugging hints
 *
 * @param {string} str - String in snake_case
 * @returns {string} String in camelCase
 */
function toCamelCase(str) {
  return str.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
}
 
/**
 * Logs payload structure for debugging
 *
 * @param {Object} payload - Payload to log
 */
export function debugPayload(payload) {
  console.log("[PAYLOAD_DEBUG] ===== PAYLOAD STRUCTURE =====");
  Object.entries(payload).forEach(([key, value]) => {
    const valueType = typeof value;
    const valuePreview = valueType === 'string' && value.length > 50
      ? `${value.substring(0, 50)}...`
      : value;
    console.log(`[PAYLOAD_DEBUG] ${key}: (${valueType}) ${valuePreview}`);
  });
  console.log("[PAYLOAD_DEBUG] ===== END PAYLOAD STRUCTURE =====");
}
 
// =============================================================================
// SECTION 5: EXPORTS
// =============================================================================
 
export default {
  prepareApiPayload,
  debugPayload,
  validatePayload,
};
