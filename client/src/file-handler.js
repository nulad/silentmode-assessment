import fs from 'fs/promises';
import fsSync from 'fs';
import { createReadStream } from 'fs';
import path from 'path';
import logger from './utils/logger.js';
import { calculateFileChecksum, calculateChecksum } from './utils/checksum.js';

/**
 * File handler for client-side file operations
 */
class FileHandler {
  /**
   * Get file information including existence, size, and checksum
   * @param {string} filePath - Path to the file
   * @returns {Promise<{exists: boolean, size?: number, checksum?: string}>}
   */
  async getFileInfo(filePath) {
    try {
      // Check if file exists
      await fs.access(filePath);
      
      // Get file stats
      const stats = await fs.stat(filePath);
      const size = stats.size;
      
      // Calculate checksum
      const checksum = await calculateFileChecksum(filePath);
      
      logger.debug(`File info retrieved for ${filePath}: size=${size}, checksum=${checksum}`);
      
      return {
        exists: true,
        size,
        checksum
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.debug(`File does not exist: ${filePath}`);
        return { exists: false };
      }
      
      logger.error(`Error getting file info for ${filePath}:`, error);
      throw error;
    }
  }
  
  /**
   * Create a chunk reader for a file
   * @param {string} filePath - Path to the file
   * @param {number} chunkSize - Size of each chunk in bytes (default: 1MB)
   * @returns {AsyncIterator<{index: number, data: Buffer, checksum: string}>}
   */
  async *createChunkReader(filePath, chunkSize = 1024 * 1024) {
    // Verify file exists first
    const fileInfo = await this.getFileInfo(filePath);
    if (!fileInfo.exists) {
      throw new Error(`File does not exist: ${filePath}`);
    }
    
    logger.debug(`Creating chunk reader for ${filePath} with chunk size ${chunkSize}`);
    
    let index = 0;
    const stream = createReadStream(filePath, {
      highWaterMark: chunkSize
    });
    
    try {
      for await (const chunk of stream) {
        const checksum = calculateChecksum(chunk);
        
        logger.debug(`Yielding chunk ${index} for ${filePath}, size: ${chunk.length}`);
        
        yield {
          index,
          data: chunk,
          checksum
        };
        
        index++;
      }
    } catch (error) {
      logger.error(`Error reading chunks from ${filePath}:`, error);
      throw error;
    }
  }
  
  /**
   * Get the total number of chunks for a file
   * @param {string} filePath - Path to the file
   * @param {number} chunkSize - Size of each chunk in bytes
   * @returns {Promise<number>} Total number of chunks
   */
  async getChunkCount(filePath, chunkSize = 1024 * 1024) {
    const fileInfo = await this.getFileInfo(filePath);
    if (!fileInfo.exists) {
      throw new Error(`File does not exist: ${filePath}`);
    }
    
    return Math.ceil(fileInfo.size / chunkSize);
  }
  
  /**
   * Read a specific chunk from a file
   * @param {string} filePath - Path to the file
   * @param {number} chunkIndex - Index of the chunk to read
   * @param {number} chunkSize - Size of each chunk in bytes
   * @returns {Promise<{index: number, data: Buffer, checksum: string}>}
   */
  async readChunk(filePath, chunkIndex, chunkSize = 1024 * 1024) {
    const fileInfo = await this.getFileInfo(filePath);
    if (!fileInfo.exists) {
      throw new Error(`File does not exist: ${filePath}`);
    }
    
    const start = chunkIndex * chunkSize;
    const end = Math.min(start + chunkSize, fileInfo.size);
    
    if (start >= fileInfo.size) {
      throw new Error(`Chunk index ${chunkIndex} is out of bounds for file ${filePath}`);
    }
    
    const buffer = Buffer.alloc(end - start);
    const fd = await fs.open(filePath, 'r');
    
    try {
      await fd.read(buffer, 0, buffer.length, start);
      const checksum = calculateChecksum(buffer);
      
      logger.debug(`Read chunk ${chunkIndex} from ${filePath}, size: ${buffer.length}`);
      
      return {
        index: chunkIndex,
        data: buffer,
        checksum
      };
    } finally {
      await fd.close();
    }
  }
}

export default FileHandler;
