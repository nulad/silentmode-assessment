const WebSocket = require('ws');
const logger = require('./utils/logger');
const config = require('./config');
const { MESSAGE_TYPES, validateMessage, ERROR_CODES } = require('../../shared/protocol');
const DownloadManager = require('./download-manager');

class WebSocketServer {
  constructor() {
    this.wss = null;
    this.clients = new Map();
    this.downloadManager = new DownloadManager();
  }

  start() {
    this.wss = new WebSocket.Server({ 
      port: config.WS_PORT,
      perMessageDeflate: false
    });

    this.wss.on('listening', () => {
      logger.info(`WebSocket server listening on port ${config.WS_PORT}`);
    });

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    this.wss.on('error', (error) => {
      logger.error('WebSocket server error:', error);
    });

    return this.wss;
  }

  handleConnection(ws, req) {
    const clientId = this.generateClientId();
    const clientInfo = {
      id: clientId,
      ws: ws,
      ip: req.socket.remoteAddress,
      connectedAt: new Date(),
      isAlive: true
    };

    this.clients.set(clientId, clientInfo);
    logger.info(`Client connected: ${clientId} from ${clientInfo.ip}`);

    ws.on('message', (data) => {
      this.handleMessage(clientId, data);
    });

    ws.on('close', (code, reason) => {
      this.handleClose(clientId, code, reason);
    });

    ws.on('error', (error) => {
      logger.error(`Client ${clientId} error:`, error);
    });

    ws.on('pong', () => {
      clientInfo.isAlive = true;
    });

    this.sendToClient(clientId, {
      type: MESSAGE_TYPES.REGISTER_ACK,
      success: true,
      message: 'Connected to SilentMode server'
    });
  }

  handleMessage(clientId, data) {
    try {
      const message = JSON.parse(data.toString());
      logger.debug(`Received message from ${clientId}:`, message.type);

      if (!message.type) {
        throw new Error('Message missing type field');
      }

      validateMessage(message.type, message);

      switch (message.type) {
        case MESSAGE_TYPES.REGISTER:
          this.handleRegister(clientId, message);
          break;
        case MESSAGE_TYPES.DOWNLOAD_REQUEST:
          this.handleDownloadRequest(clientId, message);
          break;
        case MESSAGE_TYPES.DOWNLOAD_ACK:
          this.handleDownloadAck(clientId, message);
          break;
        case MESSAGE_TYPES.RETRY_CHUNK:
          this.handleRetryChunk(clientId, message);
          break;
        case MESSAGE_TYPES.CANCEL_DOWNLOAD:
          this.handleCancelDownload(clientId, message);
          break;
        case MESSAGE_TYPES.PING:
          this.handlePing(clientId);
          break;
        default:
          logger.warn(`Unknown message type: ${message.type} from ${clientId}`);
          this.sendError(clientId, 'INVALID_REQUEST', `Unknown message type: ${message.type}`);
      }
    } catch (error) {
      logger.error(`Error handling message from ${clientId}:`, error);
      this.sendError(clientId, 'INVALID_REQUEST', error.message);
    }
  }

  handleRegister(clientId, message) {
    logger.info(`Registering client: ${message.clientId}`);
    
    const client = this.clients.get(clientId);
    if (client) {
      client.registeredId = message.clientId;
    }

    this.sendToClient(clientId, {
      type: MESSAGE_TYPES.REGISTER_ACK,
      success: true,
      message: 'Registration successful'
    });
  }

  handleDownloadRequest(clientId, message) {
    logger.info(`Download request from ${clientId} for file: ${message.filePath}`);
    
    // Generate a unique request ID if not provided
    const requestId = message.requestId || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create download in manager
    this.downloadManager.createDownload(clientId, message.filePath, requestId);
    
    // Send DOWNLOAD_REQUEST to client
    this.sendToClient(clientId, {
      type: MESSAGE_TYPES.DOWNLOAD_REQUEST,
      requestId: requestId,
      filePath: message.filePath
    });
  }

  handleDownloadAck(clientId, message) {
    logger.info(`Received DOWNLOAD_ACK from ${clientId} for request ${message.requestId}`);
    
    const client = this.clients.get(clientId);
    if (!client) {
      logger.error(`Received DOWNLOAD_ACK from unknown client: ${clientId}`);
      return;
    }
    
    // Forward to download manager for processing
    this.downloadManager.handleDownloadAck(message.requestId, message);
  }

  handleRetryChunk(clientId, message) {
    logger.info(`Retry chunk request from ${clientId} for file: ${message.fileId}, chunk: ${message.chunkIndex}`);
    // This will be implemented in the retry logic module
  }

  handleCancelDownload(clientId, message) {
    logger.info(`Cancel download from ${clientId} for file: ${message.fileId} reason: ${message.reason}`);
    // This will be implemented in the file transfer module
  }

  handlePing(clientId) {
    this.sendToClient(clientId, {
      type: MESSAGE_TYPES.PONG
    });
  }

  handleClose(clientId, code, reason) {
    const client = this.clients.get(clientId);
    if (client) {
      logger.info(`Client disconnected: ${client.registeredId || clientId} (${code}: ${reason})`);
      this.clients.delete(clientId);
    }
  }

  sendToClient(clientId, message) {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(JSON.stringify(message));
      } catch (error) {
        logger.error(`Error sending message to ${clientId}:`, error);
      }
    }
  }

  sendError(clientId, code, message, details = {}) {
    this.sendToClient(clientId, {
      type: MESSAGE_TYPES.ERROR,
      code,
      message,
      details
    });
  }

  generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  startHeartbeat() {
    setInterval(() => {
      this.clients.forEach((client, clientId) => {
        if (!client.isAlive) {
          logger.warn(`Client ${clientId} failed heartbeat check, terminating`);
          client.ws.terminate();
          this.clients.delete(clientId);
          return;
        }

        client.isAlive = false;
        client.ws.ping();
      });
    }, config.HEARTBEAT_INTERVAL);
  }

  stop() {
    if (this.wss) {
      this.wss.close(() => {
        logger.info('WebSocket server stopped');
      });
    }
  }

  getConnectedClients() {
    return Array.from(this.clients.values()).map(client => ({
      id: client.id,
      registeredId: client.registeredId,
      ip: client.ip,
      connectedAt: client.connectedAt
    }));
  }
}

module.exports = WebSocketServer;
