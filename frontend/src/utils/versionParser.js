
/**
 * =============================================================================
 * VERSION PARSER UTILITY
 * =============================================================================
 *
 * Extracts precise Junos version numbers from software image filenames.
 *
 * Supported formats:
 * - junos-install-srxsme-25.2R1-S1.tgz       → "25.2R1-S1"
 * - junos-install-srxsme-25.2R2-S2.tgz       → "25.2R2-S2"
 * - junos-srxsme-x86-64-24.4R2-S1.7.tgz      → "24.4R2-S1.7"
 * - junos-vmhost-install-20.4R3.8.tgz        → "20.4R3.8"
 * - junos-install-srxsme-25.2R1.tgz          → "25.2R1"
 *
 * @version 1.0.1
 * @last_updated 2025-10-29
 * =============================================================================
 */

/**
 * Extract precise Junos version from image filename.
 *
 * @param {string} filename - Software image filename
 * @returns {string|null} Extracted version or null if not found
 *
 * @example
 * extractVersionFromImageFilename("junos-install-srxsme-25.2R2-S2.tgz")
 * // → "25.2R2-S2"
 *
 * extractVersionFromImageFilename("junos-srxsme-x86-64-24.4R2-S1.7.tgz")
 * // → "24.4R2-S1.7"
 */
export function extractVersionFromImageFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    console.warn('[VERSION PARSER] Invalid or missing filename');
    return null;
  }

  /**
   * Array of regex patterns to capture various Junos version syntaxes.
   * These are ordered by specificity — most detailed patterns first.
   */
  const patterns = [
    // Pattern 1: Includes patch level with optional dot suffix (e.g., -S1.7)
    /(\d{2,}\.\d{1,2}R\d+[-S]\d+(?:\.\d+)?)/i,

    // Pattern 2: Standard release with service pack (e.g., 25.2R1-S1)
    /(\d{2,}\.\d{1,2}R\d+-S\d+)/i,

    // Pattern 3: Standard release only (e.g., 25.2R1)
    /(\d{2,}\.\d{1,2}R\d+)/i,

    // Pattern 4: Release with maintenance version (e.g., 20.4R3.8)
    /(\d{2,}\.\d{1,2}R\d+\.\d+)/i
  ];

  // Normalize filename (strip extension and lower case for consistency)
  const base = filename.toLowerCase().replace(/\.(tgz|img|tar\.gz|gz)$/i, '');

  // Try all patterns sequentially
  for (const pattern of patterns) {
    const match = base.match(pattern);
    if (match && match[1]) {
      return match[1].toUpperCase();
    }
  }

  console.warn(`[VERSION PARSER] Could not extract version from filename: ${filename}`);
  return null;
}

/* =============================================================================
 * Self-test (optional)
 * Uncomment the below block for quick standalone testing
 * =============================================================================
 */
// const testFiles = [
//   "junos-install-srxsme-25.2R1-S1.tgz",
//   "junos-install-srxsme-25.2R2-S2.tgz",
//   "junos-srxsme-x86-64-24.4R2-S1.7.tgz",
//   "junos-vmhost-install-20.4R3.8.tgz",
//   "junos-install-srxsme-25.2R1.tgz",
//   "invalid-file-name.tgz"
// ];

// testFiles.forEach(f => console.log(f, '→', extractVersionFromImageFilename(f)));
