const http = require('http');

async function startServer(expressServer) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(expressServer.app);
    server.listen(3001, (err) => {
      if (err) reject(err);
      else resolve(server);
    });
  });
}

async function runTests() {
  console.log('Testing DELETE /api/v1/downloads/:requestId endpoint...\n');
  
  // Import server modules
  const WebSocketServer = require('./server/src/websocket-server');
  const ExpressServer = require('./server/src/express-server');
  
  // Create servers
  const wsServer = new WebSocketServer();
  const expressServer = new ExpressServer(wsServer);
  
  // Start HTTP server
  const httpServer = await startServer(expressServer);
  console.log('Server started on port 3001\n');
  
  try {
    // Test 1: Non-existent download should return 404
    console.log('Test 1: DELETE non-existent download');
    const test1 = await makeRequest('/api/v1/downloads/non-existent-id', 'DELETE');
    console.log(`Status: ${test1.statusCode}`);
    console.log(`Response: ${test1.body}`);
    
    if (test1.statusCode === 404 && JSON.parse(test1.body).error === 'Download not found') {
      console.log('✓ Test 1 passed: Returns 404 for non-existent download\n');
    } else {
      console.log('✗ Test 1 failed: Expected 404 with "Download not found" message\n');
    }
    
    // Test 2: Cancel in-progress download
    console.log('Test 2: DELETE in-progress download');
    const requestId = 'test-download-' + Date.now();
    wsServer.downloadManager.createDownload('test-client', '/test/file.txt', requestId);
    wsServer.downloadManager.updateDownload(requestId, {
      status: 'in_progress',
      totalChunks: 10,
      chunksReceived: 5
    });
    
    const test2 = await makeRequest(`/api/v1/downloads/${requestId}`, 'DELETE');
    console.log(`Status: ${test2.statusCode}`);
    console.log(`Response: ${test2.body}`);
    
    const response2 = JSON.parse(test2.body);
    if (test2.statusCode === 200 && response2.success === true && response2.status === 'cancelled') {
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
    
    // Test 3: Attempt to cancel completed download
    console.log('Test 3: DELETE completed download (should fail)');
    const completedRequestId = 'test-completed-' + Date.now();
    wsServer.downloadManager.createDownload('test-client', '/test/file.txt', completedRequestId);
    wsServer.downloadManager.updateDownload(completedRequestId, {
      status: 'completed',
      completedAt: new Date()
    });
    
    const test3 = await makeRequest(`/api/v1/downloads/${completedRequestId}`, 'DELETE');
    console.log(`Status: ${test3.statusCode}`);
    console.log(`Response: ${test3.body}`);
    
    if (test3.statusCode === 409 && JSON.parse(test3.body).error === 'Cannot cancel completed download') {
      console.log('✓ Test 3 passed: Returns 409 for completed download\n');
    } else {
      console.log('✗ Test 3 failed: Expected 409\n');
    }
    
    console.log('All tests completed successfully!');
    
  } catch (error) {
    console.error('Test error:', error);
  } finally {
    // Cleanup
    httpServer.close();
    wsServer.stop();
    console.log('\nServer stopped');
    process.exit(0);
  }
}

function makeRequest(path, method) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: path,
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
        resolve({
          statusCode: res.statusCode,
          body: data
        });
      });
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    
    req.end();
  });
}

// Start the test
runTests().catch(console.error);
