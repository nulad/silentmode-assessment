/**
 * Shared protocol definitions for SilentMode file transfer system
 * Used by both server and client to ensure message consistency
 */

// Message Types
const MESSAGE_TYPES = {
  // Client registration
  REGISTER: 'REGISTER',
  REGISTER_ACK: 'REGISTER_ACK',
  
  // Download flow
  DOWNLOAD_REQUEST: 'DOWNLOAD_REQUEST',
  DOWNLOAD_ACK: 'DOWNLOAD_ACK',
  FILE_CHUNK: 'FILE_CHUNK',
  RETRY_CHUNK: 'RETRY_CHUNK',
  DOWNLOAD_COMPLETE: 'DOWNLOAD_COMPLETE',
  CANCEL_DOWNLOAD: 'CANCEL_DOWNLOAD',
  
  // Error handling
  ERROR: 'ERROR',
  
  // Connection health
  PING: 'PING',
  PONG: 'PONG'
};

// Error Codes
const ERROR_CODES = {
  CLIENT_NOT_FOUND: 'CLIENT_NOT_FOUND',
  CLIENT_NOT_CONNECTED: 'CLIENT_NOT_CONNECTED',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_READ_ERROR: 'FILE_READ_ERROR',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  DOWNLOAD_IN_PROGRESS: 'DOWNLOAD_IN_PROGRESS',
  DOWNLOAD_TIMEOUT: 'DOWNLOAD_TIMEOUT',
  CHUNK_CHECKSUM_FAILED: 'CHUNK_CHECKSUM_FAILED',
  CHUNK_TRANSFER_FAILED: 'CHUNK_TRANSFER_FAILED',
  INVALID_REQUEST: 'INVALID_REQUEST'
};

// Constants
const CONSTANTS = {
  CHUNK_SIZE: 1048576, // 1MB in bytes
  DEFAULT_WS_PORT: 8080,
  DEFAULT_API_PORT: 3000
};

// Message validation schemas (optional but helpful)
const MESSAGE_SCHEMAS = {
  [MESSAGE_TYPES.REGISTER]: {
    clientId: 'string'
  },
  [MESSAGE_TYPES.REGISTER_ACK]: {
    success: 'boolean',
    message: 'string'
  },
  [MESSAGE_TYPES.DOWNLOAD_REQUEST]: {
    clientId: 'string',
    filePath: 'string'
  },
  [MESSAGE_TYPES.DOWNLOAD_ACK]: {
    success: 'boolean',
    fileId: 'string',
    totalChunks: 'number',
    fileSize: 'number',
    checksum: 'string',
    message: 'string'
  },
  [MESSAGE_TYPES.FILE_CHUNK]: {
    fileId: 'string',
    chunkIndex: 'number',
    data: 'buffer', // Base64 encoded binary data
    checksum: 'string'
  },
  [MESSAGE_TYPES.RETRY_CHUNK]: {
    fileId: 'string',
    chunkIndex: 'number'
  },
  [MESSAGE_TYPES.DOWNLOAD_COMPLETE]: {
    fileId: 'string',
    success: 'boolean',
    message: 'string'
  },
  [MESSAGE_TYPES.CANCEL_DOWNLOAD]: {
    fileId: 'string',
    reason: 'string'
  },
  [MESSAGE_TYPES.ERROR]: {
    code: 'string',
    message: 'string',
    details: 'object' // optional
  },
  [MESSAGE_TYPES.PING]: {},
  [MESSAGE_TYPES.PONG]: {}
};

// Helper function to validate messages
function validateMessage(type, data) {
  const schema = MESSAGE_SCHEMAS[type];
  if (!schema) {
    throw new Error(`Unknown message type: ${type}`);
  }
  
  // Basic validation - check required fields
  for (const [field, fieldType] of Object.entries(schema)) {
    if (!(field in data)) {
      throw new Error(`Missing required field: ${field} for message type: ${type}`);
    }
    
    // Type checking (basic)
    if (fieldType === 'string' && typeof data[field] !== 'string') {
      throw new Error(`Field ${field} must be a string`);
    }
    if (fieldType === 'number' && typeof data[field] !== 'number') {
      throw new Error(`Field ${field} must be a number`);
    }
    if (fieldType === 'boolean' && typeof data[field] !== 'boolean') {
      throw new Error(`Field ${field} must be a boolean`);
    }
    if (fieldType === 'object' && typeof data[field] !== 'object') {
      throw new Error(`Field ${field} must be an object`);
    }
  }
  
  return true;
}

// Export everything
module.exports = {
  MESSAGE_TYPES,
  ERROR_CODES,
  CONSTANTS,
  MESSAGE_SCHEMAS,
  validateMessage
};

// Also provide named exports for convenience
module.exports.MessageTypes = MESSAGE_TYPES;
module.exports.ErrorCodes = ERROR_CODES;
module.exports.Constants = CONSTANTS;
module.exports.MessageSchemas = MESSAGE_SCHEMAS;
module.exports.validateMessage = validateMessage;
