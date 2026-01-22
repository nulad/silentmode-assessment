const { ERROR_CODES } = require('../../../shared/protocol');

/**
 * Maps error codes to HTTP status codes
 */
const ERROR_STATUS_MAP = {
  [ERROR_CODES.CLIENT_NOT_FOUND]: 404,
  [ERROR_CODES.CLIENT_NOT_CONNECTED]: 503,
  [ERROR_CODES.FILE_NOT_FOUND]: 404,
  [ERROR_CODES.FILE_READ_ERROR]: 500,
  [ERROR_CODES.PERMISSION_DENIED]: 403,
  [ERROR_CODES.DOWNLOAD_IN_PROGRESS]: 409,
  [ERROR_CODES.DOWNLOAD_TIMEOUT]: 408,
  [ERROR_CODES.CHUNK_CHECKSUM_FAILED]: 422,
  [ERROR_CODES.CHUNK_TRANSFER_FAILED]: 500,
  [ERROR_CODES.INVALID_REQUEST]: 400
};

/**
 * Default HTTP status for unmapped error codes
 */
const DEFAULT_ERROR_STATUS = 500;

/**
 * Creates a standardized error response object
 * @param {string} code - Error code from protocol
 * @param {string} message - Human readable error message
 * @param {object} details - Additional error details (optional)
 * @returns {object} Standardized error response
 */
function createErrorResponse(code, message, details = {}) {
  return {
    success: false,
    error: {
      code,
      message,
      details,
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * Express error handler middleware
 * Catches all errors and formats them consistently
 */
function errorHandler(err, req, res, next) {
  // Log the full error for debugging
  console.error('Error occurred:', err);
  
  // Determine error code and status
  let errorCode = ERROR_CODES.INVALID_REQUEST;
  let statusCode = DEFAULT_ERROR_STATUS;
  let message = 'An unexpected error occurred';
  let details = {};
  
  // Handle specific error types
  if (err.code && ERROR_CODES[err.code]) {
    errorCode = err.code;
    statusCode = ERROR_STATUS_MAP[errorCode] || DEFAULT_ERROR_STATUS;
    message = err.message || message;
    details = err.details || {};
  } else if (err.name === 'ValidationError') {
    errorCode = ERROR_CODES.INVALID_REQUEST;
    statusCode = 400;
    message = err.message || 'Validation failed';
    details = err.details || {};
  } else if (err.name === 'UnauthorizedError') {
    errorCode = ERROR_CODES.PERMISSION_DENIED;
    statusCode = 403;
    message = 'Access denied';
  } else {
    // Generic server error
    errorCode = 'INTERNAL_SERVER_ERROR';
    statusCode = DEFAULT_ERROR_STATUS;
    message = process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message || 'Internal server error';
    
    if (process.env.NODE_ENV !== 'production') {
      details.stack = err.stack;
    }
  }
  
  // Send standardized error response
  const errorResponse = createErrorResponse(errorCode, message, details);
  res.status(statusCode).json(errorResponse);
}

/**
 * Async route wrapper to catch async errors
 * Wraps async route handlers to ensure errors are caught by the error middleware
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Creates a custom error object with protocol error code
 * @param {string} code - Error code from protocol
 * @param {string} message - Error message
 * @param {object} details - Additional error details
 * @returns {Error} Custom error object
 */
function createError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

module.exports = {
  createErrorResponse,
  errorHandler,
  asyncHandler,
  createError,
  ERROR_STATUS_MAP,
  ERROR_CODES
};
