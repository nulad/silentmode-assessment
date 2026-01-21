import logger from './utils/logger.js';
import config from './config.js';
import WebSocketClient from './websocket-client.js';

class SilentModeClient {
  constructor() {
    this.wsClient = new WebSocketClient();
    this.setupMessageHandlers();
  }

  async start() {
    try {
      logger.info('Starting SilentMode client...');
      logger.info(`Client ID: ${config.CLIENT_ID}`);
      logger.info(`Server URL: ${config.SERVER_WS_URL}`);

      // Connect to WebSocket server
      await this.wsClient.connect();
      
      // Handle graceful shutdown
      process.on('SIGINT', () => this.shutdown());
      process.on('SIGTERM', () => this.shutdown());
      
    } catch (error) {
      logger.error('Failed to start client:', error);
      process.exit(1);
    }
  }

  setupMessageHandlers() {
    // Handle download requests
    this.wsClient.onMessage('DOWNLOAD_ACK', (message) => {
      if (message.success) {
        logger.info(`Download request accepted for file: ${message.fileId}`);
        logger.info(`Total chunks: ${message.totalChunks}, File size: ${message.fileSize} bytes`);
      } else {
        logger.error(`Download request rejected: ${message.message}`);
      }
    });

    // Handle file chunks
    this.wsClient.onMessage('FILE_CHUNK', (message) => {
      logger.debug(`Received chunk ${message.chunkIndex} for file: ${message.fileId}`);
      // TODO: Implement file chunk handling
    });

    // Handle download completion
    this.wsClient.onMessage('DOWNLOAD_COMPLETE', (message) => {
      if (message.success) {
        logger.info(`Download completed: ${message.message}`);
      } else {
        logger.error(`Download failed: ${message.message}`);
      }
    });

    // Handle errors
    this.wsClient.onMessage('ERROR', (message) => {
      logger.error(`Server error [${message.code}]: ${message.message}`);
      if (message.details) {
        logger.error('Details:', message.details);
      }
    });
  }

  async requestDownload(filePath) {
    if (!this.wsClient.isConnected()) {
      logger.error('Cannot request download - not connected to server');
      return false;
    }

    logger.info(`Requesting download for: ${filePath}`);
    
    return this.wsClient.sendMessage('DOWNLOAD_REQUEST', {
      clientId: config.CLIENT_ID,
      filePath: filePath
    });
  }

  shutdown() {
    logger.info('Shutting down SilentMode client...');
    
    if (this.wsClient) {
      this.wsClient.disconnect();
    }
    
    logger.info('Client shutdown complete');
    process.exit(0);
  }

  getStatus() {
    return {
      connected: this.wsClient.isConnected(),
      state: this.wsClient.getConnectionState(),
      clientId: config.CLIENT_ID,
      serverUrl: config.SERVER_WS_URL
    };
  }
}

// Start client if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const client = new SilentModeClient();
  client.start().catch(error => {
    logger.error('Failed to start client:', error);
    process.exit(1);
  });
}

export default SilentModeClient;
