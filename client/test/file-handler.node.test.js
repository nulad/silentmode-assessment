import { test, describe } from 'node:test';
import assert from 'node:assert';
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
  
  test('setup', async () => {
    fileHandler = new FileHandler();
    testFilePath = path.join(__dirname, 'test-file.txt');
    const testContent = 'This is a test file for the file handler implementation. '.repeat(100);
    await fs.writeFile(testFilePath, testContent, 'utf8');
  });
  
  test('getFileInfo returns file metadata for existing file', async () => {
    const result = await fileHandler.getFileInfo(testFilePath);
    
    assert.strictEqual(result.exists, true);
    assert.strictEqual(typeof result.size, 'number');
    assert.strictEqual(result.size, 5700);
    assert.strictEqual(typeof result.checksum, 'string');
    assert.match(result.checksum, /^[a-f0-9]{64}$/);
  });
  
  test('getFileInfo returns { exists: false } for missing files', async () => {
    const result = await fileHandler.getFileInfo('/path/to/non/existent/file.txt');
    
    assert.deepStrictEqual(result, { exists: false });
  });
  
  test('createChunkReader yields 1MB chunks by default', async () => {
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
      
      assert.strictEqual(chunks.length, 2);
      assert.strictEqual(chunks[0].data.length, 1024 * 1024);
      assert.strictEqual(chunks[0].index, 0);
      assert.match(chunks[0].checksum, /^[a-f0-9]{64}$/);
      assert.strictEqual(chunks[1].data.length, 1024 * 1024);
      assert.strictEqual(chunks[1].index, 1);
    } finally {
      await fs.unlink(largeTestFilePath);
    }
  });
  
  test('createChunkReader yields chunks with calculated checksums', async () => {
    const chunks = [];
    const chunkReader = fileHandler.createChunkReader(testFilePath, 1024);
    
    for await (const chunk of chunkReader) {
      chunks.push(chunk);
      assert.ok(chunk.hasOwnProperty('index'));
      assert.ok(chunk.hasOwnProperty('data'));
      assert.ok(chunk.hasOwnProperty('checksum'));
      assert.strictEqual(typeof chunk.index, 'number');
      assert.strictEqual(Buffer.isBuffer(chunk.data), true);
      assert.strictEqual(typeof chunk.checksum, 'string');
      assert.match(chunk.checksum, /^[a-f0-9]{64}$/);
    }
    
    assert.strictEqual(chunks.length > 0, true);
  });
  
  test('createChunkReader handles read errors', async () => {
    const nonExistentFile = '/path/to/non/existent/file.txt';
    
    await assert.rejects(
      async () => {
        const reader = fileHandler.createChunkReader(nonExistentFile);
        for await (const _ of reader) {
          // Should not reach here
        }
      },
      /File does not exist/
    );
  });
  
  test('cleanup', async () => {
    try {
      await fs.unlink(testFilePath);
    } catch (error) {
      // Ignore cleanup errors
    }
  });
});
