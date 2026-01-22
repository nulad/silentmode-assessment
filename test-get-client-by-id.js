const request = require('supertest');
const ExpressServer = require('./server/src/express-server');
const WebSocketServer = require('./server/src/websocket-server');

describe('GET /api/v1/clients/:clientId', () => {
  let expressServer;
  let wsServer;
  let app;

  beforeAll(() => {
    wsServer = new WebSocketServer();
    expressServer = new ExpressServer(wsServer);
    app = expressServer.app;
  });

  afterAll(async () => {
    if (expressServer.server) {
      await expressServer.stop();
    }
    if (wsServer) {
      wsServer.stop();
    }
  });

  test('should return 404 for non-existent client', async () => {
    const response = await request(app)
      .get('/api/v1/clients/non-existent-client')
      .expect(404);

    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'CLIENT_NOT_FOUND',
        message: "Client with ID 'non-existent-client' not found"
      }
    });
  });

  test('should return client details for existing client', async () => {
    // Mock a client connection
    const mockClient = {
      id: 'test-client-123',
      registeredId: 'test-client-001',
      ip: '127.0.0.1',
      connectedAt: new Date('2025-01-21T10:00:00Z')
    };

    // Add mock client to wsServer
    wsServer.clients.set(mockClient.id, {
      ws: { readyState: 1 }, // WebSocket.OPEN
      lastHeartbeat: new Date('2025-01-21T10:05:00Z'),
      downloadHistory: [
        {
          requestId: 'req-001',
          filename: 'test-file.txt',
          status: 'completed',
          createdAt: new Date('2025-01-21T10:02:00Z'),
          completedAt: new Date('2025-01-21T10:03:00Z')
        }
      ]
    });

    wsServer.registeredClients = new Map([['test-client-001', mockClient.id]]);

    const response = await request(app)
      .get('/api/v1/clients/test-client-001')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.client.clientId).toBe('test-client-001');
    expect(response.body.client.status).toBe('connected');
    expect(response.body.client.metadata.ip).toBe('127.0.0.1');
    expect(response.body.client.downloadHistory).toHaveLength(1);
    expect(response.body.client.downloadHistory[0].requestId).toBe('req-001');
  });
});

// Run tests if this file is executed directly
if (require.main === module) {
  console.log('Running GET /api/v1/clients/:clientId endpoint tests...');
  
  // Simple manual test
  const wsServer = new WebSocketServer();
  const expressServer = new ExpressServer(wsServer);
  
  expressServer.start().then(() => {
    console.log('Server started on port 3001');
    console.log('Test the endpoint with:');
    console.log('  curl http://localhost:3001/api/v1/clients/test-client-001');
    console.log('  curl http://localhost:3001/api/v1/clients/non-existent');
  }).catch(console.error);
}
