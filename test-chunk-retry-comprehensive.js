/**
 * Test chunk retry logic with exponential backoff
 * This test simulates various failure scenarios and verifies retry behavior
 */

const { chunkManager, MAX_RETRY_ATTEMPTS, BASE_RETRY_DELAY, MAX_RETRY_DELAY } = require('./server/src/chunk-manager');

// Test configuration
const TEST_REQUEST_ID = 'test-retry-' + Date.now();
const TEST_TOTAL_CHUNKS = 5;

console.log('🧪 Testing chunk retry logic with exponential backoff...\n');
console.log(`Configuration:`);
console.log(`  - Max retry attempts: ${MAX_RETRY_ATTEMPTS}`);
console.log(`  - Base retry delay: ${BASE_RETRY_DELAY}ms`);
console.log(`  - Max retry delay: ${MAX_RETRY_DELAY}ms\n`);

// Track events
const events = [];

// Listen for all relevant events
chunkManager.on('chunkTimeout', (event) => {
  events.push({ type: 'chunkTimeout', ...event, timestamp: new Date() });
  console.log(`⏰ Chunk ${event.chunkIndex} timed out for request ${event.requestId}`);
});

chunkManager.on('retryChunk', (event) => {
  events.push({ type: 'retryChunk', ...event, timestamp: new Date() });
  console.log(`🔄 Retrying chunk ${event.chunkIndex} (attempt ${event.attempt}/${event.maxRetries}) - Reason: ${event.reason}`);
});

chunkManager.on('maxRetriesExceeded', (event) => {
  events.push({ type: 'maxRetriesExceeded', ...event, timestamp: new Date() });
  console.log(`❌ Chunk ${event.chunkIndex} exceeded max retries after ${event.attempts} attempts`);
});

// Initialize tracking
console.log(`📋 Initializing tracking for request ${TEST_REQUEST_ID} with ${TEST_TOTAL_CHUNKS} chunks`);
chunkManager.initChunkTracking(TEST_REQUEST_ID, TEST_TOTAL_CHUNKS);

// Test 1: Simulate successful chunk reception
console.log('\n✅ Test 1: Successful chunk reception');
chunkManager.markChunkReceived(TEST_REQUEST_ID, 0);
console.log('   Chunk 0 marked as received');

// Test 2: Simulate chunk failure with checksum error
console.log('\n❌ Test 2: Chunk failure with checksum error');
chunkManager.markChunkFailed(TEST_REQUEST_ID, 1, 'checksum failed');
console.log('   Chunk 1 marked as failed (should trigger retry)');

// Test 3: Simulate multiple failures to exceed max retries
console.log('\n💥 Test 3: Multiple failures to exceed max retries');
// Simulate chunk 2 failing multiple times quickly
for (let i = 0; i < MAX_RETRY_ATTEMPTS; i++) {
  chunkManager.markChunkFailed(TEST_REQUEST_ID, 2, 'persistent failure');
}

// Test 4: Check retry statistics
console.log('\n📊 Test 4: Retry statistics');
const retryInfo = chunkManager.getRetryInfo(TEST_REQUEST_ID);
console.log(JSON.stringify(retryInfo, null, 2));

// Test 5: Verify exponential backoff calculation
console.log('\n⏱️  Test 5: Exponential backoff delays');
for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
  const delay = chunkManager.calculateBackoffDelay(attempt);
  console.log(`   Attempt ${attempt + 1}: ${delay}ms delay`);
}

// Test 6: Simulate missing chunks on completion
console.log('\n🔍 Test 6: Missing chunks detection');
const missingChunks = chunkManager.getMissingChunks(TEST_REQUEST_ID);
console.log(`   Missing chunks: [${missingChunks.join(', ')}]`);

// Wait for retry events to complete
setTimeout(() => {
  console.log('\n📈 Event Summary:');
  events.forEach((event, index) => {
    console.log(`   ${index + 1}. ${event.type} - Chunk: ${event.chunkIndex || 'N/A'}, Time: ${event.timestamp.toISOString()}`);
  });

  // Final cleanup
  console.log('\n🧹 Cleaning up test data...');
  chunkManager.cleanup(TEST_REQUEST_ID);
  
  console.log('\n✅ Test completed successfully!');
  process.exit(0);
}, 10000); // Wait 10 seconds to see retry behavior
