const request = require('supertest');
const express = require('express');
const WebSocket = require('ws');
const http = require('http');

// Import server components
const ExpressServer = require('./server/src/express-server');
const WebSocketServer = require('./server/src/websocket-server');
const DownloadManager = require('./server/src/download-manager');

// Create a test server
async function createTestServer() {
  const wsServer = new WebSocketServer();
  await wsServer.start();
  const expressServer = new ExpressServer(wsServer);
  await expressServer.start();
  
  return { wsServer, expressServer, app: expressServer.app };
}

describe('DELETE /api/v1/downloads/:requestId', () => {
  let wsServer, expressServer, app;
  let testClient;
  let downloadId;
  
  beforeAll(async () => {
    // Create test server
    const server = await createTestServer();
    wsServer = server.wsServer;
    expressServer = server.expressServer;
    app = server.app;
    
    // Create a test WebSocket client
    testClient = new WebSocket('ws://localhost:8080');
    
    await new Promise((resolve) => {
      testClient.on('open', () => {
        // Register the client
        testClient.send(JSON.stringify({
          type: 'REGISTER',
          clientId: 'test-client-123'
        }));
      });
      
      testClient.on('message', (data) => {
        const message = JSON.parse(data);
        if (message.type === 'REGISTER_ACK') {
          resolve();
        }
      });
    });
  });
  
  afterAll(async () => {
    if (testClient) {
      testClient.close();
    }
    if (expressServer) {
      await expressServer.stop();
    }
    if (wsServer) {
      await wsServer.stop();
    }
  });
  
  beforeEach(async () => {
    // Create a test download
    downloadId = wsServer.downloadManager.createDownload(
      'test-client-123',
      '/test/file.txt',
      null,
      'requester-client-456'
    );
    
    // Update to in_progress status
    wsServer.downloadManager.updateDownload(downloadId, {
      status: 'in_progress',
      totalChunks: 10,
      chunksReceived: 5
    });
  });
  
  afterEach(() => {
    // Clean up the download
    wsServer.downloadManager.downloads.delete(downloadId);
  });
  
  test('should cancel an in-progress download', async () => {
    const response = await request(app)
      .delete(`/api/v1/downloads/${downloadId}`)
      .expect(200);
    
    expect(response.body).toEqual({
      success: true,
      requestId: downloadId,
      status: 'cancelled'
    });
    
    // Verify download status is updated
    const download = wsServer.downloadManager.getDownload(downloadId);
    expect(download.status).toBe('cancelled');
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
    // Mark download as completed
    wsServer.downloadManager.updateDownload(downloadId, {
      status: 'completed'
    });
    
    const response = await request(app)
      .delete(`/api/v1/downloads/${downloadId}`)
      .expect(409);
    
    expect(response.body).toEqual({
      success: false,
      error: 'Cannot cancel completed download'
    });
  });
  
  test('should send CANCEL_DOWNLOAD message to client', async () => {
    let messageReceived = null;
    
    testClient.on('message', (data) => {
      const message = JSON.parse(data);
      if (message.type === 'CANCEL_DOWNLOAD') {
        messageReceived = message;
      }
    });
    
    await request(app)
      .delete(`/api/v1/downloads/${downloadId}`)
      .expect(200);
    
    // Wait a bit for message to be received
    await new Promise(resolve => setTimeout(resolve, 100));
    
    expect(messageReceived).toEqual({
      type: 'CANCEL_DOWNLOAD',
      requestId: downloadId
    });
  });
});

// Run tests if called directly
if (require.main === module) {
  console.log('Running DELETE download endpoint tests...');
  
  // Simple test runner
  const testServer = async () => {
    try {
      const { wsServer, expressServer, app } = await createTestServer();
      
      // Create a test download
      const downloadId = wsServer.downloadManager.createDownload(
        'test-client-123',
        '/test/file.txt'
      );
      
      wsServer.downloadManager.updateDownload(downloadId, {
        status: 'in_progress',
        totalChunks: 10,
        chunksReceived: 5
      });
      
      console.log(`Created test download: ${downloadId}`);
      
      // Test DELETE endpoint
      const response = await request(app)
        .delete(`/api/v1/downloads/${downloadId}`);
      
      console.log('DELETE Response:', response.body);
      
      // Verify status
      const download = wsServer.downloadManager.getDownload(downloadId);
      console.log('Download status after DELETE:', download.status);
      
      // Test 404 case
      const notFoundResponse = await request(app)
        .delete('/api/v1/downloads/non-existent');
      
      console.log('404 Response:', notFoundResponse.body);
      
      // Cleanup
      await expressServer.stop();
      await wsServer.stop();
      
      console.log('Tests completed successfully!');
    } catch (error) {
      console.error('Test failed:', error);
      process.exit(1);
    }
  };
  
  testServer();
}
