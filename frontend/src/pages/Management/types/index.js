/**
 * =============================================================================
 * TYPE DEFINITIONS
 * =============================================================================
 *
 * JSDoc type definitions for better IDE support and documentation
 *
 * @module types
 * @author nikos-geranios_vgi
 * @date 2025-11-05
 */
 
/**
 * @typedef {Object} UpgradeParameters
 * @property {string} username - Device username
 * @property {string} password - Device password
 * @property {string} hostname - Device hostname
 * @property {string} inventory_file - Ansible inventory file path
 * @property {string} vendor - Device vendor
 * @property {string} platform - Device platform
 * @property {string} target_version - Target software version
 * @property {string} image_filename - Software image filename
 */
 
/**
 * @typedef {Object} PreCheckResult
 * @property {string} check_name - Name of the validation check
 * @property {('pass'|'warning'|'critical')} severity - Result severity
 * @property {string} message - Result message
 * @property {string} [recommendation] - Recommended action if failed
 */
 
/**
 * @typedef {Object} PreCheckSummary
 * @property {number} total_checks - Total number of checks performed
 * @property {number} passed - Number of checks that passed
 * @property {number} warnings - Number of warning-level issues
 * @property {number} critical_failures - Number of critical failures
 * @property {boolean} can_proceed - Whether upgrade can proceed
 * @property {PreCheckResult[]} results - Array of individual check results
 */
 
/**
 * @typedef {Object} JobOutput
 * @property {string} timestamp - ISO timestamp
 * @property {string} message - Log message
 * @property {('info'|'warning'|'error'|'debug')} level - Message level
 * @property {string} event_type - Event type identifier
 * @property {Object} [data] - Additional data
 */
 
/**
 * @typedef {Object} WebSocketMessage
 * @property {string} event_type - Type of event
 * @property {string} [type] - Alternative type field
 * @property {string} [message] - Message content
 * @property {string} [timestamp] - Message timestamp
 * @property {string} [channel] - WebSocket channel
 * @property {Object} [data] - Message data payload
 */
 
/**
 * @typedef {('idle'|'running'|'success'|'failed')} JobStatus
 */
 
/**
 * @typedef {('config'|'pre_check'|'review'|'upgrade'|'results')} WorkflowPhase
 */
 
/**
 * @typedef {Object} Statistics
 * @property {number} total - Total operations
 * @property {number} succeeded - Successful operations
 * @property {number} failed - Failed operations
 */
 
// Export empty object to make this a module
export {};