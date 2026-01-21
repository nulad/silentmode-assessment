import { WebSocketServer as WSServer } from 'ws';
import logger from './utils/logger.js';
import config from './config.js';
import { MESSAGE_TYPES, validateMessage } from '../../shared/protocol.js';

class WebSocketServer {
  constructor() {
    this.wss = null;
    this.clients = new Map(); // Map of connectionId -> clientInfo
    this.clientRegistry = new Map(); // Map of registeredClientId -> connectionId
  }

  start() {
    this.wss = new WSServer({ 
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

  handleRegister(connectionId, message) {
    logger.info(`Registration request from ${connectionId} for clientId: ${message.clientId}`);
    
    // Check if clientId already exists in registry
    if (this.clientRegistry.has(message.clientId)) {
      const existingConnectionId = this.clientRegistry.get(message.clientId);
      logger.warn(`ClientId ${message.clientId} already registered with connection ${existingConnectionId}`);
      
      // Send rejection response
      this.sendToClient(connectionId, {
        type: MESSAGE_TYPES.REGISTER_ACK,
        success: false,
        message: `ClientId ${message.clientId} is already registered`,
        timestamp: new Date().toISOString()
      });
      return;
    }
    
    const client = this.clients.get(connectionId);
    if (client) {
      // Add to registry
      client.registeredId = message.clientId;
      this.clientRegistry.set(message.clientId, connectionId);
      
      logger.info(`Client registered successfully: ${message.clientId}`);
      this.sendToClient(connectionId, {
        type: MESSAGE_TYPES.REGISTER_ACK,
        success: true,
        message: 'Registration successful',
        timestamp: new Date().toISOString()
      });
    } else {
      logger.error(`Connection ${connectionId} not found in clients map`);
      this.sendToClient(connectionId, {
        type: MESSAGE_TYPES.REGISTER_ACK,
        success: false,
        message: 'Internal server error: connection not found',
        timestamp: new Date().toISOString()
      });
    }
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

  handleClose(connectionId, code, reason) {
    const client = this.clients.get(connectionId);
    if (client) {
      logger.info(`Client disconnected: ${client.registeredId || connectionId} (${code}: ${reason})`);
      
      // Remove from registry if registered
      if (client.registeredId && this.clientRegistry.has(client.registeredId)) {
        this.clientRegistry.delete(client.registeredId);
        logger.info(`Removed ${client.registeredId} from client registry`);
      }
      
      this.clients.delete(connectionId);
    }
  }

  sendToClient(clientId, message) {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === 1) { // WebSocket.OPEN = 1
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

export default WebSocketServer;
