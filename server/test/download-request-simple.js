const WebSocketServer = require('../src/websocket-server');
const DownloadManager = require('../src/download-manager');
const { MESSAGE_TYPES } = require('../../shared/protocol');

// Simple test to verify DOWNLOAD_REQUEST message creation
function testDownloadRequestMessage() {
  console.log('Testing DOWNLOAD_REQUEST message creation...\n');

  // Create mock WebSocket
  const mockWs = {
    readyState: 1, // WebSocket.OPEN
    send: function(data) {
      this.sentData = JSON.parse(data);
    }
  };

  // Create mock client
  const mockClient = {
    id: 'conn1',
    registeredId: 'test-client-123',
    ws: mockWs,
    ip: '127.0.0.1',
    connectedAt: new Date()
  };

  // Create WebSocket server and add mock client
  const wsServer = new WebSocketServer();
  wsServer.clients.set('conn1', mockClient);

  // Create download manager
  const downloadManager = new DownloadManager(wsServer);

  // Test 1: Create download request
  console.log('Test 1: Create download request');
  try {
    const download = downloadManager.createDownload('test-client-123', '/home/user/test-file.txt');
    console.log('✓ Download created successfully');
    console.log(`  Request ID: ${download.requestId}`);
    console.log(`  Client ID: ${download.clientId}`);
    console.log(`  File path: ${download.filePath}`);
    console.log(`  Status: ${download.status}`);
    console.log(`  Chunk size: ${download.chunkSize}`);
    console.log('');
  } catch (error) {
    console.error('✗ Failed to create download:', error.message);
    return false;
  }

  // Test 2: Verify sent message
  console.log('Test 2: Verify DOWNLOAD_REQUEST message');
  if (mockWs.sentData) {
    const message = mockWs.sentData;
    console.log('✓ Message sent to client');
    console.log(`  Type: ${message.type}`);
    console.log(`  Request ID: ${message.requestId}`);
    console.log(`  File path: ${message.filePath}`);
    console.log(`  Chunk size: ${message.chunkSize}`);
    console.log(`  Timestamp: ${message.timestamp}`);
    
    // Verify message structure
    if (message.type === MESSAGE_TYPES.DOWNLOAD_REQUEST &&
        message.requestId &&
        message.filePath === '/home/user/test-file.txt' &&
        message.chunkSize === 1048576 &&
        message.timestamp) {
      console.log('\n✅ Message structure is correct!');
    } else {
      console.log('\n✗ Message structure is invalid');
      return false;
    }
  } else {
    console.log('✗ No message sent');
    return false;
  }

  // Test 3: Client not found error
  console.log('\nTest 3: Client not found error');
  try {
    downloadManager.createDownload('nonexistent-client', '/test/file.txt');
    console.log('✗ Should have thrown error');
    return false;
  } catch (error) {
    console.log('✓ Correctly threw error:', error.message);
  }

  // Test 4: Get download info
  console.log('\nTest 4: Get download info');
  const downloads = downloadManager.getAllDownloads();
  if (downloads.length === 1) {
    const download = downloads[0];
    console.log('✓ Retrieved download from manager');
    console.log(`  Request ID: ${download.requestId}`);
    console.log(`  Status: ${download.status}`);
  } else {
    console.log('✗ Failed to retrieve download');
    return false;
  }

  console.log('\n✅ All tests passed!');
  return true;
}

// Run the test
if (require.main === module) {
  const success = testDownloadRequestMessage();
  process.exit(success ? 0 : 1);
}

module.exports = { testDownloadRequestMessage };
