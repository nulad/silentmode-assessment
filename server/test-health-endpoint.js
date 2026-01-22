const http = require('http');

const PORT = process.env.PORT || 3000;

function testHealthEndpoint() {
  const options = {
    hostname: 'localhost',
    port: PORT,
    path: '/api/v1/health',
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
      console.log('Status Code:', res.statusCode);
      console.log('Response:', data);
      
      try {
        const json = JSON.parse(data);
        console.log('\nParsed Response:');
        console.log('  Status:', json.status);
        console.log('  Uptime:', json.uptime, 'seconds');
        console.log('  Connected Clients:', json.connectedClients);
        console.log('  Active Downloads:', json.activeDownloads);
        console.log('  Version:', json.version);
        
        if (json.status === 'healthy' && 
            typeof json.uptime === 'number' &&
            typeof json.connectedClients === 'number' &&
            typeof json.activeDownloads === 'number' &&
            json.version) {
          console.log('\n✓ Health endpoint test PASSED');
          process.exit(0);
        } else {
          console.log('\n✗ Health endpoint test FAILED - Invalid response format');
          process.exit(1);
        }
      } catch (e) {
        console.log('\n✗ Health endpoint test FAILED - Invalid JSON');
        console.error(e);
        process.exit(1);
      }
    });
  });

  req.on('error', (error) => {
    console.error('✗ Health endpoint test FAILED - Request error:', error.message);
    console.error('Make sure the server is running on port', PORT);
    process.exit(1);
  });

  req.end();
}

setTimeout(testHealthEndpoint, 1000);
