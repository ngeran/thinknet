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
 * Prepares API payload for different operations
 * @param {Object} upgradeParams - Upgrade parameters
 * @param {string} operationType - Type of operation ('pre-check' or 'upgrade')
 * @returns {Object} Prepared payload
 */
export function prepareApiPayload(upgradeParams, operationType) {
  // Base payload - common fields
  const basePayload = {
    hostname: upgradeParams.hostname,
    inventory_file: upgradeParams.inventoryFile,
    username: upgradeParams.username,
    password: upgradeParams.password,
    vendor: upgradeParams.vendor,
    platform: upgradeParams.platform,
    target_version: upgradeParams.targetVersion,
    image_filename: upgradeParams.imageFilename,
  };

  // Add pre_check_selection if provided
  if (upgradeParams.preCheckSelection) {
    basePayload.pre_check_selection = upgradeParams.preCheckSelection;
  }

  // Operation-specific fields
  if (operationType === 'pre-check') {
    return {
      ...basePayload,
      skip_storage_check: upgradeParams.skipStorageCheck || false,
      skip_snapshot_check: upgradeParams.skipSnapshotCheck || false,
      require_snapshot: upgradeParams.requireSnapshot || false,
    };
  }

  if (operationType === 'upgrade') {
    return {
      command: 'code_upgrade',
      ...basePayload,
      pre_check_job_id: upgradeParams.preCheckJobId || null,
      skip_pre_check: upgradeParams.skipPreCheck || false,
      force_upgrade: upgradeParams.forceUpgrade || false,
    };
  }

  return basePayload;
}
