const WebSocket = require('ws');

// Connect to server as admin to trigger download
const ws = new WebSocket('ws://localhost:8080');

ws.on('open', () => {
  console.log('Connected to server');
  
  // Register as admin client
  ws.send(JSON.stringify({
    type: 'REGISTER',
    clientId: 'admin-client',
    timestamp: new Date().toISOString()
  }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  console.log('Received:', message);
  
  if (message.type === 'REGISTER_ACK' && message.success) {
    console.log('Registration successful, sending download request...');
    
    // Send download request to test-client-1
    ws.send(JSON.stringify({
      type: 'DOWNLOAD_REQUEST',
      clientId: 'test-client-1',
      filePath: '~/file_to_download.txt',
      requestId: 'test-req-001'
    }));
  }
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});

ws.on('close', () => {
  console.log('Disconnected from server');
});

// Close after 10 seconds
setTimeout(() => {
  ws.close();
}, 10000);
