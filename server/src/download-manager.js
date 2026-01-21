const { v4: uuidv4 } = require('uuid');
const logger = require('./utils/logger');
const { MESSAGE_TYPES } = require('../../shared/protocol');

/**
 * Download Manager tracks active downloads and their states
 */
class DownloadManager {
  constructor() {
    this.downloads = new Map(); // requestId -> download state
  }

  /**
   * Create a new download request
   * @param {string} clientId - Client ID
   * @param {string} filePath - File path to download
   * @param {string} requestId - Optional request ID (will generate if not provided)
   * @returns {string} Request ID
   */
  createDownload(clientId, filePath, requestId = null) {
    const id = requestId || uuidv4();
    
    this.downloads.set(id, {
      id: id,
      clientId,
      filePath,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
      totalChunks: 0,
      fileSize: 0,
      checksum: null,
      error: null,
      chunksReceived: 0,
      progress: 0
    });

    logger.info(`Created download request ${id} for client ${clientId}, file: ${filePath}`);
    return id;
  }

  /**
   * Get download information
   * @param {string} requestId - Request ID
   * @returns {Object|null} Download state or null if not found
   */
  getDownload(requestId) {
    return this.downloads.get(requestId) || null;
  }

  /**
   * Get all downloads
   * @returns {Array} Array of download states
   */
  getAllDownloads() {
    return Array.from(this.downloads.values());
  }

  /**
   * Update download progress
   * @param {string} requestId - Request ID
   * @param {Object} updates - Properties to update
   */
  updateDownload(requestId, updates) {
    const download = this.downloads.get(requestId);
    if (download) {
      Object.assign(download, updates);
      download.updatedAt = new Date();
      
      // Calculate progress percentage
      if (download.totalChunks > 0) {
        download.progress = Math.round((download.chunksReceived / download.totalChunks) * 100);
      }
    }
  }

  /**
   * Handle DOWNLOAD_ACK from client
   * @param {string} requestId - Request ID
   * @param {Object} ack - ACK message from client
   */
  handleDownloadAck(requestId, ack) {
    const download = this.downloads.get(requestId);
    if (!download) {
      logger.warn(`Received DOWNLOAD_ACK for unknown request: ${requestId}`);
      return;
    }

    if (ack.success) {
      // Client has the file and is ready to send
      logger.info(`DOWNLOAD_ACK success for ${requestId}: ${ack.fileSize} bytes, ${ack.totalChunks} chunks`);
      
      this.updateDownload(requestId, {
        status: 'in_progress',
        fileSize: ack.fileSize,
        totalChunks: ack.totalChunks,
        checksum: ack.fileChecksum
      });
    } else {
      // Client cannot fulfill the request
      logger.error(`DOWNLOAD_ACK failed for ${requestId}: ${ack.error?.message || 'Unknown error'}`);
      
      this.updateDownload(requestId, {
        status: 'failed',
        error: ack.error
      });
    }
  }

  /**
   * Mark download as completed
   * @param {string} requestId - Request ID
   * @param {Object} result - Completion details
   */
  completeDownload(requestId, result) {
    logger.info(`Download ${requestId} completed successfully`);
    
    this.updateDownload(requestId, {
      status: 'completed',
      ...result
    });
  }

  /**
   * Mark download as failed
   * @param {string} requestId - Request ID
   * @param {Error} error - Error details
   */
  failDownload(requestId, error) {
    logger.error(`Download ${requestId} failed: ${error.message}`);
    
    this.updateDownload(requestId, {
      status: 'failed',
      error: {
        code: error.code || 'DOWNLOAD_FAILED',
        message: error.message
      }
    });
  }

  /**
   * Cancel a download
   * @param {string} requestId - Request ID
   * @param {string} reason - Cancellation reason
   */
  cancelDownload(requestId, reason) {
    logger.info(`Download ${requestId} cancelled: ${reason}`);
    
    this.updateDownload(requestId, {
      status: 'cancelled',
      error: {
        code: 'DOWNLOAD_CANCELLED',
        message: reason
      }
    });
  }

  /**
   * Clean up old downloads (optional - for memory management)
   * @param {number} maxAge - Maximum age in milliseconds
   */
  cleanup(maxAge = 24 * 60 * 60 * 1000) { // Default 24 hours
    const now = Date.now();
    const toDelete = [];

    for (const [requestId, download] of this.downloads.entries()) {
      if (now - download.updatedAt.getTime() > maxAge) {
        toDelete.push(requestId);
      }
    }

    toDelete.forEach(requestId => {
      this.downloads.delete(requestId);
      logger.debug(`Cleaned up old download: ${requestId}`);
    });

    if (toDelete.length > 0) {
      logger.info(`Cleaned up ${toDelete.length} old downloads`);
    }
  }
}

module.exports = DownloadManager;
