/**
 * Chunk Manager - Tracks chunk states and retry attempts for file downloads
 * Handles chunk reception, failure tracking, and retry statistics
 */

class ChunkManager {
  constructor() {
    // Main data structure to track all requests
    this.requests = new Map();
  }

  /**
   * Initialize tracking for a new download request
   * @param {string} requestId - Unique identifier for the download request
   * @param {number} totalChunks - Total number of chunks expected
   */
  initChunkTracking(requestId, totalChunks) {
    if (!requestId || typeof totalChunks !== 'number' || totalChunks <= 0) {
      throw new Error('Invalid requestId or totalChunks');
    }

    this.requests.set(requestId, {
      totalChunks,
      receivedChunks: new Set(),
      retryAttempts: new Map(),
      createdAt: new Date(),
      lastActivity: new Date()
    });

    console.log(`[ChunkManager] Initialized tracking for request ${requestId} with ${totalChunks} chunks`);
  }

  /**
   * Mark a chunk as successfully received
   * @param {string} requestId - Unique identifier for the download request
   * @param {number} chunkIndex - Index of the received chunk
   * @returns {boolean} - True if this is the first time receiving this chunk
   */
  markChunkReceived(requestId, chunkIndex) {
    const request = this.requests.get(requestId);
    if (!request) {
      throw new Error(`Request ${requestId} not found`);
    }

    if (typeof chunkIndex !== 'number' || chunkIndex < 0 || chunkIndex >= request.totalChunks) {
      throw new Error(`Invalid chunkIndex: ${chunkIndex}`);
    }

    const isFirstTime = !request.receivedChunks.has(chunkIndex);
    request.receivedChunks.add(chunkIndex);
    
    // Clear any retry attempts for this chunk since it was received successfully
    if (request.retryAttempts.has(chunkIndex)) {
      request.retryAttempts.delete(chunkIndex);
    }
    
    request.lastActivity = new Date();
    
    console.log(`[ChunkManager] Marked chunk ${chunkIndex} as received for request ${requestId}`);
    return isFirstTime;
  }

  /**
   * Mark a chunk as failed and track retry attempt
   * @param {string} requestId - Unique identifier for the download request
   * @param {number} chunkIndex - Index of the failed chunk
   * @param {string} reason - Reason for failure
   * @returns {number} - Number of retry attempts for this chunk
   */
  markChunkFailed(requestId, chunkIndex, reason) {
    const request = this.requests.get(requestId);
    if (!request) {
      throw new Error(`Request ${requestId} not found`);
    }

    if (typeof chunkIndex !== 'number' || chunkIndex < 0 || chunkIndex >= request.totalChunks) {
      throw new Error(`Invalid chunkIndex: ${chunkIndex}`);
    }

    if (!reason || typeof reason !== 'string') {
      throw new Error('Reason must be a non-empty string');
    }

    const existing = request.retryAttempts.get(chunkIndex) || {
      attempts: 0,
      lastAttempt: null,
      status: 'pending',
      reason: null
    };

    existing.attempts++;
    existing.lastAttempt = new Date();
    existing.status = 'failed';
    existing.reason = reason;

    request.retryAttempts.set(chunkIndex, existing);
    request.lastActivity = new Date();

    console.log(`[ChunkManager] Marked chunk ${chunkIndex} as failed for request ${requestId}: ${reason} (${existing.attempts} attempts)`);
    return existing.attempts;
  }

  /**
   * Get retry statistics for a request
   * @param {string} requestId - Unique identifier for the download request
   * @returns {Object} - Retry statistics
   */
  getRetryInfo(requestId) {
    const request = this.requests.get(requestId);
    if (!request) {
      throw new Error(`Request ${requestId} not found`);
    }

    const retryStats = {
      totalChunks: request.totalChunks,
      receivedCount: request.receivedChunks.size,
      pendingCount: request.totalChunks - request.receivedChunks.size,
      failedChunks: Array.from(request.retryAttempts.entries()).map(([index, info]) => ({
        chunkIndex: index,
        attempts: info.attempts,
        lastAttempt: info.lastAttempt,
        status: info.status,
        reason: info.reason
      })),
      totalRetryAttempts: Array.from(request.retryAttempts.values()).reduce((sum, info) => sum + info.attempts, 0),
      createdAt: request.createdAt,
      lastActivity: request.lastActivity
    };

    return retryStats;
  }

