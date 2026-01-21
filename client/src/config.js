import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import logger from './utils/logger.js';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });

// Validate required configuration (CLIENT_ID is optional when passed to constructor)
// if (!process.env.CLIENT_ID) {
//   logger.error('CLIENT_ID environment variable is required');
//   process.exit(1);
// }

// Configuration object with defaults
const config = {
  CLIENT_ID: process.env.CLIENT_ID,
  SERVER_WS_URL: process.env.SERVER_WS_URL || 'ws://localhost:8080',
  RECONNECT_INTERVAL: parseInt(process.env.RECONNECT_INTERVAL || '5000'),
  MAX_RECONNECT_ATTEMPTS: parseInt(process.env.MAX_RECONNECT_ATTEMPTS || '10'),
  HEARTBEAT_INTERVAL: parseInt(process.env.HEARTBEAT_INTERVAL || '30000'),
  LOG_LEVEL: process.env.LOG_LEVEL || 'info'
};

// Export frozen config object
export default Object.freeze(config);
