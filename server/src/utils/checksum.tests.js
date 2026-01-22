const fs = require('fs');
const path = require('path');
const { calculateChecksum, calculateFileChecksum, verifyChecksum } = require('./checksum');

// Test data
const testData = 'Hello, World!';
const expectedChecksum = 'dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f';

async function runTests() {
  console.log('Running checksum utility tests...\n');
  
  // Test 1: calculateChecksum
  console.log('Test 1: calculateChecksum');
  const checksum = calculateChecksum(Buffer.from(testData));
  console.log(`  Input: "${testData}"`);
  console.log(`  Expected: ${expectedChecksum}`);
  console.log(`  Actual:   ${checksum}`);
  console.log(`  ✓ Pass: ${checksum === expectedChecksum}\n`);
  
  // Test 2: verifyChecksum
  console.log('Test 2: verifyChecksum');
  const isValid = verifyChecksum(testData, expectedChecksum);
  console.log(`  Valid checksum: ${isValid}`);
  console.log(`  ✓ Pass: ${isValid}\n`);
  
  // Test 3: calculateFileChecksum
  console.log('Test 3: calculateFileChecksum');
  const testFilePath = path.join(__dirname, 'test-file.txt');
  
  // Create test file
  fs.writeFileSync(testFilePath, testData);
  
  try {
    const fileChecksum = await calculateFileChecksum(testFilePath);
    console.log(`  File checksum: ${fileChecksum}`);
    console.log(`  Matches buffer checksum: ${fileChecksum === expectedChecksum}`);
    console.log(`  ✓ Pass: ${fileChecksum === expectedChecksum}\n`);
  } catch (error) {
    console.error(`  ✗ Fail: ${error.message}\n`);
  } finally {
    // Clean up test file
    fs.unlinkSync(testFilePath);
  }
  
  console.log('All tests completed!');
}

runTests().catch(console.error);
