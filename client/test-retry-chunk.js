import WebSocketClient from './src/websocket-client.js';
import { MESSAGE_TYPES } from '../shared/protocol.js';

const mockConfig = {
  CLIENT_ID: 'test-client',
  SERVER_WS_URL: 'ws://localhost:8080',
  MAX_RECONNECT_ATTEMPTS: 3,
  RECONNECT_INTERVAL: 1000
};

async function testRetryChunk() {
  console.log('Testing retry chunk functionality...\n');
  
  const client = new WebSocketClient(mockConfig);
  
  // Simulate an active download
  const testRequestId = 'test-request-123';
  const testFilePath = './data/file_to_download.txt';
  
  client.activeDownloads.set(testRequestId, {
    filePath: testFilePath,
    totalChunks: 5,
    fileChecksum: 'test-checksum'
  });
  
  console.log('✓ Added test download to activeDownloads map');
  console.log(`  Request ID: ${testRequestId}`);
  console.log(`  File Path: ${testFilePath}`);
  console.log(`  Total Chunks: 5\n`);
  
  // Mock the send method to capture output
  const sentMessages = [];
  client.send = function(message) {
    sentMessages.push(message);
    console.log('📤 Message sent:', JSON.stringify(message, null, 2));
  };
  
  // Test 1: Valid retry request
  console.log('Test 1: Valid retry request for chunk 2');
  const retryMessage = {
    type: MESSAGE_TYPES.RETRY_CHUNK,
    requestId: testRequestId,
    chunkIndex: 2,
    attempt: 1,
    reason: 'CHECKSUM_FAILED',
    timestamp: new Date().toISOString()
  };
  
  try {
    await client.handleRetryChunk(retryMessage);
    
    if (sentMessages.length > 0) {
      const lastMessage = sentMessages[sentMessages.length - 1];
      if (lastMessage.type === MESSAGE_TYPES.FILE_CHUNK && lastMessage.chunkIndex === 2) {
        console.log('✓ Test 1 PASSED: Chunk 2 was re-sent successfully\n');
      } else {
        console.log('✗ Test 1 FAILED: Expected FILE_CHUNK message\n');
      }
    }
  } catch (error) {
    console.log('✗ Test 1 FAILED:', error.message, '\n');
  }
  
  // Test 2: Invalid chunk index
  console.log('Test 2: Invalid chunk index (out of range)');
  sentMessages.length = 0;
  
  const invalidRetryMessage = {
    type: MESSAGE_TYPES.RETRY_CHUNK,
    requestId: testRequestId,
    chunkIndex: 10,
    attempt: 1,
    reason: 'CHECKSUM_FAILED',
    timestamp: new Date().toISOString()
  };
  
  try {
    await client.handleRetryChunk(invalidRetryMessage);
    
    if (sentMessages.length === 0) {
      console.log('✓ Test 2 PASSED: Invalid chunk index was rejected\n');
    } else {
      console.log('✗ Test 2 FAILED: Should not send message for invalid chunk\n');
    }
  } catch (error) {
    console.log('✗ Test 2 FAILED:', error.message, '\n');
  }
  
  // Test 3: Unknown request ID
  console.log('Test 3: Unknown request ID');
  sentMessages.length = 0;
  
  const unknownRetryMessage = {
    type: MESSAGE_TYPES.RETRY_CHUNK,
    requestId: 'unknown-request',
    chunkIndex: 1,
    attempt: 1,
    reason: 'CHECKSUM_FAILED',
    timestamp: new Date().toISOString()
  };
  
  try {
    await client.handleRetryChunk(unknownRetryMessage);
    
    if (sentMessages.length === 0) {
      console.log('✓ Test 3 PASSED: Unknown request ID was rejected\n');
    } else {
      console.log('✗ Test 3 FAILED: Should not send message for unknown request\n');
    }
  } catch (error) {
    console.log('✗ Test 3 FAILED:', error.message, '\n');
  }
  
  console.log('All tests completed!');
}

testRetryChunk().catch(console.error);
