/**
 * End-to-end test for chunk retry logic with WebSocket server
 * This test simulates a client-server interaction with chunk failures and retries
 */

const WebSocket = require('./server/node_modules/ws');
const { chunkManager } = require('./server/src/chunk-manager');
const WebSocketServer = require('./server/src/websocket-server');
const { MESSAGE_TYPES, RETRY_REASONS } = require('./shared/protocol');

// Test configuration
const WS_PORT = 8081; // Use different port to avoid conflicts
const TEST_REQUEST_ID = 'e2e-test-' + Date.now();
const TEST_CLIENT_ID = 'test-client-1';
const TEST_FILE_PATH = '/test/file.txt';

console.log('🚀 Starting end-to-end chunk retry test...\n');

// Create a test server
const server = new WebSocketServer();
server.wss = new WebSocket.Server({ port: WS_PORT });

// Override the port in config
server.wss.on('connection', (ws, req) => {
  const clientId = server.generateClientId();
  const clientInfo = {
    id: clientId,
    ws: ws,
    ip: req.socket.remoteAddress,
    connectedAt: new Date(),
    lastHeartbeat: new Date()
  };

  server.clients.set(clientId, clientInfo);
  console.log(`📡 Test client connected: ${clientId}`);

  ws.on('message', (data) => {
    server.handleMessage(clientId, data);
  });

  ws.on('close', () => {
    server.handleClose(clientId, 1000, 'Test complete');
  });

  server.sendToClient(clientId, {
    type: MESSAGE_TYPES.REGISTER_ACK,
    success: true,
    message: 'Connected to test server'
  });
});

// Track events
const events = [];

// Set up event listeners
chunkManager.on('retryChunk', (event) => {
  events.push({ type: 'retryChunk', ...event, timestamp: new Date() });
  console.log(`🔄 Server triggered retry for chunk ${event.chunkIndex} (attempt ${event.attempt}/${event.maxRetries})`);
});

chunkManager.on('maxRetriesExceeded', (event) => {
  events.push({ type: 'maxRetriesExceeded', ...event, timestamp: new Date() });
  console.log(`❌ Server gave up on chunk ${event.chunkIndex} after ${event.attempts} attempts`);
});

// Create test client
const client = new WebSocket(`ws://localhost:${WS_PORT}`);

client.on('open', () => {
  console.log('✅ Client connected to server');
  
  // Register client
  client.send(JSON.stringify({
    type: MESSAGE_TYPES.REGISTER,
    clientId: TEST_CLIENT_ID
  }));
});

client.on('message', (data) => {
  const message = JSON.parse(data.toString());
  
  switch (message.type) {
    case MESSAGE_TYPES.REGISTER_ACK:
      console.log('✅ Client registered successfully');
      
      // Initiate download request
      client.send(JSON.stringify({
        type: MESSAGE_TYPES.DOWNLOAD_REQUEST,
        clientId: TEST_CLIENT_ID,
        filePath: TEST_FILE_PATH,
        requestId: TEST_REQUEST_ID
      }));
      break;
      
    case MESSAGE_TYPES.DOWNLOAD_REQUEST:
      console.log('📥 Received download request, simulating file with 3 chunks');
      
      // Simulate DOWNLOAD_ACK
      client.send(JSON.stringify({
        type: MESSAGE_TYPES.DOWNLOAD_ACK,
        requestId: TEST_REQUEST_ID,
        success: true,
        fileSize: 3 * 1024 * 1024, // 3MB
        totalChunks: 3,
        fileChecksum: 'abc123'
      }));
      break;
      
    case MESSAGE_TYPES.RETRY_CHUNK:
      console.log(`🔄 Received RETRY_CHUNK for chunk ${message.chunkIndex} (attempt ${message.attempt}) - Reason: ${message.reason}`);
      
      // Simulate retry response
      setTimeout(() => {
        if (message.chunkIndex === 1 && message.attempt < 3) {
          // Simulate failed retry
          console.log(`💥 Simulating failed retry for chunk ${message.chunkIndex}`);
          // In a real scenario, the server would detect this via timeout or checksum failure
        } else {
          // Simulate successful retry
          console.log(`✅ Simulating successful retry for chunk ${message.chunkIndex}`);
          client.send(JSON.stringify({
            type: MESSAGE_TYPES.FILE_CHUNK,
            requestId: TEST_REQUEST_ID,
            chunkIndex: message.chunkIndex,
            totalChunks: 3,
            data: Buffer.from('test data').toString('base64'),
            checksum: 'retry-checksum'
          }));
        }
      }, 100);
      break;
      
    default:
      console.log(`📨 Received message: ${message.type}`);
  }
});

// Simulate chunk failures
setTimeout(() => {
  console.log('\n💥 Simulating chunk failures...');
  
  // Mark chunk 1 as failed (checksum failure)
  chunkManager.markChunkFailed(TEST_REQUEST_ID, 1, RETRY_REASONS.CHECKSUM_FAILED);
  
  // Mark chunk 2 as failed (timeout)
  chunkManager.markChunkFailed(TEST_REQUEST_ID, 2, RETRY_REASONS.TIMEOUT);
}, 2000);

// Wait for test completion
setTimeout(() => {
  console.log('\n📊 Test Results:');
  
  // Get final retry statistics
  const retryInfo = chunkManager.getRetryInfo(TEST_REQUEST_ID);
  console.log(JSON.stringify(retryInfo, null, 2));
  
  console.log('\n📈 Event Timeline:');
  events.forEach((event, index) => {
    console.log(`   ${index + 1}. ${event.type} - Chunk: ${event.chunkIndex}, Time: ${event.timestamp.toISOString()}`);
  });
  
  // Cleanup
  console.log('\n🧹 Cleaning up...');
  chunkManager.cleanup(TEST_REQUEST_ID);
  client.close();
  server.wss.close();
  
  console.log('\n✅ End-to-end test completed!');
  process.exit(0);
}, 15000);
