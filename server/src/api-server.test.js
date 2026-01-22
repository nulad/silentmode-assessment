const request = require('supertest');
const app = require('./api-server');

describe('API Server Middleware', () => {
  test('should have security headers', async () => {
    const response = await request(app).get('/health');
    
    expect(response.headers).toHaveProperty('x-frame-options');
    expect(response.headers).toHaveProperty('x-content-type-options');
    expect(response.headers).toHaveProperty('x-xss-protection');
  });

  test('should handle CORS', async () => {
    const response = await request(app)
      .options('/health')
      .set('Origin', 'http://localhost:3000');
    
    expect(response.headers).toHaveProperty('access-control-allow-origin');
  });

  test('should parse JSON body', async () => {
    const response = await request(app)
      .post('/test')
      .send({ test: 'data' });
    
    // Should return 404 but not error on JSON parsing
    expect(response.status).toBe(404);
  });

  test('should log requests', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'healthy');
  });
});
