const request = require('supertest');
const ExpressServer = require('../src/express-server');
const WebSocketServer = require('../src/websocket-server');

describe('Request Validation', () => {
  let expressServer;
  let wsServer;
  let app;

  beforeAll(async () => {
    wsServer = new WebSocketServer();
    expressServer = new ExpressServer(wsServer);
    app = expressServer.app;
  });

  describe('GET /api/v1/downloads/:requestId', () => {
    it('should reject invalid UUID in requestId', async () => {
      const response = await request(app)
        .get('/api/v1/downloads/invalid-uuid')
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'INVALID_REQUEST',
        details: [
          {
            field: 'requestId',
            message: 'RequestId must be a valid UUID v4',
            value: 'invalid-uuid'
          }
        ]
      });
    });

    it('should accept valid UUID v4', async () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const response = await request(app)
        .get(`/api/v1/downloads/${validUuid}`)
        .expect(404); // 404 because download doesn't exist, but validation passed

      expect(response.body).toEqual({
        success: false,
        error: 'Download not found'
      });
    });
  });

  describe('DELETE /api/v1/downloads/:requestId', () => {
    it('should reject invalid UUID in requestId', async () => {
      const response = await request(app)
        .delete('/api/v1/downloads/not-a-uuid')
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'INVALID_REQUEST',
        details: [
          {
            field: 'requestId',
            message: 'RequestId must be a valid UUID v4',
            value: 'not-a-uuid'
          }
        ]
      });
    });

    it('should accept valid UUID v4', async () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const response = await request(app)
        .delete(`/api/v1/downloads/${validUuid}`)
        .expect(404); // 404 because download doesn't exist, but validation passed

      expect(response.body).toEqual({
        success: false,
        error: 'Download not found'
      });
    });
  });
});
