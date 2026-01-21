import { jest } from '@jest/globals';
import FileHandler from '../src/file-handler.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('FileHandler', () => {
  let fileHandler;
  let testFilePath;
  let testContent;
  
  beforeEach(async () => {
    fileHandler = new FileHandler();
    testFilePath = path.join(__dirname, 'test-file.txt');
    testContent = 'This is a test file for the file handler implementation. '.repeat(100);
    await fs.writeFile(testFilePath, testContent, 'utf8');
  });
  
  afterEach(async () => {
    try {
      await fs.unlink(testFilePath);
    } catch (error) {
      // Ignore cleanup errors
    }
  });
  
  describe('getFileInfo', () => {
    it('should return file metadata for existing file', async () => {
      const result = await fileHandler.getFileInfo(testFilePath);
      
      expect(result.exists).toBe(true);
      expect(result.size).toBe(5700);
      expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
    });
    
    it('should return { exists: false } for missing files', async () => {
      const result = await fileHandler.getFileInfo('/path/to/non/existent/file.txt');
      
      expect(result).toEqual({ exists: false });
    });
  });
  
  describe('createChunkReader', () => {
    it('should yield 1MB chunks by default', async () => {
      // Create a larger file for this test
      const largeTestFilePath = path.join(__dirname, 'large-test-file.txt');
      const largeContent = 'x'.repeat(2 * 1024 * 1024); // 2MB
      await fs.writeFile(largeTestFilePath, largeContent, 'utf8');
      
      try {
        const chunks = [];
        const chunkReader = fileHandler.createChunkReader(largeTestFilePath);
        
        for await (const chunk of chunkReader) {
          chunks.push(chunk);
        }
        
        expect(chunks).toHaveLength(2);
        expect(chunks[0].data.length).toBe(1024 * 1024);
        expect(chunks[0].index).toBe(0);
        expect(chunks[0].checksum).toMatch(/^[a-f0-9]{64}$/);
        expect(chunks[1].data.length).toBe(1024 * 1024);
        expect(chunks[1].index).toBe(1);
      } finally {
        await fs.unlink(largeTestFilePath);
      }
    });
    
    it('should yield chunks with calculated checksums', async () => {
      const chunks = [];
      const chunkReader = fileHandler.createChunkReader(testFilePath, 1024);
      
      for await (const chunk of chunkReader) {
        chunks.push(chunk);
        expect(chunk).toHaveProperty('index');
        expect(chunk).toHaveProperty('data');
        expect(chunk).toHaveProperty('checksum');
        expect(typeof chunk.index).toBe('number');
        expect(Buffer.isBuffer(chunk.data)).toBe(true);
        expect(typeof chunk.checksum).toBe('string');
        expect(chunk.checksum).toMatch(/^[a-f0-9]{64}$/);
      }
      
      expect(chunks.length).toBeGreaterThan(0);
    });
    
    it('should handle read errors', async () => {
      const nonExistentFile = '/path/to/non/existent/file.txt';
      
      await expect(fileHandler.createChunkReader(nonExistentFile).next())
        .rejects.toThrow('File does not exist');
    });
  });
  
  describe('getChunkCount', () => {
    it('should return correct number of chunks', async () => {
      const count = await fileHandler.getChunkCount(testFilePath, 1024);
      expect(count).toBe(Math.ceil(5700 / 1024));
    });
    
    it('should throw error for non-existent file', async () => {
      await expect(fileHandler.getChunkCount('/non/existent/file.txt', 1024))
        .rejects.toThrow('File does not exist');
    });
  });
  
  describe('readChunk', () => {
    it('should read specific chunk correctly', async () => {
      const chunk = await fileHandler.readChunk(testFilePath, 0, 1024);
      
      expect(chunk.index).toBe(0);
      expect(chunk.data.length).toBe(1024);
      expect(chunk.checksum).toMatch(/^[a-f0-9]{64}$/);
    });
    
    it('should throw error for out of bounds chunk', async () => {
      await expect(fileHandler.readChunk(testFilePath, 999, 1024))
        .rejects.toThrow('Chunk index 999 is out of bounds');
    });
  });
});
