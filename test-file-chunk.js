const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// Create a test file if it doesn't exist
const testFilePath = path.join(process.env.HOME, 'test-chunk-file.txt');
const testContent = 'This is a test file for chunked transfer. '.repeat(100); // Create ~3KB file

if (!fs.existsSync(testFilePath)) {
  fs.writeFileSync(testFilePath, testContent);
  console.log(`Created test file: ${testFilePath}`);
}

// Connect to server as admin to trigger download
const ws = new WebSocket('ws://localhost:8081');

let chunkCount = 0;
let totalChunks = 0;
let downloadComplete = false;

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
  console.log('Received:', message.type);
  
  if (message.type === 'REGISTER_ACK' && message.success) {
    console.log('Registration successful, sending download request...');
    
    // Send download request to test-client-001
    ws.send(JSON.stringify({
      type: 'DOWNLOAD_REQUEST',
      clientId: 'test-client-001',
      filePath: '~/test-chunk-file.txt',
      requestId: 'test-chunk-req-001'
    }));
  } else if (message.type === 'DOWNLOAD_ACK') {
    console.log(`DOWNLOAD_ACK received: File size=${message.fileSize}, Chunks=${message.totalChunks}`);
    totalChunks = message.totalChunks;
  } else if (message.type === 'FILE_CHUNK') {
    chunkCount++;
    const progress = Math.round((chunkCount / totalChunks) * 100);
    console.log(`FILE_CHUNK ${chunkCount}/${totalChunks} (${progress}%) - Size: ${message.size}, Checksum: ${message.checksum.substring(0, 16)}...`);
    
    // Verify chunk data is base64 encoded
    const chunkData = Buffer.from(message.data, 'base64');
    if (chunkData.length !== message.size) {
      console.error(`Chunk size mismatch! Expected ${message.size}, got ${chunkData.length}`);
    }
  } else if (message.type === 'DOWNLOAD_COMPLETE') {
    downloadComplete = true;
    console.log('DOWNLOAD_COMPLETE received:', message.message);
    console.log(`\n✅ Test completed successfully! Received all ${chunkCount} chunks.`);
  } else if (message.type === 'ERROR') {
    console.error('ERROR received:', message.error);
  }
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});

ws.on('close', () => {
  console.log('Disconnected from server');
  
  // Check if test was successful
  if (!downloadComplete && totalChunks > 0) {
    console.log(`\n❌ Test incomplete: Only received ${chunkCount}/${totalChunks} chunks`);
  }
});

// Close after 15 seconds
setTimeout(() => {
  if (!downloadComplete) {
    console.log('\n⏰ Test timeout');
  }
  ws.close();
}, 15000);
