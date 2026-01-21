import WebSocket from 'ws';
import logger from './utils/logger.js';
import config from './config.js';
import { MESSAGE_TYPES, validateMessage } from '../../shared/protocol.js';
import os from 'os';

class WebSocketClient {
  constructor(clientId) {
    this.clientId = clientId;
    this.ws = null;
    this.connected = false;
    this.registered = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const wsUrl = config.SERVER_WS_URL;
      logger.info(`Connecting to SilentMode server at ${wsUrl}`);
      
      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        logger.info('Connected to SilentMode server');
        this.connected = true;
        this.reconnectAttempts = 0;
        
        // Send registration message immediately after connection
        this.register();
        resolve();
      });

      this.ws.on('message', (data) => {
        this.handleMessage(data);
      });

      this.ws.on('close', (code, reason) => {
        logger.info(`Disconnected from server (${code}: ${reason})`);
        this.connected = false;
        this.registered = false;
        this.handleReconnect();
      });

      this.ws.on('error', (error) => {
        logger.error('WebSocket error:', error);
        if (!this.connected) {
          reject(error);
        }
      });
    });
  }

  register() {
    if (!this.connected) {
      logger.error('Cannot register: not connected to server');
      return;
    }

    const registerMessage = {
      type: MESSAGE_TYPES.REGISTER,
      clientId: this.clientId,
      timestamp: new Date().toISOString(),
      metadata: {
        version: '1.0.0',
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch()
      }
    };

    logger.info(`Registering client with ID: ${this.clientId}`);
    this.send(registerMessage);
  }

  handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      logger.debug(`Received message from server:`, message.type);

      if (!message.type) {
        throw new Error('Message missing type field');
      }

      validateMessage(message.type, message);

      switch (message.type) {
        case MESSAGE_TYPES.REGISTER_ACK:
          this.handleRegisterAck(message);
          break;
        case MESSAGE_TYPES.DOWNLOAD_ACK:
          this.handleDownloadAck(message);
          break;
        case MESSAGE_TYPES.FILE_CHUNK:
          this.handleFileChunk(message);
          break;
        case MESSAGE_TYPES.DOWNLOAD_COMPLETE:
          this.handleDownloadComplete(message);
          break;
        case MESSAGE_TYPES.ERROR:
          this.handleError(message);
          break;
        case MESSAGE_TYPES.PING:
          this.handlePing();
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
      logger.info(`Registration successful: ${message.message}`);
      this.registered = true;
    } else {
      logger.error(`Registration failed: ${message.message}`);
      // Close connection if registration failed
      this.ws.close();
    }
  }

  handleDownloadAck(message) {
    logger.info('Download ACK received:', message);
    // Will be implemented in file transfer module
  }

  handleFileChunk(message) {
    logger.debug('Received file chunk:', message.fileId, message.chunkIndex);
    // Will be implemented in file transfer module
  }

  handleDownloadComplete(message) {
    logger.info('Download complete:', message);
    // Will be implemented in file transfer module
  }

  handleError(message) {
    logger.error(`Server error [${message.code}]: ${message.message}`);
    if (message.details) {
      logger.error('Error details:', message.details);
    }
  }

  handlePing() {
    this.send({ type: MESSAGE_TYPES.PONG });
  }

  handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      
      logger.info(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      setTimeout(() => {
        this.connect().catch(error => {
          logger.error('Reconnection failed:', error);
        });
      }, delay);
    } else {
      logger.error('Max reconnection attempts reached');
    }
  }

  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
      } catch (error) {
        logger.error('Error sending message:', error);
      }
    } else {
      logger.error('Cannot send message: WebSocket is not connected');
    }
  }

  requestDownload(filePath) {
    if (!this.registered) {
      logger.error('Cannot request download: client not registered');
      return;
    }

    const message = {
      type: MESSAGE_TYPES.DOWNLOAD_REQUEST,
      clientId: this.clientId,
      filePath: filePath,
      timestamp: new Date().toISOString()
    };

    logger.info(`Requesting download: ${filePath}`);
    this.send(message);
  }

  retryChunk(fileId, chunkIndex) {
    const message = {
      type: MESSAGE_TYPES.RETRY_CHUNK,
      fileId: fileId,
      chunkIndex: chunkIndex,
      timestamp: new Date().toISOString()
    };

    logger.info(`Requesting chunk retry: ${fileId}:${chunkIndex}`);
    this.send(message);
  }

  cancelDownload(fileId, reason = 'User cancelled') {
    const message = {
      type: MESSAGE_TYPES.CANCEL_DOWNLOAD,
      fileId: fileId,
      reason: reason,
      timestamp: new Date().toISOString()
    };

    logger.info(`Cancelling download: ${fileId} - ${reason}`);
    this.send(message);
  }

  disconnect() {
    if (this.ws) {
      logger.info('Disconnecting from server');
      this.ws.close();
      this.connected = false;
      this.registered = false;
    }
  }

  isConnected() {
    return this.connected && this.registered;
  }
}

export default WebSocketClient;
