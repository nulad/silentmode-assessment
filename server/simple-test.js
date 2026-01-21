#!/usr/bin/env node

// Simple test to trigger download via WebSocket message

const WebSocket = require('ws');
const { MESSAGE_TYPES } = require('../shared/protocol');

console.log('Testing DOWNLOAD_ACK handling...\n');

const ws = new WebSocket('ws://localhost:8080');

ws.on('open', () => {
  console.log('✓ Connected to server');
  
  // Register as admin
  ws.send(JSON.stringify({
    type: MESSAGE_TYPES.REGISTER,
    clientId: 'admin-test',
    timestamp: new Date().toISOString()
  }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  
  if (message.type === MESSAGE_TYPES.REGISTER_ACK) {
    console.log('✓ Registered as admin-test');
    
    // Send a download request (this will trigger the server to send DOWNLOAD_REQUEST to test-client-1)
    console.log('\nSending download request for test-client-1...');
    ws.send(JSON.stringify({
      type: MESSAGE_TYPES.DOWNLOAD_REQUEST,
      clientId: 'test-client-1',
      filePath: '~/file_to_download.txt',
      requestId: 'test-req-001'
    }));
    
    console.log('✓ Download request sent');
    console.log('\n✓ Check server and client logs for DOWNLOAD_ACK flow:');
    console.log('  1. Server should send DOWNLOAD_REQUEST to test-client-1');
    console.log('  2. test-client-1 should respond with DOWNLOAD_ACK');
    console.log('  3. Server should process the DOWNLOAD_ACK');
    
    // Wait a bit then exit
    setTimeout(() => {
      console.log('\n✓ Test complete!');
      process.exit(0);
    }, 3000);
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
