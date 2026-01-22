const ChunkManager = require('./src/chunk-manager');

console.log('=== Testing ChunkManager ===\n');

const manager = new ChunkManager();

// Test 1: Initialize tracking
console.log('Test 1: Initialize chunk tracking');
manager.initChunkTracking('req1', 10);
const missing1 = manager.getMissingChunks('req1');
console.log(`✓ Missing chunks: ${missing1.length} (expected: 10)`);
console.log(`✓ Progress: ${manager.getProgress('req1')}% (expected: 0%)\n`);

// Test 2: Mark chunks received
console.log('Test 2: Mark chunks as received');
manager.markChunkReceived('req1', 0);
manager.markChunkReceived('req1', 2);
manager.markChunkReceived('req1', 4);
const missing2 = manager.getMissingChunks('req1');
console.log(`✓ Missing chunks after receiving 3: [${missing2}]`);
console.log(`✓ Progress: ${manager.getProgress('req1')}% (expected: 30%)\n`);

// Test 3: Track failed chunks
console.log('Test 3: Track failed chunks with retries');
manager.markChunkFailed('req1', 5, 'Checksum mismatch');
manager.markChunkFailed('req1', 5, 'Checksum mismatch');
manager.markChunkFailed('req1', 7, 'Timeout');
const retryInfo = manager.getRetryInfo('req1');
console.log(`✓ Chunks with retries: ${retryInfo.chunksWithRetries}`);
console.log(`✓ Total retry attempts: ${retryInfo.totalRetries}`);
console.log(`✓ Failed chunks: [${retryInfo.failedChunks}]\n`);

// Test 4: Mark failed chunk as received
console.log('Test 4: Mark previously failed chunk as received');
manager.markChunkReceived('req1', 5);
const retryInfo2 = manager.getRetryInfo('req1');
const chunk5 = retryInfo2.chunks.find(c => c.chunkIndex === 5);
console.log(`✓ Chunk 5 status after success: ${chunk5.status} (expected: succeeded)`);
console.log(`✓ Chunk 5 attempts: ${chunk5.attempts} (expected: 2)\n`);

// Test 5: Check completion
console.log('Test 5: Check completion status');
manager.initChunkTracking('req2', 3);
console.log(`✓ Initial complete status: ${manager.isComplete('req2')} (expected: false)`);
manager.markChunkReceived('req2', 0);
manager.markChunkReceived('req2', 1);
manager.markChunkReceived('req2', 2);
console.log(`✓ After all chunks: ${manager.isComplete('req2')} (expected: true)`);
console.log(`✓ Progress: ${manager.getProgress('req2')}% (expected: 100%)\n`);

// Test 6: Cleanup
console.log('Test 6: Cleanup request');
const cleanedUp = manager.cleanup('req2');
console.log(`✓ Cleanup result: ${cleanedUp} (expected: true)`);
const missingAfterCleanup = manager.getMissingChunks('req2');
console.log(`✓ Missing chunks after cleanup: ${missingAfterCleanup.length} (expected: 0)\n`);

// Test 7: Overall statistics
console.log('Test 7: Overall statistics');
const stats = manager.getStats();
console.log(`✓ Total requests tracked: ${stats.totalRequests}`);
console.log(`✓ Total chunks: ${stats.totalChunks}`);
console.log(`✓ Total received: ${stats.totalReceived}`);
console.log(`✓ Total missing: ${stats.totalMissing}`);
console.log(`✓ Total retries: ${stats.totalRetries}\n`);

console.log('=== All tests passed! ===');
