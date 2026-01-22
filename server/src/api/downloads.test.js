// Set environment variables before any imports
process.env.NODE_ENV = 'test';
process.env.PORT = '3001'; // Use different port for tests
process.env.WS_PORT = '8081';

const request = require('supertest');
const SilentModeServer = require('../index');

describe('POST /api/v1/downloads', () => {
  let server;
  let app;

  beforeAll(async () => {
    server = new SilentModeServer();
    await server.start();
    app = server.expressServer.app;
  });

  afterAll(async () => {
    if (server) {
      server.shutdown();
    }
  });

  describe('Validation', () => {
    test('should return 400 when missing clientId', async () => {
      const response = await request(app)
        .post('/api/v1/downloads')
        .send({ filePath: '/test/file.txt' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'Missing required fields: clientId, filePath'
      });
    });

    test('should return 400 when missing filePath', async () => {
      const response = await request(app)
        .post('/api/v1/downloads')
        .send({ clientId: 'test-client' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'Missing required fields: clientId, filePath'
      });
    });

    test('should return 400 when both fields are missing', async () => {
      const response = await request(app)
        .post('/api/v1/downloads')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'Missing required fields: clientId, filePath'
      });
    });
  });

  describe('Client not connected', () => {
    test('should return 404 when client is not connected', async () => {
      const response = await request(app)
        .post('/api/v1/downloads')
        .send({
          clientId: 'non-existent-client',
          filePath: '/test/file.txt'
        });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: 'Client not connected'
      });
    });
  });

  describe('Successful download initiation', () => {
    test('should return 202 and initiate download for connected client', async () => {
      // Mock a connected client
      const mockClientId = 'test-client-123';
      server.wsServer.clients.set(mockClientId, {
        id: mockClientId,
        ws: {
          readyState: 1, // WebSocket.OPEN
          send: jest.fn()
        }
      });

      const response = await request(app)
        .post('/api/v1/downloads')
        .send({
          clientId: mockClientId,
          filePath: '/home/user/test.txt'
        });

      expect(response.status).toBe(202);
      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('requestId');
      expect(response.body.clientId).toBe(mockClientId);
      expect(response.body.filePath).toBe('/home/user/test.txt');
      expect(response.body.status).toBe('pending');

      // Verify download was created in download manager
      const download = server.wsServer.downloadManager.getDownload(response.body.requestId);
      expect(download).toBeTruthy();
      expect(download.clientId).toBe(mockClientId);
      expect(download.filePath).toBe('/home/user/test.txt');
      expect(download.status).toBe('pending');
    });
  });

  describe('Duplicate download', () => {
    test('should return 409 when download already in progress', async () => {
      const mockClientId = 'test-client-456';
      const filePath = '/home/user/duplicate.txt';
      
      // Mock a connected client
      server.wsServer.clients.set(mockClientId, {
        id: mockClientId,
        ws: {
          readyState: 1,
          send: jest.fn()
        }
      });

      // Create first download
      const firstResponse = await request(app)
        .post('/api/v1/downloads')
        .send({
          clientId: mockClientId,
          filePath: filePath
        });

      expect(firstResponse.status).toBe(202);

      // Try to create duplicate download
      const secondResponse = await request(app)
        .post('/api/v1/downloads')
        .send({
          clientId: mockClientId,
          filePath: filePath
        });

      expect(secondResponse.status).toBe(409);
      expect(secondResponse.body).toEqual({
        success: false,
        error: 'Download already in progress',
        requestId: firstResponse.body.requestId
      });
    });
  });
});
