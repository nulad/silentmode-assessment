const WebSocket = require('ws');
const logger = require('./utils/logger');
const config = require('./config');
const { MESSAGE_TYPES, validateMessage, ERROR_CODES, RETRY_REASONS } = require('../../shared/protocol');
const DownloadManager = require('./download-manager');
const { validate: uuidValidate } = require('uuid');
const { chunkManager } = require('./chunk-manager');

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

    // Set up chunk timeout event listener
    chunkManager.on('chunkTimeout', (data) => {
      this.handleChunkTimeout(data);
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
      lastHeartbeat: new Date()
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
        case MESSAGE_TYPES.FILE_CHUNK:
          this.handleFileChunk(clientId, message);
          break;
        case MESSAGE_TYPES.DOWNLOAD_COMPLETE:
          this.handleDownloadComplete(clientId, message);
          break;
        case MESSAGE_TYPES.RETRY_CHUNK:
          this.handleRetryChunk(clientId, message);
          break;
        case MESSAGE_TYPES.CANCEL_DOWNLOAD:
          this.handleCancelDownload(clientId, message);
          break;
        case MESSAGE_TYPES.PING:
          this.handlePing(clientId, message);
          break;
        case MESSAGE_TYPES.PONG:
          this.handlePong(clientId, message);
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

  findClientByRegisteredId(registeredId) {
    logger.debug(`Looking for client with registered ID: ${registeredId}`);
    logger.debug(`Connected clients: ${Array.from(this.clients.entries()).map(([id, client]) => `${id} -> ${client.registeredId}`).join(', ')}`);
    
    for (const [clientId, client] of this.clients.entries()) {
      if (client.registeredId === registeredId) {
        logger.debug(`Found client: ${clientId}`);
        return client;
      }
    }
    logger.debug(`Client not found`);
    return null;
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
    // Validate clientId
    if (!message.clientId || typeof message.clientId !== 'string' || 
        !/^[a-zA-Z0-9-]+$/.test(message.clientId) || 
        message.clientId.length < 1 || message.clientId.length > 64) {
      this.sendError(clientId, 'INVALID_REQUEST', 'ClientId must be alphanumeric with hyphens, 1-64 characters');
      return;
    }

    // Validate filePath
    if (!message.filePath || typeof message.filePath !== 'string' || 
        !message.filePath.startsWith('/') || message.filePath.includes('..')) {
      this.sendError(clientId, 'INVALID_REQUEST', 'FilePath must be an absolute path without directory traversal');
      return;
    }

    // Validate requestId if provided
    if (message.requestId && !uuidValidate(message.requestId)) {
      this.sendError(clientId, 'INVALID_REQUEST', 'RequestId must be a valid UUID v4');
      return;
    }

    logger.info(`Download request initiated for client: ${message.clientId}, file: ${message.filePath}`);
    
    // Generate a unique request ID if not provided
    const requestId = message.requestId || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create download in manager, tracking the requester
    this.downloadManager.createDownload(message.clientId, message.filePath, requestId, clientId);
    
    // Find the target client
    let targetClientId = null;
    for (const [cid, client] of this.clients.entries()) {
      if (client.registeredId === message.clientId) {
        targetClientId = cid;
        break;
      }
    }
    
    if (!targetClientId) {
      logger.error(`Target client ${message.clientId} not found`);
      this.downloadManager.failDownload(requestId, new Error('Client not connected'));
      return;
    }
    
    // Send DOWNLOAD_REQUEST to target client
    const requestMessage = {
      type: MESSAGE_TYPES.DOWNLOAD_REQUEST,
      clientId: message.clientId,
      requestId: requestId,
      filePath: message.filePath
    };
    logger.debug(`Sending message to target client:`, JSON.stringify(requestMessage, null, 2));
    this.sendToClient(targetClientId, requestMessage);
    
    logger.info(`Sent DOWNLOAD_REQUEST ${requestId} to client ${message.clientId}`);
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
    
    // Forward ACK to the requester
    const download = this.downloadManager.getDownload(message.requestId);
    if (download && download.requesterClientId) {
      this.sendToClient(download.requesterClientId, message);
    }
  }

  async handleFileChunk(clientId, message) {
    logger.debug(`Received FILE_CHUNK from ${clientId} for request ${message.requestId}, chunk ${message.chunkIndex + 1}/${message.totalChunks}`);
    
    const client = this.clients.get(clientId);
    if (!client) {
      logger.error(`Received FILE_CHUNK from unknown client: ${clientId}`);
      return;
    }
    
    // Forward to download manager for processing
    const result = await this.downloadManager.handleFileChunk(message.requestId, message);
    
    // If chunk failed and needs retry, send RETRY_CHUNK message
    if (!result.success && result.needsRetry) {
      const download = this.downloadManager.getDownload(message.requestId);
      if (download) {
        const reason = result.error === 'CHUNK_CHECKSUM_FAILED' 
          ? RETRY_REASONS.CHECKSUM_FAILED 
          : RETRY_REASONS.TIMEOUT;
        
        this.sendRetryChunk(clientId, message.requestId, result.chunkIndex, reason);
      }
    }
    
    // Forward chunk to the requester
    const download = this.downloadManager.getDownload(message.requestId);
    if (download && download.requesterClientId) {
      this.sendToClient(download.requesterClientId, message);
    }
  }

  async handleDownloadComplete(clientId, message) {
    logger.info(`Received DOWNLOAD_COMPLETE from ${clientId} for request ${message.requestId}, totalChunks: ${message.totalChunks}`);
    
    const client = this.clients.get(clientId);
    if (!client) {
      logger.error(`Received DOWNLOAD_COMPLETE from unknown client: ${clientId}`);
      return;
    }
    
    // Check for missing chunks before processing completion
    const missingChunks = this.downloadManager.getMissingChunks(message.requestId);
    if (missingChunks.length > 0) {
      logger.warn(`Download ${message.requestId} has ${missingChunks.length} missing chunks, sending retry requests`);
      
      // Send RETRY_CHUNK for each missing chunk
      for (const chunkIndex of missingChunks) {
        this.sendRetryChunk(clientId, message.requestId, chunkIndex, RETRY_REASONS.MISSING);
      }
      
      return;
    }
    
    // Forward to download manager for processing
    await this.downloadManager.handleDownloadComplete(message.requestId, message);
    
    // Forward completion to the requester
    const download = this.downloadManager.getDownload(message.requestId);
    if (download && download.requesterClientId) {
      this.sendToClient(download.requesterClientId, message);
    }
  }

  handleRetryChunk(clientId, message) {
    logger.info(`Retry chunk request from ${clientId} for file: ${message.fileId}, chunk: ${message.chunkIndex}`);
    // This will be implemented in the retry logic module
  }

  handleCancelDownload(clientId, message) {
    logger.info(`Cancel download from ${clientId} for file: ${message.fileId} reason: ${message.reason}`);
    // This will be implemented in the file transfer module
  }

  handlePing(clientId, message) {
    this.sendToClient(clientId, {
      type: MESSAGE_TYPES.PONG,
      timestamp: new Date().toISOString()
    });
  }

  handlePong(clientId, message) {
    const client = this.clients.get(clientId);
    if (client) {
      client.lastHeartbeat = new Date();
      logger.debug(`Received PONG from ${clientId}`);
    }
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

  handleChunkTimeout(data) {
    const { requestId, chunkIndex } = data;
    logger.info(`Chunk timeout detected for request ${requestId}, chunk ${chunkIndex}`);
    
    // Find which client has this download
    const download = this.downloadManager.getDownload(requestId);
    if (!download) {
      logger.error(`Download ${requestId} not found for timeout handling`);
      return;
    }
    
    // Find the client ID for the download
    let clientId = null;
    for (const [cid, client] of this.clients.entries()) {
      if (client.registeredId === download.clientId) {
        clientId = cid;
        break;
      }
    }
    
    if (!clientId) {
      logger.error(`Client not found for download ${requestId}`);
      return;
    }
    
    // Send retry chunk with timeout reason
    this.sendRetryChunk(clientId, requestId, chunkIndex, RETRY_REASONS.TIMEOUT);
  }

  sendError(clientId, code, message, details = {}) {
    this.sendToClient(clientId, {
      type: MESSAGE_TYPES.ERROR,
      code,
      message,
      details
    });
  }

  /**
   * Send RETRY_CHUNK message to client with exponential backoff
   * @param {string} clientId - Target client ID
   * @param {string} requestId - Request ID
   * @param {number} chunkIndex - Chunk index to retry
   * @param {string} reason - Retry reason (CHECKSUM_FAILED, TIMEOUT, MISSING)
   */
  sendRetryChunk(clientId, requestId, chunkIndex, reason) {
    const download = this.downloadManager.getDownload(requestId);
    if (!download) {
      logger.error(`Cannot send RETRY_CHUNK: download ${requestId} not found`);
      return;
    }

    const failedChunk = download.failedChunks.get(chunkIndex);
    const attempt = failedChunk ? failedChunk.attempts + 1 : 1;

    // Check if max retry attempts exceeded
    if (attempt > config.MAX_CHUNK_RETRY_ATTEMPTS) {
      logger.error(`Max retry attempts (${config.MAX_CHUNK_RETRY_ATTEMPTS}) exceeded for request ${requestId}, chunk ${chunkIndex}`);
      this.downloadManager.failDownload(requestId, new Error(`Max retry attempts exceeded for chunk ${chunkIndex}`));
      return;
    }

    // Calculate exponential backoff delay: CHUNK_RETRY_DELAY * (2 ^ (attempt - 1))
    const backoffDelay = config.CHUNK_RETRY_DELAY * Math.pow(2, attempt - 1);

    const retryMessage = {
      type: MESSAGE_TYPES.RETRY_CHUNK,
      requestId: requestId,
      chunkIndex: chunkIndex,
      attempt: attempt,
      reason: reason,
      timestamp: new Date().toISOString()
    };

    logger.info(`Scheduling RETRY_CHUNK for request ${requestId}, chunk ${chunkIndex}, attempt ${attempt}/${config.MAX_CHUNK_RETRY_ATTEMPTS}, reason: ${reason}, delay: ${backoffDelay}ms`);
    
    // Update retry tracking before sending
    this.downloadManager.updateRetryTracking(requestId, chunkIndex, attempt, 'pending', reason);
    
    // Send retry message after backoff delay
    setTimeout(() => {
      this.sendToClient(clientId, retryMessage);
      logger.info(`Sent RETRY_CHUNK for request ${requestId}, chunk ${chunkIndex}, attempt ${attempt}`);
    }, backoffDelay);
  }

  generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  startHeartbeat() {
    const STALE_TIMEOUT = config.HEARTBEAT_INTERVAL * 3; // 90 seconds

    setInterval(() => {
      const now = new Date();

      this.clients.forEach((client, clientId) => {
        // Check if client is stale (no PONG for 90 seconds)
        const timeSinceLastHeartbeat = now - client.lastHeartbeat;

        if (timeSinceLastHeartbeat > STALE_TIMEOUT) {
          logger.warn(`Client ${clientId} is stale (no PONG for ${timeSinceLastHeartbeat}ms), terminating`);
          client.ws.terminate();
          this.clients.delete(clientId);
          return;
        }

        // Send PING to client
        this.sendToClient(clientId, {
          type: MESSAGE_TYPES.PING,
          timestamp: now.toISOString()
        });
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
   * Trigger a download to a specific client (for testing/CLI)
   * @param {string} clientId - Target client ID
   * @param {string} filePath - File path to download
   * @param {string} requesterClientId - Optional requester client ID
   * @returns {string} Request ID
   */
  triggerDownload(clientId, filePath, requesterClientId = null) {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create download in manager
    this.downloadManager.createDownload(clientId, filePath, requestId, requesterClientId);
    
    // Find the target client
    let targetClientId = null;
    for (const [cid, client] of this.clients.entries()) {
      if (client.registeredId === clientId) {
        targetClientId = cid;
        break;
      }
    }
    
    if (!targetClientId) {
      throw new Error(`Client ${clientId} not found`);
    }
    
    // Send DOWNLOAD_REQUEST to target client
    this.sendToClient(targetClientId, {
      type: MESSAGE_TYPES.DOWNLOAD_REQUEST,
      requestId: requestId,
      filePath: filePath
    });
    
    logger.info(`Triggered download ${requestId} for client ${clientId}, file: ${filePath}`);
    return requestId;
  }
}

module.exports = WebSocketServer;
