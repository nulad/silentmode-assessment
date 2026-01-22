const request = require('supertest');
const express = require('express');
const WebSocketServer = require('./server/src/websocket-server');
const ExpressServer = require('./server/src/express-server');

describe('DELETE /api/v1/downloads/:requestId', () => {
  let app;
  let wsServer;
  let expressServer;

  beforeEach(() => {
    wsServer = new WebSocketServer();
    expressServer = new ExpressServer(wsServer);
    app = expressServer.app;
  });

  afterEach(async () => {
    if (wsServer) {
      wsServer.stop();
    }
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

  test('should return 409 for failed download', async () => {
    // Create a failed download
    const requestId = 'test-failed-download';
    wsServer.downloadManager.createDownload('test-client', '/test/file.txt', requestId);
    wsServer.downloadManager.updateDownload(requestId, {
      status: 'failed',
      error: { message: 'Test error' }
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
    expect(download.error.code).toBe('DOWNLOAD_CANCELLED');
    expect(download.error.message).toBe('Download cancelled by API request');
  });

  test('should clean up temp files when cancelling', async () => {
    const fs = require('fs');
    const path = require('path');

    // Create a download with temp file
    const requestId = 'test-with-temp-file';
    wsServer.downloadManager.createDownload('test-client', '/test/file.txt', requestId);
    
    const download = wsServer.downloadManager.getDownload(requestId);
    
    // Create a fake temp file
    if (!fs.existsSync(download.tempFilePath)) {
      fs.writeFileSync(download.tempFilePath, 'test data');
    }

    // Verify temp file exists
    expect(fs.existsSync(download.tempFilePath)).toBe(true);

    // Cancel the download
    await request(app)
      .delete(`/api/v1/downloads/${requestId}`)
      .expect(200);

    // Verify temp file is cleaned up
    expect(fs.existsSync(download.tempFilePath)).toBe(false);
  });
});

// Run tests if this file is executed directly
if (require.main === module) {
  console.log('Running DELETE /api/v1/downloads/:requestId endpoint tests...');
  
  // Simple test runner
  const testCases = [
    {
      name: '404 for non-existent download',
      test: async () => {
        const wsServer = new WebSocketServer();
        const expressServer = new ExpressServer(wsServer);
        
        const response = await request(expressServer.app)
          .delete('/api/v1/downloads/non-existent-id')
          .expect(404);
        
        console.log('✓', test.name);
        wsServer.stop();
      }
    },
    {
      name: 'Cancel in-progress download',
      test: async () => {
        const wsServer = new WebSocketServer();
        const expressServer = new ExpressServer(wsServer);
        
        const requestId = 'test-download';
        wsServer.downloadManager.createDownload('test-client', '/test/file.txt', requestId);
        wsServer.downloadManager.updateDownload(requestId, { status: 'in_progress' });
        
        const response = await request(expressServer.app)
          .delete(`/api/v1/downloads/${requestId}`)
          .expect(200);
        
        console.log('Response:', response.body);
        
        const download = wsServer.downloadManager.getDownload(requestId);
        console.log('Download status:', download.status);
        
        console.log('✓', test.name);
        wsServer.stop();
      }
    }
  ];
  
  (async () => {
    for (const testCase of testCases) {
      try {
        await testCase.test();
      } catch (error) {
        console.error('✗', testCase.name, error.message);
      }
    }
    console.log('Tests completed');
    process.exit(0);
  })();
}
