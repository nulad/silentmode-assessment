#!/usr/bin/env node

/**
 * Test script to verify client registration protocol
 * Tests both successful registration and duplicate clientId rejection
 */

// Set environment variables for testing
process.env.CLIENT_ID = 'test-client';
process.env.LOG_LEVEL = 'info';

import WebSocketClient from './client/src/websocket-client.js';

// Use createRequire for config
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const config = require('./server/src/config.js');

async function testRegistration() {
  console.log('=== Testing Client Registration Protocol ===\n');
  
  // Test 1: Successful registration
  console.log('Test 1: Successful registration with unique clientId');
  const client1 = new WebSocketClient('test-client-001');
  
  try {
    await client1.connect();
    await new Promise(resolve => setTimeout(resolve, 100)); // Wait for registration
    
    if (client1.registered) {
      console.log('✓ Client 1 registered successfully\n');
    } else {
      console.log('✗ Client 1 registration failed\n');
    }
  } catch (error) {
    console.error('✗ Client 1 connection failed:', error.message, '\n');
  }
  
  // Test 2: Duplicate clientId should be rejected
  console.log('Test 2: Duplicate clientId registration should be rejected');
  const client2 = new WebSocketClient('test-client-001'); // Same clientId as client1
  
  try {
    await client2.connect();
    await new Promise(resolve => setTimeout(resolve, 100)); // Wait for registration response
    
    if (!client2.registered) {
      console.log('✓ Duplicate clientId correctly rejected\n');
    } else {
      console.log('✗ Duplicate clientId was incorrectly accepted\n');
    }
  } catch (error) {
    console.error('✗ Client 2 connection failed:', error.message, '\n');
  }
  
  // Test 3: Different clientId should succeed
  console.log('Test 3: Different clientId should register successfully');
  const client3 = new WebSocketClient('test-client-002');
  
  try {
    await client3.connect();
    await new Promise(resolve => setTimeout(resolve, 100)); // Wait for registration
    
    if (client3.registered) {
      console.log('✓ Client 3 with different clientId registered successfully\n');
    } else {
      console.log('✗ Client 3 registration failed\n');
    }
  } catch (error) {
    console.error('✗ Client 3 connection failed:', error.message, '\n');
  }
  
  // Cleanup
  console.log('Cleaning up connections...');
  client1.disconnect();
  client2.disconnect();
  client3.disconnect();
  
  setTimeout(() => {
    console.log('\n=== Test Complete ===');
    process.exit(0);
  }, 500);
}

// Check if server is running
async function checkServer() {
  return new Promise((resolve) => {
    const WebSocket = require('ws');
    const testWs = new WebSocket(`ws://${config.SERVER_HOST}:${config.WS_PORT}`);
    
    testWs.on('open', () => {
      testWs.close();
      resolve(true);
    });
    
    testWs.on('error', () => {
      resolve(false);
    });
  });
}

async function main() {
  const serverRunning = await checkServer();
  
  if (!serverRunning) {
    console.error(`Error: Server is not running on ${config.SERVER_HOST}:${config.WS_PORT}`);
    console.log('Please start the server first: npm run dev');
    process.exit(1);
  }
  
  await testRegistration();
}

main().catch(console.error);
