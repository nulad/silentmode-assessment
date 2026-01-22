const { ERROR_CODES } = require('../../../shared/protocol');
const logger = require('./logger');

/**
 * Map error codes to HTTP status codes
 */
const ERROR_CODE_TO_HTTP_STATUS = {
  [ERROR_CODES.CLIENT_NOT_FOUND]: 404,
  [ERROR_CODES.CLIENT_NOT_CONNECTED]: 503,
  [ERROR_CODES.FILE_NOT_FOUND]: 404,
  [ERROR_CODES.FILE_READ_ERROR]: 500,
  [ERROR_CODES.PERMISSION_DENIED]: 403,
  [ERROR_CODES.DOWNLOAD_IN_PROGRESS]: 409,
  [ERROR_CODES.DOWNLOAD_TIMEOUT]: 408,
  [ERROR_CODES.CHUNK_CHECKSUM_FAILED]: 500,
  [ERROR_CODES.CHUNK_TRANSFER_FAILED]: 500,
  [ERROR_CODES.INVALID_REQUEST]: 400
};

/**
 * Application error class with error code
 */
class AppError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
    this.statusCode = ERROR_CODE_TO_HTTP_STATUS[code] || 500;
  }
}

/**
 * Format error response according to the protocol
 */
function formatErrorResponse(error) {
  // If it's our custom AppError, use its properties
  if (error instanceof AppError) {
    return {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        timestamp: new Date().toISOString()
      }
    };
  }

  // For generic errors, return a generic error response
  return {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: error.message || 'Internal server error',
      details: {},
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * Express error handling middleware
 * Should be registered last in middleware chain
 */
function errorMiddleware(err, req, res, next) {
  // Log the error
  logger.error('Error handling request:', {
    path: req.path,
    method: req.method,
    error: err.message,
    code: err.code,
    stack: err.stack
  });

  // Get HTTP status code
  const statusCode = err.statusCode || 500;

  // Format and send error response
  const errorResponse = formatErrorResponse(err);
  res.status(statusCode).json(errorResponse);
}

/**
 * Async route wrapper to catch errors and pass to error middleware
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  AppError,
  formatErrorResponse,
  errorMiddleware,
  asyncHandler,
  ERROR_CODE_TO_HTTP_STATUS
};
