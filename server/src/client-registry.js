const logger = require('./utils/logger');

class ClientRegistry {
  constructor() {
    this.clients = new Map();
  }

  /**
   * Add a new client to the registry
   * @param {string} clientId - Unique client identifier
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} metadata - Client metadata (version, hostname, platform)
   */
  addClient(clientId, ws, metadata = {}) {
    if (this.clients.has(clientId)) {
      logger.warn(`Client ${clientId} already exists, removing old connection`);
      this.removeClient(clientId);
    }

    const client = {
      clientId,
      ws,
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
      status: 'connected',
      metadata: {
        version: metadata.version || 'unknown',
        hostname: metadata.hostname || 'unknown',
        platform: metadata.platform || 'unknown',
        ...metadata
      }
    };

    this.clients.set(clientId, client);
    logger.info(`Client ${clientId} connected from ${client.metadata.hostname}`);
    
    return client;
  }

  /**
   * Remove a client from the registry
   * @param {string} clientId - Client identifier to remove
   */
  removeClient(clientId) {
    const client = this.clients.get(clientId);
    if (client) {
      client.status = 'disconnected';
      this.clients.delete(clientId);
      logger.info(`Client ${clientId} disconnected`);
      return true;
    }
    return false;
  }

  /**
   * Get a specific client by ID
   * @param {string} clientId - Client identifier
   * @returns {Object|null} Client object or null if not found
   */
  getClient(clientId) {
    return this.clients.get(clientId) || null;
  }

  /**
   * Get all connected clients
   * @returns {Array} Array of client objects (without WebSocket references)
   */
  getAllClients() {
    const clients = [];
    for (const [clientId, client] of this.clients) {
      clients.push({
        clientId: client.clientId,
        connectedAt: client.connectedAt,
        lastHeartbeat: client.lastHeartbeat,
        status: client.status,
        metadata: { ...client.metadata }
      });
    }
    return clients;
  }

  /**
   * Update the heartbeat timestamp for a client
   * @param {string} clientId - Client identifier
   */
  updateHeartbeat(clientId) {
    const client = this.clients.get(clientId);
    if (client) {
      client.lastHeartbeat = new Date();
      return true;
    }
    return false;
  }

  /**
   * Check if a client is connected
   * @param {string} clientId - Client identifier
   * @returns {boolean} True if client exists and is connected
   */
  isClientConnected(clientId) {
    const client = this.clients.get(clientId);
    return !!(client && client.status === 'connected');
  }

  /**
   * Get count of connected clients
   * @returns {number} Number of connected clients
   */
  getConnectedCount() {
    return this.clients.size;
  }

  /**
   * Clean up disconnected clients (optional utility)
   */
  cleanup() {
    const before = this.clients.size;
    for (const [clientId, client] of this.clients.entries()) {
      if (client.status === 'disconnected' || client.ws.readyState !== client.ws.OPEN) {
        this.clients.delete(clientId);
      }
    }
    const after = this.clients.size;
    if (before !== after) {
      logger.info(`Cleaned up ${before - after} disconnected clients`);
    }
  }
}

module.exports = ClientRegistry;
