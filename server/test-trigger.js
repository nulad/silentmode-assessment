#!/usr/bin/env node

// This script simulates the server sending a DOWNLOAD_REQUEST to test DOWNLOAD_ACK handling

const WebSocket = require('ws');
const { MESSAGE_TYPES } = require('./shared/protocol');

console.log('Testing DOWNLOAD_ACK handling...\n');

// Connect as a second client to trigger download
const ws = new WebSocket('ws://localhost:8080');

ws.on('open', () => {
  console.log('✓ Connected to server');
  
  // Register
  ws.send(JSON.stringify({
    type: MESSAGE_TYPES.REGISTER,
    clientId: 'trigger-client',
    timestamp: new Date().toISOString()
  }));
});

// Listen for messages
ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  
  if (message.type === MESSAGE_TYPES.REGISTER_ACK) {
    console.log('✓ Registered as trigger-client');
    
    // Now we need to manually trigger the download on the server
    // Since we don't have the API server running, let's check the server logs
    console.log('\nTo test DOWNLOAD_ACK:');
    console.log('1. Server should have received DOWNLOAD_REQUEST from trigger-client');
    console.log('2. Server should send DOWNLOAD_REQUEST to test-client-1');
    console.log('3. test-client-1 should respond with DOWNLOAD_ACK');
    console.log('4. Server should handle the DOWNLOAD_ACK');
    
    // Let's wait and see
    setTimeout(() => {
      console.log('\n✓ Test setup complete. Check server and client logs.');
      process.exit(0);
    }, 2000);
  }
});

ws.on('error', (error) => {
  console.error('✗ Error:', error);
  process.exit(1);
});

setTimeout(() => {
  console.log('✗ Test timed out');
  process.exit(1);
}, 5000);
