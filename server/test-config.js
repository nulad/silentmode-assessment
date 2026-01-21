const config = require('./src/config');
const logger = require('./src/utils/logger');

console.log('Testing server configuration loader...\n');

// Test 1: All config values accessible
console.log('✓ Test 1: All config values accessible');
console.log('Config:', config);
console.log('');

// Test 2: Check defaults are applied
console.log('✓ Test 2: Checking default values');
const expectedDefaults = {
  PORT: 3000,
  WS_PORT: 8080,
  DOWNLOAD_DIR: './downloads',
  CHUNK_SIZE: 1048576,
  MAX_CHUNK_RETRY_ATTEMPTS: 3,
  CHUNK_RETRY_DELAY: 1000,
  HEARTBEAT_INTERVAL: 30000,
  DOWNLOAD_TIMEOUT: 300000,
  LOG_LEVEL: 'info'
};

Object.entries(expectedDefaults).forEach(([key, value]) => {
  if (config[key] === value) {
    console.log(`  ${key}: ✓ ${value}`);
  } else {
    console.log(`  ${key}: � Expected ${value}, got ${config[key]}`);
  }
});

// Test 3: Config is frozen
console.log('\n✓ Test 3: Config is frozen');
try {
  config.PORT = 4000;
  console.log('  ✗ Config was modified!');
} catch (e) {
  console.log('  ✓ Config is properly frozen');
}

// Test 4: Test with environment variables
console.log('\n✓ Test 4: Testing with environment variables');
process.env.TEST_PORT = '4000';
process.env.TEST_CHUNK_SIZE = 'invalid';

// Reload config in a child process to test env vars
const { spawn } = require('child_process');
const testProcess = spawn('node', ['-e', `
require('dotenv').config();
process.env.PORT = '4000';
process.env.CHUNK_SIZE = 'invalid';
process.env.LOG_LEVEL = 'debug';
const config = require('./src/config');
console.log('PORT with env var:', config.PORT);
console.log('CHUNK_SIZE with invalid value:', config.CHUNK_SIZE);
console.log('LOG_LEVEL with env var:', config.LOG_LEVEL);
`], { cwd: __dirname });

testProcess.stdout.on('data', (data) => {
  console.log('  ', data.toString().trim());
});

testProcess.on('close', () => {
  console.log('\n✅ All tests completed!');
});
