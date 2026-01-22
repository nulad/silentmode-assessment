#!/usr/bin/env node

// Test script for clients list command
const { spawn } = require('child_process');
const path = require('path');

const cliPath = path.join(__dirname, 'server', 'cli.js');

console.log('Testing "silentmode clients list" command...\n');

// Test 1: Default table format
console.log('Test 1: Table format');
const child1 = spawn('node', [cliPath, 'clients', 'list'], {
  cwd: __dirname,
  env: { ...process.env, SERVER_URL: 'http://localhost:3001' }
});

child1.stdout.on('data', (data) => {
  process.stdout.write(data);
});

child1.stderr.on('data', (data) => {
  process.stderr.write(data);
});

child1.on('close', (code) => {
  console.log(`\nExit code: ${code}\n`);
  
  // Test 2: JSON format
  console.log('Test 2: JSON format');
  const child2 = spawn('node', [cliPath, 'clients', 'list', '--format', 'json'], {
    cwd: __dirname,
    env: { ...process.env, SERVER_URL: 'http://localhost:3001' }
  });
  
  child2.stdout.on('data', (data) => {
    process.stdout.write(data);
  });
  
  child2.stderr.on('data', (data) => {
    process.stderr.write(data);
  });
  
  child2.on('close', (code) => {
    console.log(`\nExit code: ${code}\n`);
    
    // Test 3: With status filter
    console.log('Test 3: With status filter');
    const child3 = spawn('node', [cliPath, 'clients', 'list', '--status', 'connected'], {
      cwd: __dirname,
      env: { ...process.env, SERVER_URL: 'http://localhost:3001' }
    });
    
    child3.stdout.on('data', (data) => {
      process.stdout.write(data);
    });
    
    child3.stderr.on('data', (data) => {
      process.stderr.write(data);
    });
    
    child3.on('close', (code) => {
      console.log(`\nExit code: ${code}`);
      console.log('\nAll tests completed!');
    });
  });
});
