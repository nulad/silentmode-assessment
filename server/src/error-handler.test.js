const request = require('supertest');
const ExpressServer = require('../src/express-server');
const WebSocketServer = require('../src/websocket-server');
const { ERROR_CODES } = require('../../shared/protocol');

describe('Error Response Format', () => {
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
      await wsServer.stop();
    }
  });

  describe('Error Response Structure', () => {
    test('404 errors should have proper format', async () => {
      const response = await request(app)
        .get('/api/v1/nonexistent')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', ERROR_CODES.FILE_NOT_FOUND);
      expect(response.body.error).toHaveProperty('message');
      expect(response.body.error).toHaveProperty('timestamp');
      expect(response.body.error).toHaveProperty('details');
      expect(response.body.error.details).toHaveProperty('method', 'GET');
      expect(response.body.error.details).toHaveProperty('path', '/api/v1/nonexistent');
    });

    test('Download not found error should have proper format', async () => {
      const response = await request(app)
        .get('/api/v1/downloads/nonexistent-id')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', ERROR_CODES.FILE_NOT_FOUND);
      expect(response.body.error).toHaveProperty('message', 'Download not found');
      expect(response.body.error).toHaveProperty('timestamp');
    });

    test('Cancel completed download error should have proper format', async () => {
      // First create a mock completed download
      const mockDownload = {
        id: 'test-download-id',
        status: 'completed',
        clientId: 'test-client'
      };
      
      wsServer.downloadManager.downloads.set('test-download-id', mockDownload);

      const response = await request(app)
        .delete('/api/v1/downloads/test-download-id')
        .expect(409);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', ERROR_CODES.DOWNLOAD_IN_PROGRESS);
      expect(response.body.error).toHaveProperty('message', 'Cannot cancel completed download');
      expect(response.body.error).toHaveProperty('timestamp');
    });
  });

  describe('Error Handler Edge Cases', () => {
    test('Should handle unexpected errors gracefully', async () => {
      // Add a route that throws an unexpected error
      app.get('/api/v1/test-error', (req, res, next) => {
        throw new Error('Unexpected error');
      });

      const response = await request(app)
        .get('/api/v1/test-error')
        .expect(500);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'INTERNAL_SERVER_ERROR');
      expect(response.body.error).toHaveProperty('message');
      expect(response.body.error).toHaveProperty('timestamp');
    });

    test('Should handle validation errors properly', async () => {
      // Add a route that throws a validation error
      app.get('/api/v1/test-validation', (req, res, next) => {
        const error = new Error('Validation failed');
        error.name = 'ValidationError';
        error.details = { field: 'test', value: 'invalid' };
        throw error;
      });

      const response = await request(app)
        .get('/api/v1/test-validation')
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', ERROR_CODES.INVALID_REQUEST);
      expect(response.body.error).toHaveProperty('message', 'Validation failed');
      expect(response.body.error).toHaveProperty('details');
      expect(response.body.error.details).toHaveProperty('field', 'test');
      expect(response.body.error.details).toHaveProperty('value', 'invalid');
    });
  });

  describe('Timestamp Format', () => {
    test('Error timestamps should be valid ISO strings', async () => {
      const response = await request(app)
        .get('/api/v1/nonexistent')
        .expect(404);

      const timestamp = response.body.error.timestamp;
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(new Date(timestamp)).toBeInstanceOf(Date);
    });
  });
});
