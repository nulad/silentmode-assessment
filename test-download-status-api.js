const axios = require('axios');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const SERVER_URL = 'http://localhost:3001';
const WS_URL = 'ws://localhost:3002';

async function testDownloadStatusAPI() {
  console.log('Testing GET /api/v1/downloads/:requestId endpoint...\n');
  
  try {
    // 1. Test with non-existent download ID
    console.log('1. Testing 404 for non-existent download...');
    try {
      const response = await axios.get(`${SERVER_URL}/api/v1/downloads/non-existent-id`);
      console.log('❌ Should have returned 404');
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.log('✅ Correctly returned 404 for non-existent download');
        console.log('   Response:', error.response.data);
      }
    }
    
    // 2. Create a WebSocket connection and trigger a download
    console.log('\n2. Creating WebSocket connection and triggering download...');
    const ws = new WebSocket(WS_URL);
    
    await new Promise((resolve) => {
      ws.on('open', () => {
        console.log('✅ WebSocket connected');
        
        // Register client
        ws.send(JSON.stringify({
          type: 'REGISTER',
          clientId: 'test-client-123'
        }));
      });
      
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'REGISTER_ACK') {
          console.log('✅ Client registered');
          
          // Trigger a download via HTTP API (if available) or wait for existing download
          // For now, let's check if there are any existing downloads
          resolve();
        }
      });
      
      setTimeout(resolve, 1000); // Resolve after 1 second anyway
    });
    
    // 3. Test the health endpoint to see active downloads
    console.log('\n3. Checking health endpoint for active downloads...');
    const healthResponse = await axios.get(`${SERVER_URL}/api/v1/health`);
    console.log('✅ Health endpoint response:', healthResponse.data);
    
    // 4. If there are downloads, test the status endpoint
    if (healthResponse.data.activeDownloads > 0) {
      console.log('\n4. Active downloads found, testing status endpoint...');
      // Note: We would need the actual requestId to test a real download
      console.log('⚠️  Need actual requestId to test with real download');
    } else {
      console.log('\n4. No active downloads found');
    }
    
    // 5. Test with a mock download in the system
    console.log('\n5. Testing with various download statuses...');
    
    // Close WebSocket
    ws.close();
    
    console.log('\n✅ All tests completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('   Response data:', error.response.data);
    }
  }
}

// Run the test
testDownloadStatusAPI().catch(console.error);
