#!/usr/bin/env node

/**
 * Test script to verify exponential backoff in retry mechanism
 */

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const SERVER_URL = 'ws://localhost:8080';
const CLIENT_ID = `test-client-${Date.now()}`;

let ws = null;
let retryTimes = [];
let retryIntervals = [];

function connect() {
  console.log(`Connecting to ${SERVER_URL}...`);
  
  ws = new WebSocket(SERVER_URL);
  
  ws.on('open', () => {
    console.log('Connected to server');
    
    // Register client
    ws.send(JSON.stringify({
      type: 'REGISTER',
      clientId: CLIENT_ID,
      timestamp: new Date().toISOString()
    }));
    
    // Start test after registration
    setTimeout(() => {
      startDownloadTest();
    }, 1000);
  });
  
  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    
    switch (message.type) {
      case 'RETRY_CHUNK':
        handleRetryChunk(message);
        break;
      case 'DOWNLOAD_ACK':
        console.log('Download ACK received:', message.success ? 'SUCCESS' : 'FAILED');
        break;
      case 'ERROR':
        console.error('Error received:', message.code, '-', message.message);
        break;
      default:
        // console.log('Received:', message.type);
    }
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
  
  ws.on('close', () => {
    console.log('Connection closed');
  });
}

function startDownloadTest() {
  console.log('\n=== Starting Retry Test ===');
  console.log('Requesting a file download to test retry mechanism...\n');
  
  const requestId = uuidv4();
  
  // Request a download that will trigger retries
  ws.send(JSON.stringify({
    type: 'DOWNLOAD_REQUEST',
    clientId: CLIENT_ID, // Requesting from self
    filePath: './test-files/large-test-file.txt',
    requestId: requestId
  }));
  
  console.log(`Download request sent with ID: ${requestId}`);
  console.log('Expected behavior:');
  console.log('  - First retry after 1s (1000ms)');
  console.log('  - Second retry after 2s (2000ms)');
  console.log('  - Third retry after 4s (4000ms)');
  console.log('  - Max retries: 3 attempts\n');
}

function handleRetryChunk(message) {
  const now = Date.now();
  retryTimes.push({ 
    attempt: message.attempt, 
    timestamp: now,
    reason: message.reason,
    chunkIndex: message.chunkIndex
  });
  
  console.log(`\n🔄 RETRY CHUNK received:`);
  console.log(`  - Chunk: ${message.chunkIndex}`);
  console.log(`  - Attempt: ${message.attempt}`);
  console.log(`  - Reason: ${message.reason}`);
  console.log(`  - Time: ${new Date(now).toISOString()}`);
  
  // Calculate interval from previous retry
  if (retryTimes.length > 1) {
    const prev = retryTimes[retryTimes.length - 2];
    const interval = now - prev.timestamp;
    retryIntervals.push(interval);
    
    console.log(`  - Interval since last retry: ${interval}ms`);
    
    // Verify exponential backoff
    const expectedInterval = 1000 * Math.pow(2, message.attempt - 2); // 1000, 2000, 4000
    const tolerance = 100; // 100ms tolerance
    
    if (Math.abs(interval - expectedInterval) <= tolerance) {
      console.log(`  ✅ Correct exponential backoff!`);
    } else {
      console.log(`  ❌ Expected ~${expectedInterval}ms, got ${interval}ms`);
    }
  }
  
  // Check if max retries reached
  if (message.attempt >= 3) {
    console.log(`\n⚠️  Max retry attempts reached for chunk ${message.chunkIndex}`);
    
    // After receiving all retries, show summary
    setTimeout(() => {
      showSummary();
    }, 1000);
  }
}

function showSummary() {
  console.log('\n=== Test Summary ===');
  console.log(`Total retry events: ${retryTimes.length}`);
  console.log(`Retry intervals: ${retryIntervals.map(i => `${i}ms`).join(', ')}`);
  
  // Verify exponential backoff pattern
  const expectedIntervals = [1000, 2000]; // First two intervals (third is max)
  let allCorrect = true;
  
  retryIntervals.forEach((actual, index) => {
    const expected = expectedIntervals[index];
    if (Math.abs(actual - expected) > 100) {
      allCorrect = false;
      console.log(`❌ Interval ${index + 1}: Expected ~${expected}ms, got ${actual}ms`);
    }
  });
  
  if (allCorrect && retryIntervals.length >= 2) {
    console.log('\n✅ SUCCESS: Exponential backoff is working correctly!');
  } else {
    console.log('\n❌ FAILURE: Exponential backoff is not working as expected');
  }
  
  console.log('\nClosing connection...');
  ws.close();
  process.exit(0);
}

// Start the test
connect();
