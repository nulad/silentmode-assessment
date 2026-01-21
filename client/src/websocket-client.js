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
      
      // Send success ACK
      this.send({
        type: MESSAGE_TYPES.DOWNLOAD_ACK,
        requestId: message.requestId,
        success: true,
        fileSize: fileInfo.size,
        totalChunks: fileInfo.totalChunks,
        fileChecksum: fileInfo.checksum,
        timestamp: new Date().toISOString()
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
        error: {
          code: 'FILE_NOT_FOUND',
          message: error.message
        },
        timestamp: new Date().toISOString()
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
          fileId: fileId,
          chunkIndex: chunkIndex,
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
      
      // Send DOWNLOAD_COMPLETE message
      this.send({
        type: MESSAGE_TYPES.DOWNLOAD_COMPLETE,
        fileId: fileId,
        success: true,
        message: 'File transfer completed successfully',
        timestamp: new Date().toISOString()
      });
      
      logger.info(`Completed sending file ${filePath} (ID: ${fileId})`);
      
    } catch (error) {
      logger.error(`Error sending file chunks: ${error.message}`);
      
      // Send DOWNLOAD_COMPLETE with error
      this.send({
        type: MESSAGE_TYPES.DOWNLOAD_COMPLETE,
        fileId: fileId,
        success: false,
        message: `File transfer failed: ${error.message}`,
        timestamp: new Date().toISOString()
      });
    }
  }

  handleRetryChunk(message) {
    logger.info(`Retry request for chunk ${message.chunkIndex} of file ${message.fileId}`);
    // Will be implemented in retry logic task
  }

  handleCancelDownload(message) {
    logger.info(`Download cancelled for file ${message.fileId}: ${message.reason}`);
    // Will be implemented in file transfer task
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
