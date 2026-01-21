import FileHandler from '../src/file-handler.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create a test file
async function createTestFile() {
  const testFilePath = path.join(__dirname, 'test-file.txt');
  const testContent = 'This is a test file for the file handler implementation. '.repeat(100);
  
  await fs.writeFile(testFilePath, testContent, 'utf8');
  console.log(`Created test file: ${testFilePath}`);
  return testFilePath;
}

// Test the file handler
async function testFileHandler() {
  const fileHandler = new FileHandler();
  const testFilePath = await createTestFile();
  
  try {
    console.log('\n=== Testing getFileInfo ===');
    const fileInfo = await fileHandler.getFileInfo(testFilePath);
    console.log('File info:', fileInfo);
    
    // Test with non-existent file
    const nonExistentInfo = await fileHandler.getFileInfo('/path/to/non/existent/file.txt');
    console.log('Non-existent file info:', nonExistentInfo);
    
    console.log('\n=== Testing createChunkReader ===');
    const chunkReader = fileHandler.createChunkReader(testFilePath, 1024); // 1KB chunks
    
    const chunks = [];
    for await (const chunk of chunkReader) {
      console.log(`Received chunk ${chunk.index}: size=${chunk.data.length}, checksum=${chunk.checksum}`);
      chunks.push(chunk);
    }
    
    console.log(`Total chunks read: ${chunks.length}`);
    
    console.log('\n=== Testing getChunkCount ===');
    const chunkCount = await fileHandler.getChunkCount(testFilePath, 1024);
    console.log(`Chunk count: ${chunkCount}`);
    
    console.log('\n=== Testing readChunk ===');
    const specificChunk = await fileHandler.readChunk(testFilePath, 0, 1024);
    console.log(`Read specific chunk: index=${specificChunk.index}, size=${specificChunk.data.length}`);
    
    console.log('\n✅ All tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    // Clean up test file
    try {
      await fs.unlink(testFilePath);
      console.log('\n🧹 Cleaned up test file');
    } catch (error) {
      console.error('Error cleaning up test file:', error);
    }
  }
}

// Run tests
testFileHandler().catch(console.error);
