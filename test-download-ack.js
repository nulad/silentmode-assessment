#!/usr/bin/env node

/**
 * Simple integration test for DOWNLOAD_ACK handling
 * This test simulates the client-server interaction for download acknowledgment
 */

const WebSocket = require('ws');
const { MESSAGE_TYPES } = require('./shared/protocol');

// Configuration
const SERVER_URL = 'ws://localhost:8080';
const TEST_FILE_PATH = '~/file_to_download.txt';

// Create test file
const fs = require('fs');
const path = require('path');
const os = require('os');

const testFilePath = path.join(os.homedir(), 'file_to_download.txt');

console.log('Creating test file...');
fs.writeFileSync(testFilePath, 'This is a test file for SilentMode download.\n'.repeat(1000));

// Test client
class TestClient {
  constructor() {
    this.ws = null;
    this.clientId = 'test-client-001';
  }

  connect() {
    return new Promise((resolve, reject) => {
      console.log('Connecting to server...');
      this.ws = new WebSocket(SERVER_URL);

      this.ws.on('open', () => {
        console.log('Connected to server');
        this.register();
        resolve();
      });

      this.ws.on('message', (data) => {
        this.handleMessage(data);
      });

      this.ws.on('error', reject);
      this.ws.on('close', () => {
        console.log('Disconnected from server');
      });
    });
  }

  register() {
    this.send({
      type: MESSAGE_TYPES.REGISTER,
      clientId: this.clientId,
      timestamp: new Date().toISOString(),
      metadata: { version: '1.0.0' }
    });
  }

  handleMessage(data) {
    const message = JSON.parse(data.toString());
    console.log('Received message:', message.type);

    switch (message.type) {
      case MESSAGE_TYPES.REGISTER_ACK:
        console.log('Registration successful');
        this.waitForDownloadRequest();
        break;
      case MESSAGE_TYPES.DOWNLOAD_REQUEST:
        console.log('Received download request for:', message.filePath);
        this.handleDownloadRequest(message);
        break;
      case MESSAGE_TYPES.CANCEL_DOWNLOAD:
        console.log('Download cancelled:', message.reason);
        break;
      case MESSAGE_TYPES.PING:
        this.send({ type: MESSAGE_TYPES.PONG });
        break;
    }
  }

  waitForDownloadRequest() {
    console.log('Waiting for download request...');
    console.log('To trigger a download, use the CLI or REST API in another terminal:');
    console.log(`  cd server && npm run cli download ${this.clientId} ${TEST_FILE_PATH}`);
  }

  async handleDownloadRequest(message) {
    try {
      // Check if file exists
      const stats = fs.statSync(testFilePath);
      const fileSize = stats.size;
      const totalChunks = Math.ceil(fileSize / 1048576); // 1MB chunks
      
      // Calculate checksum (simplified)
      const crypto = require('crypto');
      const fileBuffer = fs.readFileSync(testFilePath);
      const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

      // Send success ACK
      this.send({
        type: MESSAGE_TYPES.DOWNLOAD_ACK,
        requestId: message.requestId,
        success: true,
        fileSize: fileSize,
        totalChunks: totalChunks,
        fileChecksum: checksum,
        timestamp: new Date().toISOString()
      });

      console.log(`✓ Sent DOWNLOAD_ACK (success: ${fileSize} bytes, ${totalChunks} chunks)`);
      
      // In a real implementation, we would start sending chunks here
      console.log('Test complete! Press Ctrl+C to exit.');
      
    } catch (error) {
      console.error('File not found:', error.message);
      
      // Send failure ACK
      this.send({
        type: MESSAGE_TYPES.DOWNLOAD_ACK,
        requestId: message.requestId,
        success: false,
        error: {
          code: 'FILE_NOT_FOUND',
          message: error.message
        },
        timestamp: new Date().toISOString()
      });

      console.log('✓ Sent DOWNLOAD_ACK (failure)');
    }
  }

  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }
}

// Run the test
async function runTest() {
  const client = new TestClient();
  
  try {
    await client.connect();
    console.log('\n✅ Test client is ready and waiting for download requests');
    console.log('📁 Test file created at:', testFilePath);
    console.log('\nThe client will respond with DOWNLOAD_ACK when it receives a download request.\n');
  } catch (error) {
    console.error('❌ Failed to connect to server:', error.message);
    console.log('\nMake sure the server is running:');
    console.log('  cd server && npm start');
    process.exit(1);
  }
}

// Cleanup on exit
process.on('SIGINT', () => {
  console.log('\nCleaning up test file...');
  if (fs.existsSync(testFilePath)) {
    fs.unlinkSync(testFilePath);
    console.log('✓ Test file removed');
  }
  process.exit(0);
});

runTest();
