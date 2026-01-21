import WebSocket from 'ws';
import EventEmitter from 'events';
import config from './config.js';
import logger from './utils/logger.js';
import { MESSAGE_TYPES, validateMessage } from '../../shared/protocol.js';

class WebSocketClient extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.url = config.SERVER_WS_URL;
    
    // Bind methods to preserve context
    this.onOpen = this.onOpen.bind(this);
    this.onMessage = this.onMessage.bind(this);
    this.onClose = this.onClose.bind(this);
    this.onError = this.onError.bind(this);
  }

  /**
   * Connect to the WebSocket server
   */
  connect() {
    logger.info(`Connecting to WebSocket server at ${this.url}`);
    
    try {
      this.ws = new WebSocket(this.url);
      
      // Set up event listeners
      this.ws.on('open', this.onOpen);
      this.ws.on('message', this.onMessage);
      this.ws.on('close', this.onClose);
      this.ws.on('error', this.onError);
      
    } catch (error) {
      logger.error(`Failed to create WebSocket connection: ${error.message}`);
      this.emit('error', error);
    }
  }

  /**
   * Handle WebSocket open event
   */
  onOpen() {
    logger.info('WebSocket connection established');
    this.isConnected = true;
    this.reconnectAttempts = 0;
    this.emit('open');
    
    // Trigger registration after connection is open
    this.register();
  }

  /**
   * Handle WebSocket message event
   */
  onMessage(data) {
    try {
      // Parse JSON message
      const message = JSON.parse(data.toString());
      logger.debug(`Received message: ${JSON.stringify(message)}`);
      
      // Validate message structure
      if (!message.type) {
        throw new Error('Message missing required field: type');
      }
      
      // Route message by type
      this.routeMessage(message);
      
    } catch (error) {
      logger.error(`Failed to parse incoming message: ${error.message}`);
      this.emit('error', error);
    }
  }

  /**
   * Route messages based on their type
   */
  routeMessage(message) {
    const { type, data } = message;
    
    // Validate message if schema exists
    try {
      validateMessage(type, data || {});
    } catch (error) {
      logger.error(`Message validation failed: ${error.message}`);
      return;
    }
    
    // Emit typed events
    switch (type) {
      case MESSAGE_TYPES.REGISTER_ACK:
        this.emit('registerAck', data);
        break;
        
      case MESSAGE_TYPES.DOWNLOAD_ACK:
        this.emit('downloadAck', data);
        break;
        
      case MESSAGE_TYPES.FILE_CHUNK:
        this.emit('fileChunk', data);
        break;
        
      case MESSAGE_TYPES.DOWNLOAD_COMPLETE:
        this.emit('downloadComplete', data);
        break;
        
      case MESSAGE_TYPES.ERROR:
        this.emit('serverError', data);
        break;
        
      case MESSAGE_TYPES.PONG:
        this.emit('pong', data);
        break;
        
      default:
        logger.warn(`Unknown message type: ${type}`);
        this.emit('unknownMessage', message);
    }
    
    // Also emit generic message event
    this.emit('message', message);
  }

  /**
   * Handle WebSocket close event
   */
  onClose(code, reason) {
    logger.info(`WebSocket connection closed: ${code} - ${reason}`);
    this.isConnected = false;
    this.ws = null;
    this.emit('close', { code, reason });
    
    // Trigger reconnect logic (will be implemented in task 2.6)
    this.emit('reconnect');
  }

  /**
   * Handle WebSocket error event
   */
  onError(error) {
    logger.error(`WebSocket error: ${error.message}`);
    this.emit('error', error);
  }

  /**
   * Register client with server
   */
  register() {
    if (!this.isConnected) {
      logger.warn('Cannot register: WebSocket not connected');
      return;
    }
    
    const registerMessage = {
      type: MESSAGE_TYPES.REGISTER,
      data: {
        clientId: config.CLIENT_ID
      }
    };
    
    this.send(registerMessage);
  }

  /**
   * Send a message to the server
   */
  send(message) {
    if (!this.isConnected || !this.ws) {
      logger.warn('Cannot send message: WebSocket not connected');
      return false;
    }
    
    try {
      const messageString = JSON.stringify(message);
      this.ws.send(messageString);
      logger.debug(`Sent message: ${JSON.stringify(message)}`);
      return true;
    } catch (error) {
      logger.error(`Failed to send message: ${error.message}`);
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Close the WebSocket connection
   */
  disconnect() {
    if (this.ws && this.isConnected) {
      logger.info('Disconnecting WebSocket connection');
      this.ws.close();
    }
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      url: this.url,
      reconnectAttempts: this.reconnectAttempts
    };
  }
}

export default WebSocketClient;
