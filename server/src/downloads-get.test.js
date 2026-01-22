const request = require('supertest');
const ExpressServer = require('../src/express-server');
const WebSocketServer = require('../src/websocket-server');

describe('GET /api/v1/downloads/:requestId', () => {
  let expressServer;
  let wsServer;
  let app;

  beforeAll(async () => {
    wsServer = new WebSocketServer();
    expressServer = new ExpressServer(wsServer);
    app = expressServer.app;
  });

  afterAll(async () => {
    if (expressServer) {
      await expressServer.stop();
    }
    if (wsServer) {
      wsServer.stop();
    }
  });

  test('should return 404 for non-existent download', async () => {
    const response = await request(app)
      .get('/api/v1/downloads/non-existent-id')
      .expect(404);

    expect(response.body).toEqual({
      success: false,
      error: 'Download not found'
    });
  });

  test('should return download status for existing download', async () => {
    // Create a test download
    const testRequestId = 'test-req-123';
    wsServer.downloadManager.createDownload('test-client', '/test/file.txt', testRequestId, 'requester-client');
    
    // Update download with test data
    wsServer.downloadManager.updateDownload(testRequestId, {
      status: 'in_progress',
      totalChunks: 100,
      chunksReceived: 45,
      progress: 45
    });

    const response = await request(app)
      .get(`/api/v1/downloads/${testRequestId}`)
      .expect(200);

    expect(response.body).toMatchObject({
      success: true,
      requestId: testRequestId,
      clientId: 'test-client',
      status: 'in_progress',
      progress: {
        chunksReceived: 45,
        totalChunks: 100,
        percentage: 45,
        bytesReceived: 45 * 1048576,
        retriedChunks: []
      }
    });
    expect(response.body).toHaveProperty('startedAt');
  });

  test('should include failed chunks in response', async () => {
    // Create a test download with failed chunks
    const testRequestId = 'test-req-failed';
    const downloadId = wsServer.downloadManager.createDownload('test-client', '/test/file.txt', testRequestId, 'requester-client');
    
    // Simulate failed chunk
    const download = wsServer.downloadManager.getDownload(testRequestId);
    download.failedChunks.set(5, {
      error: 'Checksum validation failed',
      timestamp: new Date(),
      attempts: 2,
      lastRetryAt: new Date()
    });

    const response = await request(app)
      .get(`/api/v1/downloads/${testRequestId}`)
      .expect(200);

    expect(response.body.progress.retriedChunks).toHaveLength(1);
    expect(response.body.progress.retriedChunks[0]).toMatchObject({
      chunkIndex: 5,
      attempts: 2,
      error: 'Checksum validation failed'
    });
    expect(response.body.progress.retriedChunks[0]).toHaveProperty('lastRetryAt');
  });

  test('should include completion details for completed downloads', async () => {
    // Create a completed download
    const testRequestId = 'test-req-completed';
    const completedAt = new Date();
    wsServer.downloadManager.createDownload('test-client', '/test/file.txt', testRequestId, 'requester-client');
    
    wsServer.downloadManager.updateDownload(testRequestId, {
      status: 'completed',
      totalChunks: 100,
      chunksReceived: 100,
      progress: 100,
      completedAt: completedAt,
      duration: 5000,
      finalFilePath: '/downloads/test-client-1234567890.txt',
      finalFileSize: 104857600
    });

    const response = await request(app)
      .get(`/api/v1/downloads/${testRequestId}`)
      .expect(200);

    expect(response.body).toMatchObject({
      success: true,
      requestId: testRequestId,
      status: 'completed',
      progress: {
        chunksReceived: 100,
        totalChunks: 100,
        percentage: 100,
        bytesReceived: 100 * 1048576,
        retriedChunks: []
      }
    });
    expect(response.body).toHaveProperty('completedAt');
    expect(response.body).toHaveProperty('duration', 5000);
    expect(response.body.completedAt).toBe(completedAt.toISOString());
  });

  test('should include error details for failed downloads', async () => {
    // Create a failed download
    const testRequestId = 'test-req-failed-download';
    wsServer.downloadManager.createDownload('test-client', '/test/file.txt', testRequestId, 'requester-client');
    
    wsServer.downloadManager.updateDownload(testRequestId, {
      status: 'failed',
      error: {
        code: 'DOWNLOAD_FAILED',
        message: 'Client disconnected'
      }
    });

    const response = await request(app)
      .get(`/api/v1/downloads/${testRequestId}`)
      .expect(200);

    expect(response.body).toMatchObject({
      success: true,
      requestId: testRequestId,
      status: 'failed',
      error: {
        code: 'DOWNLOAD_FAILED',
        message: 'Client disconnected'
      }
    });
  });
});
