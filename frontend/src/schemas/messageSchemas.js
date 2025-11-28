/**
 * =============================================================================
 * MESSAGE SCHEMAS v1.0 - Standardized Message Contracts
 * =============================================================================
 *
 * Centralized message schema definitions for the ThinkNet WebSocket
 * communication system. Provides validation, type safety, and clear contracts
 * for all message types flowing between worker service and frontend.
 *
 * PURPOSE:
 * - Define standardized message structure contracts
 * - Provide validation functions for message integrity
 * - Enable type-safe message processing
 * - Serve as documentation for message formats
 * - Prevent runtime errors from malformed messages
 *
 * USAGE:
 * import { MESSAGE_SCHEMAS, validateMessage, createEventMessage } from './messageSchemas';
 *
 * const isValid = validateMessage(eventData, 'PROGRESS_UPDATE');
 * const event = createEventMessage('PROGRESS_UPDATE', { progress: 75 }, job_id);
 *
 * AUTHOR: Claude Code Assistant
 * DATE: 2025-11-28
 * VERSION: 1.0.0
 * =============================================================================
 */

// =============================================================================
// SECTION 1: CORE SCHEMA DEFINITIONS
// =============================================================================

/**
 * Core message schema structure
 * All messages must follow this base structure
 */
const BASE_MESSAGE_SCHEMA = {
  required: ['event_type', 'timestamp', 'job_id'],
  optional: ['sequence', 'data', 'message', 'level', 'success'],
  type: 'object'
};

/**
 * Event type-specific schemas
 * Each schema defines the required and optional fields for that event type
 */
