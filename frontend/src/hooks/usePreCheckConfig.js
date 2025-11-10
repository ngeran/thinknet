/**
 * =============================================================================
 * PRE-CHECK CONFIGURATION HOOK
 * =============================================================================
 *
 * Custom hook for managing pre-check configuration and selection state.
 * Provides easy integration with forms and components.
 *
 * LOCATION: /src/hooks/usePreCheckConfig.js
 * AUTHOR: nikos-geranios_vgi
 * DATE: 2025-11-10
 * VERSION: 1.0.0
 *
 * =============================================================================
 */

import { useState, useEffect, useCallback } from 'react';

// =============================================================================
// SECTION 1: MAIN HOOK
// =============================================================================

/**
 * Custom hook for pre-check configuration management
 *
 * @param {Object} options Hook options
 * @param {boolean} options.autoLoad Auto-load config on mount
 * @param {Array<string>} options.initialSelection Initial selected check IDs
 *
 * @returns {Object} Configuration state and methods
 */
export function usePreCheckConfig({ autoLoad = true, initialSelection = [] } = {}) {

  // ===========================================================================
  // SUBSECTION 1.1: STATE
  // ===========================================================================

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [config, setConfig] = useState(null);
  const [selectedChecks, setSelectedChecks] = useState(initialSelection);

  // ===========================================================================
  // SUBSECTION 1.2: LOAD CONFIGURATION
  // ===========================================================================

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/pre-checks/config', {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Failed to load configuration: ${response.status}`);
      }

      const data = await response.json();
      setConfig(data);

      // Auto-select defaults if no initial selection
      if (initialSelection.length === 0) {
        const defaults = data.checks
          .filter(check => check.required || check.enabled_by_default)
          .map(check => check.id);

        setSelectedChecks(defaults);
      }

      return data;

    } catch (err) {
      console.error('[USE_PRE_CHECK_CONFIG] Load failed:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [initialSelection]);

  // ===========================================================================
  // SUBSECTION 1.3: AUTO-LOAD
  // ===========================================================================

  useEffect(() => {
    if (autoLoad) {
      loadConfig();
    }
  }, [autoLoad, loadConfig]);

  // ===========================================================================
  // SUBSECTION 1.4: HELPER METHODS
  // ===========================================================================

  /**
   * Get check configuration by ID
   */
  const getCheckById = useCallback((checkId) => {
    return config?.checks.find(check => check.id === checkId);
  }, [config]);

  /**
   * Check if a specific check is selected
   */
  const isCheckSelected = useCallback((checkId) => {
    return selectedChecks.includes(checkId);
  }, [selectedChecks]);

  /**
   * Toggle check selection
   */
  const toggleCheck = useCallback((checkId) => {
    const check = getCheckById(checkId);

    // Don't toggle required checks
    if (check?.required) return;

    setSelectedChecks(prev =>
      prev.includes(checkId)
        ? prev.filter(id => id !== checkId)
        : [...prev, checkId]
    );
  }, [getCheckById]);

  /**
   * Select all available checks
   */
  const selectAll = useCallback(() => {
    if (!config) return;

    const allIds = config.checks
      .filter(check => check.available)
      .map(check => check.id);

    setSelectedChecks(allIds);
  }, [config]);

  /**
   * Select only required checks
   */
  const selectRequired = useCallback(() => {
    if (!config) return;

    const requiredIds = config.checks
      .filter(check => check.required)
      .map(check => check.id);

    setSelectedChecks(requiredIds);
  }, [config]);

  /**
   * Get selected checks with full configuration
   */
  const getSelectedChecksWithConfig = useCallback(() => {
    if (!config) return [];

    return selectedChecks
      .map(id => config.checks.find(check => check.id === id))
      .filter(Boolean);
  }, [config, selectedChecks]);

  /**
   * Calculate total estimated duration
   */
  const getTotalDuration = useCallback(() => {
    const checks = getSelectedChecksWithConfig();
    return checks.reduce((total, check) => total + check.estimated_duration_seconds, 0);
  }, [getSelectedChecksWithConfig]);

  // ===========================================================================
  // SUBSECTION 1.5: RETURN API
  // ===========================================================================

  return {
    // State
    loading,
    error,
    config,
    selectedChecks,

    // Setters
    setSelectedChecks,

    // Methods
    loadConfig,
    getCheckById,
    isCheckSelected,
    toggleCheck,
    selectAll,
    selectRequired,
    getSelectedChecksWithConfig,
    getTotalDuration,

    // Computed
    totalChecks: config?.checks.length || 0,
    selectedCount: selectedChecks.length,
    estimatedDuration: getTotalDuration(),
  };
}
