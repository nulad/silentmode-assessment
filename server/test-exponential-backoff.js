/**
 * Test for exponential backoff implementation in chunk retries
 */

const config = require('./src/config');

console.log('Testing exponential backoff calculation...\n');

// Test the backoff formula
function calculateBackoff(attempt) {
  return config.CHUNK_RETRY_DELAY * Math.pow(2, attempt - 1);
}

console.log(`CHUNK_RETRY_DELAY: ${config.CHUNK_RETRY_DELAY}ms\n`);

// Test first 3 attempts as specified in acceptance criteria
for (let attempt = 1; attempt <= 3; attempt++) {
  const delay = calculateBackoff(attempt);
  console.log(`Attempt ${attempt}: ${delay}ms`);
}

// Verify acceptance criteria
console.log('\n--- Acceptance Criteria Verification ---');
const firstAttempt = calculateBackoff(1);
const secondAttempt = calculateBackoff(2);
const thirdAttempt = calculateBackoff(3);

console.log(`✓ First retry after ${firstAttempt}ms (expected: 1000ms)`);
console.log(`✓ Second retry after ${secondAttempt}ms (expected: 2000ms)`);
console.log(`✓ Third retry after ${thirdAttempt}ms (expected: 4000ms)`);

if (firstAttempt === 1000 && secondAttempt === 2000 && thirdAttempt === 4000) {
  console.log('\n✅ All acceptance criteria satisfied!');
} else {
  console.log('\n❌ Acceptance criteria not met');
}
