#!/usr/bin/env node

const DownloadManager = require('../src/download-manager');

// Colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testDownloadManager() {
  log('\n=== Download Manager Unit Test ===\n', 'blue');
  
  try {
    const downloadManager = new DownloadManager();
    
    // Test 1: Create download
    log('Test 1: Creating download...', 'yellow');
    const requestId = downloadManager.createDownload('client-1', '/test/file.txt');
    log(`✓ Created download request: ${requestId}`, 'green');
    
    // Test 2: Get download
    log('\nTest 2: Retrieving download...', 'yellow');
    const download = downloadManager.getDownload(requestId);
    if (download && download.clientId === 'client-1') {
      log('✓ Download retrieved successfully', 'green');
      log(`  Status: ${download.status}`, 'reset');
      log(`  File: ${download.filePath}`, 'reset');
    } else {
      throw new Error('Failed to retrieve download');
    }
    
    // Test 3: Update download
    log('\nTest 3: Updating download...', 'yellow');
    downloadManager.updateDownload(requestId, { 
      status: 'in_progress',
      totalChunks: 10,
      fileChecksum: 'abc123def456'
    });
    const updated = downloadManager.getDownload(requestId);
    if (updated.status === 'in_progress' && updated.totalChunks === 10) {
      log('✓ Download updated successfully', 'green');
    } else {
      throw new Error('Failed to update download');
    }
    
    // Test 4: Add chunk progress
    log('\nTest 4: Adding chunk progress...', 'yellow');
    downloadManager.addChunkProgress(requestId, 1024);
    downloadManager.addChunkProgress(requestId, 2048);
    const withProgress = downloadManager.getDownload(requestId);
    if (withProgress.chunksReceived === 2 && withProgress.bytesReceived === 3072) {
      log('✓ Chunk progress tracked correctly', 'green');
      log(`  Chunks: ${withProgress.chunksReceived}/${withProgress.totalChunks}`, 'reset');
      log(`  Bytes: ${withProgress.bytesReceived}`, 'reset');
    } else {
      throw new Error('Failed to track progress');
    }
    
    // Test 5: Create multiple downloads
    log('\nTest 5: Creating multiple downloads...', 'yellow');
    const id2 = downloadManager.createDownload('client-2', '/test/file2.txt');
    const id3 = downloadManager.createDownload('client-1', '/test/file3.txt');
    
    // Test 6: Filter downloads
    log('\nTest 6: Filtering downloads...', 'yellow');
    const allDownloads = downloadManager.getDownloads();
    const client1Downloads = downloadManager.getClientDownloads('client-1');
    const pendingDownloads = downloadManager.getDownloads({ status: 'pending' });
    
    log(`  Total downloads: ${allDownloads.length}`, 'reset');
    log(`  Client 1 downloads: ${client1Downloads.length}`, 'reset');
    log(`  Pending downloads: ${pendingDownloads.length}`, 'reset');
    
    if (allDownloads.length === 3 && client1Downloads.length === 2) {
      log('✓ Filtering works correctly', 'green');
    } else {
      throw new Error('Filtering failed');
    }
    
    // Test 7: Complete download
    log('\nTest 7: Completing download...', 'yellow');
    downloadManager.completeDownload(requestId, { finalSize: 3072 });
    const completed = downloadManager.getDownload(requestId);
    if (completed.status === 'completed' && completed.completedAt) {
      log('✓ Download completed successfully', 'green');
    } else {
      throw new Error('Failed to complete download');
    }
    
    // Test 8: Cancel download
    log('\nTest 8: Cancelling download...', 'yellow');
    const cancelled = downloadManager.cancelDownload(id2, 'Test cancellation');
    const cancelledDownload = downloadManager.getDownload(id2);
    if (cancelled && cancelledDownload.status === 'cancelled') {
      log('✓ Download cancelled successfully', 'green');
      log(`  Reason: ${cancelledDownload.error.message}`, 'reset');
    } else {
      throw new Error('Failed to cancel download');
    }
    
    // Test 9: Fail download
    log('\nTest 9: Failing download...', 'yellow');
    const error = new Error('Test failure');
    error.code = 'TEST_ERROR';
    downloadManager.failDownload(id3, error);
    const failed = downloadManager.getDownload(id3);
    if (failed.status === 'failed' && failed.error.code === 'TEST_ERROR') {
      log('✓ Download failed correctly', 'green');
      log(`  Error: ${failed.error.message}`, 'reset');
    } else {
      throw new Error('Failed to mark download as failed');
    }
    
    // Test 10: Statistics
    log('\nTest 10: Getting statistics...', 'yellow');
    const stats = downloadManager.getStatistics();
    log(`  Total: ${stats.total}`, 'reset');
    log(`  Pending: ${stats.pending}`, 'reset');
    log(`  In Progress: ${stats.in_progress}`, 'reset');
    log(`  Completed: ${stats.completed}`, 'reset');
    log(`  Failed: ${stats.failed}`, 'reset');
    log(`  Cancelled: ${stats.cancelled}`, 'reset');
    log(`  Total Bytes: ${stats.totalBytesTransferred}`, 'reset');
    
    if (stats.total === 3 && stats.completed === 1 && stats.cancelled === 1 && stats.failed === 1) {
      log('✓ Statistics are correct', 'green');
    } else {
      throw new Error('Statistics are incorrect');
    }
    
    // Test 11: Cleanup
    log('\nTest 11: Testing cleanup...', 'yellow');
    // Simulate old completed download
    const oldId = downloadManager.createDownload('client-3', '/old/file.txt');
    downloadManager.updateDownload(oldId, { 
      status: 'completed',
      startedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) // 10 days ago
    });
    
    const cleaned = downloadManager.cleanup({ olderThan: 7 });
    if (cleaned === 1) {
      log('✓ Cleanup removed old downloads', 'green');
    } else {
      throw new Error('Cleanup failed');
    }
    
    log('\n=== Test Result ===', 'blue');
    log('✓ All tests PASSED\n', 'green');
    
  } catch (error) {
    log(`\n✗ Test FAILED: ${error.message}\n`, 'red');
    process.exit(1);
  }
}

// Run the test
testDownloadManager();
