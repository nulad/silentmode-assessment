const WebSocket = require('ws');
const logger = require('./utils/logger');
const config = require('./config');
const { MESSAGE_TYPES, validateMessage } = require('../../shared/protocol');

class WebSocketServer {
  constructor() {
    this.wss = null;
    this.clients = new Map();
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
    // This will be implemented in the file transfer module
    this.sendToClient(clientId, {
      type: MESSAGE_TYPES.DOWNLOAD_ACK,
      success: false,
      fileId: '',
      totalChunks: 0,
      fileSize: 0,
      checksum: '',
      message: 'File transfer not yet implemented'
    });
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

  /**
   * Send DOWNLOAD_REQUEST to a specific client
   * @param {string} clientId - The registered client ID
   * @param {string} requestId - The download request ID
   * @param {string} filePath - The file path to download
   */
  sendDownloadRequest(clientId, requestId, filePath) {
    const message = {
      type: MESSAGE_TYPES.DOWNLOAD_REQUEST,
      requestId,
      filePath,
      chunkSize: config.CHUNK_SIZE,
      timestamp: new Date().toISOString()
    };

    // Find the WebSocket connection for this client
    let targetClient = null;
    for (const [connectionId, clientInfo] of this.clients) {
      if (clientInfo.registeredId === clientId && clientInfo.ws.readyState === WebSocket.OPEN) {
        targetClient = clientInfo;
        break;
      }
    }

    if (!targetClient) {
      throw new Error(`Client ${clientId} not connected`);
    }

    // Send the message
    try {
      targetClient.ws.send(JSON.stringify(message));
      logger.info(`Sent DOWNLOAD_REQUEST to client ${clientId} for request ${requestId}`);
    } catch (error) {
      logger.error(`Failed to send DOWNLOAD_REQUEST to client ${clientId}:`, error);
      throw error;
    }
  }
}

module.exports = WebSocketServer;
