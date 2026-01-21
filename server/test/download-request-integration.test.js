// Set environment variable for test port BEFORE importing server
process.env.WS_PORT = '8081';

const WebSocket = require('ws');
const SilentModeServer = require('../src/index');
const { MESSAGE_TYPES } = require('../../shared/protocol');
const logger = require('../src/utils/logger');

describe('Download Request Integration', () => {
  let server;
  let clientWs;
  let serverInstance;
  let testPort = 8081; // Use a different port

  beforeAll(async () => {
    // Start the server
    serverInstance = new SilentModeServer();
    server = serverInstance.wsServer;
    server.start();
    
    // Wait a bit for server to start
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterAll(async () => {
    if (clientWs) {
      clientWs.close();
    }
    if (server) {
      server.stop();
    }
    // Clean up environment variable
    delete process.env.WS_PORT;
  });

  beforeEach(async () => {
    // Connect a client
    clientWs = new WebSocket(`ws://localhost:${testPort}`);
    
    await new Promise((resolve, reject) => {
      clientWs.on('open', resolve);
      clientWs.on('error', reject);
      
      // Timeout after 1 second
      setTimeout(() => reject(new Error('Connection timeout')), 1000);
    });

    // Register the client
    const registerMessage = {
      type: MESSAGE_TYPES.REGISTER,
      clientId: 'test-client-123'
    };

    clientWs.send(JSON.stringify(registerMessage));
    
    // Wait for registration acknowledgment
    await new Promise((resolve) => {
      clientWs.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === MESSAGE_TYPES.REGISTER_ACK) {
          resolve();
        }
      });
    });
  });

  afterEach(() => {
    if (clientWs && clientWs.readyState === WebSocket.OPEN) {
      clientWs.close();
    }
  });

  test('should send DOWNLOAD_REQUEST to registered client', async () => {
    const downloadManager = serverInstance.getDownloadManager();
    
    // Listen for DOWNLOAD_REQUEST
    const downloadRequestPromise = new Promise((resolve) => {
      clientWs.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === MESSAGE_TYPES.DOWNLOAD_REQUEST) {
          resolve(message);
        }
      });
    });

    // Initiate download
    const filePath = '/home/user/test-file.txt';
    const requestId = await downloadManager.initiateDownload('test-client-123', filePath);

    // Wait for DOWNLOAD_REQUEST message
    const downloadRequest = await downloadRequestPromise;

    // Verify the message structure
    expect(downloadRequest.type).toBe(MESSAGE_TYPES.DOWNLOAD_REQUEST);
    expect(downloadRequest.requestId).toBe(requestId);
    expect(downloadRequest.filePath).toBe(filePath);
    expect(downloadRequest.chunkSize).toBe(1048576);
    expect(downloadRequest.timestamp).toBeDefined();

    // Verify download state
    const download = downloadManager.getDownload(requestId);
    expect(download.status).toBe('pending');
    expect(download.clientId).toBe('test-client-123');
    expect(download.filePath).toBe(filePath);
  });

  test('should handle request to non-existent client', async () => {
    const downloadManager = serverInstance.getDownloadManager();
    
    try {
      await downloadManager.initiateDownload('non-existent-client', '/file.txt');
      fail('Should have thrown an error');
    } catch (error) {
      expect(error.message).toContain('is not connected');
    }
  });
});
