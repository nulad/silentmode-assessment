require('dotenv').config();
const logger = require('./utils/logger');
const path = require('path');
const fs = require('fs');

// Default configuration values
const defaults = {
  PORT: 3000,
  WS_PORT: 8080,
  DOWNLOAD_DIR: './downloads',
  CHUNK_SIZE: 1048576,
  MAX_CHUNK_RETRY_ATTEMPTS: 3,
  CHUNK_RETRY_DELAY: 1000,
  HEARTBEAT_INTERVAL: 30000,
  DOWNLOAD_TIMEOUT: 300000,
  LOG_LEVEL: 'info',
};

// Validation functions for numeric values
const validateNumber = (key, value, defaultValue) => {
  const num = parseInt(value, 10);
  if (isNaN(num) || num < 0) {
    logger.warn(`Invalid ${key}: ${value}. Using default: ${defaultValue}`);
    return defaultValue;
  }
  return num;
};

// Load and validate configuration
const config = {
  PORT: validateNumber('PORT', process.env.PORT || defaults.PORT, defaults.PORT),
  WS_PORT: validateNumber('WS_PORT', process.env.WS_PORT || defaults.WS_PORT, defaults.WS_PORT),
  DOWNLOAD_DIR: process.env.DOWNLOAD_DIR || defaults.DOWNLOAD_DIR,
  CHUNK_SIZE: validateNumber('CHUNK_SIZE', process.env.CHUNK_SIZE || defaults.CHUNK_SIZE, defaults.CHUNK_SIZE),
  MAX_CHUNK_RETRY_ATTEMPTS: validateNumber('MAX_CHUNK_RETRY_ATTEMPTS', process.env.MAX_CHUNK_RETRY_ATTEMPTS || defaults.MAX_CHUNK_RETRY_ATTEMPTS, defaults.MAX_CHUNK_RETRY_ATTEMPTS),
  CHUNK_RETRY_DELAY: validateNumber('CHUNK_RETRY_DELAY', process.env.CHUNK_RETRY_DELAY || defaults.CHUNK_RETRY_DELAY, defaults.CHUNK_RETRY_DELAY),
  HEARTBEAT_INTERVAL: validateNumber('HEARTBEAT_INTERVAL', process.env.HEARTBEAT_INTERVAL || defaults.HEARTBEAT_INTERVAL, defaults.HEARTBEAT_INTERVAL),
  DOWNLOAD_TIMEOUT: validateNumber('DOWNLOAD_TIMEOUT', process.env.DOWNLOAD_TIMEOUT || defaults.DOWNLOAD_TIMEOUT, defaults.DOWNLOAD_TIMEOUT),
  LOG_LEVEL: process.env.LOG_LEVEL || defaults.LOG_LEVEL,
};

// Ensure download directory exists
const downloadDir = path.resolve(config.DOWNLOAD_DIR);
if (!fs.existsSync(downloadDir)) {
  logger.info(`Creating download directory: ${downloadDir}`);
  fs.mkdirSync(downloadDir, { recursive: true });
}

// Ensure logs directory exists
const logsDir = path.resolve('logs');
if (!fs.existsSync(logsDir)) {
  logger.info(`Creating logs directory: ${logsDir}`);
  fs.mkdirSync(logsDir, { recursive: true });
}

// Freeze the config object to prevent runtime modifications
const frozenConfig = Object.freeze(config);
module.exports = frozenConfig;
