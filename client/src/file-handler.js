import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { createReadStream } from 'fs';
import { calculateChecksum } from './utils/checksum.js';
import logger from './utils/logger.js';
import { CONSTANTS } from '../../shared/protocol.js';

class FileHandler {
  constructor() {
    this.chunkSize = CONSTANTS.CHUNK_SIZE;
  }

  async getFileInfo(filePath) {
    try {
      // Resolve the file path relative to user's home directory
      const resolvedPath = this.resolveFilePath(filePath);
      
      // Check if file exists
      const stats = await fs.stat(resolvedPath);
      if (!stats.isFile()) {
        throw new Error('Path is not a file');
      }

      // Calculate total chunks
      const totalChunks = Math.ceil(stats.size / this.chunkSize);
      
      // Calculate file checksum
      const checksum = await this.calculateFileChecksum(resolvedPath);
      
      return {
        path: resolvedPath,
        size: stats.size,
        totalChunks,
        checksum,
        lastModified: stats.mtime
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      }
      throw error;
    }
  }

  resolveFilePath(filePath) {
    // If the path starts with ~, replace with home directory
    if (filePath.startsWith('~')) {
      return path.join(process.env.HOME || process.env.USERPROFILE, filePath.slice(1));
    }
    
    // If the path is relative, make it relative to home directory
    if (!path.isAbsolute(filePath)) {
      return path.join(process.env.HOME || process.env.USERPROFILE, filePath);
    }
    
    return filePath;
  }

  async calculateFileChecksum(filePath) {
    return new Promise((resolve, reject) => {
      const stream = createReadStream(filePath);
      const hash = crypto.createHash('sha256');
      
      stream.on('data', (chunk) => {
        hash.update(chunk);
      });
      
      stream.on('end', () => {
        resolve(hash.digest('hex'));
      });
      
      stream.on('error', (error) => {
        reject(error);
      });
    });
  }

  async createChunkStream(filePath, chunkIndex) {
    const resolvedPath = this.resolveFilePath(filePath);
    const start = chunkIndex * this.chunkSize;
    const end = Math.min(start + this.chunkSize - 1, (await fs.stat(resolvedPath)).size);
    
    return {
      stream: createReadStream(resolvedPath, { start, end }),
      start,
      end: end + 1,
      size: end - start + 1
    };
  }

  async readChunk(filePath, chunkIndex) {
    const { stream, size } = await this.createChunkStream(filePath, chunkIndex);
    
    return new Promise((resolve, reject) => {
      const chunks = [];
      
      stream.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      stream.on('end', () => {
        const data = Buffer.concat(chunks);
        resolve(data);
      });
      
      stream.on('error', (error) => {
        reject(error);
      });
    });
  }

  async calculateChunkChecksum(filePath, chunkIndex) {
    const chunkData = await this.readChunk(filePath, chunkIndex);
    return crypto.createHash('sha256').update(chunkData).digest('hex');
  }
}

export default FileHandler;