const EVENT_SCHEMAS = {

  // Progress update events - used for progress bars and step indicators
  PROGRESS_UPDATE: {
    extends: BASE_MESSAGE_SCHEMA,
    required: ['event_type', 'timestamp', 'job_id', 'data'],
    data: {
      required: ['progress'],
      optional: ['step', 'total_steps', 'message', 'details'],
      properties: {
        progress: { type: 'number', min: 0, max: 100 },
        step: { type: 'string' },
        total_steps: { type: 'number' },
        message: { type: 'string' },
        details: { type: 'object' }
      }
    }
  },

  // Upload completion events - final status for file operations
  UPLOAD_COMPLETE: {
    extends: BASE_MESSAGE_SCHEMA,
    required: ['event_type', 'timestamp', 'job_id', 'success'],
    optional: ['data', 'message'],
    data: {
      optional: ['status', 'file_info', 'details', 'error'],
      properties: {
        status: { type: 'string', enum: ['SUCCESS', 'FAILED'] },
        file_info: { type: 'object' },
        details: { type: 'object' },
        error: { type: 'string' }
      }
    }
  },

  // Upload start events - initialization of file operations
  UPLOAD_START: {
    extends: BASE_MESSAGE_SCHEMA,
    required: ['event_type', 'timestamp', 'job_id'],
    optional: ['data', 'message'],
    data: {
      optional: ['file_name', 'file_size', 'operation_type'],
      properties: {
        file_name: { type: 'string' },
        file_size: { type: 'number' },
        operation_type: { type: 'string' }
      }
    }
  },

  // Pre-check completion events - validation results
  PRE_CHECK_COMPLETE: {
    extends: BASE_MESSAGE_SCHEMA,
    required: ['event_type', 'timestamp', 'job_id'],
    optional: ['data', 'message', 'success'],
    data: {
      required: ['validation_passed'],
      optional: ['required_mb', 'available_mb', 'details'],
      properties: {
        validation_passed: { type: 'boolean' },
        required_mb: { type: 'number' },
        available_mb: { type: 'number' },
        details: { type: 'object' }
      }
    }
  },

  // Pre-check result events - individual check results
  PRE_CHECK_RESULT: {
    extends: BASE_MESSAGE_SCHEMA,
    required: ['event_type', 'timestamp', 'job_id'],
    optional: ['data', 'message'],
    data: {
      required: ['check_name', 'result'],
      optional: ['details', 'error'],
      properties: {
        check_name: { type: 'string' },
        result: { type: 'string', enum: ['PASS', 'FAIL', 'WARNING'] },
        details: { type: 'object' },
        error: { type: 'string' }
      }
    }
  },

  // Operation completion events - generic operation final status
  OPERATION_COMPLETE: {
    extends: BASE_MESSAGE_SCHEMA,
    required: ['event_type', 'timestamp', 'job_id', 'success'],
    optional: ['data', 'message', 'level'],
    data: {
      optional: ['status', 'exit_code', 'details', 'error'],
      properties: {
        status: { type: 'string', enum: ['SUCCESS', 'FAILED', 'TIMEOUT'] },
        exit_code: { type: 'number' },
        details: { type: 'object' },
        error: { type: 'string' }
      }
    }
  },

  // Operation start events - operation initialization
  OPERATION_START: {
    extends: BASE_MESSAGE_SCHEMA,
    required: ['event_type', 'timestamp', 'job_id'],
    optional: ['data', 'message'],
    data: {
      optional: ['operation_type', 'target', 'parameters'],
      properties: {
        operation_type: { type: 'string' },
        target: { type: 'string' },
        parameters: { type: 'object' }
      }
    }
  },

  // Step completion events - individual step status
  STEP_COMPLETE: {
    extends: BASE_MESSAGE_SCHEMA,
    required: ['event_type', 'timestamp', 'job_id'],
    optional: ['data', 'message'],
    data: {
      required: ['step_name', 'result'],
      optional: ['details', 'duration_ms'],
      properties: {
        step_name: { type: 'string' },
        result: { type: 'string', enum: ['SUCCESS', 'FAIL', 'WARNING'] },
        details: { type: 'object' },
        duration_ms: { type: 'number' }
      }
    }
  },

  // Device progress events - device-specific progress
  DEVICE_PROGRESS: {
    extends: BASE_MESSAGE_SCHEMA,
    required: ['event_type', 'timestamp', 'job_id', 'data'],
    data: {
      required: ['device_id', 'progress'],
      optional: ['step', 'message'],
      properties: {
        device_id: { type: 'string' },
        progress: { type: 'number', min: 0, max: 100 },
        step: { type: 'string' },
        message: { type: 'string' }
      }
    }
  },

  // Upgrade progress events - firmware/software upgrade progress
  UPGRADE_PROGRESS: {
    extends: BASE_MESSAGE_SCHEMA,
    required: ['event_type', 'timestamp', 'job_id', 'data'],
    data: {
      required: ['device_id', 'progress', 'stage'],
      optional: ['message', 'details'],
      properties: {
        device_id: { type: 'string' },
        progress: { type: 'number', min: 0, max: 100 },
        stage: { type: 'string' },
        message: { type: 'string' },
        details: { type: 'object' }
      }
    }
  },

  // Log message events - pure log output
  LOG_MESSAGE: {
    extends: BASE_MESSAGE_SCHEMA,
    required: ['event_type', 'timestamp', 'job_id', 'level', 'message'],
    optional: ['data'],
    level: {
      type: 'string',
      enum: ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']
    }
  },

  // Step progress events - granular step progress
  STEP_PROGRESS: {
    extends: BASE_MESSAGE_SCHEMA,
    required: ['event_type', 'timestamp', 'job_id', 'data'],
    data: {
      required: ['step_number', 'progress'],
      optional: ['total_steps', 'step_name', 'message'],
      properties: {
        step_number: { type: 'number', min: 1 },
        progress: { type: 'number', min: 0, max: 100 },
        total_steps: { type: 'number', min: 1 },
        step_name: { type: 'string' },
        message: { type: 'string' }
      }
    }
  },

  // =============================================================================
  // TEMPLATE DEPLOYMENT EVENTS - Template deployment specific events
  // =============================================================================

  // Template deployment start events - initialization of template deployment
  TEMPLATE_DEPLOY_START: {
    extends: BASE_MESSAGE_SCHEMA,
    required: ['event_type', 'timestamp', 'job_id'],
    optional: ['data', 'message'],
    data: {
      required: ['template_name', 'template_path', 'target_device'],
      optional: ['template_vars', 'config_lines', 'deployment_type'],
      properties: {
        template_name: { type: 'string' },
        template_path: { type: 'string' },
        target_device: { type: 'string' },
        template_vars: { type: 'object' },
        config_lines: { type: 'number' },
        deployment_type: { type: 'string', enum: ['TEMPLATE', 'CONFIG'] }
      }
    }
  },

  // Template deployment progress events - template deployment step progress
  TEMPLATE_DEPLOY_PROGRESS: {
    extends: BASE_MESSAGE_SCHEMA,
    required: ['event_type', 'timestamp', 'job_id'],
    optional: ['data', 'message'],
    data: {
      required: ['step_name', 'progress'],
      optional: ['step_number', 'total_steps', 'details', 'duration_ms'],
      properties: {
        step_name: { type: 'string' },
        progress: { type: 'number', min: 0, max: 100 },
        step_number: { type: 'number', min: 1 },
        total_steps: { type: 'number', min: 1 },
        details: { type: 'object' },
        duration_ms: { type: 'number' }
      }
    }
  },

  // Template deployment completion events - final status of template deployment
  TEMPLATE_DEPLOY_COMPLETE: {
    extends: BASE_MESSAGE_SCHEMA,
    required: ['event_type', 'timestamp', 'job_id', 'success'],
    optional: ['data', 'message', 'level'],
    data: {
      required: ['deployment_result'],
      optional: ['config_applied', 'diff_data', 'validation_result', 'details'],
      properties: {
        deployment_result: { type: 'string', enum: ['SUCCESS', 'FAILED', 'PARTIAL'] },
        config_applied: { type: 'boolean' },
        diff_data: { type: 'string' },
        validation_result: { type: 'string', enum: ['PASSED', 'FAILED', 'WARNING'] },
        details: { type: 'object' }
      }
    }
  },

  // Template validation result events - configuration validation results
  TEMPLATE_VALIDATION_RESULT: {
    extends: BASE_MESSAGE_SCHEMA,
    required: ['event_type', 'timestamp', 'job_id'],
    optional: ['data', 'message'],
    data: {
      required: ['validation_passed'],
      optional: ['validation_type', 'errors', 'warnings', 'syntax_check'],
      properties: {
        validation_passed: { type: 'boolean' },
        validation_type: { type: 'string', enum: ['SYNTAX', 'SEMANTIC', 'FULL'] },
        errors: { type: 'array', items: { type: 'string' } },
        warnings: { type: 'array', items: { type: 'string' } },
        syntax_check: { type: 'object' }
      }
    }
  },

  // Template diff generation events - configuration diff generation results
  TEMPLATE_DIFF_GENERATED: {
    extends: BASE_MESSAGE_SCHEMA,
    required: ['event_type', 'timestamp', 'job_id'],
    optional: ['data', 'message'],
    data: {
      required: ['diff_available'],
      optional: ['diff_content', 'diff_size', 'changes_count'],
      properties: {
        diff_available: { type: 'boolean' },
        diff_content: { type: 'string' },
        diff_size: { type: 'number' },
        changes_count: { type: 'number' }
      }
    }
  }
};