  /**
   * Get list of missing chunk indices
   * @param {string} requestId - Unique identifier for the download request
   * @returns {Array<number>} - Array of missing chunk indices
   */
  getMissingChunks(requestId) {
    const request = this.requests.get(requestId);
    if (!request) {
      throw new Error(`Request ${requestId} not found`);
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
   * Get chunks that need to be retried (failed chunks)
   * @param {string} requestId - Unique identifier for the download request
   * @returns {Array<number>} - Array of chunk indices that need retry
   */
  getChunksToRetry(requestId) {
    const request = this.requests.get(requestId);
    if (!request) {
      throw new Error(`Request ${requestId} not found`);
    }

    return Array.from(request.retryAttempts.keys());
  }

  /**
   * Check if a request is complete (all chunks received)
   * @param {string} requestId - Unique identifier for the download request
   * @returns {boolean} - True if all chunks have been received
   */
  isComplete(requestId) {
    const request = this.requests.get(requestId);
    if (!request) {
      return false;
    }

    return request.receivedChunks.size === request.totalChunks;
  }

  /**
   * Clean up tracking data for a request
   * @param {string} requestId - Unique identifier for the download request
   * @returns {boolean} - True if the request existed and was cleaned up
   */
  cleanup(requestId) {
    const existed = this.requests.has(requestId);
    if (existed) {
      this.requests.delete(requestId);
      console.log(`[ChunkManager] Cleaned up tracking for request ${requestId}`);
    }
    return existed;
  }

  /**
   * Get all active requests
   * @returns {Array<string>} - Array of request IDs
   */
  getActiveRequests() {
    return Array.from(this.requests.keys());
  }

  /**
   * Clean up old requests (older than specified hours)
   * @param {number} maxAgeHours - Maximum age in hours before cleanup
   * @returns {Array<string>} - Array of cleaned up request IDs
   */
  cleanupOldRequests(maxAgeHours = 24) {
    const now = new Date();
    const toCleanup = [];

    for (const [requestId, request] of this.requests.entries()) {
      const ageHours = (now - request.lastActivity) / (1000 * 60 * 60);
      if (ageHours > maxAgeHours) {
        toCleanup.push(requestId);
      }
    }

    toCleanup.forEach(id => this.cleanup(id));
    return toCleanup;
  }
}

// Export a singleton instance
const chunkManager = new ChunkManager();

module.exports = {
  ChunkManager,
  chunkManager,
  
  // Export individual methods for convenience
  initChunkTracking: (requestId, totalChunks) => chunkManager.initChunkTracking(requestId, totalChunks),
  markChunkReceived: (requestId, chunkIndex) => chunkManager.markChunkReceived(requestId, chunkIndex),
  markChunkFailed: (requestId, chunkIndex, reason) => chunkManager.markChunkFailed(requestId, chunkIndex, reason),
  getRetryInfo: (requestId) => chunkManager.getRetryInfo(requestId),
  getMissingChunks: (requestId) => chunkManager.getMissingChunks(requestId),
  getChunksToRetry: (requestId) => chunkManager.getChunksToRetry(requestId),
  isComplete: (requestId) => chunkManager.isComplete(requestId),
  cleanup: (requestId) => chunkManager.cleanup(requestId),
  getActiveRequests: () => chunkManager.getActiveRequests(),
  cleanupOldRequests: (maxAgeHours) => chunkManager.cleanupOldRequests(maxAgeHours)
};
