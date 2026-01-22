module.exports = {
  testEnvironment: 'node',
  maxWorkers: 1, // Run tests sequentially to avoid port conflicts
  testTimeout: 30000, // Increase timeout for integration tests
  verbose: true
};
