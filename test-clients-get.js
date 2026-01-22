#!/usr/bin/env node

// Test script for clients get command
const { spawn } = require('child_process');
const axios = require('axios');

const SERVER_URL = 'http://localhost:3001';
const CLI_PATH = './server/cli.js';

async function testClientsGet() {
  console.log('Testing clients get command...\n');
  
  try {
    // First, check if server is running
    console.log('1. Checking server health...');
    const healthResponse = await axios.get(`${SERVER_URL}/api/v1/health`);
    if (!healthResponse.data.success) {
      console.error('Server is not healthy. Please start the server first.');
      process.exit(1);
    }
    console.log('✓ Server is healthy\n');
    
    // Get list of clients to find a valid client ID
    console.log('2. Getting list of clients...');
    const clientsResponse = await axios.get(`${SERVER_URL}/api/v1/clients`);
    if (!clientsResponse.data.success || clientsResponse.data.clients.length === 0) {
      console.error('No clients connected. Please connect a client first.');
      process.exit(1);
    }
    
    const clientId = clientsResponse.data.clients[0].clientId;
    console.log(`✓ Found client: ${clientId}\n`);
    
    // Test table format (default)
    console.log('3. Testing table format (default)...');
    await runCommand('node', [CLI_PATH, 'clients', 'get', clientId]);
    
    console.log('\n4. Testing JSON format...');
    await runCommand('node', [CLI_PATH, 'clients', 'get', clientId, '--format', 'json']);
    
    console.log('\n5. Testing non-existent client...');
    await runCommand('node', [CLI_PATH, 'clients', 'get', 'non-existent-client']);
    
    console.log('\n✅ All tests completed!');
    
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.error('Server is not running. Please start the server first.');
    } else {
      console.error('Error:', error.message);
    }
    process.exit(1);
  }
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });
    
    child.on('error', reject);
  });
}

testClientsGet();
