import dotenv from 'dotenv';

dotenv.config();

const config = {
  CLIENT_ID: process.env.CLIENT_ID,
  SERVER_URL: process.env.SERVER_URL || 'http://localhost:8080',
  RECONNECT_INTERVAL: parseInt(process.env.RECONNECT_INTERVAL) || 5000,
  MAX_RECONNECT_ATTEMPTS: parseInt(process.env.MAX_RECONNECT_ATTEMPTS) || 10,
  HEARTBEAT_INTERVAL: parseInt(process.env.HEARTBEAT_INTERVAL) || 30000,
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
};

if (!config.CLIENT_ID) {
  console.error('CLIENT_ID is required');
  process.exit(1);
}

export default Object.freeze(config);
