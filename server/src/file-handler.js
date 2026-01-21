const fs = require('fs');
const { calculateChecksum } = require('./utils/checksum');
const { CONSTANTS } = require('../../shared/protocol');

/**
 * File handler for reading files in chunks using streams
 * Implements memory-efficient chunk reading for large files
 */
class FileHandler {
  constructor(filePath) {
    this.filePath = filePath;
    this.fileSize = 0;
    this.totalChunks = 0;
    this.chunkSize = CONSTANTS.CHUNK_SIZE; // 1MB
  }

  /**
   * Initialize file handler and calculate file statistics
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      const stats = await fs.promises.stat(this.filePath);
      this.fileSize = stats.size;
      this.totalChunks = Math.ceil(this.fileSize / this.chunkSize);
    } catch (error) {
      throw new Error(`Failed to access file: ${error.message}`);
    }
  }

  /**
   * Read file chunks using async generator
   * Yields one chunk at a time without loading entire file into memory
   * @returns {AsyncGenerator<Object>} Chunk objects with index, data, checksum, and size
   */
  async *readChunks() {
    if (!this.fileSize) {
      await this.initialize();
    }

    const readStream = fs.createReadStream(this.filePath, {
      highWaterMark: this.chunkSize
    });

    let chunkIndex = 0;
    
    try {
      for await (const chunk of readStream) {
        // Ensure chunk is a Buffer
        const chunkBuffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        
        const chunkObject = {
          index: chunkIndex,
          data: chunkBuffer,
          checksum: calculateChecksum(chunkBuffer),
          size: chunkBuffer.length
        };

        yield chunkObject;
        chunkIndex++;
      }
    } catch (error) {
      throw new Error(`Error reading file chunks: ${error.message}`);
    }
  }

  /**
   * Get file metadata
   * @returns {Object} File information
   */
  getFileInfo() {
    return {
      filePath: this.filePath,
      fileSize: this.fileSize,
      totalChunks: this.totalChunks,
      chunkSize: this.chunkSize
    };
  }

  /**
   * Read a specific chunk by index
   * @param {number} chunkIndex - Index of chunk to read
   * @returns {Promise<Object>} Chunk object
   */
  async readChunk(chunkIndex) {
    if (!this.fileSize) {
      await this.initialize();
    }

    if (chunkIndex < 0 || chunkIndex >= this.totalChunks) {
      throw new Error(`Invalid chunk index: ${chunkIndex}`);
    }

    const start = chunkIndex * this.chunkSize;
    const end = Math.min(start + this.chunkSize, this.fileSize);
    
    const buffer = Buffer.alloc(end - start);
    const fd = await fs.promises.open(this.filePath, 'r');
    
    try {
      await fd.read(buffer, 0, buffer.length, start);
      
      return {
        index: chunkIndex,
        data: buffer,
        checksum: calculateChecksum(buffer),
        size: buffer.length
      };
    } finally {
      await fd.close();
    }
  }
}

module.exports = FileHandler;
