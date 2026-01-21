const WebSocket = require('ws');
const WebSocketServer = require('./websocket-server');
const config = require('./config');

async function runIntegrationTest() {
  console.log('Starting WebSocket server integration test...');
  
  // Start server
  const server = new WebSocketServer();
  server.start();
  
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Create client connection
  const ws = new WebSocket(`ws://localhost:${config.WS_PORT}`);
  
  ws.on('open', () => {
    console.log('✓ Client connected to server');
    
    // Send a ping
    ws.send(JSON.stringify({ type: 'PING' }));
  });
  
  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    console.log('✓ Received message:', message);
    
    if (message.type === 'PONG') {
      console.log('✓ Ping/Pong working correctly');
      ws.close();
    }
  });
  
  ws.on('close', () => {
    console.log('✓ Client disconnected');
    server.stop();
    console.log('✓ Integration test completed successfully');
  });
  
  ws.on('error', (error) => {
    console.error('✗ Client error:', error);
    server.stop();
  });
}

// Run test if this file is executed directly
if (require.main === module) {
  runIntegrationTest().catch(console.error);
}

module.exports = runIntegrationTest;
