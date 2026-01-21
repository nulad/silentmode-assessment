import WebSocketClient from '../src/websocket-client.js';
import logger from '../src/utils/logger.js';

// Test the WebSocket client implementation
function testWebSocketClient() {
  logger.info('Testing WebSocket Client implementation...');
  
  // Create a new client instance
  const client = new WebSocketClient();
  
  // Set up event listeners to verify functionality
  client.on('open', () => {
    logger.info('✓ Client connected to server');
  });
  
  client.on('registerAck', (data) => {
    logger.info('✓ Received registration acknowledgment:', data);
  });
  
  client.on('message', (message) => {
    logger.info('✓ Message routed successfully:', message.type);
  });
  
  client.on('error', (error) => {
    logger.error('✗ Error occurred:', error.message);
  });
  
  client.on('close', ({ code, reason }) => {
    logger.info(`✓ Connection closed: ${code} - ${reason}`);
  });
  
  // Test connection status
  const status = client.getStatus();
  logger.info('✓ Initial status:', status);
  
  // Test sending message before connection (should warn)
  client.send({ type: 'TEST', data: {} });
  
  // Try to connect (will fail if server is not running)
  logger.info('Attempting to connect to server...');
  client.connect();
  
  // Test disconnect
  setTimeout(() => {
    client.disconnect();
    logger.info('✓ Disconnect called');
  }, 3000);
}

// Run the test
testWebSocketClient();
