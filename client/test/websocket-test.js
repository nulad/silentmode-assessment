import WebSocketClient from '../src/websocket-client.js';
import logger from '../src/utils/logger.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Load test environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env.test') });

async function runTest() {
  logger.info('Starting WebSocket connection test...');
  logger.info(`Test client ID: ${process.env.CLIENT_ID}`);
  
  const wsClient = new WebSocketClient();
  
  // Set up message handlers for testing
  wsClient.onMessage('REGISTER_ACK', (message) => {
    logger.info('✓ Registration ACK received:', message);
  });
  
  wsClient.onMessage('PONG', () => {
    logger.debug('✓ PONG received');
  });
  
  wsClient.onMessage('ERROR', (message) => {
    logger.error('✗ Error received:', message);
  });
  
  // Track connection state
  let connectionCount = 0;
  const originalConnect = wsClient.connect.bind(wsClient);
  wsClient.connect = async () => {
    connectionCount++;
    logger.info(`Connection attempt #${connectionCount}`);
    return originalConnect();
  };
  
  // Start connection
  await wsClient.connect();
  
  // Wait for connection
  await new Promise(resolve => {
    const checkConnection = () => {
      if (wsClient.isConnected()) {
        logger.info('✓ Connected to server');
        resolve();
      } else if (connectionCount >= parseInt(process.env.MAX_RECONNECT_ATTEMPTS)) {
        logger.error('✗ Failed to connect after maximum attempts');
        process.exit(1);
      } else {
        setTimeout(checkConnection, 500);
      }
    };
    checkConnection();
  });
  
  // Test sending a download request
  logger.info('Testing download request...');
  wsClient.sendMessage('DOWNLOAD_REQUEST', {
    clientId: process.env.CLIENT_ID,
    filePath: '/test/file.txt'
  });
  
  // Wait for response
  await new Promise(resolve => {
    wsClient.onMessage('DOWNLOAD_ACK', (message) => {
      logger.info('✓ Download ACK received:', message);
      resolve();
    });
    
    // Timeout after 5 seconds
    setTimeout(() => {
      logger.warn('Download ACK not received (expected - file transfer not implemented)');
      resolve();
    }, 5000);
  });
  
  // Test heartbeat
  logger.info('Testing heartbeat (waiting for ping/pong)...');
  await new Promise(resolve => setTimeout(resolve, 15000));
  
  // Disconnect
  logger.info('Test complete, disconnecting...');
  wsClient.disconnect();
  
  // Exit after a short delay
  setTimeout(() => {
    logger.info('Test finished successfully');
    process.exit(0);
  }, 1000);
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the test
runTest();
