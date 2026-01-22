const http = require('http');

const PORT = process.env.PORT || 3000;

function testClientsEndpoint(path, testName) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: PORT,
      path: path,
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
        console.log(`\n=== ${testName} ===`);
        console.log('Status Code:', res.statusCode);
        console.log('Response:', data);

        try {
          const json = JSON.parse(data);
          console.log('\nParsed Response:');
          console.log('  Success:', json.success);
          console.log('  Total:', json.total);
          console.log('  Clients count:', json.clients ? json.clients.length : 0);

          if (json.clients && json.clients.length > 0) {
            console.log('\nFirst client:');
            console.log('  Client ID:', json.clients[0].clientId);
            console.log('  Connected At:', json.clients[0].connectedAt);
            console.log('  Last Heartbeat:', json.clients[0].lastHeartbeat);
            console.log('  Status:', json.clients[0].status);
            console.log('  Metadata:', JSON.stringify(json.clients[0].metadata));
          }

          if (json.success === true &&
              typeof json.total === 'number' &&
              Array.isArray(json.clients) &&
              json.clients.length === json.total) {

            const allClientsValid = json.clients.every(client =>
              client.clientId &&
              client.connectedAt &&
              client.lastHeartbeat &&
              client.status === 'connected' &&
              typeof client.metadata === 'object'
            );

            if (allClientsValid) {
              console.log(`\n✓ ${testName} PASSED`);
              resolve();
            } else {
              console.log(`\n✗ ${testName} FAILED - Invalid client format`);
              reject(new Error('Invalid client format'));
            }
          } else {
            console.log(`\n✗ ${testName} FAILED - Invalid response format`);
            reject(new Error('Invalid response format'));
          }
        } catch (e) {
          console.log(`\n✗ ${testName} FAILED - Invalid JSON`);
          console.error(e);
          reject(e);
        }
      });
    });

    req.on('error', (error) => {
      console.error(`✗ ${testName} FAILED - Request error:`, error.message);
      console.error('Make sure the server is running on port', PORT);
      reject(error);
    });

    req.end();
  });
}

async function runTests() {
  try {
    await testClientsEndpoint('/api/v1/clients', 'Test 1: GET /api/v1/clients');
    await testClientsEndpoint('/api/v1/clients?status=connected', 'Test 2: GET /api/v1/clients?status=connected');

    console.log('\n\n=== ALL TESTS PASSED ===\n');
    process.exit(0);
  } catch (error) {
    console.log('\n\n=== TESTS FAILED ===\n');
    process.exit(1);
  }
}

setTimeout(runTests, 1000);
