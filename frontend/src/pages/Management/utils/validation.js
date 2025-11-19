/**
 * =============================================================================
 * VALIDATION UTILITIES - ENHANCED v1.2.0
 * =============================================================================
 *
 * Validation functions for upgrade parameters with enhanced field handling
 *
 * @module utils/validation
 * @author nikos-geranios_vgi
 * @updated 2025-11-18 23:30:00 UTC - Added field extraction support
 */

/**
 * Validates upgrade parameters with comprehensive field checking
 *
 * ENHANCEMENT: Now works with extracted fields from pre-check results
 * 
 * @param {Object} upgradeParams - Upgrade parameters to validate
 * @returns {Array} Array of validation error messages
 */
export function validateUpgradeParameters(upgradeParams) {
  const errors = [];

  console.log("[VALIDATION] 🔍 Validating upgrade parameters:", {
    params: upgradeParams,
    hasParams: !!upgradeParams
  });

  if (!upgradeParams) {
    errors.push("No upgrade parameters provided");
    return errors;
  }

  // Core required fields (must be in upgradeParams)
  if (!upgradeParams.hostname) {
    errors.push("Hostname is required");
  }

  if (!upgradeParams.username) {
    errors.push("Username is required");
  }

  if (!upgradeParams.password) {
    errors.push("Password is required");
  }

  // Note: targetVersion and imageFilename are now extracted separately
  // and may not be in upgradeParams initially

  if (errors.length > 0) {
    console.error("[VALIDATION] ❌ Validation errors:", errors);
  } else {
    console.log("[VALIDATION] ✅ Core parameters validated successfully");
  }

  return errors;
}

/**
 * Validates WebSocket connection status
 */
export function validateWebSocketConnection(isConnected) {
  if (!isConnected) {
    return {
      valid: false,
      error: "WebSocket connection is not established"
    };
  }
  return { valid: true };
}
