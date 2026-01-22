const WebSocket = require('ws');
const axios = require('axios');

const WS_URL = 'ws://localhost:8080';
const HTTP_URL = 'http://localhost:3000';

async function testWithRealDownload() {
  console.log('Testing with a real download flow...\n');
  
  const ws = new WebSocket(WS_URL);
  const clientId = `test-client-${Date.now()}`;
  const filePath = '/test/sample.txt';
  let requestId = null;
  
  // Connect and register
  await new Promise((resolve) => {
    ws.on('open', () => {
      console.log('✅ WebSocket connected');
      
      ws.send(JSON.stringify({
        type: 'REGISTER',
        clientId: clientId
      }));
    });
    
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'REGISTER_ACK') {
        console.log('✅ Client registered');
        resolve();
      }
    });
  });
  
  // Create a second connection to trigger download
  const ws2 = new WebSocket(WS_URL);
  
  await new Promise((resolve) => {
    ws2.on('open', () => {
      console.log('✅ Second WebSocket connected (as requester)');
      
      // Register as requester
      ws2.send(JSON.stringify({
        type: 'REGISTER',
        clientId: `${clientId}-requester`
      }));
    });
    
    ws2.on('message', (data) => {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'REGISTER_ACK') {
        console.log('✅ Requester registered');
        resolve();
      }
    });
  });
  
  // Trigger a download request
  ws2.send(JSON.stringify({
    type: 'DOWNLOAD_REQUEST',
    clientId: clientId,
    filePath: filePath,
    requestId: `test-${Date.now()}`
  }));
  
  // Wait for DOWNLOAD_ACK to get the requestId
  await new Promise((resolve) => {
    ws2.on('message', (data) => {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'DOWNLOAD_ACK') {
        requestId = message.requestId;
        console.log(`✅ Download ACK received, requestId: ${requestId}`);
        resolve();
      }
    });
    
    // Simulate ACK from first client
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'DOWNLOAD_REQUEST') {
        console.log('✅ Received download request, sending ACK...');
        
        // Send ACK with file info
        ws.send(JSON.stringify({
          type: 'DOWNLOAD_ACK',
          requestId: message.requestId,
          success: true,
          fileSize: 1048576, // 1MB
          totalChunks: 1,
          fileChecksum: 'abc123'
        }));
        
        requestId = message.requestId;
        resolve();
      }
    });
  });
  
  // Now test the status endpoint
  if (requestId) {
    console.log(`\nTesting status endpoint for requestId: ${requestId}`);
    
    try {
      const response = await axios.get(`${HTTP_URL}/api/v1/downloads/${requestId}`);
      console.log('✅ Status endpoint response:');
      console.log(JSON.stringify(response.data, null, 2));
      
      // Verify required fields
      const required = ['success', 'requestId', 'clientId', 'status', 'progress', 'startedAt'];
      const missing = required.filter(field => !(field in response.data));
      
      if (missing.length === 0) {
        console.log('\n✅ All required fields present');
      } else {
        console.log(`\n❌ Missing fields: ${missing.join(', ')}`);
      }
      
      // Verify progress fields
      const progressFields = ['chunksReceived', 'totalChunks', 'percentage', 'bytesReceived', 'retriedChunks'];
      const missingProgress = progressFields.filter(field => !(field in response.data.progress));
      
      if (missingProgress.length === 0) {
        console.log('✅ All progress fields present');
      } else {
        console.log(`❌ Missing progress fields: ${missingProgress.join(', ')}`);
      }
      
    } catch (error) {
      console.error('❌ Error calling status endpoint:', error.message);
    }
  }
  
  // Close connections
  ws.close();
  ws2.close();
  
  console.log('\n✅ Test completed!');
}

// Run the test
testWithRealDownload().catch(console.error);
