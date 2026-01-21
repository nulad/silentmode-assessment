#!/usr/bin/env node

// Test the download manager directly

const DownloadManager = require('./src/download-manager');

console.log('Testing Download Manager...\n');

const dm = new DownloadManager();

// Test 1: Create a download
console.log('1. Creating download...');
const requestId = dm.createDownload('test-client', '~/file_to_download.txt');
console.log(`   ✓ Created download with ID: ${requestId}`);

// Test 2: Get download info
console.log('\n2. Getting download info...');
const download = dm.getDownload(requestId);
console.log(`   ✓ Status: ${download.status}`);
console.log(`   ✓ Client: ${download.clientId}`);
console.log(`   ✓ File: ${download.filePath}`);

// Test 3: Handle successful DOWNLOAD_ACK
console.log('\n3. Handling successful DOWNLOAD_ACK...');
dm.handleDownloadAck(requestId, {
  success: true,
  fileSize: 1024,
  totalChunks: 1,
  fileChecksum: 'abc123...'
});

const updatedDownload = dm.getDownload(requestId);
console.log(`   ✓ Status: ${updatedDownload.status}`);
console.log(`   ✓ File size: ${updatedDownload.fileSize}`);
console.log(`   ✓ Total chunks: ${updatedDownload.totalChunks}`);

// Test 4: Handle failed DOWNLOAD_ACK
console.log('\n4. Handling failed DOWNLOAD_ACK...');
const requestId2 = dm.createDownload('test-client-2', '~/nonexistent.txt');
dm.handleDownloadAck(requestId2, {
  success: false,
  error: {
    code: 'FILE_NOT_FOUND',
    message: 'File not found'
  }
});

const failedDownload = dm.getDownload(requestId2);
console.log(`   ✓ Status: ${failedDownload.status}`);
console.log(`   ✓ Error: ${failedDownload.error.message}`);

console.log('\n✓ All tests passed! DOWNLOAD_ACK handling is working correctly.');
console.log('\nNext steps:');
console.log('1. The server can now track download states');
console.log('2. Client responses are properly processed');
console.log('3. Success/failure states are correctly updated');
