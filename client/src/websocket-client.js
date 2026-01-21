import WebSocket from 'ws';
import logger from './utils/logger.js';
import config from './config.js';
import { MESSAGE_TYPES, validateMessage } from '../../shared/protocol.js';

class WebSocketClient {
  constructor() {
    this.ws = null;
    this.reconnectAttempts = 0;
    this.isConnecting = false;
    this.isManualClose = false;
    this.messageHandlers = new Map();
    this.heartbeatInterval = null;
  }

  async connect() {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isConnecting = true;
    this.isManualClose = false;

    try {
      logger.info(`Connecting to WebSocket server: ${config.SERVER_WS_URL}`);
      
      this.ws = new WebSocket(config.SERVER_WS_URL);
      
      this.ws.on('open', () => {
        logger.info('Connected to WebSocket server');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.register();
      });

      this.ws.on('message', (data) => {
        this.handleMessage(data);
      });

      this.ws.on('close', (code, reason) => {
        logger.warn(`WebSocket connection closed: ${code} - ${reason}`);
        this.isConnecting = false;
        this.stopHeartbeat();
        
        if (!this.isManualClose && this.reconnectAttempts < config.MAX_RECONNECT_ATTEMPTS) {
          this.scheduleReconnect();
        }
      });

      this.ws.on('error', (error) => {
        logger.error('WebSocket error:', error);
        this.isConnecting = false;
      });

    } catch (error) {
      logger.error('Failed to connect to WebSocket server:', error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  register() {
    const message = {
      type: MESSAGE_TYPES.REGISTER,
      clientId: config.CLIENT_ID
    };
    
    this.sendMessage(MESSAGE_TYPES.REGISTER, message);
    logger.info(`Sent registration for client: ${config.CLIENT_ID}`);
  }

  sendMessage(type, data) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.error('Cannot send message - WebSocket is not connected');
      return false;
    }

    try {
      const message = {
        type,
        ...data,
        timestamp: new Date().toISOString()
      };

      this.ws.send(JSON.stringify(message));
      logger.debug(`Sent message: ${type}`);
      return true;
    } catch (error) {
      logger.error('Failed to send message:', error);
      return false;
    }
  }

  handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      logger.debug(`Received message: ${message.type}`);

      // Validate message structure
      validateMessage(message.type, message);

      // Handle specific message types
      switch (message.type) {
        case MESSAGE_TYPES.REGISTER_ACK:
          this.handleRegisterAck(message);
          break;
        
        case MESSAGE_TYPES.PING:
          this.sendMessage(MESSAGE_TYPES.PONG, {});
          break;
        
        case MESSAGE_TYPES.PONG:
          // Pong received, connection is alive
          break;
        
        default:
          // Call registered handler if exists
          const handler = this.messageHandlers.get(message.type);
          if (handler) {
            handler(message);
          } else {
            logger.warn(`No handler for message type: ${message.type}`);
          }
      }
    } catch (error) {
      logger.error('Failed to handle message:', error);
    }
  }

  handleRegisterAck(message) {
    if (message.success) {
      logger.info(`Registration successful: ${message.message}`);
    } else {
      logger.error(`Registration failed: ${message.message}`);
    }
  }

  onMessage(type, handler) {
    this.messageHandlers.set(type, handler);
  }

  startHeartbeat() {
    this.stopHeartbeat();
    
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendMessage(MESSAGE_TYPES.PING, {});
      }
    }, config.HEARTBEAT_INTERVAL);
    
    logger.debug(`Started heartbeat with interval: ${config.HEARTBEAT_INTERVAL}ms`);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      logger.debug('Stopped heartbeat');
    }
  }

  scheduleReconnect() {
    const delay = Math.min(
      config.RECONNECT_INTERVAL * Math.pow(2, this.reconnectAttempts),
      30000 // Max 30 seconds
    );
    
    this.reconnectAttempts++;
    logger.info(`Scheduling reconnect attempt ${this.reconnectAttempts}/${config.MAX_RECONNECT_ATTEMPTS} in ${delay}ms`);
    
    setTimeout(() => {
      if (!this.isManualClose) {
        this.connect();
      }
    }, delay);
  }

  disconnect() {
    this.isManualClose = true;
    this.stopHeartbeat();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    logger.info('Disconnected from WebSocket server');
  }

  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  getConnectionState() {
    if (!this.ws) return 'DISCONNECTED';
    
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'CONNECTING';
      case WebSocket.OPEN: return 'CONNECTED';
      case WebSocket.CLOSING: return 'CLOSING';
      case WebSocket.CLOSED: return 'DISCONNECTED';
      default: return 'UNKNOWN';
    }
  }
}

export default WebSocketClient;
