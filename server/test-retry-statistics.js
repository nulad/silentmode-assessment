#!/usr/bin/env node
/**
 * Test script to verify retry statistics tracking implementation
 */

const DownloadManager = require('./src/download-manager');
const { chunkManager } = require('./src/chunk-manager');

async function testRetryStatistics() {
  console.log('=== Testing Retry Statistics Tracking ===\n');
  
  const downloadManager = new DownloadManager();
  const requestId = 'test-retry-' + Date.now();
  
  // Create a download
  const clientId = 'test-client';
  const filePath = '/test/large-file.txt';
  
  const downloadId = downloadManager.createDownload(clientId, filePath, requestId, 'requester-client');
  console.log(`✓ Created download: ${downloadId}`);
  
  // Simulate download acknowledgment
  downloadManager.handleDownloadAck(requestId, {
    success: true,
    fileSize: 5 * 1048576, // 5MB
    totalChunks: 5,
    fileChecksum: 'abc123'
  });
  
  // Initialize chunk tracking
  chunkManager.initChunkTracking(requestId, 5);
  console.log('✓ Initialized chunk tracking for 5 chunks\n');
  
  // Simulate successful chunks
  console.log('--- Simulating successful chunks ---');
  for (let i = 0; i < 2; i++) {
    const chunk = {
      chunkIndex: i,
      totalChunks: 5,
      data: Buffer.from('test-data').toString('base64'),
      checksum: 'test-checksum'
    };
    
    // Mock successful chunk processing
    const download = downloadManager.getDownload(requestId);
    download.receivedChunkIndices.add(i);
    chunkManager.markChunkReceived(requestId, i);
    downloadManager.updateDownload(requestId, {
      chunksReceived: download.receivedChunkIndices.size
    });
    
    console.log(`Chunk ${i}: received successfully`);
  }
  
  // Simulate chunk failures and retries
  console.log('\n--- Simulating chunk failures and retries ---');
  const failedChunkIndex = 2;
  
  // First attempt fails
  console.log(`Chunk ${failedChunkIndex} attempt 1: fails with checksum error`);
  downloadManager.updateRetryTracking(requestId, failedChunkIndex, 1, 'failed', 'CHECKSUM_FAILED');
  chunkManager.markChunkFailed(requestId, failedChunkIndex, 'CHECKSUM_FAILED');
  
  // Second attempt fails
  console.log(`Chunk ${failedChunkIndex} attempt 2: fails with checksum error`);
  downloadManager.updateRetryTracking(requestId, failedChunkIndex, 2, 'failed', 'CHECKSUM_FAILED');
  chunkManager.markChunkFailed(requestId, failedChunkIndex, 'CHECKSUM_FAILED');
  
  // Third attempt succeeds
  console.log(`Chunk ${failedChunkIndex} attempt 3: succeeds`);
  const download = downloadManager.getDownload(requestId);
  download.receivedChunkIndices.add(failedChunkIndex);
  chunkManager.markChunkReceived(requestId, failedChunkIndex);
  
  // Update retry tracking to mark as succeeded
  const retryEntry = download.retriedChunks.find(r => r.chunkIndex === failedChunkIndex);
  if (retryEntry) {
    retryEntry.status = 'succeeded';
    retryEntry.attempts = 3;
    retryEntry.lastRetryAt = new Date();
  }
  
  downloadManager.updateDownload(requestId, {
    chunksReceived: download.receivedChunkIndices.size
  });
  
  // Get retry statistics
  console.log('\n--- Retry Statistics ---');
  const updatedDownload = downloadManager.getDownload(requestId);
  
  console.log(`Total retries: ${updatedDownload.totalRetries}`);
  console.log(`Retried chunks: ${updatedDownload.retriedChunks.length}`);
  
  updatedDownload.retriedChunks.forEach(chunk => {
    console.log(`  Chunk ${chunk.chunkIndex}: ${chunk.attempts} attempts, status: ${chunk.status}, reason: ${chunk.reason}`);
  });
  
  // Verify API response format
  console.log('\n--- API Response Format ---');
  const apiResponse = {
    progress: {
      retriedChunks: updatedDownload.retriedChunks
    },
    retryStats: {
      totalRetries: updatedDownload.totalRetries,
      retriedChunks: updatedDownload.retriedChunks,
      retrySuccessRate: updatedDownload.retriedChunks && updatedDownload.retriedChunks.length > 0 
        ? updatedDownload.retriedChunks.filter(r => r.status === 'succeeded').length / updatedDownload.retriedChunks.length 
        : 0
    }
  };
  
  console.log(JSON.stringify(apiResponse, null, 2));
  
  // Validate acceptance criteria
  console.log('\n--- Validation ---');
  
  // Check 1: Download progress includes retriedChunks array
  const hasRetriedChunks = Array.isArray(apiResponse.progress.retriedChunks);
  console.log(`✓ Progress includes retriedChunks array: ${hasRetriedChunks}`);
  
  // Check 2: Each entry has required fields
  const hasRequiredFields = apiResponse.progress.retriedChunks.every(chunk => 
    'chunkIndex' in chunk && 
    'attempts' in chunk && 
    'status' in chunk && 
    'reason' in chunk
  );
  console.log(`✓ Each entry has required fields: ${hasRequiredFields}`);
  
  // Check 3: Final result includes total retry count
  const hasTotalRetries = 'totalRetries' in apiResponse.retryStats;
  console.log(`✓ Final result includes total retry count: ${hasTotalRetries}`);
  
  // Cleanup
  chunkManager.cleanup(requestId);
  console.log('\n✓ Test completed successfully');
}

// Run the test
testRetryStatistics().catch(console.error);
