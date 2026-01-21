const path = require('path');
const { createRequire } = require('module');

// Set environment variables for the test
process.env.CLIENT_ID = 'test-client';
process.env.SERVER_WS_URL = 'ws://localhost:8080';

// Create a require function that can load ES modules
const clientRequire = createRequire(path.resolve('../client/package.json'));

// Import client using dynamic import for ES module
async function loadClient() {
  const WebSocketClient = await import('../client/src/websocket-client.js');
  return WebSocketClient.default;
}

const WebSocketServer = require('../server/src/websocket-server');
const logger = require('../server/src/utils/logger');

async function testRegistration() {
  console.log('=== Testing Client Registration Protocol ===\n');
  
  // Load client module
  const WebSocketClient = await loadClient();
  
  // Start server
  const server = new WebSocketServer();
  server.start();
  
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 100));
  
  try {
    // Test 1: Successful registration
    console.log('Test 1: Successful registration');
    const client1 = new WebSocketClient('test-client-1');
    await client1.connect();
    
    // Wait for registration
    await new Promise(resolve => setTimeout(resolve, 100));
    
    if (client1.registered) {
      console.log('✓ Client 1 registered successfully\n');
    } else {
      console.log('✗ Client 1 registration failed\n');
    }
    
    // Test 2: Duplicate clientId rejection
    console.log('Test 2: Duplicate clientId rejection');
    const client2 = new WebSocketClient('test-client-1'); // Same ID
    await client2.connect();
    
    // Wait for registration attempt
    await new Promise(resolve => setTimeout(resolve, 100));
    
    if (!client2.registered) {
      console.log('✓ Client 2 correctly rejected for duplicate ID\n');
    } else {
      console.log('✗ Client 2 should have been rejected\n');
    }
    
    // Test 3: Different clientId successful registration
    console.log('Test 3: Different clientId successful registration');
    const client3 = new WebSocketClient('test-client-3');
    await client3.connect();
    
    // Wait for registration
    await new Promise(resolve => setTimeout(resolve, 100));
    
    if (client3.registered) {
      console.log('✓ Client 3 registered successfully\n');
    } else {
      console.log('✗ Client 3 registration failed\n');
    }
    
    // Show connected clients
    const connectedClients = server.getConnectedClients();
    console.log('Connected clients:', connectedClients.length);
    connectedClients.forEach(client => {
      console.log(`  - ${client.registeredId || client.id} (${client.ip})`);
    });
    
    // Cleanup
    client1.disconnect();
    client2.disconnect();
    client3.disconnect();
    
  } catch (error) {
    console.error('Test error:', error);
  } finally {
    // Stop server
    server.stop();
    process.exit(0);
  }
}

// Run test
testRegistration();
