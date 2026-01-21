const { v4: uuidv4 } = require('uuid');
const logger = require('./utils/logger');
const config = require('./config');
const { MESSAGE_TYPES, ERROR_CODES } = require('../../shared/protocol');

class DownloadManager {
  constructor(websocketServer) {
    this.wsServer = websocketServer;
    this.downloads = new Map(); // requestId -> download info
  }

  /**
   * Create a new download request
   * @param {string} clientId - The registered client ID
   * @param {string} filePath - The file path to download
   * @returns {Object} Download request info
   */
  createDownload(clientId, filePath) {
    const requestId = uuidv4();
    
    // Check if client is connected
    const client = this.findClientById(clientId);
    if (!client) {
      throw new Error(`Client ${clientId} not found or not connected`);
    }

    // Create download record
    const download = {
      requestId,
      clientId,
      filePath,
      status: 'pending',
      createdAt: new Date(),
      chunkSize: config.CHUNK_SIZE
    };

    this.downloads.set(requestId, download);
    logger.info(`Created download request ${requestId} for client ${clientId}, file: ${filePath}`);

    // Send download request to client
    this.sendDownloadRequest(clientId, requestId, filePath);

    return download;
  }

  /**
   * Send DOWNLOAD_REQUEST message to client
   * @param {string} clientId - The registered client ID
   * @param {string} requestId - The download request ID
   * @param {string} filePath - The file path to download
   */
  sendDownloadRequest(clientId, requestId, filePath) {
    try {
      this.wsServer.sendDownloadRequest(clientId, requestId, filePath);
      logger.info(`Sent DOWNLOAD_REQUEST to client ${clientId} for request ${requestId}`);
    } catch (error) {
      logger.error(`Failed to send DOWNLOAD_REQUEST to client ${clientId}:`, error);
      // Update download status to failed
      const download = this.downloads.get(requestId);
      if (download) {
        download.status = 'failed';
        download.error = error.message;
      }
      throw error;
    }
  }

  /**
   * Find client by registered ID
   * @param {string} clientId - The registered client ID
   * @returns {Object|null} Client info or null if not found
   */
  findClientById(clientId) {
    const clients = this.wsServer.getConnectedClients();
    return clients.find(c => c.registeredId === clientId);
  }

  /**
   * Get download status
   * @param {string} requestId - The download request ID
   * @returns {Object|null} Download info or null if not found
   */
  getDownload(requestId) {
    return this.downloads.get(requestId) || null;
  }

  /**
   * Get all downloads
   * @returns {Array} Array of all downloads
   */
  getAllDownloads() {
    return Array.from(this.downloads.values());
  }

  /**
   * Update download status (called by websocket server when receiving responses)
   * @param {string} requestId - The download request ID
   * @param {string} status - The new status
   * @param {Object} data - Additional data
   */
  updateDownloadStatus(requestId, status, data = {}) {
    const download = this.downloads.get(requestId);
    if (download) {
      download.status = status;
      download.updatedAt = new Date();
      Object.assign(download, data);
      logger.info(`Updated download ${requestId} status to ${status}`);
    }
  }

  /**
   * Cancel a download
   * @param {string} requestId - The download request ID
   * @param {string} reason - The cancellation reason
   */
  cancelDownload(requestId, reason = 'Cancelled by server') {
    const download = this.downloads.get(requestId);
    if (download) {
      download.status = 'cancelled';
      download.cancelledAt = new Date();
      download.cancellationReason = reason;

      // Send cancel message to client if still connected
      const wsConnection = this.findWebSocketConnection(download.clientId);
      if (wsConnection) {
        const message = {
          type: MESSAGE_TYPES.CANCEL_DOWNLOAD,
          requestId,
          reason,
          timestamp: new Date().toISOString()
        };
        wsConnection.send(JSON.stringify(message));
        logger.info(`Sent CANCEL_DOWNLOAD to client ${download.clientId} for request ${requestId}`);
      }
    }
  }

  /**
   * Clean up old/failed downloads
   * @param {number} maxAge - Maximum age in milliseconds (default: 24 hours)
   */
  cleanup(maxAge = 24 * 60 * 60 * 1000) {
    const now = new Date();
    const toDelete = [];

    for (const [requestId, download] of this.downloads) {
      const age = now - download.createdAt;
      if (age > maxAge && (download.status === 'completed' || download.status === 'failed' || download.status === 'cancelled')) {
        toDelete.push(requestId);
      }
    }

    toDelete.forEach(requestId => {
      this.downloads.delete(requestId);
      logger.debug(`Cleaned up old download ${requestId}`);
    });

    if (toDelete.length > 0) {
      logger.info(`Cleaned up ${toDelete.length} old downloads`);
    }
  }
}

module.exports = DownloadManager;
