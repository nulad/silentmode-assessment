#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');

const CLI_PATH = path.join(__dirname, 'cli.js');

function testCliClientsGet() {
  console.log('Testing CLI command: silentmode clients get...\n');
  
  // Test 1: Missing client ID
  console.log('1. Testing without client ID (should show help)...');
  const child1 = spawn('node', [CLI_PATH, 'clients', 'get'], { stdio: 'inherit' });
  
  child1.on('close', (code) => {
    if (code === 1) {
      console.log('✓ Correctly failed when client ID is missing\n');
      
      // Test 2: Non-existent client
      console.log('2. Testing with non-existent client ID...');
      const child2 = spawn('node', [CLI_PATH, 'clients', 'get', 'non-existent-client'], { stdio: 'pipe' });
      
      let output2 = '';
      child2.stdout.on('data', (data) => output2 += data.toString());
      child2.stderr.on('data', (data) => output2 += data.toString());
      
      child2.on('close', (code2) => {
        if (code2 === 1 && output2.includes('Client not found')) {
          console.log('✓ Correctly handled non-existent client\n');
          
          // Test 3: JSON format flag
          console.log('3. Testing JSON format flag...');
          const child3 = spawn('node', [CLI_PATH, 'clients', 'get', 'test-client', '--format', 'json'], { stdio: 'pipe' });
          
          let output3 = '';
          child3.stdout.on('data', (data) => output3 += data.toString());
          child3.stderr.on('data', (data) => output3 += data.toString());
          
          child3.on('close', (code3) => {
            if (code3 === 1 && output3.includes('Client not found')) {
              console.log('✓ JSON format flag accepted\n');
              console.log('✅ CLI command structure is correct!');
              console.log('\nNote: To test with a real client, start the server and connect a client first.');
            } else {
              console.error('✗ JSON format test failed');
              console.error('Output:', output3);
              process.exit(1);
            }
          });
          
        } else {
          console.error('✗ Non-existent client test failed');
          console.error('Output:', output2);
          process.exit(1);
        }
      });
      
    } else {
      console.error('✗ Should have failed when client ID is missing');
      process.exit(1);
    }
  });
}

testCliClientsGet();
