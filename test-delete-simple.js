const http = require('http');

// Test the DELETE endpoint
async function testDeleteEndpoint() {
  console.log('Testing DELETE /api/v1/downloads/:requestId endpoint...\n');
  
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/downloads/test-non-existent',
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json'
    }
  };
  
  const req = http.request(options, (res) => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Headers: ${JSON.stringify(res.headers, null, 2)}`);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      try {
        const response = JSON.parse(data);
        console.log(`Response: ${JSON.stringify(response, null, 2)}\n`);
        
        if (res.statusCode === 404 && response.error === 'Download not found') {
          console.log('✅ Test 1 passed: Non-existent download returns 404');
        } else {
          console.log('❌ Test 1 failed: Expected 404 and "Download not found" error');
        }
      } catch (e) {
        console.log('Response:', data);
      }
    });
  });
  
  req.on('error', (e) => {
    console.error(`Request error: ${e.message}`);
    console.log('\n⚠️  Server is not running. Start the server with: npm start');
    console.log('Then run this test again.');
  });
  
  req.end();
}

// Test with curl if server is running
console.log('Alternatively, you can test with curl:');
console.log('1. Start the server: npm start');
console.log('2. Test non-existent download:');
console.log('   curl -X DELETE http://localhost:3000/api/v1/downloads/non-existent-id');
console.log('3. Expected response:');
console.log('   {"success":false,"error":"Download not found"}');
console.log('');

testDeleteEndpoint();
