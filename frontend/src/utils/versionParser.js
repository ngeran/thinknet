/**
 * =============================================================================
 * VERSION PARSER UTILITY
 * =============================================================================
 *
 * Extracts precise Junos version numbers from software image filenames
 *
 * Supported formats:
 * - junos-install-srxsme-25.2R1-S1.tgz       → "25.2R1-S1"
 * - junos-install-srxsme-25.2R2-S2.tgz       → "25.2R2-S2"
 * - junos-srxsme-x86-64-24.4R2-S1.7.tgz      → "24.4R2-S1.7"
 * - junos-vmhost-install-20.4R3.8.tgz        → "20.4R3.8"
 * - junos-install-srxsme-25.2R1.tgz          → "25.2R1"
 *
 * @version 1.0.0
 * @last_updated 2025-10-29
 * =============================================================================
 */
 
/**
 * Extract precise Junos version from image filename
 *
 * @param {string} filename - Software image filename
 * @returns {string|null} Extracted version or null if not found
 *
 * @example
 * extractVersionFromImageFilename("junos-install-srxsme-25.2R2-S2.tgz")
 * // Returns: "25.2R2-S2"
 *
 * extractVersionFromImageFilename("junos-srxsme-x86-64-24.4R2-S1.7.tgz")
 * // Returns: "24.4R2-S1.7"
 */
export function extractVersionFromImageFilename(filename) {
  if (!filename) {
    console.warn('[VERSION PARSER] No filename provided');
    return null;
  }
 
  // Array of regex patterns to match different version formats
  const patterns = [
    // Pattern 1: Standard format with service pack and patch
    // Matches: 25.2R1-S1.7, 24.4R2-S
