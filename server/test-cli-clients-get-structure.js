#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');

const CLI_PATH = path.join(__dirname, 'cli.js');

function testCliStructure() {
  console.log('Testing CLI command structure...\n');
  
  // Test 1: Help for clients command
  console.log('1. Testing "clients" help...');
  const child1 = spawn('node', [CLI_PATH, 'clients', '--help'], { stdio: 'pipe' });
  
  let output1 = '';
  child1.stdout.on('data', (data) => output1 += data.toString());
  child1.stderr.on('data', (data) => output1 += data.toString());
  
  child1.on('close', (code1) => {
    if (code1 === 0 && output1.includes('Manage clients')) {
      console.log('✓ Clients command group exists\n');
      
      // Test 2: Help for clients get command
      console.log('2. Testing "clients get" help...');
      const child2 = spawn('node', [CLI_PATH, 'clients', 'get', '--help'], { stdio: 'pipe' });
      
      let output2 = '';
      child2.stdout.on('data', (data) => output2 += data.toString());
      child2.stderr.on('data', (data) => output2 += data.toString());
      
      child2.on('close', (code2) => {
        if (code2 === 0 && 
            output2.includes('Get specific client details') &&
            output2.includes('clientId') &&
            output2.includes('--format')) {
          console.log('✓ Clients get command has correct structure\n');
          
          // Test 3: Missing argument
          console.log('3. Testing missing client ID...');
          const child3 = spawn('node', [CLI_PATH, 'clients', 'get'], { stdio: 'pipe' });
          
          let output3 = '';
          child3.stdout.on('data', (data) => output3 += data.toString());
          child3.stderr.on('data', (data) => output3 += data.toString());
          
          child3.on('close', (code3) => {
            if (code3 === 1 && output3.includes('missing required argument')) {
              console.log('✓ Correctly requires client ID argument\n');
              
              // Test 4: Invalid format option
              console.log('4. Testing invalid format option...');
              const child4 = spawn('node', [CLI_PATH, 'clients', 'get', 'test', '--format', 'xml'], { 
                stdio: 'pipe',
                env: { ...process.env, SERVER_URL: 'http://localhost:9999' } // Use invalid port
              });
              
              let output4 = '';
              child4.stdout.on('data', (data) => output4 += data.toString());
              child4.stderr.on('data', (data) => output4 += data.toString());
              
              child4.on('close', (code4) => {
                // The command should accept the format option (validation happens in the API)
                if (output4.includes('Fetching client details')) {
                  console.log('✓ Format option is accepted\n');
                  console.log('✅ All CLI structure tests passed!');
                } else {
                  console.error('✗ Format option test failed');
                  console.error('Output:', output4);
                }
              });
              
            } else {
              console.error('✗ Missing argument test failed');
              console.error('Output:', output3);
            }
          });
          
        } else {
          console.error('✗ Clients get command structure incorrect');
          console.error('Output:', output2);
        }
      });
      
    } else {
      console.error('✗ Clients command group not found');
      console.error('Output:', output1);
    }
  });
}

testCliStructure();
