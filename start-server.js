#!/usr/bin/env node

/**
 * Simple server startup script for testing
 */

// Set environment variables for testing
process.env.LOG_LEVEL = 'info';

const WebSocketServer = require('./server/src/websocket-server');
const logger = require('./server/src/utils/logger');

const server = new WebSocketServer();

// Start the server
server.start();
server.startHeartbeat();

logger.info('SilentMode server started for testing');
logger.info('Press Ctrl+C to stop');

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down server...');
  server.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down server...');
  server.stop();
  process.exit(0);
});
