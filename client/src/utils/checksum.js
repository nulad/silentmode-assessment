import crypto from 'crypto';
import { createReadStream } from 'fs';

/**
 * Calculate SHA-256 checksum of a buffer
 * @param {Buffer} buffer - Data to hash
 * @returns {string} Hexadecimal SHA-256 hash
 */
export function calculateChecksum(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Calculate SHA-256 checksum of a file using streaming
 * @param {string} filePath - Path to the file
 * @returns {Promise<string>} Hexadecimal SHA-256 hash
 */
export async function calculateFileChecksum(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = createReadStream(filePath);
    
    stream.on('data', (data) => {
      hash.update(data);
    });
    
    stream.on('end', () => {
      resolve(hash.digest('hex'));
    });
    
    stream.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Verify data against expected checksum
 * @param {Buffer|string} data - Data to verify
 * @param {string} expectedChecksum - Expected SHA-256 hash
 * @returns {boolean} True if checksums match
 */
export function verifyChecksum(data, expectedChecksum) {
  const actualChecksum = calculateChecksum(Buffer.isBuffer(data) ? data : Buffer.from(data));
  return actualChecksum === expectedChecksum;
}
