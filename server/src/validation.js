const { body, param, validationResult } = require('express-validator');

// Validation rules
const clientIdValidation = body('clientId')
  .isLength({ min: 1, max: 64 })
  .matches(/^[a-zA-Z0-9-]+$/, { message: 'ClientId must contain only alphanumeric characters and hyphens' });

const filePathValidation = body('filePath')
  .isLength({ min: 1 })
  .matches(/^\/.*$/, { message: 'FilePath must be an absolute path' })
  .not().contains('..', { message: 'FilePath cannot contain directory traversal (..)' });

const requestIdParamValidation = param('requestId')
  .isUUID(4, { message: 'RequestId must be a valid UUID v4' })
  .withMessage('RequestId must be a valid UUID v4');

const requestIdBodyValidation = body('requestId')
  .isUUID(4, { message: 'RequestId must be a valid UUID v4' });

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_REQUEST',
      details: errors.array().map(err => ({
        field: err.path || err.param,
        message: err.msg,
        value: err.value
      }))
    });
  }
  next();
};

// Validation chains for different endpoints
const validateDownloadRequest = [
  clientIdValidation,
  filePathValidation,
  requestIdBodyValidation,
  handleValidationErrors
];

const validateGetDownload = [
  requestIdParamValidation,
  handleValidationErrors
];

const validateDeleteDownload = [
  requestIdParamValidation,
  handleValidationErrors
];

module.exports = {
  validateDownloadRequest,
  validateGetDownload,
  validateDeleteDownload,
  handleValidationErrors
};
