#!/usr/bin/env node
const WebSocket = require('ws');
const { spawn } = require('child_process');
const axios = require('axios');

const SERVER_URL = 'http://localhost:3000';
const WS_URL = 'ws://localhost:8080';

async function testClientsListCommand() {
  console.log('=== Testing clients list command ===\n');

  // Start the server
  console.log('Starting server...');
  const server = spawn('node', ['src/index.js'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: __dirname
  });

  // Capture server output for debugging
  server.stderr.on('data', (data) => {
    console.error('Server error:', data.toString());
  });
  
  server.stdout.on('data', (data) => {
    console.log('Server output:', data.toString());
  });

  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 2000));

  try {
    // Connect a test client
    console.log('Connecting test client...');
    const ws = new WebSocket(WS_URL);
    
    await new Promise((resolve, reject) => {
      ws.on('open', () => {
        console.log('Client connected');
        
        // Register with a specific ID
        ws.send(JSON.stringify({
          type: 'register',
          clientId: 'test-client-123'
        }));
        
        setTimeout(resolve, 500);
      });
      
      ws.on('error', reject);
    });

    // Test 1: Basic list command
    console.log('\nTest 1: Basic clients list');
    const cli = spawn('node', ['cli.js', 'clients', 'list'], {
      stdio: 'pipe',
      cwd: __dirname
    });

    let output = '';
    cli.stdout.on('data', (data) => {
      output += data.toString();
    });

    await new Promise((resolve) => {
      cli.on('close', resolve);
    });

    console.log('Output:');
    console.log(output);
    
    // Verify output contains expected fields
    if (output.includes('test-client-123') && output.includes('connected')) {
      console.log('✓ Test 1 passed: Client listed correctly');
    } else {
      console.log('✗ Test 1 failed: Client not found or incorrect format');
    }

    // Test 2: JSON format
    console.log('\nTest 2: JSON format');
    const cliJson = spawn('node', ['cli.js', 'clients', 'list', '--format', 'json'], {
      stdio: 'pipe',
      cwd: __dirname
    });

    let jsonOutput = '';
    cliJson.stdout.on('data', (data) => {
      jsonOutput += data.toString();
    });

    await new Promise((resolve) => {
      cliJson.on('close', resolve);
    });

    console.log('JSON Output:');
    console.log(jsonOutput);
    
    try {
      const parsed = JSON.parse(jsonOutput);
      if (parsed.success && parsed.clients && parsed.clients.length > 0) {
        console.log('✓ Test 2 passed: Valid JSON output');
      } else {
        console.log('✗ Test 2 failed: Invalid JSON structure');
      }
    } catch (e) {
      console.log('✗ Test 2 failed: Invalid JSON');
    }

    // Test 3: Status filter
    console.log('\nTest 3: Status filter');
    const cliFilter = spawn('node', ['cli.js', 'clients', 'list', '--status', 'connected'], {
      stdio: 'pipe',
      cwd: __dirname
    });

    let filterOutput = '';
    cliFilter.stdout.on('data', (data) => {
      filterOutput += data.toString();
    });

    await new Promise((resolve) => {
      cliFilter.on('close', resolve);
    });

    console.log('Filter Output:');
    console.log(filterOutput);
    
    if (filterOutput.includes('test-client-123')) {
      console.log('✓ Test 3 passed: Status filter works');
    } else {
      console.log('✗ Test 3 failed: Status filter not working');
    }

    // Test 4: Empty list (disconnect client first)
    console.log('\nTest 4: Empty client list');
    ws.close();
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const cliEmpty = spawn('node', ['cli.js', 'clients', 'list'], {
      stdio: 'pipe',
      cwd: __dirname
    });

    let emptyOutput = '';
    cliEmpty.stdout.on('data', (data) => {
      emptyOutput += data.toString();
    });

    await new Promise((resolve) => {
      cliEmpty.on('close', resolve);
    });

    console.log('Empty Output:');
    console.log(emptyOutput);
    
    if (emptyOutput.includes('No clients found')) {
      console.log('✓ Test 4 passed: Empty list handled correctly');
    } else {
      console.log('✗ Test 4 failed: Empty list not handled properly');
    }

    console.log('\n=== All tests completed ===');

  } catch (error) {
    console.error('Test error:', error);
  } finally {
    // Clean up
    server.kill();
    process.exit(0);
  }
}

testClientsListCommand();
