#!/usr/bin/env node

import WebSocket from 'ws';
import { MESSAGE_TYPES } from './shared/protocol.js';

console.log('Testing FILE_CHUNK implementation...');

// Connect to server
const ws = new WebSocket('ws://localhost:8082');

ws.on('open', () => {
  console.log('Connected to server');
  
  // Register as test-client-001
  ws.send(JSON.stringify({
    type: MESSAGE_TYPES.REGISTER,
    clientId: 'test-client-001',
    timestamp: new Date().toISOString()
  }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  console.log('Received message type:', message.type);
  
  if (message.type === MESSAGE_TYPES.DOWNLOAD_REQUEST) {
    console.log('Received DOWNLOAD_REQUEST:', message);
    
    // Send DOWNLOAD_ACK
    ws.send(JSON.stringify({
      type: MESSAGE_TYPES.DOWNLOAD_ACK,
      requestId: message.requestId,
      success: true,
      fileSize: 1024,
      totalChunks: 1,
      fileChecksum: 'abc123',
      timestamp: new Date().toISOString()
    }));
    
    // Send FILE_CHUNK
    const testData = Buffer.from('Hello, World!').toString('base64');
    ws.send(JSON.stringify({
      type: MESSAGE_TYPES.FILE_CHUNK,
      requestId: message.requestId,
      chunkIndex: 0,
      totalChunks: 1,
      data: testData,
      checksum: 'checksum123',
      size: testData.length,
      timestamp: new Date().toISOString()
    }));
    
    // Send DOWNLOAD_COMPLETE
    ws.send(JSON.stringify({
      type: MESSAGE_TYPES.DOWNLOAD_COMPLETE,
      requestId: message.requestId,
      success: true,
      message: 'Test transfer completed',
      timestamp: new Date().toISOString()
    }));
    
    console.log('Sent all messages, closing...');
    setTimeout(() => ws.close(), 1000);
  }
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});

ws.on('close', () => {
  console.log('Disconnected from server');
  process.exit(0);
});

// Timeout after 10 seconds
setTimeout(() => {
  console.log('Test timeout');
  ws.close();
  process.exit(1);
}, 10000);
