#!/usr/bin/env node

// Test script for the download CLI command
const { spawn } = require('child_process');
const path = require('path');

const cliPath = path.join(__dirname, 'cli.js');

// Test 1: Show help
console.log('\n=== Test 1: Show download command help ===');
const helpProcess = spawn('node', [cliPath, 'download', '--help'], { stdio: 'inherit' });
helpProcess.on('close', (code) => {
  console.log(`\nHelp command exited with code ${code}\n`);
  
  // Test 2: Missing file-path error
  console.log('=== Test 2: Missing file-path option ===');
  const errorProcess = spawn('node', [cliPath, 'download', 'test-client'], { stdio: 'inherit' });
  errorProcess.on('close', (code) => {
    console.log(`\nError command exited with code ${code}\n`);
    
    // Test 3: Valid command structure (will fail to connect to server)
    console.log('=== Test 3: Valid command syntax (without server) ===');
    const validProcess = spawn('node', [cliPath, 'download', 'test-client', '-f', '/test/file.txt', '--api-url', 'http://localhost:9999'], { stdio: 'inherit' });
    validProcess.on('close', (code) => {
      console.log(`\nValid command exited with code ${code} (expected to fail due to no server)\n`);
      console.log('=== Tests completed ===');
    });
  });
});
