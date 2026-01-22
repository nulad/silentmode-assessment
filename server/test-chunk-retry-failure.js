/**
 * Test for chunk retry failure handling
 * Verifies that downloads fail after MAX_CHUNK_RETRY_ATTEMPTS
 */

const WebSocket = require('ws');
const { MESSAGE_TYPES, ERROR_CODES } = require('../shared/protocol');

// Configuration
const WS_PORT = 8080;
const SERVER_URL = `ws://localhost:${WS_PORT}`;
const MAX_CHUNK_RETRY_ATTEMPTS = 3;

// Test configuration
const TEST_CONFIG = {
  clientId: 'test-client-retry-failure',
  filePath: 'test-retry-failure.txt',
  chunkIndex: 42,
  invalidChunkData: 'invalid-data-that-will-fail-checksum'
};

let testClient = null;
let requestId = null;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function connectToServer() {
  console.log('Connecting to server...');
  
  return new Promise((resolve, reject) => {
    testClient = new WebSocket(SERVER_URL);
    
    testClient.on('open', () => {
      console.log('Connected to server');
      resolve();
    });
    
    testClient.on('error', (error) => {
      console.error('Connection error:', error);
      reject(error);
    });
  });
}

async function registerClient() {
  console.log('Registering client...');
  
  return new Promise((resolve, reject) => {
    // Wait for the initial connection ACK first
    testClient.once('message', (data) => {
      const response = JSON.parse(data.toString());
      
      if (response.type === MESSAGE_TYPES.REGISTER_ACK) {
        console.log('Received connection ACK');
        
        // Now send the actual registration
        const message = {
          type: MESSAGE_TYPES.REGISTER,
          clientId: TEST_CONFIG.clientId
        };
        
        testClient.send(JSON.stringify(message));
        
        const timeout = setTimeout(() => {
          reject(new Error('Registration timeout'));
        }, 5000);
        
        testClient.once('message', (data) => {
          clearTimeout(timeout);
          const regResponse = JSON.parse(data.toString());
          
          if (regResponse.type === MESSAGE_TYPES.REGISTER_ACK && regResponse.success) {
            console.log('Client registered successfully');
            resolve();
          } else {
            reject(new Error('Registration failed'));
          }
        });
      } else {
        reject(new Error('Expected REGISTER_ACK on connection'));
      }
    });
  });
}

async function initiateDownload() {
  console.log('Initiating download...');
  
  return new Promise((resolve, reject) => {
    requestId = `test-req-${Date.now()}`;
    
    // Clear any pending messages first
    testClient.removeAllListeners('message');
    
    const message = {
      type: MESSAGE_TYPES.DOWNLOAD_REQUEST,
      clientId: TEST_CONFIG.clientId,
      filePath: TEST_CONFIG.filePath,
      requestId: requestId
    };
    
    testClient.send(JSON.stringify(message));
    
    const timeout = setTimeout(() => {
      testClient.removeAllListeners('message');
      reject(new Error('Download request timeout'));
    }, 5000);
    
    testClient.once('message', (data) => {
      clearTimeout(timeout);
      const response = JSON.parse(data.toString());
      
      if (response.type === MESSAGE_TYPES.DOWNLOAD_REQUEST) {
        console.log('Download request received');
        resolve();
      } else {
        reject(new Error('Unexpected response: ' + JSON.stringify(response)));
      }
    });
  });
}

async function sendDownloadAck() {
  console.log('Sending DOWNLOAD_ACK...');
  
  const message = {
    type: MESSAGE_TYPES.DOWNLOAD_ACK,
    requestId: requestId,
    success: true,
    fileSize: 1048576,
    totalChunks: 100,
    fileChecksum: 'abcd1234567890abcd1234567890abcd1234567890abcd1234567890abcd1234'
  };
  
  testClient.send(JSON.stringify(message));
  await sleep(100);
}

