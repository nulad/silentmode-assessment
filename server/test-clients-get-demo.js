#!/usr/bin/env node
// Demo script to show the clients get command functionality
const { spawn } = require('child_process');
const path = require('path');

const CLI_PATH = path.join(__dirname, 'cli.js');

console.log('=== SilentMode CLI: "clients get" Command Demo ===\n');

console.log('This command allows you to retrieve detailed information about a specific client.\n');

console.log('Usage examples:');
console.log('  silentmode clients get <clientId>');
console.log('  silentmode clients get <clientId> --format json\n');

console.log('Command help:');
const helpChild = spawn('node', [CLI_PATH, 'clients', 'get', '--help'], { stdio: 'inherit' });
helpChild.on('close', () => {
  console.log('\n=== Features ===');
  console.log('✓ Retrieves detailed client information');
  console.log('✓ Shows connection status and timestamps');
  console.log('✓ Displays client metadata if available');
  console.log('✓ Supports table and JSON output formats');
  console.log('✓ Handles non-existent clients gracefully');
  
  console.log('\n=== Implementation Details ===');
  console.log('• API Endpoint: GET /api/v1/clients/:clientId');
  console.log('• Returns: Client ID, connection ID, status, timestamps, metadata');
  console.log('• Error handling: 404 for non-existent clients');
  
  console.log('\nTo test with a real client:');
  console.log('1. Start the server: node src/index.js');
  console.log('2. Connect a client');
  console.log('3. Run: silentmode clients get <clientId>');
});
