const { v4: uuidv4 } = require('uuid');
const logger = require('./utils/logger');
const { CONSTANTS } = require('../../shared/protocol');

class DownloadManager {
  constructor(websocketServer) {
    this.wsServer = websocketServer;
    this.downloads = new Map(); // requestId -> download info
  }

  /**
   * Initiate a download request to a client
   * @param {string} clientId - The registered client ID
   * @param {string} filePath - Path to the file to download
   * @returns {Promise<string>} - Returns the request ID
   */
  async initiateDownload(clientId, filePath) {
    const requestId = uuidv4();
    
    // Store download info
    this.downloads.set(requestId, {
      requestId,
      clientId,
      filePath,
      status: 'pending',
      createdAt: new Date(),
      chunkSize: CONSTANTS.CHUNK_SIZE
    });

    logger.info(`Initiating download ${requestId} for client ${clientId}, file: ${filePath}`);

    try {
      // Send download request to client
      await this.wsServer.sendDownloadRequest(clientId, requestId, filePath);
      return requestId;
    } catch (error) {
      // Update status to failed if we can't send the request
      const download = this.downloads.get(requestId);
      if (download) {
        download.status = 'failed';
        download.error = error.message;
      }
      throw error;
    }
  }

  /**
   * Get download status
   * @param {string} requestId - The download request ID
   * @returns {object} - Download info
   */
  getDownload(requestId) {
    return this.downloads.get(requestId);
  }

  /**
   * List all downloads
   * @returns {Array} - Array of download info
   */
  listDownloads() {
    return Array.from(this.downloads.values());
  }

  /**
   * Update download status
   * @param {string} requestId - The download request ID
   * @param {string} status - New status
   * @param {object} updates - Additional fields to update
   */
  updateDownload(requestId, status, updates = {}) {
    const download = this.downloads.get(requestId);
    if (download) {
      download.status = status;
      Object.assign(download, updates);
      download.updatedAt = new Date();
    }
  }

  /**
   * Cancel a download
   * @param {string} requestId - The download request ID
   */
  cancelDownload(requestId) {
    const download = this.downloads.get(requestId);
    if (download) {
      download.status = 'cancelled';
      download.updatedAt = new Date();
      
      // Send cancel message to client
      this.wsServer.sendCancelDownload(download.clientId, requestId, 'Cancelled by server');
    }
  }
}

module.exports = DownloadManager;
