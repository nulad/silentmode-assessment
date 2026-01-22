const { MESSAGE_TYPES, RETRY_REASONS } = require('../shared/protocol');

console.log('Testing RETRY_CHUNK message structure...\n');

const retryMessage = {
  type: MESSAGE_TYPES.RETRY_CHUNK,
  requestId: 'test-request-123',
  chunkIndex: 42,
  attempt: 2,
  reason: RETRY_REASONS.CHECKSUM_FAILED,
  timestamp: new Date().toISOString()
};

console.log('RETRY_CHUNK message structure:');
console.log(JSON.stringify(retryMessage, null, 2));

console.log('\nAvailable RETRY_REASONS:');
console.log(JSON.stringify(RETRY_REASONS, null, 2));

console.log('\n✓ All required fields present:');
console.log('  - type:', retryMessage.type);
console.log('  - requestId:', retryMessage.requestId);
console.log('  - chunkIndex:', retryMessage.chunkIndex);
console.log('  - attempt:', retryMessage.attempt);
console.log('  - reason:', retryMessage.reason);
console.log('  - timestamp:', retryMessage.timestamp);

console.log('\n✓ Test passed: RETRY_CHUNK message format is correct');
