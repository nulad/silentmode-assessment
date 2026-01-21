#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Test configuration
const TEST_TIMEOUT = 30000; // 30 seconds
const SERVER_STARTUP_DELAY = 3000; // 3 seconds

// Colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Clean up any existing test artifacts
function cleanup() {
  const testDirs = ['./logs', './client/logs'];
  testDirs.forEach(dir => {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

// Run the integration test
async function runIntegrationTest() {
  log('\n=== SilentMode WebSocket Integration Test ===\n', 'blue');
  
  cleanup();
  
  let serverProcess;
  let clientProcess;
  let testPassed = false;
  
  try {
    // Start the server
    log('Starting server...', 'yellow');
    serverProcess = spawn('node', ['src/index.js'], {
      cwd: path.join(__dirname, '..', 'server'),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, LOG_LEVEL: 'info' }
    });
    
    // Capture server output
    serverProcess.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output.includes('WebSocket server listening')) {
        log('✓ Server started successfully', 'green');
      }
    });
    
    serverProcess.stderr.on('data', (data) => {
      log(`Server error: ${data.toString().trim()}`, 'red');
    });
    
    // Wait for server to start
    log('Waiting for server to initialize...', 'yellow');
    await new Promise(resolve => setTimeout(resolve, SERVER_STARTUP_DELAY));
    
    // Run client test
    log('Running client WebSocket test...', 'yellow');
    clientProcess = spawn('npm', ['test'], {
      cwd: path.join(__dirname, '..', 'client'),
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Capture client output
    let clientOutput = '';
    clientProcess.stdout.on('data', (data) => {
      const output = data.toString();
      clientOutput += output;
      process.stdout.write(output);
    });
    
    clientProcess.stderr.on('data', (data) => {
      process.stderr.write(`Client stderr: ${data}`);
    });
    
    // Wait for client test to complete
    await new Promise((resolve, reject) => {
      clientProcess.on('close', (code) => {
        if (code === 0) {
          testPassed = true;
          log('✓ Client test completed successfully', 'green');
        } else {
          log(`✗ Client test failed with exit code: ${code}`, 'red');
        }
        resolve();
      });
      
      clientProcess.on('error', (error) => {
        log(`Client process error: ${error.message}`, 'red');
        reject(error);
      });
    });
    
  } catch (error) {
    log(`Test error: ${error.message}`, 'red');
  } finally {
    // Clean up processes
    if (clientProcess) {
      clientProcess.kill();
    }
    if (serverProcess) {
      serverProcess.kill();
    }
    
    // Final result
    log('\n=== Test Result ===', 'blue');
    if (testPassed) {
      log('✓ Integration test PASSED\n', 'green');
      process.exit(0);
    } else {
      log('✗ Integration test FAILED\n', 'red');
      process.exit(1);
    }
  }
}

// Handle timeout
const timeout = setTimeout(() => {
  log('Test timed out', 'red');
  process.exit(1);
}, TEST_TIMEOUT);

// Run the test
runIntegrationTest().then(() => {
  clearTimeout(timeout);
}).catch(error => {
  clearTimeout(timeout);
  log(`Test failed: ${error.message}`, 'red');
  process.exit(1);
});
