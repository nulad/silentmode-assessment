const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');
const { MESSAGE_TYPES } = require('../../shared/protocol');
const { verifyChecksum } = require('./utils/checksum');

/**
 * Download Manager tracks active downloads and their states
 */
class DownloadManager {
  constructor() {
    this.downloads = new Map(); // requestId -> download state
    this.tempDir = path.join(__dirname, '../downloads/.tmp');

    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
      logger.info(`Created temp directory: ${this.tempDir}`);
    }
  }

  /**
   * Create a new download request
   * @param {string} clientId - Client ID (source client with the file)
   * @param {string} filePath - File path to download
   * @param {string} requestId - Optional request ID (will generate if not provided)
   * @param {string} requesterClientId - Client ID who initiated the request
   * @returns {string} Request ID
   */
  createDownload(clientId, filePath, requestId = null, requesterClientId = null) {
    const id = requestId || uuidv4();
    
    this.downloads.set(id, {
      id: id,
      clientId,
      filePath,
      requesterClientId,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
      totalChunks: 0,
      fileSize: 0,
      checksum: null,
      error: null,
      chunksReceived: 0,
      progress: 0,
      receivedChunkIndices: new Set(), // Track which chunks have been received
      failedChunks: new Map(), // Track failed chunks: chunkIndex -> error
      tempFilePath: path.join(this.tempDir, id),
      tempFileHandle: null
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
      logger.error(`DOWNLOAD_ACK failed for ${requestId}: File not available`);
      
      this.updateDownload(requestId, {
        status: 'failed',
        error: { message: 'File not available' }
      });
    }
  }

  /**
   * Handle FILE_CHUNK from client
   * @param {string} requestId - Request ID
   * @param {Object} chunk - Chunk message from client
   */
  async handleFileChunk(requestId, chunk) {
    const download = this.downloads.get(requestId);
    if (!download) {
      logger.warn(`Received FILE_CHUNK for unknown request: ${requestId}`);
      return { success: false, error: 'Unknown request' };
    }

    try {
      // Step 1: Decode base64 data to buffer
      const decodedData = Buffer.from(chunk.data, 'base64');
      logger.debug(`Decoded chunk ${chunk.chunkIndex}: ${decodedData.length} bytes`);

      // Step 2: Validate checksum matches decoded data
      const isValid = verifyChecksum(decodedData, chunk.checksum);

      if (!isValid) {
        // Checksum validation failed - flag for retry
        const error = `Checksum validation failed for chunk ${chunk.chunkIndex}`;
        logger.error(error);

        download.failedChunks.set(chunk.chunkIndex, {
          error: error,
          timestamp: new Date(),
          attempts: (download.failedChunks.get(chunk.chunkIndex)?.attempts || 0) + 1
        });

        return {
          success: false,
          error: 'CHUNK_CHECKSUM_FAILED',
          chunkIndex: chunk.chunkIndex,
          needsRetry: true
        };
      }

      // Step 3: Write chunk to temp file
      await this.writeChunkToFile(download, chunk.chunkIndex, decodedData);

      // Step 4: Track received chunk
      download.receivedChunkIndices.add(chunk.chunkIndex);

      // Step 5: Update download progress
      this.updateDownload(requestId, {
        chunksReceived: download.receivedChunkIndices.size
      });

      // Log progress every 10 chunks or on last chunk
      if ((chunk.chunkIndex + 1) % 10 === 0 || chunk.chunkIndex === chunk.totalChunks - 1) {
        logger.info(`Received chunk ${chunk.chunkIndex + 1}/${chunk.totalChunks} for request ${requestId} (${download.progress}%)`);
      }

      return { success: true, chunkIndex: chunk.chunkIndex };

    } catch (error) {
      logger.error(`Error processing chunk ${chunk.chunkIndex} for ${requestId}:`, error);

      download.failedChunks.set(chunk.chunkIndex, {
        error: error.message,
        timestamp: new Date(),
        attempts: (download.failedChunks.get(chunk.chunkIndex)?.attempts || 0) + 1
      });

      return {
        success: false,
        error: error.message,
        chunkIndex: chunk.chunkIndex,
        needsRetry: true
      };
    }
  }

  /**
   * Write a chunk to the temp file at the correct offset
   * @param {Object} download - Download state object
   * @param {number} chunkIndex - Index of the chunk
   * @param {Buffer} data - Chunk data
   */
  async writeChunkToFile(download, chunkIndex, data) {
    try {
      // Open file handle if not already open
      if (!download.tempFileHandle) {
        download.tempFileHandle = await fs.promises.open(download.tempFilePath, 'w');
        logger.debug(`Opened temp file: ${download.tempFilePath}`);
      }

      // Calculate offset (assuming 1MB chunk size from protocol)
      const CHUNK_SIZE = 1048576; // 1MB
      const offset = chunkIndex * CHUNK_SIZE;

      // Write chunk at the correct position
      await download.tempFileHandle.write(data, 0, data.length, offset);
      logger.debug(`Wrote chunk ${chunkIndex} to temp file at offset ${offset}`);

    } catch (error) {
      logger.error(`Failed to write chunk ${chunkIndex} to file:`, error);
      throw error;
    }
  }

  /**
   * Handle DOWNLOAD_COMPLETE from client
   * @param {string} requestId - Request ID
   * @param {Object} completion - Completion message from client
   */
  async handleDownloadComplete(requestId, completion) {
    const download = this.downloads.get(requestId);
    if (!download) {
      logger.warn(`Received DOWNLOAD_COMPLETE for unknown request: ${requestId}`);
      return;
    }

    // Close temp file handle if open
    if (download.tempFileHandle) {
      try {
        await download.tempFileHandle.close();
        logger.debug(`Closed temp file for request ${requestId}`);
        download.tempFileHandle = null;
      } catch (error) {
        logger.error(`Error closing temp file for ${requestId}:`, error);
      }
    }

    if (completion.success) {
      logger.info(`Download ${requestId} completed successfully: ${completion.message}`);
      this.updateDownload(requestId, {
        status: 'completed'
      });
    } else {
      logger.error(`Download ${requestId} failed: ${completion.message}`);
      this.updateDownload(requestId, {
        status: 'failed',
        error: { message: completion.message }
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
  async failDownload(requestId, error) {
    logger.error(`Download ${requestId} failed: ${error.message}`);

    const download = this.downloads.get(requestId);

    // Close temp file handle if open
    if (download && download.tempFileHandle) {
      try {
        await download.tempFileHandle.close();
        logger.debug(`Closed temp file for failed download ${requestId}`);
        download.tempFileHandle = null;
      } catch (closeError) {
        logger.error(`Error closing temp file for ${requestId}:`, closeError);
      }
    }

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
  async cancelDownload(requestId, reason) {
    logger.info(`Download ${requestId} cancelled: ${reason}`);

    const download = this.downloads.get(requestId);

    // Close temp file handle if open
    if (download && download.tempFileHandle) {
      try {
        await download.tempFileHandle.close();
        logger.debug(`Closed temp file for cancelled download ${requestId}`);
        download.tempFileHandle = null;
      } catch (error) {
        logger.error(`Error closing temp file for ${requestId}:`, error);
      }
    }

    this.updateDownload(requestId, {
      status: 'cancelled',
      error: {
        code: 'DOWNLOAD_CANCELLED',
        message: reason
      }
    });
  }

  /**
   * Get failed chunks for a download (for retry logic)
   * @param {string} requestId - Request ID
   * @returns {Array} Array of failed chunk indices with error details
   */
  getFailedChunks(requestId) {
    const download = this.downloads.get(requestId);
    if (!download) {
      return [];
    }

    return Array.from(download.failedChunks.entries()).map(([chunkIndex, error]) => ({
      chunkIndex,
      error,
      attempts: error.attempts || 1
    }));
  }

  /**
   * Get missing chunks for a download
   * @param {string} requestId - Request ID
   * @returns {Array} Array of missing chunk indices
   */
  getMissingChunks(requestId) {
    const download = this.downloads.get(requestId);
    if (!download || download.totalChunks === 0) {
      return [];
    }

    const missing = [];
    for (let i = 0; i < download.totalChunks; i++) {
      if (!download.receivedChunkIndices.has(i)) {
        missing.push(i);
      }
    }

    return missing;
  }

  /**
   * Clean up old downloads (optional - for memory management)
   * @param {number} maxAge - Maximum age in milliseconds
   */
  async cleanup(maxAge = 24 * 60 * 60 * 1000) { // Default 24 hours
    const now = Date.now();
    const toDelete = [];

    for (const [requestId, download] of this.downloads.entries()) {
      if (now - download.updatedAt.getTime() > maxAge) {
        toDelete.push(requestId);
      }
    }

    // Close file handles and delete downloads
    for (const requestId of toDelete) {
      const download = this.downloads.get(requestId);

      // Close temp file handle if open
      if (download && download.tempFileHandle) {
        try {
          await download.tempFileHandle.close();
          logger.debug(`Closed temp file for cleanup of ${requestId}`);
        } catch (error) {
          logger.error(`Error closing temp file during cleanup for ${requestId}:`, error);
        }
      }

      // Delete temp file if it exists
      if (download && download.tempFilePath) {
        try {
          if (fs.existsSync(download.tempFilePath)) {
            await fs.promises.unlink(download.tempFilePath);
            logger.debug(`Deleted temp file: ${download.tempFilePath}`);
          }
        } catch (error) {
          logger.error(`Error deleting temp file during cleanup for ${requestId}:`, error);
        }
      }

      this.downloads.delete(requestId);
      logger.debug(`Cleaned up old download: ${requestId}`);
    }

    if (toDelete.length > 0) {
      logger.info(`Cleaned up ${toDelete.length} old downloads`);
    }
  }
}

module.exports = DownloadManager;
