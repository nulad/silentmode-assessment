/**
 * Test runner for all chunk-manager tests
 * Runs basic tests, timeout tests, and edge case tests
 */

const { runTests } = require('./chunk-manager.test');
const jest = require('jest');

// Run the basic tests first
console.log('='.repeat(60));
console.log('Running Basic Chunk Manager Tests');
console.log('='.repeat(60));

try {
  runTests();
} catch (error) {
  console.error('Basic tests failed:', error);
  process.exit(1);
}

// Run Jest tests for timeout and edge cases
console.log('\n' + '='.repeat(60));
console.log('Running Jest Tests (Timeout & Edge Cases)');
console.log('='.repeat(60));

// Configure Jest to run our test files
const jestConfig = {
  testEnvironment: 'node',
  verbose: true,
  testMatch: [
    '**/chunk-timeout.test.js',
    '**/chunk-manager.edge-cases.test.js'
  ],
  collectCoverageFrom: [
    'chunk-manager.js'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html']
};

// Run Jest with our configuration
const { run } = require('jest');
run(jestConfig);
