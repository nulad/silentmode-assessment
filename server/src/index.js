require('dotenv').config();
const logger = require('./utils/logger');
const WebSocketServer = require('./websocket-server');
const config = require('./config');

class SilentModeServer {
  constructor() {
    this.wsServer = new WebSocketServer();
  }

  getDownloadManager() {
    return this.wsServer.getDownloadManager();
  }

  async start() {
    try {
      logger.info('Starting SilentMode server...');

      // Start WebSocket server
      this.wsServer.start();
      
      // Start heartbeat for WebSocket connections
      this.wsServer.startHeartbeat();

      logger.info(`SilentMode server started successfully`);
      logger.info(`WebSocket server listening on port ${config.WS_PORT}`);
      
      // Handle graceful shutdown
      process.on('SIGINT', () => this.shutdown());
      process.on('SIGTERM', () => this.shutdown());
      
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  shutdown() {
    logger.info('Shutting down SilentMode server...');
    
    if (this.wsServer) {
      this.wsServer.stop();
    }
    
    logger.info('Server shutdown complete');
    process.exit(0);
  }
}

// Start server if this file is run directly
if (require.main === module) {
  const server = new SilentModeServer();
  server.start();
}

module.exports = SilentModeServer;
