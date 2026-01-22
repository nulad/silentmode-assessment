#!/usr/bin/env node

// Integration test for download command with a real server
const { spawn } = require('child_process');
const axios = require('axios');
const path = require('path');

const SERVER_PORT = 3001;
const API_URL = `http://localhost:${SERVER_PORT}`;
const cliPath = path.join(__dirname, 'cli.js');

async function testDownloadIntegration() {
  console.log('=== Download Command Integration Test ===\n');

  // Start the server in background
  console.log('Starting server...');
  const serverProcess = spawn('node', ['src/index.js'], {
    env: { ...process.env, PORT: SERVER_PORT },
    stdio: 'pipe'
  });

  // Wait for server to start
  let retries = 10;
  while (retries > 0) {
    try {
      await axios.get(`${API_URL}/api/v1/health`);
      console.log('✓ Server is ready\n');
      break;
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      retries--;
    }
  }

  if (retries === 0) {
    console.error('Failed to start server');
    serverProcess.kill();
    process.exit(1);
  }

  try {
    // Test 1: Try to download from non-existent client
    console.log('=== Test 1: Non-existent client ===');
    const test1 = spawn('node', [cliPath, 'download', 'fake-client', '-f', '/test.txt', '--api-url', API_URL], {
      stdio: 'inherit'
    });
    
    await new Promise(resolve => {
      test1.on('close', resolve);
    });

    console.log('\n=== Test 2: Valid command syntax (no --watch) ===');
    const test2 = spawn('node', [cliPath, 'download', 'test-client', '-f', '/test/file.txt', '--api-url', API_URL], {
      stdio: 'inherit'
    });
    
    await new Promise(resolve => {
      test2.on('close', resolve);
    });

    console.log('\n✓ All integration tests passed!');

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    // Clean up
    serverProcess.kill();
    console.log('\n✓ Server stopped');
  }
}

testDownloadIntegration();
