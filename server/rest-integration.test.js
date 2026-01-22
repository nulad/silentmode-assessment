// Set test environment ports to avoid conflicts
process.env.PORT = '0'; // Use random available port
process.env.WS_PORT = '0'; // Use random available port

// Clear config cache to ensure environment variables are picked up
delete require.cache[require.resolve('./src/config')];

const request = require('supertest');
const ExpressServer = require('./src/express-server');
const WebSocketServer = require('./src/websocket-server');
const logger = require('./src/utils/logger');

describe('REST API Integration Tests', () => {
  let server;
  let wsServer;
  let expressServer;
  let app;

  beforeAll(async () => {
    // Create real WebSocket server and download manager
    wsServer = new WebSocketServer();
    await wsServer.start();
    
    // Create Express server instance
    expressServer = new ExpressServer(wsServer);
    app = expressServer.app;
    
    // Start the server
    await expressServer.start();
  });

  afterAll(async () => {
    if (expressServer) {
      await expressServer.stop();
    }
    if (wsServer) {
      await wsServer.stop();
    }
  });

  describe('Server Health', () => {
    it('should start and respond to health check', async () => {
      const response = await request(app)
        .get('/api/v1/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('version');
    });
  });

  describe('All Endpoints Available', () => {
    it('should have all required endpoints', async () => {
      // Test that endpoints exist (even if they return expected errors)
      
      // POST /api/v1/downloads - should return 400 without body
      await request(app)
        .post('/api/v1/downloads')
        .expect(400);

      // GET /api/v1/downloads - should return 200 with empty list
      const downloadsResponse = await request(app)
        .get('/api/v1/downloads')
        .expect(200);
      
      expect(downloadsResponse.body).toHaveProperty('success', true);
      expect(downloadsResponse.body).toHaveProperty('downloads');
      expect(Array.isArray(downloadsResponse.body.downloads)).toBe(true);

      // GET /api/v1/downloads/nonexistent - should return 400 for invalid UUID
      const invalidResponse = await request(app)
        .get('/api/v1/downloads/nonexistent')
        .expect(400);
      expect(invalidResponse.body).toHaveProperty('success', false);
      expect(invalidResponse.body).toHaveProperty('error', 'INVALID_REQUEST');

      // GET /api/v1/downloads with valid UUID format - should return 404
      const { v4: uuidv4 } = require('uuid');
      const testUuid = uuidv4();
      
      await request(app)
        .get(`/api/v1/downloads/${testUuid}`)
        .expect(404);

      // DELETE /api/v1/downloads/nonexistent - should return 400 for invalid UUID
      await request(app)
        .delete('/api/v1/downloads/nonexistent')
        .expect(400);

      // DELETE /api/v1/downloads with valid UUID format - should return 404
      await request(app)
        .delete(`/api/v1/downloads/${testUuid}`)
        .expect(404);

      // GET /api/v1/clients - should return 200 with empty list
      const clientsResponse = await request(app)
        .get('/api/v1/clients')
        .expect(200);
      
      expect(clientsResponse.body).toHaveProperty('success', true);
      expect(clientsResponse.body).toHaveProperty('clients');
      expect(Array.isArray(clientsResponse.body.clients)).toBe(true);

      // GET /api/v1/clients/nonexistent - should return 404
      await request(app)
        .get('/api/v1/clients/nonexistent')
        .expect(404);
    });
  });

  describe('Error Response Format', () => {
    it('should return consistent error format', async () => {
      // Test 404 error
      const response = await request(app)
        .get('/api/v1/nonexistent')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Not found');
    });
  });
});
