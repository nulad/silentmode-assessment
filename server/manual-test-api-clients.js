const WebSocket = require('ws');
const request = require('supertest');
const ExpressServer = require('./src/express-server');
const WebSocketServer = require('./src/websocket-server');

async function manualTest() {
  console.log('Starting manual test for GET /api/v1/clients endpoint...\n');
  
  // Start servers
  const wsServer = new WebSocketServer();
  const expressServer = new ExpressServer(wsServer);
  
  // Start WebSocket server
  wsServer.start();
  
  // Create mock clients
  console.log('Creating mock WebSocket clients...');
  
  const client1 = new WebSocket(`ws://localhost:${process.env.WS_PORT || 8080}`);
  const client2 = new WebSocket(`ws://localhost:${process.env.WS_PORT || 8080}`);
  
  await new Promise(resolve => {
    let connected = 0;
    client1.on('open', () => {
      console.log('Client 1 connected');
      client1.send(JSON.stringify({
        type: 'register',
        clientId: 'restaurant-001'
      }));
      connected++;
      if (connected === 2) resolve();
    });
    
    client2.on('open', () => {
      console.log('Client 2 connected');
      client2.send(JSON.stringify({
        type: 'register',
        clientId: 'restaurant-002'
      }));
      connected++;
      if (connected === 2) resolve();
    });
  });
  
  // Wait a bit for registration
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Test the API endpoint
  console.log('\nTesting GET /api/v1/clients...');
  
  const response = await request(expressServer.app)
    .get('/api/v1/clients')
    .expect(200);
  
  console.log('Response:', JSON.stringify(response.body, null, 2));
  
  // Test with status filter
  console.log('\nTesting GET /api/v1/clients?status=connected...');
  
  const filteredResponse = await request(expressServer.app)
    .get('/api/v1/clients?status=connected')
    .expect(200);
  
  console.log('Filtered Response:', JSON.stringify(filteredResponse, null, 2));
  
  // Cleanup
  client1.close();
  client2.close();
  wsServer.stop();
  
  console.log('\nManual test completed!');
}

manualTest().catch(console.error);
