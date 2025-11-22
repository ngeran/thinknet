/**
 * =============================================================================
 * API CONFIGURATION
 * =============================================================================
 *
 * API endpoints and configuration
 *
 * @module constants/api
 * @author nikos-geranios_vgi
 * @date 2025-11-05
 * @updated 2025-11-18 16:47:45 UTC - Added UPGRADE endpoint for device upgrades
 */
 
/**
 * Base API URL
 * Reads from environment variable with localhost fallback
 */
export const API_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000';
 
/**
 * API Endpoints
 *
 * ARCHITECTURE:
 * - PRE_CHECK: Validation checks before upgrade (code_upgrade.py)
 * - UPGRADE: Device software upgrade execution (upgrade.py) - NEW 2025-11-18 16:47:45 UTC
 * - EXECUTE: Generic operations for backup/restore (operations.py)
 */
export const ENDPOINTS = {
  PRE_CHECK: '/api/operations/pre-check',  // Pre-check validation endpoint
  UPGRADE: '/api/operations/upgrade',      // NEW - Device upgrade endpoint
  EXECUTE: '/api/operations/execute',      // Generic operations (backup/restore)
};
 
/**
 * WebSocket configuration
 */
export const WS_CONFIG = {
  RECONNECT_DELAY: 3000,
  MAX_RECONNECT_ATTEMPTS: 5,
};
