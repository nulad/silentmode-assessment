#!/usr/bin/env node

const WebSocket = require('ws');
const http = require('http');
const { MESSAGE_TYPES } = require('../shared/protocol');

const PORT = process.env.PORT || 3000;
const WS_PORT = process.env.WS_PORT || 8080;

const clients = [];
let connectedCount = 0;
const totalClients = 2;

function connectClient(clientId) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${WS_PORT}`);

    ws.on('open', () => {
      console.log(`✓ Client ${clientId} connected`);

      ws.send(JSON.stringify({
        type: MESSAGE_TYPES.REGISTER,
        clientId: clientId,
        timestamp: new Date().toISOString()
      }));
    });

    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());

      if (message.type === MESSAGE_TYPES.REGISTER_ACK) {
        console.log(`✓ Client ${clientId} registered`);
        clients.push(ws);
        connectedCount++;

        if (connectedCount === totalClients) {
          resolve();
        }
      } else if (message.type === MESSAGE_TYPES.PING) {
        ws.send(JSON.stringify({
          type: MESSAGE_TYPES.PONG,
          timestamp: new Date().toISOString()
        }));
      }
    });

    ws.on('error', (error) => {
      console.error(`✗ Client ${clientId} error:`, error);
      reject(error);
    });

    setTimeout(() => {
      if (connectedCount < totalClients) {
        reject(new Error('Client connection timeout'));
      }
    }, 5000);
  });
}

function testClientsEndpoint() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: PORT,
      path: '/api/v1/clients',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log('\n=== GET /api/v1/clients Test ===');
        console.log('Status Code:', res.statusCode);
        console.log('Response:', data);

        try {
          const json = JSON.parse(data);
          console.log('\nValidation:');
          console.log('  success:', json.success);
          console.log('  total:', json.total);
          console.log('  clients.length:', json.clients.length);

          if (json.clients && json.clients.length > 0) {
            console.log('\nClients:');
            json.clients.forEach((client, i) => {
              console.log(`  Client ${i + 1}:`);
              console.log(`    clientId: ${client.clientId}`);
              console.log(`    connectedAt: ${client.connectedAt}`);
              console.log(`    lastHeartbeat: ${client.lastHeartbeat}`);
              console.log(`    status: ${client.status}`);
              console.log(`    metadata: ${JSON.stringify(client.metadata)}`);
            });
          }

          if (json.success === true &&
              json.total === totalClients &&
              json.clients.length === totalClients) {

            const allClientsValid = json.clients.every(client =>
              client.clientId &&
              client.connectedAt &&
              client.lastHeartbeat &&
              client.status === 'connected' &&
              typeof client.metadata === 'object'
            );

            if (allClientsValid) {
              console.log('\n✓ ALL TESTS PASSED - Endpoint works correctly with connected clients');
              resolve();
            } else {
              console.log('\n✗ TEST FAILED - Invalid client format');
              reject(new Error('Invalid client format'));
            }
          } else {
            console.log('\n✗ TEST FAILED - Response does not match expected format');
            console.log(`Expected ${totalClients} clients, got ${json.clients.length}`);
            reject(new Error('Invalid response'));
          }
        } catch (e) {
          console.log('\n✗ TEST FAILED - Invalid JSON');
          console.error(e);
          reject(e);
        }
      });
    });

    req.on('error', (error) => {
      console.error('✗ TEST FAILED - Request error:', error.message);
      reject(error);
    });

    req.end();
  });
}

async function runTest() {
  try {
    console.log('Connecting test clients...\n');

    await Promise.all([
      connectClient('restaurant-001'),
      connectClient('restaurant-002')
    ]);

    console.log('\n✓ All clients connected');

    await new Promise(resolve => setTimeout(resolve, 500));

    await testClientsEndpoint();

    clients.forEach(ws => ws.close());
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Test failed:', error.message);
    clients.forEach(ws => ws.close());
    process.exit(1);
  }
}

runTest();
