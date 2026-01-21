const { v4: uuidv4 } = require('uuid');
const logger = require('./utils/logger');
const path = require('path');
const fs = require('fs');

class DownloadManager {
  constructor() {
    this.downloads = new Map();
  }

  /**
   * Create a new download request
   * @param {string} clientId - The client ID requesting the download
   * @param {string} filePath - The file path to download
   * @returns {string} The request ID
   */
  createDownload(clientId, filePath) {
    const requestId = uuidv4();
    const now = new Date();
    
    const download = {
      requestId,
      clientId,
      filePath,
      status: 'pending',
      startedAt: now,
      completedAt: null,
      totalChunks: 0,
      chunksReceived: 0,
      bytesReceived: 0,
      fileChecksum: null,
      localPath: null,
      error: null
    };
    
    this.downloads.set(requestId, download);
    logger.info(`Created download request ${requestId} for client ${clientId}, file: ${filePath}`);
    
    return requestId;
  }

  /**
   * Update download with new information
   * @param {string} requestId - The download request ID
   * @param {object} updates - The updates to apply
   */
  updateDownload(requestId, updates) {
    const download = this.downloads.get(requestId);
    if (!download) {
      logger.warn(`Attempted to update non-existent download: ${requestId}`);
      return false;
    }
    
    // Apply updates
    Object.assign(download, updates);
    
    // Log significant status changes
    if (updates.status && download.status !== updates.status) {
      logger.info(`Download ${requestId} status changed: ${download.status} -> ${updates.status}`);
    }
    
    if (updates.chunksReceived) {
      const progress = Math.round((updates.chunksReceived / download.totalChunks) * 100);
      logger.debug(`Download ${requestId} progress: ${progress}% (${updates.chunksReceived}/${download.totalChunks} chunks)`);
    }
    
    return true;
  }

  /**
   * Get download by request ID
   * @param {string} requestId - The download request ID
   * @returns {object|null} The download object or null if not found
   */
  getDownload(requestId) {
    const download = this.downloads.get(requestId);
    if (!download) {
      return null;
    }
    
    // Return a copy to prevent external modification
    return { ...download };
  }

  /**
   * Get all downloads, optionally filtered
   * @param {object} filters - Filters to apply
   * @param {string} filters.clientId - Filter by client ID
   * @param {string} filters.status - Filter by status
   * @param {Date} filters.since - Filter by date since
   * @returns {Array} Array of download objects
   */
  getDownloads(filters = {}) {
    let results = Array.from(this.downloads.values());
    
    // Apply filters
    if (filters.clientId) {
      results = results.filter(d => d.clientId === filters.clientId);
    }
    
    if (filters.status) {
      results = results.filter(d => d.status === filters.status);
    }
    
    if (filters.since) {
      const since = new Date(filters.since);
      results = results.filter(d => d.startedAt >= since);
    }
    
    // Sort by start time (newest first)
    results.sort((a, b) => b.startedAt - a.startedAt);
    
    // Return copies to prevent external modification
    return results.map(d => ({ ...d }));
  }

  /**
   * Cancel a download
   * @param {string} requestId - The download request ID
   * @param {string} reason - Reason for cancellation
   * @returns {boolean} True if cancelled successfully
   */
  cancelDownload(requestId, reason = 'Cancelled by user') {
    const download = this.downloads.get(requestId);
    if (!download) {
      logger.warn(`Attempted to cancel non-existent download: ${requestId}`);
      return false;
    }
    
    // Only cancel if not already completed
    if (download.status === 'completed' || download.status === 'cancelled') {
      logger.warn(`Cannot cancel download ${requestId} - already ${download.status}`);
      return false;
    }
    
    this.updateDownload(requestId, {
      status: 'cancelled',
      completedAt: new Date(),
      error: {
        code: 'CANCELLED',
        message: reason
      }
    });
    
    logger.info(`Cancelled download ${requestId}: ${reason}`);
    return true;
  }

  /**
   * Get all downloads for a specific client
   * @param {string} clientId - The client ID
   * @returns {Array} Array of download objects for the client
   */
  getClientDownloads(clientId) {
    return this.getDownloads({ clientId });
  }

  /**
   * Mark download as in progress
   * @param {string} requestId - The download request ID
   * @param {object} metadata - Download metadata (totalChunks, fileChecksum, etc.)
   */
  startDownload(requestId, metadata = {}) {
    return this.updateDownload(requestId, {
      status: 'in_progress',
      totalChunks: metadata.totalChunks || 0,
      fileChecksum: metadata.fileChecksum || null,
      localPath: metadata.localPath || null
    });
  }

  /**
   * Mark download as completed
   * @param {string} requestId - The download request ID
   * @param {object} completionData - Completion data
   */
  completeDownload(requestId, completionData = {}) {
    return this.updateDownload(requestId, {
      status: 'completed',
      completedAt: new Date(),
      ...completionData
    });
  }

  /**
   * Mark download as failed
   * @param {string} requestId - The download request ID
   * @param {Error} error - The error that caused the failure
   */
  failDownload(requestId, error) {
    return this.updateDownload(requestId, {
      status: 'failed',
      completedAt: new Date(),
      error: {
        code: error.code || 'UNKNOWN_ERROR',
        message: error.message || 'Unknown error occurred'
      }
    });
  }

  /**
   * Update chunk progress
   * @param {string} requestId - The download request ID
   * @param {number} chunkSize - Size of the received chunk in bytes
   */
  addChunkProgress(requestId, chunkSize) {
    const download = this.downloads.get(requestId);
    if (!download) {
      return false;
    }
    
    return this.updateDownload(requestId, {
      chunksReceived: download.chunksReceived + 1,
      bytesReceived: download.bytesReceived + chunkSize
    });
  }

  /**
   * Get download statistics
   * @returns {object} Statistics about all downloads
   */
  getStatistics() {
    const allDownloads = Array.from(this.downloads.values());
    
    const stats = {
      total: allDownloads.length,
      pending: 0,
      in_progress: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      totalBytesTransferred: 0
    };
    
    allDownloads.forEach(download => {
      stats[download.status]++;
      stats.totalBytesTransferred += download.bytesReceived || 0;
    });
    
    return stats;
  }

  /**
   * Clean up old downloads (optional maintenance)
   * @param {object} options - Cleanup options
   * @param {number} options.olderThan - Age in days to remove completed downloads
   * @param {boolean} options.keepFailed - Whether to keep failed downloads
   */
  cleanup(options = {}) {
    const { olderThan = 7, keepFailed = true } = options;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThan);
    
    let cleaned = 0;
    
    for (const [requestId, download] of this.downloads.entries()) {
      const shouldRemove = 
        download.startedAt < cutoffDate &&
        (download.status === 'completed' || download.status === 'cancelled') &&
        (!keepFailed || download.status !== 'failed');
      
      if (shouldRemove) {
        this.downloads.delete(requestId);
        cleaned++;
        
        // Clean up local file if it exists
        if (download.localPath && fs.existsSync(download.localPath)) {
          try {
            fs.unlinkSync(download.localPath);
            logger.debug(`Cleaned up local file: ${download.localPath}`);
          } catch (error) {
            logger.warn(`Failed to clean up local file ${download.localPath}:`, error);
          }
        }
      }
    }
    
    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} old downloads`);
    }
    
    return cleaned;
  }
}

module.exports = DownloadManager;
