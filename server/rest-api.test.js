const request = require('supertest');
const ExpressServer = require('./src/express-server');
const WebSocketServer = require('./src/websocket-server');
const DownloadManager = require('./src/download-manager');
const logger = require('./src/utils/logger');

// Mock dependencies
jest.mock('./src/utils/logger');

describe('REST API Tests', () => {
  let server;
  let wsServer;
  let downloadManager;
  let app;

  beforeAll(async () => {
    // Create mock WebSocket server
    wsServer = {
      clients: new Map(),
      downloadManager: {
        downloads: new Map(),
        getDownload: jest.fn(),
        createDownload: jest.fn(),
        cancelDownload: jest.fn()
      }
    };

    // Create Express server instance
    const expressServer = new ExpressServer(wsServer);
    app = expressServer.app;
  });

  describe('GET /api/v1/health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/v1/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('connectedClients');
      expect(response.body).toHaveProperty('activeDownloads');
      expect(response.body).toHaveProperty('version');
    });
  });

  describe('POST /api/v1/downloads', () => {
    it('should create a new download request', async () => {
      // Mock a client
      const mockClient = {
        id: 'client-1',
        registeredId: 'client-1',
        send: jest.fn()
      };
      wsServer.clients.set('client-1', mockClient);

      const downloadData = {
        url: 'https://example.com/file.zip',
        filename: 'file.zip',
        clientId: 'client-1'
      };

      const response = await request(app)
        .post('/api/v1/downloads')
        .send(downloadData)
        .expect(202);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('requestId');
      expect(response.body).toHaveProperty('status', 'pending');
      expect(mockClient.send).toHaveBeenCalled();
    });

    it('should return 400 for missing URL', async () => {
      const response = await request(app)
        .post('/api/v1/downloads')
        .send({
          filename: 'file.zip',
          clientId: 'client-1'
        })
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toContain('URL is required');
    });

    it('should return 404 for non-existent client', async () => {
      const response = await request(app)
        .post('/api/v1/downloads')
        .send({
          url: 'https://example.com/file.zip',
          filename: 'file.zip',
          clientId: 'non-existent'
        })
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toContain('Client not found');
    });
  });

  describe('GET /api/v1/downloads', () => {
    beforeEach(() => {
      // Mock some downloads
      const mockDownload1 = {
        id: 'download-1',
        clientId: 'client-1',
        status: 'completed',
        chunksReceived: 10,
        totalChunks: 10,
        progress: 100,
        createdAt: new Date(),
        completedAt: new Date(),
        url: 'https://example.com/file1.zip',
        filename: 'file1.zip'
      };

      const mockDownload2 = {
        id: 'download-2',
        clientId: 'client-2',
        status: 'in_progress',
        chunksReceived: 5,
        totalChunks: 10,
        progress: 50,
        createdAt: new Date(),
        completedAt: null,
        url: 'https://example.com/file2.zip',
        filename: 'file2.zip'
      };

      wsServer.downloadManager.downloads.set('download-1', mockDownload1);
      wsServer.downloadManager.downloads.set('download-2', mockDownload2);
    });

    it('should list all downloads', async () => {
      const response = await request(app)
        .get('/api/v1/downloads')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('downloads');
      expect(response.body.downloads).toHaveLength(2);
      expect(response.body).toHaveProperty('total', 2);
    });

    it('should filter downloads by status', async () => {
      const response = await request(app)
        .get('/api/v1/downloads?status=completed')
        .expect(200);

      expect(response.body.downloads).toHaveLength(1);
      expect(response.body.downloads[0].status).toBe('completed');
    });

    it('should filter downloads by client', async () => {
      const response = await request(app)
        .get('/api/v1/downloads?clientId=client-1')
        .expect(200);

      expect(response.body.downloads).toHaveLength(1);
      expect(response.body.downloads[0].clientId).toBe('client-1');
    });
  });

  describe('GET /api/v1/downloads/:requestId', () => {
    it('should return specific download', async () => {
      const mockDownload = {
        id: 'download-1',
        clientId: 'client-1',
        status: 'completed',
        chunksReceived: 10,
        totalChunks: 10,
        progress: 100,
        createdAt: new Date(),
        completedAt: new Date(),
        url: 'https://example.com/file.zip',
        filename: 'file.zip',
        duration: 5000,
        failedChunks: new Map()
      };

      wsServer.downloadManager.getDownload.mockReturnValue(mockDownload);

      const response = await request(app)
        .get('/api/v1/downloads/download-1')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('requestId', 'download-1');
      expect(response.body).toHaveProperty('status', 'completed');
      expect(response.body).toHaveProperty('progress');
      expect(response.body).toHaveProperty('startedAt');
      expect(response.body).toHaveProperty('completedAt');
      expect(response.body).toHaveProperty('duration');
    });

    it('should return 404 for non-existent download', async () => {
      wsServer.downloadManager.getDownload.mockReturnValue(null);

      const response = await request(app)
        .get('/api/v1/downloads/non-existent')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toContain('Download not found');
    });
  });

  describe('DELETE /api/v1/downloads/:requestId', () => {
    it('should cancel a download', async () => {
      const mockDownload = {
        id: 'download-1',
        clientId: 'client-1',
        status: 'in_progress',
        tempFilePath: '/tmp/test-file'
      };

      const mockClient = {
        id: 'client-1',
        registeredId: 'client-1',
        readyState: 1,
        send: jest.fn()
      };

      wsServer.clients.set('client-1', mockClient);
      wsServer.downloadManager.getDownload.mockReturnValue(mockDownload);
      wsServer.downloadManager.cancelDownload.mockResolvedValue();

      const response = await request(app)
        .delete('/api/v1/downloads/download-1')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('requestId', 'download-1');
      expect(response.body).toHaveProperty('status', 'cancelled');
      expect(mockClient.send).toHaveBeenCalledWith(
        expect.stringContaining('CANCEL_DOWNLOAD')
      );
    });

    it('should return 404 for non-existent download', async () => {
      wsServer.downloadManager.getDownload.mockReturnValue(null);

      const response = await request(app)
        .delete('/api/v1/downloads/non-existent')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toContain('Download not found');
    });
  });

  describe('GET /api/v1/clients', () => {
    beforeEach(() => {
      // Mock clients
      const mockClient1 = {
        id: 'client-1',
        registeredId: 'client-1',
        connectedAt: new Date(),
        lastHeartbeat: new Date()
      };

      const mockClient2 = {
        id: 'client-2',
        registeredId: 'client-2',
        connectedAt: new Date(),
        lastHeartbeat: new Date()
      };

      wsServer.clients.set('client-1', mockClient1);
      wsServer.clients.set('client-2', mockClient2);
    });

    it('should list all clients', async () => {
      const response = await request(app)
        .get('/api/v1/clients')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('clients');
      expect(response.body.clients).toHaveLength(2);
      expect(response.body).toHaveProperty('total', 2);
    });

    it('should filter clients by status', async () => {
      const response = await request(app)
        .get('/api/v1/clients?status=connected')
        .expect(200);

      expect(response.body.clients).toHaveLength(2);
    });
  });

  describe('GET /api/v1/clients/:clientId', () => {
    beforeEach(() => {
      const mockClient = {
        id: 'client-1',
        registeredId: 'client-1',
        connectedAt: new Date(),
        lastHeartbeat: new Date()
      };

      wsServer.clients.set('client-1', mockClient);
    });

    it('should return specific client info', async () => {
      const response = await request(app)
        .get('/api/v1/clients/client-1')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.client).toHaveProperty('clientId', 'client-1');
      expect(response.body.client).toHaveProperty('connectedAt');
      expect(response.body.client).toHaveProperty('lastHeartbeat');
      expect(response.body.client).toHaveProperty('status', 'connected');
      expect(response.body.client).toHaveProperty('downloads');
      expect(response.body.client.downloads).toHaveProperty('total');
    });

    it('should return 404 for non-existent client', async () => {
      const response = await request(app)
        .get('/api/v1/clients/non-existent')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toContain('Client not found');
    });
  });

  describe('Error handling', () => {
    it('should return 404 for unknown endpoints', async () => {
      const response = await request(app)
        .get('/api/v1/unknown')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error', 'Endpoint not found');
      expect(response.body).toHaveProperty('path', '/api/v1/unknown');
      expect(response.body).toHaveProperty('method', 'GET');
    });
  });
});
