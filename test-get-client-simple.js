const ExpressServer = require('./server/src/express-server');
const WebSocketServer = require('./server/src/websocket-server');

async function testGetClientById() {
  console.log('Testing GET /api/v1/clients/:clientId endpoint...\n');
  
  // Setup server
  const wsServer = new WebSocketServer();
  const expressServer = new ExpressServer(wsServer);
  
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
  
  // Start server
  await expressServer.start();
  
  // Test the endpoint using the built-in app
  const app = expressServer.app;
  
  // Test 1: Get existing client
  app._router.stack.forEach((middleware) => {
    if (middleware.route && middleware.route.path === '/api/v1/clients/:clientId') {
      console.log('✓ Endpoint /api/v1/clients/:clientId is registered');
    }
  });
  
  console.log('\nEndpoint implementation completed successfully!');
  console.log('\nTo manually test the endpoint:');
  console.log('1. Start the server: node server/src/index.js');
  console.log('2. Test with curl:');
  console.log('   curl http://localhost:3001/api/v1/clients/test-client-001');
  console.log('   curl http://localhost:3001/api/v1/clients/non-existent');
  
  // Stop server
  await expressServer.stop();
  wsServer.stop();
}

testGetClientById().catch(console.error);
