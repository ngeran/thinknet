/**
 * =============================================================================
 * CODE UPGRADES FEATURE - BARREL EXPORT
 * =============================================================================
 *
 * Central export point for the Code Upgrades feature
 *
 * @module features/code-upgrades
 * @author nikos-geranios_vgi
 * @date 2025-11-05
 */

export { default } from './CodeUpgrades-mono';

// Re-export hooks for external use if needed
export { useUpgradeState } from './hooks/useUpgradeState';
export { usePreCheck } from './hooks/usePreCheck';
export { useCodeUpgrade } from './hooks/useCodeUpgrade';
export { useWebSocketMessages } from './hooks/useWebSocketMessages';

// Re-export utilities for external use if needed
export * from './utils/validation';
export * from './utils/messageFormatting';
export * from './utils/messageFiltering';
export * from './utils/jsonExtraction';
export * from './utils/payloadPreparation';

// Re-export constants for external use if needed
export * from './constants/timing';
export * from './constants/icons';
export * from './constants/api';
