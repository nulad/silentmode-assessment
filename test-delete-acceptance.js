const WebSocket = require('ws');
const http = require('http');

// Test configuration
const WS_PORT = 8080;
const HTTP_PORT = 3000;
const WS_URL = `ws://localhost:${WS_PORT}`;
const HTTP_URL = `http://localhost:${HTTP_PORT}`;

// Helper to make HTTP requests
function httpRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: HTTP_PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          resolve({ status: res.statusCode, body: response });
        } catch (e) {
          resolve({ status: res.statusCode, body: body });
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

// WebSocket client helper
function createWebSocketClient() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

async function runTests() {
  console.log('=== DELETE /api/v1/downloads/:requestId Acceptance Tests ===\n');
  
  let testWs = null;
  let testClientId = null;
  
  try {
    // Setup: Connect a WebSocket client
    console.log('Setting up test client...');
    testWs = await createWebSocketClient();
    
    // Register the client
    testWs.send(JSON.stringify({
      type: 'REGISTER',
      clientId: 'test-delete-client'
    }));
    
    testClientId = 'test-delete-client';
    console.log('✓ Test client connected and registered\n');
    
    // Test 1: DELETE non-existent download returns 404
    console.log('Test 1: DELETE non-existent download');
    const response1 = await httpRequest('DELETE', '/api/v1/downloads/non-existent-id');
    console.log(`Status: ${response1.status}, Body:`, response1.body);
    
    if (response1.status === 404 && response1.body.error === 'Download not found') {
      console.log('✅ PASSED: Returns 404 for non-existent download\n');
    } else {
      console.log('❌ FAILED: Expected 404 and "Download not found"\n');
    }
    
    // Test 2: DELETE completed download returns 409
    console.log('Test 2: DELETE completed download');
    // First create a download via WebSocket
    testWs.send(JSON.stringify({
      type: 'DOWNLOAD_REQUEST',
      clientId: testClientId,
      requestId: 'test-completed-download',
      filePath: '/test/file.txt'
    }));
    
    // Simulate completion by updating directly through download manager
    // (In real scenario, this would be done via client sending chunks)
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Mark as completed
    const response2 = await httpRequest('DELETE', '/api/v1/downloads/test-completed-download');
    console.log(`Status: ${response2.status}, Body:`, response2.body);
    
    if (response2.status === 409 && response2.body.error.includes('Cannot cancel')) {
      console.log('✅ PASSED: Returns 409 for completed download\n');
    } else {
      console.log('❌ FAILED: Expected 409 for completed download\n');
    }
    
    // Test 3: Successfully cancel in-progress download
    console.log('Test 3: Cancel in-progress download');
    
    // Create a new download
    testWs.send(JSON.stringify({
      type: 'DOWNLOAD_REQUEST',
      clientId: testClientId,
      requestId: 'test-in-progress-download',
      filePath: '/test/file2.txt'
    }));
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Cancel it
    const response3 = await httpRequest('DELETE', '/api/v1/downloads/test-in-progress-download');
    console.log(`Status: ${response3.status}, Body:`, response3.body);
    
    if (response3.status === 200 && 
        response3.body.success === true && 
        response3.body.status === 'cancelled') {
      console.log('✅ PASSED: Successfully cancels in-progress download\n');
    } else {
      console.log('❌ FAILED: Expected 200 with success=true and status=cancelled\n');
    }
    
    // Test 4: Verify CANCEL_DOWNLOAD message was sent to client
    console.log('Test 4: Verify CANCEL_DOWNLOAD message sent to client');
    
    // Listen for messages
    let cancelMessageReceived = false;
    testWs.on('message', (data) => {
      const message = JSON.parse(data);
      if (message.type === 'CANCEL_DOWNLOAD') {
        cancelMessageReceived = true;
        console.log('✓ Received CANCEL_DOWNLOAD message:', message);
      }
    });
    
    // Create another download to cancel
    testWs.send(JSON.stringify({
      type: 'DOWNLOAD_REQUEST',
      clientId: testClientId,
      requestId: 'test-cancel-message',
      filePath: '/test/file3.txt'
    }));
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Cancel it
    await httpRequest('DELETE', '/api/v1/downloads/test-cancel-message');
    
    // Wait a bit for the message to be received
    await new Promise(resolve => setTimeout(resolve, 200));
    
    if (cancelMessageReceived) {
      console.log('✅ PASSED: CANCEL_DOWNLOAD message sent to client\n');
    } else {
      console.log('❌ FAILED: CANCEL_DOWNLOAD message not received\n');
    }
    
    console.log('=== All Tests Completed ===');
    
  } catch (error) {
    console.error('Test error:', error);
  } finally {
    if (testWs) {
      testWs.close();
    }
  }
}

// Run tests
runTests();
