const request = require('supertest');
const express = require('express');
const WebSocketServer = require('./server/src/websocket-server');
const ExpressServer = require('./server/src/express-server');

describe('DELETE /api/v1/downloads/:requestId', () => {
  let wsServer;
  let httpServer;
  let app;

  beforeAll(() => {
    wsServer = new WebSocketServer();
    httpServer = new ExpressServer(wsServer);
    app = httpServer.app;
  });

  test('should return 404 for non-existent download', async () => {
    const response = await request(app)
      .delete('/api/v1/downloads/non-existent-id')
      .expect(404);

    expect(response.body).toEqual({
      success: false,
      error: 'Download not found'
    });
  });

  test('should return 409 for completed download', async () => {
    // Create a completed download
    const requestId = 'test-completed-download';
    wsServer.downloadManager.createDownload('test-client', '/test/file.txt', requestId);
    wsServer.downloadManager.updateDownload(requestId, {
      status: 'completed',
      completedAt: new Date()
    });

    const response = await request(app)
      .delete(`/api/v1/downloads/${requestId}`)
      .expect(409);

    expect(response.body).toEqual({
      success: false,
      error: 'Cannot cancel completed download'
    });
  });

  test('should successfully cancel an in-progress download', async () => {
    // Create an in-progress download
    const requestId = 'test-in-progress-download';
    wsServer.downloadManager.createDownload('test-client', '/test/file.txt', requestId);
    wsServer.downloadManager.updateDownload(requestId, {
      status: 'in_progress',
      totalChunks: 10,
      chunksReceived: 5
    });

    const response = await request(app)
      .delete(`/api/v1/downloads/${requestId}`)
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      requestId: requestId,
      status: 'cancelled'
    });

    // Verify the download status is updated
    const download = wsServer.downloadManager.getDownload(requestId);
    expect(download.status).toBe('cancelled');
  });
});

// Run the tests if this file is executed directly
if (require.main === module) {
  console.log('Running DELETE API tests...\n');
  
  // Simple test runner
  const test = async () => {
    try {
      const wsServer = new WebSocketServer();
      const httpServer = new ExpressServer(wsServer);
      
      // Test 404 case
      console.log('Test 1: Non-existent download');
      const response1 = await request(httpServer.app)
        .delete('/api/v1/downloads/non-existent-id')
        .expect(404);
      console.log('✓ Passed:', response1.body);
      
      // Test 409 case
      console.log('\nTest 2: Completed download');
      const requestId2 = 'test-completed';
      wsServer.downloadManager.createDownload('client1', '/file.txt', requestId2);
      wsServer.downloadManager.updateDownload(requestId2, { status: 'completed' });
      
      const response2 = await request(httpServer.app)
        .delete(`/api/v1/downloads/${requestId2}`)
        .expect(409);
      console.log('✓ Passed:', response2.body);
      
      // Test successful cancellation
      console.log('\nTest 3: Cancel in-progress download');
      const requestId3 = 'test-in-progress';
      wsServer.downloadManager.createDownload('client2', '/file2.txt', requestId3);
      wsServer.downloadManager.updateDownload(requestId3, { status: 'in_progress' });
      
      const response3 = await request(httpServer.app)
        .delete(`/api/v1/downloads/${requestId3}`)
        .expect(200);
      console.log('✓ Passed:', response3.body);
      
      // Verify status
      const download = wsServer.downloadManager.getDownload(requestId3);
      console.log('\nDownload status after cancellation:', download.status);
      
      console.log('\n✅ All tests passed!');
      
    } catch (error) {
      console.error('❌ Test failed:', error);
      process.exit(1);
    }
  };
  
  test();
}