async function sendInvalidChunk() {
  console.log(`Sending invalid chunk ${TEST_CONFIG.chunkIndex}...`);
  
  const message = {
    type: MESSAGE_TYPES.FILE_CHUNK,
    requestId: requestId,
    chunkIndex: TEST_CONFIG.chunkIndex,
    totalChunks: 100,
    data: Buffer.from(TEST_CONFIG.invalidChunkData).toString('base64'),
    checksum: 'invalid-checksum'
  };
  
  testClient.send(JSON.stringify(message));
}

async function handleRetryChunk() {
  console.log('Waiting for RETRY_CHUNK messages...');
  
  let retryCount = 0;
  let errorReceived = false;
  
  return new Promise((resolve, reject) => {
    const messageHandler = (data) => {
      const message = JSON.parse(data.toString());
      
      // Skip PING messages
      if (message.type === MESSAGE_TYPES.PING) {
        testClient.send(JSON.stringify({
          type: MESSAGE_TYPES.PONG,
          timestamp: new Date().toISOString()
        }));
        return;
      }
      
      console.log('Received message:', message.type);
      
      if (message.type === MESSAGE_TYPES.ERROR && !errorReceived) {
        errorReceived = true;
        console.log('Error details:', message);
        
        if (message.code === ERROR_CODES.CHUNK_TRANSFER_FAILED) {
          console.log('✓ Received expected CHUNK_TRANSFER_FAILED error');
          console.log(`Error message: ${message.message}`);
          console.log(`Failed chunk index: ${message.details.chunkIndex}`);
          console.log(`Total attempts: ${message.details.attempts}`);
          
          testClient.removeListener('message', messageHandler);
          resolve({
            success: true,
            chunkIndex: message.details.chunkIndex,
            attempts: message.details.attempts
          });
        } else {
          testClient.removeListener('message', messageHandler);
          reject(new Error('Expected CHUNK_TRANSFER_FAILED error, got: ' + JSON.stringify(message)));
        }
      }
      else if (message.type === MESSAGE_TYPES.RETRY_CHUNK) {
        retryCount++;
        console.log(`Received RETRY_CHUNK #${retryCount} for chunk ${message.chunkIndex}, attempt ${message.attempt}`);
        
        if (retryCount < MAX_CHUNK_RETRY_ATTEMPTS) {
          // Send another invalid chunk
          setTimeout(() => sendInvalidChunk(), 100);
        } else {
          // Send one more invalid chunk to trigger the failure
          setTimeout(() => {
            console.log('Sending final invalid chunk to trigger failure...');
            sendInvalidChunk();
          }, 100);
        }
      }
      // Ignore other messages like FILE_CHUNK (they're echoed back by the server)
    };
    
    testClient.on('message', messageHandler);
    
    // Send first invalid chunk
    sendInvalidChunk();
    
    // Set a timeout in case we don't get the error
    setTimeout(() => {
      if (!errorReceived) {
        console.log('Timeout waiting for error message');
        testClient.removeListener('message', messageHandler);
        reject(new Error('Timeout waiting for CHUNK_TRANSFER_FAILED error'));
      }
    }, 10000);
  });
}

async function cleanup() {
  if (testClient && testClient.readyState === WebSocket.OPEN) {
    testClient.close();
    console.log('Test client closed');
  }
}

async function runTest() {
  try {
    console.log('=== Testing Chunk Retry Failure Handling ===\n');
    
    await connectToServer();
    await registerClient();
    await initiateDownload();
    await sendDownloadAck();
    
    const result = await handleRetryChunk();
    
    // Verify the results
    if (result.success && 
        result.chunkIndex === TEST_CONFIG.chunkIndex && 
        result.attempts === MAX_CHUNK_RETRY_ATTEMPTS) {
      console.log('\n✅ TEST PASSED: Download failed after max retry attempts');
      console.log(`   - Failed chunk index: ${result.chunkIndex}`);
      console.log(`   - Total attempts: ${result.attempts}`);
      process.exit(0);
    } else {
      console.log('\n❌ TEST FAILED: Unexpected result');
      console.log('   Result:', result);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await cleanup();
  }
}

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  cleanup().then(() => process.exit(1));
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  cleanup().then(() => process.exit(1));
});

// Run the test
runTest();
