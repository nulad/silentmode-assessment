/**
 * Test suite for Chunk Manager
 */

const { chunkManager } = require('./chunk-manager');

function runTests() {
  console.log('Running Chunk Manager Tests...\n');
  
  let passed = 0;
  let failed = 0;
  
  function assert(condition, message) {
    if (condition) {
      console.log(`✓ ${message}`);
      passed++;
    } else {
      console.log(`✗ ${message}`);
      failed++;
    }
  }
  
  function assertThrows(fn, message) {
    try {
      fn();
      console.log(`✗ ${message} - Expected to throw`);
      failed++;
    } catch (e) {
      console.log(`✓ ${message}`);
      passed++;
    }
  }
  
  // Test 1: Initialize chunk tracking
  const requestId = 'test-request-1';
  const totalChunks = 10;
  
  chunkManager.initChunkTracking(requestId, totalChunks);
  assert(chunkManager.getActiveRequests().includes(requestId), 'Should initialize chunk tracking');
  
  // Test 2: Invalid initialization
  assertThrows(() => chunkManager.initChunkTracking(null, 10), 'Should throw on null requestId');
  assertThrows(() => chunkManager.initChunkTracking('test', -1), 'Should throw on negative totalChunks');
  
  // Test 3: Mark chunks as received
  const firstTime = chunkManager.markChunkReceived(requestId, 0);
  assert(firstTime === true, 'Should return true for first-time chunk receipt');
  
  const secondTime = chunkManager.markChunkReceived(requestId, 0);
  assert(secondTime === false, 'Should return false for duplicate chunk receipt');
  
  // Test 4: Mark chunks as failed
  const attempts = chunkManager.markChunkFailed(requestId, 1, 'Network timeout');
  assert(attempts === 1, 'Should track first failure attempt');
  
  const attempts2 = chunkManager.markChunkFailed(requestId, 1, 'Network timeout again');
  assert(attempts2 === 2, 'Should increment failure attempts');
  
  // Test 5: Get missing chunks
  chunkManager.markChunkReceived(requestId, 2);
  chunkManager.markChunkReceived(requestId, 3);
  const missing = chunkManager.getMissingChunks(requestId);
  assert(missing.length === 7, 'Should identify 7 missing chunks');
  assert(!missing.includes(0) && !missing.includes(2) && !missing.includes(3), 'Should not include received chunks');
  
  // Test 6: Get retry info
  const retryInfo = chunkManager.getRetryInfo(requestId);
  assert(retryInfo.totalChunks === 10, 'Should report correct total chunks');
  assert(retryInfo.receivedCount === 3, 'Should report correct received count (chunks 0, 2, 3)');
  assert(retryInfo.failedChunks.length === 1, 'Should report failed chunks');
  assert(retryInfo.failedChunks[0].chunkIndex === 1, 'Should report correct failed chunk index');
  assert(retryInfo.failedChunks[0].attempts === 2, 'Should report correct retry attempts');
  
  // Test 7: Get chunks to retry
  const toRetry = chunkManager.getChunksToRetry(requestId);
  assert(toRetry.length === 1, 'Should identify chunks needing retry');
  assert(toRetry[0] === 1, 'Should return correct chunk index for retry');
  
  // Test 8: Check completion
  assert(!chunkManager.isComplete(requestId), 'Should not be complete yet (chunk 1 failed)');
  
  // Mark all chunks as received including the failed one
  chunkManager.markChunkReceived(requestId, 1); // This clears the retry attempt
  for (let i = 4; i < totalChunks; i++) {
    chunkManager.markChunkReceived(requestId, i);
  }
  assert(chunkManager.isComplete(requestId), 'Should be complete after receiving all chunks');
  
  // Test 9: Cleanup
  const cleaned = chunkManager.cleanup(requestId);
  assert(cleaned === true, 'Should cleanup existing request');
  assert(!chunkManager.getActiveRequests().includes(requestId), 'Should remove request from active list');
  
  const cleanedAgain = chunkManager.cleanup(requestId);
  assert(cleanedAgain === false, 'Should return false for non-existent request cleanup');
  
  // Test 10: Error handling for non-existent requests
  assertThrows(() => chunkManager.markChunkReceived('non-existent', 0), 'Should throw on non-existent request');
  assertThrows(() => chunkManager.getRetryInfo('non-existent'), 'Should throw on getting retry info for non-existent request');
  
  console.log(`\nTest Results: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed');
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests();
}

module.exports = { runTests };
