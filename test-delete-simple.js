const http = require('http');

// Simple test for DELETE endpoint
async function testDeleteEndpoint() {
  console.log('Testing DELETE /api/v1/downloads/:requestId endpoint...\n');
  
  // Import server modules
  const WebSocketServer = require('./server/src/websocket-server');
  const ExpressServer = require('./server/src/express-server');
  
  // Create servers
  const wsServer = new WebSocketServer();
  const expressServer = new ExpressServer(wsServer);
  
  // Test 1: Non-existent download should return 404
  console.log('Test 1: DELETE non-existent download');
  try {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/v1/downloads/non-existent-id',
      method: 'DELETE',
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
        console.log(`Status: ${res.statusCode}`);
        console.log(`Response: ${data}`);
        
        if (res.statusCode === 404) {
          console.log('✓ Test 1 passed: Returns 404 for non-existent download\n');
        } else {
          console.log('✗ Test 1 failed: Expected 404\n');
        }
        
        // Test 2: Cancel in-progress download
        testCancelDownload(wsServer, expressServer);
      });
    });
    
    req.on('error', (err) => {
      console.error(`Request error: ${err.message}`);
      console.log('Starting server first...\n');
      
      // Start server and retry
      expressServer.start().then(() => {
        console.log('Server started, retrying test...\n');
        testDeleteEndpoint();
      }).catch(console.error);
    });
    
    req.end();
    
  } catch (error) {
    console.error('Test error:', error.message);
  }
}

function testCancelDownload(wsServer, expressServer) {
  console.log('Test 2: DELETE in-progress download');
  
  // Create an in-progress download
  const requestId = 'test-download-' + Date.now();
  wsServer.downloadManager.createDownload('test-client', '/test/file.txt', requestId);
  wsServer.downloadManager.updateDownload(requestId, {
    status: 'in_progress',
    totalChunks: 10,
    chunksReceived: 5
  });
  
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: `/api/v1/downloads/${requestId}`,
    method: 'DELETE',
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
      console.log(`Status: ${res.statusCode}`);
      console.log(`Response: ${data}`);
      
      try {
        const response = JSON.parse(data);
        
        if (res.statusCode === 200 && response.success === true && response.status === 'cancelled') {
          console.log('✓ Test 2 passed: Successfully cancelled download\n');
          
          // Verify download status
          const download = wsServer.downloadManager.getDownload(requestId);
          if (download.status === 'cancelled') {
            console.log('✓ Download status updated to cancelled\n');
          } else {
            console.log('✗ Download status not updated\n');
          }
        } else {
          console.log('✗ Test 2 failed: Expected success response\n');
        }
      } catch (e) {
        console.log('✗ Test 2 failed: Invalid JSON response\n');
      }
      
      // Test 3: Attempt to cancel completed download
      testCancelCompletedDownload(wsServer, expressServer);
    });
  });
  
  req.on('error', (err) => {
    console.error(`Request error: ${err.message}`);
  });
  
  req.end();
}

function testCancelCompletedDownload(wsServer, expressServer) {
  console.log('Test 3: DELETE completed download (should fail)');
  
  // Create a completed download
  const requestId = 'test-completed-' + Date.now();
  wsServer.downloadManager.createDownload('test-client', '/test/file.txt', requestId);
  wsServer.downloadManager.updateDownload(requestId, {
    status: 'completed',
    completedAt: new Date()
  });
  
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: `/api/v1/downloads/${requestId}`,
    method: 'DELETE',
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
      console.log(`Status: ${res.statusCode}`);
      console.log(`Response: ${data}`);
      
      if (res.statusCode === 409) {
        console.log('✓ Test 3 passed: Returns 409 for completed download\n');
      } else {
        console.log('✗ Test 3 failed: Expected 409\n');
      }
      
      console.log('All tests completed!');
      
      // Cleanup
      wsServer.stop();
      expressServer.stop();
      process.exit(0);
    });
  });
  
  req.on('error', (err) => {
    console.error(`Request error: ${err.message}`);
  });
  
  req.end();
}

// Start the test
testDeleteEndpoint();
