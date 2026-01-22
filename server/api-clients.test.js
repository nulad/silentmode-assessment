const request = require('supertest');
const ExpressServer = require('./src/express-server');
const WebSocketServer = require('./src/websocket-server');

describe('GET /api/v1/clients', () => {
  let expressServer;
  let wsServer;
  let app;

  beforeAll(() => {
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

  it('should return empty clients list when no clients connected', async () => {
    const response = await request(app)
      .get('/api/v1/clients')
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      clients: [],
      total: 0
    });
  });

  it('should filter clients by status=connected', async () => {
    const response = await request(app)
      .get('/api/v1/clients?status=connected')
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      clients: [],
      total: 0
    });
  });

  it('should return 404 for unknown endpoints', async () => {
    await request(app)
      .get('/api/v1/unknown')
      .expect(404);
  });
});
