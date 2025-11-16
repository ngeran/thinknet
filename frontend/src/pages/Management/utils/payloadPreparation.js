/**
 * =============================================================================
 * PAYLOAD PREPARATION UTILITIES
 * =============================================================================
 *
 * Prepares API payloads for different operations
 *
 * @module utils/payloadPreparation
 */

/**
 * Validates that all required fields are present
 * @param {Object} payload - The payload to validate
 * @returns {Object} Validation result
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

/**
 * Prepares API payload for different operations
 * @param {Object} upgradeParams - Upgrade parameters
 * @param {string} operationType - Type of operation ('pre-check' or 'upgrade')
 * @returns {Object} Prepared payload
 */
export function prepareApiPayload(upgradeParams, operationType) {
  console.log("[PAYLOAD_PREP] Original upgradeParams:", upgradeParams);

  // Base payload - common fields with CORRECT snake_case mapping
  const basePayload = {
    hostname: upgradeParams.hostname,
    inventory_file: upgradeParams.inventoryFile,
    username: upgradeParams.username,
    password: upgradeParams.password,
    vendor: upgradeParams.vendor,
    platform: upgradeParams.platform,
    // THESE ARE REQUIRED - make sure they exist in upgradeParams
    target_version: upgradeParams.targetVersion,
    image_filename: upgradeParams.imageFilename,
  };

  console.log("[PAYLOAD_PREP] Base payload after mapping:", basePayload);

  // Add pre_check_selection if provided
  if (upgradeParams.preCheckSelection) {
    basePayload.pre_check_selection = upgradeParams.preCheckSelection;
  }

  let finalPayload;

  // Operation-specific fields
  if (operationType === 'pre-check') {
    finalPayload = {
      ...basePayload,
      skip_storage_check: upgradeParams.skipStorageCheck || false,
      skip_snapshot_check: upgradeParams.skipSnapshotCheck || false,
      require_snapshot: upgradeParams.requireSnapshot || false,
    };
  } else if (operationType === 'upgrade') {
    finalPayload = {
      command: 'code_upgrade',
      ...basePayload,
      pre_check_job_id: upgradeParams.preCheckJobId || null,
      skip_pre_check: upgradeParams.skipPreCheck || false,
      force_upgrade: upgradeParams.forceUpgrade || false,
    };
  } else {
    finalPayload = basePayload;
  }

  // Validate the payload
  const validation = validatePayload(finalPayload);

  if (!validation.isValid) {
    console.error("[PAYLOAD_PREP] ❌ VALIDATION FAILED - Missing required fields:", validation.missingFields);
    console.error("[PAYLOAD_PREP] ❌ Current payload:", finalPayload);

    // Throw an error to prevent the API call
    throw new Error(`Missing required fields: ${validation.missingFields.join(', ')}`);
  }

  console.log("[PAYLOAD_PREP] ✅ Payload validation passed");
  console.log("[PAYLOAD_PREP] Final payload:", finalPayload);

  return finalPayload;
}
