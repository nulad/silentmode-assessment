import WebSocketClient from './websocket-client.js';
import config from './config.js';
import logger from './utils/logger.js';

const client = new WebSocketClient(config);

client.start().catch(error => {
  logger.error('Failed to start client:', error);
  process.exit(1);
});
