#!/usr/bin/env node

/**
 * Simple server startup script for testing
 */

// Set environment variables for testing
process.env.LOG_LEVEL = 'info';

import WebSocketServer from './server/src/websocket-server.js';
import logger from './server/src/utils/logger.js';

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
