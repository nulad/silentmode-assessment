#!/usr/bin/env node

const SilentModeServer = require('../src/index');
const WebSocket = require('ws');
const { MESSAGE_TYPES } = require('../../shared/protocol');

// Test configuration
const WS_PORT = 8081; // Use different port to avoid conflicts
const TEST_CLIENT_ID = 'download-manager-test-client';

// Colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testDownloadManager() {
  log('\n=== Download Manager Integration Test ===\n', 'blue');
  
  // Set environment variable for port before loading server
  process.env.WS_PORT = WS_PORT.toString();
  
  // Clear config cache to force reload with new port
  delete require.cache[require.resolve('../src/config')];
  
  let server;
  let wsClient;
  
  try {
    // Start server
    log('Starting SilentMode server...', 'yellow');
    server = new SilentModeServer();
    server.start();
    
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 1000));
    log('✓ Server started', 'green');
    
    // Get download manager
    const downloadManager = server.getDownloadManager();
    log('✓ Download manager accessible', 'green');
    
    // Test creating download directly
    const requestId = downloadManager.createDownload(TEST_CLIENT_ID, '/test/file.txt');
    log(`✓ Created download request: ${requestId}`, 'green');
    
    // Test getting download
    const download = downloadManager.getDownload(requestId);
    if (download && download.clientId === TEST_CLIENT_ID) {
      log('✓ Download retrieved successfully', 'green');
    } else {
      throw new Error('Failed to retrieve download');
    }
    
    // Test updating download
    downloadManager.updateDownload(requestId, { 
      status: 'in_progress',
      totalChunks: 10 
    });
    const updated = downloadManager.getDownload(requestId);
    if (updated.status === 'in_progress' && updated.totalChunks === 10) {
      log('✓ Download updated successfully', 'green');
    } else {
      throw new Error('Failed to update download');
    }
    
    // Test WebSocket integration
    log('\nTesting WebSocket download request...', 'yellow');
    
    // Connect WebSocket client
    wsClient = new WebSocket(`ws://localhost:${WS_PORT}`);
    
    await new Promise((resolve, reject) => {
      wsClient.on('open', () => {
        log('✓ WebSocket connected', 'green');
        
        // Send registration
        wsClient.send(JSON.stringify({
          type: MESSAGE_TYPES.REGISTER,
          clientId: TEST_CLIENT_ID
        }));
      });
      
      wsClient.on('message', (data) => {
        const message = JSON.parse(data.toString());
        log(`Received message: ${JSON.stringify(message, null, 2)}`, 'blue');
        
        if (message.type === MESSAGE_TYPES.REGISTER_ACK) {
          log('✓ Client registered', 'green');
          
          // Send download request
          wsClient.send(JSON.stringify({
            type: MESSAGE_TYPES.DOWNLOAD_REQUEST,
            clientId: TEST_CLIENT_ID,
            filePath: '/test/websocket-file.txt'
          }));
        }
        
        if (message.type === MESSAGE_TYPES.DOWNLOAD_ACK) {
          if (message.fileId) {
            log(`✓ Download request created via WebSocket: ${message.fileId}`, 'green');
            
            // Verify it's in the download manager
            const wsDownload = downloadManager.getDownload(message.fileId);
            if (wsDownload && wsDownload.clientId === TEST_CLIENT_ID) {
              log('✓ Download tracked in manager', 'green');
              resolve();
            } else {
              reject(new Error('Download not found in manager'));
            }
          } else {
            reject(new Error('No file ID in download ACK'));
          }
        }
      });
      
      wsClient.on('error', reject);
    });
    
    // Test statistics
    const stats = downloadManager.getStatistics();
    log(`\nDownload Statistics:`, 'yellow');
    log(`  Total downloads: ${stats.total}`, 'reset');
    log(`  Pending: ${stats.pending}`, 'reset');
    log(`  In progress: ${stats.in_progress}`, 'reset');
    
    // Test filtering
    const clientDownloads = downloadManager.getClientDownloads(TEST_CLIENT_ID);
    if (clientDownloads.length === 2) {
      log('✓ Client filtering works correctly', 'green');
    }
    
    log('\n=== Test Result ===', 'blue');
    log('✓ All tests PASSED\n', 'green');
    
  } catch (error) {
    log(`\n✗ Test FAILED: ${error.message}\n`, 'red');
    process.exit(1);
  } finally {
    // Cleanup
    if (wsClient) {
      wsClient.close();
    }
    if (server) {
      server.shutdown();
    }
  }
}

// Run the test
testDownloadManager();
