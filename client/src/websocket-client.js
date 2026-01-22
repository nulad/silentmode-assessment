import WebSocket from 'ws';
import logger from './utils/logger.js';
import config from './config.js';
import FileHandler from './file-handler.js';
import { MESSAGE_TYPES, validateMessage } from '../../shared/protocol.js';

class WebSocketClient {
  constructor(config) {
    this.config = config;
    this.ws = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.fileHandler = new FileHandler();
    this.activeDownloads = new Map();
  }

  async start() {
    logger.info(`Starting SilentMode client with ID: ${this.config.CLIENT_ID}`);
    this.connect();
  }

  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    logger.info(`Connecting to server: ${this.config.SERVER_WS_URL}`);
    
    this.ws = new WebSocket(this.config.SERVER_WS_URL);

    this.ws.on('open', () => {
      logger.info('Connected to server');
      this.connected = true;
      this.reconnectAttempts = 0;
      this.register();
    });

    this.ws.on('message', (data) => {
      this.handleMessage(data);
    });

    this.ws.on('close', (code, reason) => {
      logger.warn(`Disconnected from server (${code}: ${reason})`);
      this.connected = false;
      this.handleReconnect();
    });

    this.ws.on('error', (error) => {
      logger.error('WebSocket error:', error);
    });
  }

  register() {
    this.send({
      type: MESSAGE_TYPES.REGISTER,
      clientId: this.config.CLIENT_ID,
      timestamp: new Date().toISOString(),
      metadata: { version: '1.0.0' }
    });
  }

  handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      logger.debug(`Received message: ${message.type}`, JSON.stringify(message, null, 2));

      if (!message.type) {
        throw new Error('Message missing type field');
      }

      validateMessage(message.type, message);

      switch (message.type) {
        case MESSAGE_TYPES.REGISTER_ACK:
          this.handleRegisterAck(message);
          break;
        case MESSAGE_TYPES.DOWNLOAD_REQUEST:
          this.handleDownloadRequest(message);
          break;
        case MESSAGE_TYPES.RETRY_CHUNK:
          this.handleRetryChunk(message);
          break;
        case MESSAGE_TYPES.CANCEL_DOWNLOAD:
          this.handleCancelDownload(message);
          break;
        case MESSAGE_TYPES.PING:
          this.handlePing();
          break;
        case MESSAGE_TYPES.PONG:
          // PONG is for server-side heartbeat tracking
          break;
        case MESSAGE_TYPES.ERROR:
          this.handleError(message);
          break;
        default:
          logger.warn(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      logger.error('Error handling message:', error);
    }
  }

  handleRegisterAck(message) {
    if (message.success) {
      logger.info('Registration successful:', message.message);
    } else {
      logger.error('Registration failed:', message.message);
    }
  }

  async handleDownloadRequest(message) {
    logger.info(`Download request for file: ${message.filePath}`);
    
    try {
      // Check if file exists and get info
      const fileInfo = await this.fileHandler.getFileInfo(message.filePath);
      
      // Track this download for retry support
      this.activeDownloads.set(message.requestId, {
        filePath: message.filePath,
        totalChunks: fileInfo.totalChunks,
        fileChecksum: fileInfo.checksum
      });
      
      // Send success ACK
      this.send({
        type: MESSAGE_TYPES.DOWNLOAD_ACK,
        requestId: message.requestId,
        success: true,
        fileSize: fileInfo.size,
        totalChunks: fileInfo.totalChunks,
        fileChecksum: fileInfo.checksum
      });
      
      logger.info(`Sent DOWNLOAD_ACK for ${message.filePath} (${fileInfo.size} bytes, ${fileInfo.totalChunks} chunks)`);
      
      // Start sending chunks
      await this.sendFileChunks(message.requestId, message.filePath);
      
    } catch (error) {
      logger.error(`File not found or error reading file: ${error.message}`);
      
      // Send failure ACK
      this.send({
        type: MESSAGE_TYPES.DOWNLOAD_ACK,
        requestId: message.requestId,
        success: false,
        fileSize: 0,
        totalChunks: 0,
        fileChecksum: ''
      });
    }
  }

  async sendFileChunks(fileId, filePath) {
    logger.info(`Starting to send chunks for file ${filePath} (ID: ${fileId})`);
    
    try {
      const fileInfo = await this.fileHandler.getFileInfo(filePath);
      
      for (let chunkIndex = 0; chunkIndex < fileInfo.totalChunks; chunkIndex++) {
        // Read chunk data
        const chunkData = await this.fileHandler.readChunk(filePath, chunkIndex);
        
        // Calculate checksum
        const checksum = await this.fileHandler.calculateChunkChecksum(filePath, chunkIndex);
        
        // Convert to base64
        const base64Data = chunkData.toString('base64');
        
        // Send FILE_CHUNK message
        this.send({
          type: MESSAGE_TYPES.FILE_CHUNK,
          requestId: fileId,
          chunkIndex: chunkIndex,
          totalChunks: fileInfo.totalChunks,
          data: base64Data,
          checksum: checksum,
          size: chunkData.length,
          timestamp: new Date().toISOString()
        });
        
        // Log progress every 10 chunks
        if ((chunkIndex + 1) % 10 === 0 || chunkIndex === fileInfo.totalChunks - 1) {
          logger.info(`Sent chunk ${chunkIndex + 1}/${fileInfo.totalChunks} for file ${fileId}`);
        }
        
        // Small delay to prevent overwhelming
        if (chunkIndex < fileInfo.totalChunks - 1) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
      
      // Small delay to ensure server has processed all chunks
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Send DOWNLOAD_COMPLETE message
      this.send({
        type: MESSAGE_TYPES.DOWNLOAD_COMPLETE,
        requestId: fileId,
        totalChunks: fileInfo.totalChunks,
        fileChecksum: fileInfo.checksum,
        timestamp: new Date().toISOString()
      });
      
      logger.info(`Completed sending file ${filePath} (ID: ${fileId})`);
      
      // Clean up active download tracking after completion
      this.activeDownloads.delete(fileId);
      
    } catch (error) {
      logger.error(`Error sending file chunks: ${error.message}`);
      
      // Send ERROR message instead of DOWNLOAD_COMPLETE for failures
      this.send({
        type: MESSAGE_TYPES.ERROR,
        code: 'FILE_TRANSFER_FAILED',
        message: `File transfer failed: ${error.message}`,
        details: { requestId: fileId }
      });
      
      // Clean up active download tracking on error
      this.activeDownloads.delete(fileId);
    }
  }

  async handleRetryChunk(message) {
    const { requestId, chunkIndex, attempt, reason } = message;
    
    logger.info(`Retrying chunk ${chunkIndex}, attempt ${attempt} (reason: ${reason})`);
    
    try {
      // Get the active download info
      const download = this.activeDownloads.get(requestId);
      
      if (!download) {
        logger.error(`Cannot retry chunk: download ${requestId} not found in active downloads`);
        return;
      }
      
      const { filePath, totalChunks } = download;
      
      // Validate chunk index
      if (chunkIndex < 0 || chunkIndex >= totalChunks) {
        logger.error(`Invalid chunk index ${chunkIndex} for file with ${totalChunks} chunks`);
        return;
      }
      
      // Re-read the specific chunk from file
      const chunkData = await this.fileHandler.readChunk(filePath, chunkIndex);
      
      // Calculate fresh checksum
      const checksum = await this.fileHandler.calculateChunkChecksum(filePath, chunkIndex);
      
      // Convert to base64
      const base64Data = chunkData.toString('base64');
      
      // Re-send as FILE_CHUNK
      this.send({
        type: MESSAGE_TYPES.FILE_CHUNK,
        requestId: requestId,
        chunkIndex: chunkIndex,
        totalChunks: totalChunks,
        data: base64Data,
        checksum: checksum,
        size: chunkData.length,
        timestamp: new Date().toISOString()
      });
      
      logger.info(`Successfully retried chunk ${chunkIndex} for request ${requestId}`);
      
    } catch (error) {
      logger.error(`Error retrying chunk ${chunkIndex}: ${error.message}`);
      
      // Send ERROR message
      this.send({
        type: MESSAGE_TYPES.ERROR,
        code: 'CHUNK_RETRY_FAILED',
        message: `Failed to retry chunk ${chunkIndex}: ${error.message}`,
        details: { requestId, chunkIndex }
      });
    }
  }

  handleCancelDownload(message) {
    logger.info(`Download cancelled for file ${message.requestId}: ${message.reason}`);
    
    // Clean up active download tracking
    this.activeDownloads.delete(message.requestId);
  }

  handlePing() {
    this.send({
      type: MESSAGE_TYPES.PONG,
      timestamp: new Date().toISOString()
    });
  }

  handleError(message) {
    logger.error(`Received error from server: ${message.code} - ${message.message}`);
  }

  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      logger.warn('Cannot send message, not connected to server');
    }
  }

  handleReconnect() {
    if (this.reconnectAttempts >= this.config.MAX_RECONNECT_ATTEMPTS) {
      logger.error('Max reconnection attempts reached, giving up');
      process.exit(1);
    }

    const delay = this.config.RECONNECT_INTERVAL * Math.pow(2, this.reconnectAttempts);
    logger.info(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

    setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  stop() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

export default WebSocketClient;
