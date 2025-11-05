/**
 * =============================================================================
 * API CONFIGURATION
 * =============================================================================
 *
 * API endpoints and configuration
 *
 * @module constants/api
 */
 
/**
 * Base API URL
 * Reads from environment variable with localhost fallback
 */
export const API_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000';
 
/**
 * API Endpoints
 */
export const ENDPOINTS = {
  PRE_CHECK: '/api/operations/pre-check',
  EXECUTE: '/api/operations/execute',
};
 
/**
 * WebSocket configuration
 */
export const WS_CONFIG = {
  RECONNECT_DELAY: 3000,
  MAX_RECONNECT_ATTEMPTS: 5,
};