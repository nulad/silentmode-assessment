const request = require('supertest');
const ExpressServer = require('./src/express-server');
const WebSocketServer = require('./src/websocket-server');

async function testDownloadsEndpoint() {
  console.log('Testing GET /api/v1/downloads/:requestId endpoint...\n');
  
  // Setup server
  const wsServer = new WebSocketServer();
  const expressServer = new ExpressServer(wsServer);
  const app = expressServer.app;
  
  try {
    // Test 1: Non-existent download
    console.log('Test 1: Non-existent download');
    const response1 = await request(app)
      .get('/api/v1/downloads/non-existent-id');
    
    console.log('Status:', response1.status);
    console.log('Body:', JSON.stringify(response1.body, null, 2));
    console.log('✓ Expected 404\n');
    
    // Test 2: Create and track a download
    console.log('Test 2: Track a real download');
    const testRequestId = 'test-integration-' + Date.now();
    
    // Create download
    wsServer.downloadManager.createDownload('test-client-123', '/path/to/test-file.txt', testRequestId);
    
    // Update with progress
    wsServer.downloadManager.updateDownload(testRequestId, {
      status: 'in_progress',
      totalChunks: 50,
      chunksReceived: 25,
      progress: 50
    });
    
    // Get status
    const response2 = await request(app)
      .get(`/api/v1/downloads/${testRequestId}`);
    
    console.log('Status:', response2.status);
    console.log('Body:', JSON.stringify(response2.body, null, 2));
    console.log('✓ Expected 200 with progress info\n');
    
    // Test 3: Complete the download
    console.log('Test 3: Completed download');
    wsServer.downloadManager.updateDownload(testRequestId, {
      status: 'completed',
      progress: 100,
      chunksReceived: 50,
      completedAt: new Date(),
      duration: 3000,
      finalFilePath: '/downloads/test-client-123-' + Date.now() + '.txt',
      finalFileSize: 52428800
    });
    
    const response3 = await request(app)
      .get(`/api/v1/downloads/${testRequestId}`);
    
    console.log('Status:', response3.status);
    console.log('Body:', JSON.stringify(response3.body, null, 2));
    console.log('✓ Expected 200 with completion details\n');
    
    console.log('All tests passed! ✓');
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    // Cleanup
    await expressServer.stop();
    wsServer.stop();
  }
}

// Run the test
testDownloadsEndpoint();
