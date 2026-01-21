const FileHandler = require('./file-handler');
const { calculateFileChecksum } = require('./utils/checksum');

/**
 * Integration example showing how FileHandler integrates with the download flow
 */
async function demonstrateFileHandlerIntegration() {
  console.log('🔗 FileHandler Integration Demo\n');

  // Example: Simulating a download request
  const filePath = '/path/to/large/file.zip'; // This would come from DOWNLOAD_REQUEST
  
  try {
    // 1. Initialize FileHandler when download is requested
    console.log('1. Initializing FileHandler for download...');
    const fileHandler = new FileHandler(filePath);
    await fileHandler.initialize();
    
    // 2. Get file info for DOWNLOAD_ACK response
    const fileInfo = fileHandler.getFileInfo();
    console.log('2. File info retrieved for DOWNLOAD_ACK:');
    console.log(`   - File size: ${(fileInfo.fileSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   - Total chunks: ${fileInfo.totalChunks}`);
    
    // 3. Calculate overall file checksum
    const fileChecksum = await calculateFileChecksum(filePath);
    console.log(`   - File checksum: ${fileChecksum.substring(0, 16)}...\n`);
    
    // 4. Stream chunks to client (simulated)
    console.log('3. Streaming chunks to client...');
    let chunksSent = 0;
    
    for await (const chunk of fileHandler.readChunks()) {
      // In real implementation, this would be sent via WebSocket
      console.log(`   Sending chunk ${chunk.index}/${fileInfo.totalChunks - 1} ` +
                  `(${chunk.size} bytes, checksum: ${chunk.checksum.substring(0, 16)}...)`);
      chunksSent++;
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    console.log(`\n✅ Successfully sent ${chunksSent} chunks`);
    console.log('✅ Download complete!\n');
    
    // 5. Example: Handle chunk retry request
    console.log('4. Handling chunk retry request...');
    const retryChunkIndex = 2;
    const retryChunk = await fileHandler.readChunk(retryChunkIndex);
    console.log(`   Resent chunk ${retryChunkIndex}: ${retryChunk.size} bytes`);
    
  } catch (error) {
    console.error('❌ Integration demo failed:', error.message);
  }
}

// Example of how FileHandler would be used in WebSocket server
class DownloadManager {
  constructor() {
    this.activeDownloads = new Map(); // fileId -> FileHandler
  }

  async handleDownloadRequest(clientId, filePath) {
    try {
      const fileHandler = new FileHandler(filePath);
      await fileHandler.initialize();
      
      const fileId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      this.activeDownloads.set(fileId, fileHandler);
      
      const fileInfo = fileHandler.getFileInfo();
      const fileChecksum = await calculateFileChecksum(filePath);
      
      return {
        fileId,
        fileSize: fileInfo.fileSize,
        totalChunks: fileInfo.totalChunks,
        checksum: fileChecksum
      };
    } catch (error) {
      throw new Error(`Failed to prepare download: ${error.message}`);
    }
  }

  async *streamChunks(fileId) {
    const fileHandler = this.activeDownloads.get(fileId);
    if (!fileHandler) {
      throw new Error('Download not found');
    }
    
    yield* fileHandler.readChunks();
  }

  async handleRetryRequest(fileId, chunkIndex) {
    const fileHandler = this.activeDownloads.get(fileId);
    if (!fileHandler) {
      throw new Error('Download not found');
    }
    
    return await fileHandler.readChunk(chunkIndex);
  }

  cleanupDownload(fileId) {
    this.activeDownloads.delete(fileId);
  }
}

module.exports = {
  demonstrateFileHandlerIntegration,
  DownloadManager
};
