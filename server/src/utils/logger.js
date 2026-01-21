const winston = require('winston');
const path = require('path');

// Get log level from environment variable, default to 'info'
const logLevel = process.env.LOG_LEVEL || 'info';

// Custom format for console output
const customFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, component }) => {
    const componentStr = component ? `[${component}]` : '';
    return `${timestamp} [${level.toUpperCase()}] ${componentStr} ${message}`;
  })
);

// Create the logger instance
const logger = winston.createLogger({
  level: logLevel,
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp({
          format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.errors({ stack: true }),
        winston.format.printf(({ timestamp, level, message, component }) => {
          const componentStr = component ? `[${component}]` : '';
          return `${timestamp} [${level.toUpperCase()}] ${componentStr} ${message}`;
        }),
        winston.format.colorize({ level: true })
      )
    })
  ],
  // Handle uncaught exceptions and rejections
  exceptionHandlers: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp({
          format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.errors({ stack: true }),
        winston.format.printf(({ timestamp, level, message, component }) => {
          const componentStr = component ? `[${component}]` : '';
          return `${timestamp} [${level.toUpperCase()}] ${componentStr} ${message}`;
        }),
        winston.format.colorize({ level: true })
      )
    })
  ],
  rejectionHandlers: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp({
          format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.errors({ stack: true }),
        winston.format.printf(({ timestamp, level, message, component }) => {
          const componentStr = component ? `[${component}]` : '';
          return `${timestamp} [${level.toUpperCase()}] ${componentStr} ${message}`;
        }),
        winston.format.colorize({ level: true })
      )
    })
  ]
});

// Add JSON format for production if NODE_ENV is production
if (process.env.NODE_ENV === 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    )
  }));
}

// Create a child logger with a specific component name
const childLogger = (componentName) => {
  return {
    error: (message, meta) => logger.error(message, { component: componentName, ...meta }),
    warn: (message, meta) => logger.warn(message, { component: componentName, ...meta }),
    info: (message, meta) => logger.info(message, { component: componentName, ...meta }),
    debug: (message, meta) => logger.debug(message, { component: componentName, ...meta })
  };
};

// Export both the main logger and the child logger factory
module.exports = logger;
module.exports.child = childLogger;

// Also provide a more convenient way to create component-specific loggers
module.exports.createLogger = (componentName) => ({
  error: (message, meta) => logger.error(message, { component: componentName, ...meta }),
  warn: (message, meta) => logger.warn(message, { component: componentName, ...meta }),
  info: (message, meta) => logger.info(message, { component: componentName, ...meta }),
  debug: (message, meta) => logger.debug(message, { component: componentName, ...meta })
});
