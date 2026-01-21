const WebSocket = require('ws');
const logger = require('./utils/logger');
const config = require('./config');
const { MESSAGE_TYPES, validateMessage } = require('../../shared/protocol');
const ClientRegistry = require('./client-registry');

class WebSocketServer {
  constructor() {
    this.wss = null;
    this.clientRegistry = new ClientRegistry();
    this.tempConnections = new Map(); // Track unregistered connections
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
    const tempId = this.generateClientId();
    const clientInfo = {
      id: tempId,
      ws: ws,
      ip: req.socket.remoteAddress,
      connectedAt: new Date(),
      isAlive: true
    };

    this.tempConnections.set(tempId, clientInfo);
    logger.info(`Temporary connection: ${tempId} from ${clientInfo.ip}`);

    ws.on('message', (data) => {
      this.handleMessage(tempId, data);
    });

    ws.on('close', (code, reason) => {
      this.handleClose(tempId, code, reason);
    });

    ws.on('error', (error) => {
      logger.error(`Client ${tempId} error:`, error);
    });

    ws.on('pong', () => {
      clientInfo.isAlive = true;
    });

    this.sendToClient(tempId, {
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

  handleRegister(tempId, message) {
    logger.info(`Registering client: ${message.clientId}`);
    
    const tempClient = this.tempConnections.get(tempId);
    if (!tempClient) {
      logger.error(`Temporary connection not found: ${tempId}`);
      return;
    }

    // Add client to registry with metadata
    const success = this.clientRegistry.addClient(message.clientId, tempClient.ws, {
      version: message.version,
      hostname: message.hostname,
      platform: message.platform
    });

    if (success) {
      // Remove from temp connections
      this.tempConnections.delete(tempId);
      // Update the ws reference to use registered ID
      tempClient.registeredId = message.clientId;
      this.tempConnections.set(message.clientId, tempClient);
    }

    this.sendToClient(success ? message.clientId : tempId, {
      type: MESSAGE_TYPES.REGISTER_ACK,
      success: success,
      message: success ? 'Registration successful' : 'Client ID already exists'
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

  handleClose(tempId, code, reason) {
    const client = this.tempConnections.get(tempId);
    if (client) {
      const clientId = client.registeredId || tempId;
      logger.info(`Client disconnected: ${clientId} (${code}: ${reason})`);
      
      // Remove from registry if registered
      if (client.registeredId) {
        this.clientRegistry.removeClient(client.registeredId);
      }
      
      this.tempConnections.delete(tempId);
    }
  }

  sendToClient(clientId, message) {
    let client;
    
    // Try temp connections first (for unregistered clients)
    client = this.tempConnections.get(clientId);
    
    // If not found, try registered clients in temp connections
    if (!client) {
      for (const [tempId, tempClient] of this.tempConnections) {
        if (tempClient.registeredId === clientId) {
          client = tempClient;
          break;
        }
      }
    }
    
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
      // Check temp connections
      for (const [tempId, client] of this.tempConnections) {
        if (!client.isAlive) {
          logger.warn(`Client ${tempId} failed heartbeat check, terminating`);
          client.ws.terminate();
          this.tempConnections.delete(tempId);
          
          // Also remove from registry if registered
          if (client.registeredId) {
            this.clientRegistry.removeClient(client.registeredId);
          }
          continue;
        }

        client.isAlive = false;
        client.ws.ping();
        
        // Update heartbeat in registry if registered
        if (client.registeredId) {
          this.clientRegistry.updateHeartbeat(client.registeredId);
        }
      }
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
    return this.clientRegistry.getAllClients();
  }
  
  /**
   * Get the client registry instance
   * @returns {ClientRegistry} The client registry
   */
  getClientRegistry() {
    return this.clientRegistry;
  }
}

module.exports = WebSocketServer;