// =============================================================================
// SECTION 2: VALIDATION FUNCTIONS
// =============================================================================

/**
 * Validate a message against its schema
 *
 * @param {Object} message - Message object to validate
 * @param {string} eventType - Expected event type (for schema lookup)
 * @returns {Object} Validation result with isValid and errors
 */
export const validateMessage = (message, eventType = null) => {
  const errors = [];

  // Basic type checking
  if (!message || typeof message !== 'object') {
    errors.push('Message must be an object');
    return { isValid: false, errors };
  }

  // Determine event type
  const msgEventType = eventType || message.event_type;
  if (!msgEventType) {
    errors.push('Message must have event_type');
    return { isValid: false, errors };
  }

  // Check if schema exists for this event type
  const schema = EVENT_SCHEMAS[msgEventType];
  if (!schema) {
    errors.push(`Unknown event type: ${msgEventType}`);
    return { isValid: false, errors };
  }

  // Validate base required fields
  for (const field of BASE_MESSAGE_SCHEMA.required) {
    if (!(field in message)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate event-specific fields
  if (schema.required) {
    for (const field of schema.required) {
      if (!(field in message)) {
        errors.push(`Missing required field for ${msgEventType}: ${field}`);
      }
    }
  }

  // Validate data structure if present
  if (message.data && schema.data) {
    const dataValidation = validateDataStructure(message.data, schema.data, msgEventType);
    if (!dataValidation.isValid) {
      errors.push(...dataValidation.errors.map(err => `data.${err}`));
    }
  }

  // Validate specific field types and values
  const fieldValidation = validateFieldTypes(message, schema, msgEventType);
  if (!fieldValidation.isValid) {
    errors.push(...fieldValidation.errors);
  }

  return {
    isValid: errors.length === 0,
    errors,
    eventType: msgEventType
  };
};

/**
 * Validate data structure within a message
 */
const validateDataStructure = (data, dataSchema, eventType) => {
  const errors = [];

  if (!data || typeof data !== 'object') {
    errors.push('data must be an object');
    return { isValid: false, errors };
  }

  // Check required data fields
  if (dataSchema.required) {
    for (const field of dataSchema.required) {
      if (!(field in data)) {
        errors.push(`Missing required field: ${field}`);
      }
    }
  }

  // Validate data field properties
  if (dataSchema.properties) {
    for (const [field, rules] of Object.entries(dataSchema.properties)) {
      if (field in data) {
        const fieldValidation = validateFieldRule(data[field], rules, field);
        if (!fieldValidation.isValid) {
          errors.push(...fieldValidation.errors);
        }
      }
    }
  }

  return { isValid: errors.length === 0, errors };
};

/**
 * Validate individual field against rules
 */
const validateFieldRule = (value, rules, fieldName) => {
  const errors = [];

  // Type validation
  if (rules.type) {
    const expectedType = rules.type;
    const actualType = Array.isArray(value) ? 'array' : typeof value;

    if (expectedType === 'number' && actualType === 'string') {
      // Allow numeric strings for number fields
      if (isNaN(Number(value))) {
        errors.push(`${fieldName} must be a valid number`);
      }
    } else if (actualType !== expectedType) {
      errors.push(`${fieldName} must be of type ${expectedType}, got ${actualType}`);
    }
  }

  // Enum validation
  if (rules.enum && !rules.enum.includes(value)) {
    errors.push(`${fieldName} must be one of: ${rules.enum.join(', ')}, got ${value}`);
  }

  // Range validation
  if (typeof value === 'number') {
    if (rules.min !== undefined && value < rules.min) {
      errors.push(`${fieldName} must be >= ${rules.min}, got ${value}`);
    }
    if (rules.max !== undefined && value > rules.max) {
      errors.push(`${fieldName} must be <= ${rules.max}, got ${value}`);
    }
  }

  return { isValid: errors.length === 0, errors };
};

/**
 * Validate top-level field types
 */
const validateFieldTypes = (message, schema, eventType) => {
  const errors = [];

  // Validate timestamp format
  if (message.timestamp && typeof message.timestamp !== 'string') {
    errors.push('timestamp must be a string');
  } else if (message.timestamp && !isValidTimestamp(message.timestamp)) {
    errors.push('timestamp must be a valid ISO timestamp');
  }

  // Validate progress fields are numbers
  if (eventType === 'PROGRESS_UPDATE' && message.data?.progress) {
    if (typeof message.data.progress !== 'number') {
      errors.push('data.progress must be a number');
    } else if (message.data.progress < 0 || message.data.progress > 100) {
      errors.push('data.progress must be between 0 and 100');
    }
  }

  // Validate success fields are booleans
  if ('success' in message && typeof message.success !== 'boolean') {
    errors.push('success must be a boolean');
  }

  // Validate sequence fields are numbers
  if ('sequence' in message && typeof message.sequence !== 'number') {
    errors.push('sequence must be a number');
  }

  return { isValid: errors.length === 0, errors };
};

/**
 * Check if timestamp is valid ISO format
 */
const isValidTimestamp = (timestamp) => {
  // Simple ISO timestamp validation
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(timestamp);
};

// =============================================================================
// SECTION 3: MESSAGE CREATION HELPERS
// =============================================================================

/**
 * Create a standardized event message
 *
 * @param {string} eventType - Type of event
 * @param {Object} data - Event data payload
 * @param {string} jobId - Job identifier
 * @param {Object} options - Additional options (sequence, message, etc.)
 * @returns {Object} Standardized event message
 */
export const createEventMessage = (eventType, data = {}, jobId, options = {}) => {
  const message = {
    event_type: eventType,
    timestamp: new Date().toISOString(),
    job_id: jobId,
    ...options
  };

  // Add data only if provided
  if (data && Object.keys(data).length > 0) {
    message.data = data;
  }

  // Validate the created message
  const validation = validateMessage(message, eventType);
  if (!validation.isValid) {
    console.warn(`Created invalid ${eventType} message:`, validation.errors);
    // Still return the message for debugging, but log the issue
  }

  return message;
};

/**
 * Create a progress update message
 */
export const createProgressMessage = (progress, jobId, options = {}) => {
  return createEventMessage('PROGRESS_UPDATE', { progress }, jobId, options);
};

/**
 * Create a completion message
 */
export const createCompletionMessage = (success, jobId, options = {}) => {
  return createEventMessage('OPERATION_COMPLETE', {}, jobId, { success, ...options });
};

/**
 * Create a log message
 */
export const createLogMessage = (level, message, jobId, options = {}) => {
  return createEventMessage('LOG_MESSAGE', {}, jobId, { level, message, ...options });
};

// =============================================================================
// SECTION 4: EXPORTS
// =============================================================================

export const MESSAGE_SCHEMAS = {
  BASE_MESSAGE_SCHEMA,
  EVENT_SCHEMAS,
  EVENT_TYPES: Object.keys(EVENT_SCHEMAS)
};

// Export validation utilities
export const ValidationUtils = {
  isValidTimestamp,
  validateFieldRule,
  validateDataStructure
};

// Default export for easy importing
export default {
  MESSAGE_SCHEMAS,
  validateMessage,
  createEventMessage,
  createProgressMessage,
  createCompletionMessage,
  createLogMessage,
  ValidationUtils
};