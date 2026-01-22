const logger = require('./utils/logger');

/**
 * ChunkManager - Tracks chunk states and retry attempts for downloads
 *
 * Manages the state of chunks for file transfers, including:
 * - Which chunks have been received successfully
 * - Which chunks need retry and their retry history
 * - Missing chunk detection
 */
class ChunkManager {
  constructor() {
    // Map of requestId -> chunk tracking data
    this.requests = new Map();
  }

  /**
   * Initialize chunk tracking for a new request
   * @param {string} requestId - Unique request identifier
   * @param {number} totalChunks - Total number of chunks expected
   */
  initChunkTracking(requestId, totalChunks) {
    if (this.requests.has(requestId)) {
      logger.warn(`Chunk tracking already initialized for request ${requestId}`);
      return;
    }

    this.requests.set(requestId, {
      totalChunks: totalChunks,
      receivedChunks: new Set(),
      retryAttempts: new Map() // chunkIndex -> retry info
    });

    logger.debug(`Initialized chunk tracking for ${requestId}: ${totalChunks} chunks`);
  }

  /**
   * Mark a chunk as successfully received
   * @param {string} requestId - Request identifier
   * @param {number} chunkIndex - Index of the chunk
   * @returns {boolean} True if marked successfully, false if request not found
   */
  markChunkReceived(requestId, chunkIndex) {
    const request = this.requests.get(requestId);
    if (!request) {
      logger.error(`Cannot mark chunk received: request ${requestId} not found`);
      return false;
    }

    request.receivedChunks.add(chunkIndex);

    // If this chunk was in retry, update its status to succeeded
    if (request.retryAttempts.has(chunkIndex)) {
      const retryInfo = request.retryAttempts.get(chunkIndex);
      retryInfo.status = 'succeeded';
      retryInfo.lastAttempt = new Date();
    }

    logger.debug(`Marked chunk ${chunkIndex} as received for ${requestId} (${request.receivedChunks.size}/${request.totalChunks})`);
    return true;
  }

  /**
   * Mark a chunk as failed and track retry attempt
   * @param {string} requestId - Request identifier
   * @param {number} chunkIndex - Index of the chunk
   * @param {string} reason - Failure reason
   * @returns {boolean} True if marked successfully, false if request not found
   */
  markChunkFailed(requestId, chunkIndex, reason) {
    const request = this.requests.get(requestId);
    if (!request) {
      logger.error(`Cannot mark chunk failed: request ${requestId} not found`);
      return false;
    }

    // Get or create retry info for this chunk
    let retryInfo = request.retryAttempts.get(chunkIndex);

    if (!retryInfo) {
      retryInfo = {
        attempts: 0,
        lastAttempt: null,
        status: 'pending',
        reason: reason
      };
      request.retryAttempts.set(chunkIndex, retryInfo);
    }

    // Update retry info
    retryInfo.attempts += 1;
    retryInfo.lastAttempt = new Date();
    retryInfo.status = 'failed';
    retryInfo.reason = reason;

    logger.debug(`Marked chunk ${chunkIndex} as failed for ${requestId} (attempt ${retryInfo.attempts}): ${reason}`);
    return true;
  }

  /**
   * Get retry information for a request
   * @param {string} requestId - Request identifier
   * @returns {Object|null} Retry statistics or null if request not found
   */
  getRetryInfo(requestId) {
    const request = this.requests.get(requestId);
    if (!request) {
      logger.warn(`Cannot get retry info: request ${requestId} not found`);
      return null;
    }

    const chunksWithRetries = [];
    const failedChunks = [];
    let totalRetries = 0;

    for (const [chunkIndex, retryInfo] of request.retryAttempts.entries()) {
      totalRetries += retryInfo.attempts;

      chunksWithRetries.push({
        chunkIndex,
        attempts: retryInfo.attempts,
        lastAttempt: retryInfo.lastAttempt,
        status: retryInfo.status,
        reason: retryInfo.reason
      });

      if (retryInfo.status === 'failed') {
        failedChunks.push(chunkIndex);
      }
    }

    return {
      requestId,
      totalChunks: request.totalChunks,
      receivedCount: request.receivedChunks.size,
      missingCount: request.totalChunks - request.receivedChunks.size,
      chunksWithRetries: chunksWithRetries.length,
      totalRetries,
      failedChunks,
      chunks: chunksWithRetries
    };
  }

  /**
   * Get list of missing chunks for a request
   * @param {string} requestId - Request identifier
   * @returns {number[]} Array of missing chunk indices, empty array if request not found
   */
  getMissingChunks(requestId) {
    const request = this.requests.get(requestId);
    if (!request) {
      logger.warn(`Cannot get missing chunks: request ${requestId} not found`);
      return [];
    }

    const missing = [];
    for (let i = 0; i < request.totalChunks; i++) {
      if (!request.receivedChunks.has(i)) {
        missing.push(i);
      }
    }

    return missing;
  }

  /**
   * Check if all chunks have been received for a request
   * @param {string} requestId - Request identifier
   * @returns {boolean} True if all chunks received, false otherwise
   */
  isComplete(requestId) {
    const request = this.requests.get(requestId);
    if (!request) {
      return false;
    }

    return request.receivedChunks.size === request.totalChunks;
  }

  /**
   * Get completion percentage for a request
   * @param {string} requestId - Request identifier
   * @returns {number} Percentage complete (0-100), or 0 if request not found
   */
  getProgress(requestId) {
    const request = this.requests.get(requestId);
    if (!request || request.totalChunks === 0) {
      return 0;
    }

    return Math.round((request.receivedChunks.size / request.totalChunks) * 100);
  }

  /**
   * Clean up tracking data for a request
   * @param {string} requestId - Request identifier
   * @returns {boolean} True if cleaned up, false if request not found
   */
  cleanup(requestId) {
    const existed = this.requests.has(requestId);

    if (existed) {
      this.requests.delete(requestId);
      logger.debug(`Cleaned up chunk tracking for ${requestId}`);
    } else {
      logger.warn(`Cannot cleanup: request ${requestId} not found`);
    }

    return existed;
  }

  /**
   * Get all tracked requests
   * @returns {string[]} Array of request IDs
   */
  getAllRequests() {
    return Array.from(this.requests.keys());
  }

  /**
   * Get statistics for all requests
   * @returns {Object} Overall statistics
   */
  getStats() {
    let totalRequests = this.requests.size;
    let totalChunks = 0;
    let totalReceived = 0;
    let totalRetries = 0;

    for (const [requestId, request] of this.requests.entries()) {
      totalChunks += request.totalChunks;
      totalReceived += request.receivedChunks.size;

      for (const retryInfo of request.retryAttempts.values()) {
        totalRetries += retryInfo.attempts;
      }
    }

    return {
      totalRequests,
      totalChunks,
      totalReceived,
      totalMissing: totalChunks - totalReceived,
      totalRetries,
      avgProgress: totalRequests > 0 ? Math.round((totalReceived / totalChunks) * 100) : 0
    };
  }
}

module.exports = ChunkManager;
