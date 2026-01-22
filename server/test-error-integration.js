const request = require('supertest');
const ExpressServer = require('./src/express-server');
const WebSocketServer = require('./src/websocket-server');
const { ERROR_CODES } = require('../shared/protocol');

// Simple test runner
function runTests() {
  const tests = [];
  
  function test(name, fn) {
    tests.push({ name, fn });
  }
  
  // Test 1: 404 error format
  test('404 error has correct format', async () => {
    const wsServer = new WebSocketServer();
    const expressServer = new ExpressServer(wsServer);
    const app = expressServer.app;
    
    const response = await request(app)
      .get('/api/v1/nonexistent')
      .expect(404);
    
    assert(response.body.success === false, 'success should be false');
    assert(response.body.error.code === ERROR_CODES.FILE_NOT_FOUND, 'error code should match');
    assert(response.body.error.message, 'should have error message');
    assert(response.body.error.timestamp, 'should have timestamp');
    assert(response.body.error.details.method === 'GET', 'should include method in details');
    assert(response.body.error.details.path === '/api/v1/nonexistent', 'should include path in details');
    
    await expressServer.stop();
    await wsServer.stop();
  });
  
  // Test 2: Download not found error
  test('Download not found error has correct format', async () => {
    const wsServer = new WebSocketServer();
    const expressServer = new ExpressServer(wsServer);
    const app = expressServer.app;
    
    const response = await request(app)
      .get('/api/v1/downloads/nonexistent-id')
      .expect(404);
    
    assert(response.body.success === false, 'success should be false');
    assert(response.body.error.code === ERROR_CODES.FILE_NOT_FOUND, 'error code should match');
    assert(response.body.error.message === 'Download not found', 'message should match');
    assert(response.body.error.timestamp, 'should have timestamp');
    
    await expressServer.stop();
    await wsServer.stop();
  });
  
  // Run all tests
  async function runAllTests() {
    console.log('Running error handling integration tests...\n');
    
    let passed = 0;
    let failed = 0;
    
    for (const test of tests) {
      try {
        await test.fn();
        console.log(`✓ ${test.name}`);
        passed++;
      } catch (error) {
        console.log(`✗ ${test.name}`);
        console.log(`  Error: ${error.message}`);
        failed++;
      }
    }
    
    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    
    if (failed > 0) {
      process.exit(1);
    }
  }
  
  runAllTests().catch(console.error);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

runTests();
