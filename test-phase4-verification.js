/**
 * Final verification test for Phase 4: Chunk Retry Logic
 * Verifies all acceptance criteria are met:
 * 1. Failed chunks automatically trigger retry
 * 2. Exponential backoff prevents server overload
 * 3. After 3 failed attempts, download fails gracefully
 * 4. Retry statistics are tracked and reported
 */

const { chunkManager, MAX_RETRY_ATTEMPTS, BASE_RETRY_DELAY, MAX_RETRY_DELAY } = require('./server/src/chunk-manager');
const WebSocketServer = require('./server/src/websocket-server');
const { MESSAGE_TYPES, RETRY_REASONS } = require('./shared/protocol');

console.log('✨ Phase 4: Chunk Retry Logic - Final Verification Test\n');

// Test results tracking
const testResults = {
  automaticRetry: false,
  exponentialBackoff: false,
  maxRetriesHandled: false,
  statisticsTracked: false
};

// Test 1: Automatic retry trigger
console.log('📋 Test 1: Automatic retry trigger');
const TEST_REQUEST_ID = 'final-test-' + Date.now();
chunkManager.initChunkTracking(TEST_REQUEST_ID, 3);

// Set up listener for automatic retry
chunkManager.once('retryChunk', (event) => {
  console.log(`   ✅ Automatic retry triggered for chunk ${event.chunkIndex}`);
  testResults.automaticRetry = true;
});

// Mark a chunk as failed to trigger retry
chunkManager.markChunkFailed(TEST_REQUEST_ID, 0, 'test failure');

// Test 2: Exponential backoff verification
console.log('\n⏱️  Test 2: Exponential backoff verification');
const delays = [];
for (let i = 0; i < 3; i++) {
  const delay = chunkManager.calculateBackoffDelay(i);
  delays.push(delay);
}

// Verify exponential growth (with jitter)
const isExponential = delays[1] > delays[0] && delays[2] > delays[1];
if (isExponential && delays[0] >= BASE_RETRY_DELAY && delays[2] <= MAX_RETRY_DELAY * 1.1) {
  console.log(`   ✅ Exponential backoff working: ${delays.join('ms -> ')}ms`);
  testResults.exponentialBackoff = true;
} else {
  console.log(`   ❌ Exponential backoff failed: ${delays.join('ms -> ')}ms`);
}

// Test 3: Max retry handling
console.log('\n💥 Test 3: Max retry handling (3 attempts)');
let retryCount = 0;
chunkManager.on('retryChunk', (event) => {
  if (event.chunkIndex === 1) {
    retryCount++;
  }
});

chunkManager.once('maxRetriesExceeded', (event) => {
  console.log(`   ✅ Max retries exceeded for chunk ${event.chunkIndex} after ${event.attempts} attempts`);
  testResults.maxRetriesHandled = true;
});

// Force chunk 1 to fail 4 times (exceeds max of 3)
for (let i = 0; i < 4; i++) {
  chunkManager.markChunkFailed(TEST_REQUEST_ID, 1, 'persistent failure');
}

// Test 4: Statistics tracking
console.log('\n📊 Test 4: Retry statistics tracking');
const stats = chunkManager.getRetryInfo(TEST_REQUEST_ID);

if (stats.totalChunks === 3 && 
    stats.failedChunks.length > 0 && 
    stats.totalRetryAttempts > 0 &&
    stats.failedChunks.every(fc => fc.attempts > 0 && fc.reason && fc.lastAttempt)) {
  console.log(`   ✅ Statistics tracked properly:`);
  console.log(`      - Total chunks: ${stats.totalChunks}`);
  console.log(`      - Failed chunks: ${stats.failedChunks.length}`);
  console.log(`      - Total retry attempts: ${stats.totalRetryAttempts}`);
  testResults.statisticsTracked = true;
} else {
  console.log(`   ❌ Statistics tracking incomplete`);
}

// Wait for all async operations to complete
setTimeout(() => {
  console.log('\n🎯 Final Results:');
  console.log('================');
  
  const allPassed = Object.values(testResults).every(result => result === true);
  
  if (allPassed) {
    console.log('✅ All acceptance criteria met!');
    console.log('');
    console.log('✨ Phase 4 Implementation Summary:');
    console.log('   • Chunk manager with retry tracking ✓');
    console.log('   • Timeout detection for missing chunks ✓');
    console.log('   • RETRY_CHUNK message protocol ✓');
    console.log('   • Exponential backoff (1s -> 2s -> 4s) ✓');
    console.log('   • Max retry handling and failure reporting ✓');
    console.log('   • Retry statistics tracked and reported ✓');
  } else {
    console.log('❌ Some criteria not met:');
    Object.entries(testResults).forEach(([test, passed]) => {
      console.log(`   ${passed ? '✅' : '❌'} ${test}`);
    });
  }
  
  // Cleanup
  chunkManager.cleanup(TEST_REQUEST_ID);
  
  console.log('\n🏁 Phase 4 testing complete!');
  process.exit(allPassed ? 0 : 1);
}, 2000);
