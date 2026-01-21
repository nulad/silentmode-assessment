const winston = require('winston');

// Try to load config, but don't fail if it doesn't exist yet
let config;
try {
  config = require('../../config');
} catch (e) {
  config = null;
}

// Create the logger format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.printf(({ timestamp, level, message, component = 'APP' }) => {
    return `[${timestamp}] [${level.toUpperCase()}] [${component}] ${message}`;
  })
);

// Create colorized format for development
const colorizedFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, component = 'APP' }) => {
    return `[${timestamp}] [${level}] [${component}] ${message}`;
  })
);

// Determine if we should use JSON format (for production)
const useJsonFormat = process.env.NODE_ENV === 'production';
const useColorizedFormat = process.env.NODE_ENV !== 'production' && process.env.NO_COLOR !== '1';

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || config?.logging?.level || 'info',
  format: useJsonFormat ? winston.format.json() : logFormat,
  transports: [
    new winston.transports.Console({
      format: useColorizedFormat ? colorizedFormat : (useJsonFormat ? winston.format.json() : logFormat)
    })
  ],
  // Handle uncaught exceptions and rejections
  exceptionHandlers: [
    new winston.transports.Console({
      format: useColorizedFormat ? colorizedFormat : (useJsonFormat ? winston.format.json() : logFormat)
    })
  ],
  rejectionHandlers: [
    new winston.transports.Console({
      format: useColorizedFormat ? colorizedFormat : (useJsonFormat ? winston.format.json() : logFormat)
    })
  ]
});

// Create a factory function for component-specific loggers
const createLogger = (component) => {
  return {
    error: (message, ...args) => logger.error(message, { component }, ...args),
    warn: (message, ...args) => logger.warn(message, { component }, ...args),
    info: (message, ...args) => logger.info(message, { component }, ...args),
    debug: (message, ...args) => logger.debug(message, { component }, ...args),
    log: (level, message, ...args) => logger.log(level, message, { component }, ...args)
  };
};

// Export the default logger and the factory function
module.exports = logger;
module.exports.createLogger = createLogger;
