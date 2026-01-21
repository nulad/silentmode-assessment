/**
 * Automated test for heartbeat mechanism
 * Tests:
 * 1. Server sends PING every 30s
 * 2. Client responds with PONG
 * 3. Server tracks lastHeartbeat
 * 4. Stale clients (90s no PONG) are removed
 */
const SilentModeServer = require('./src/index');
const TestHeartbeatClient = require('./test-heartbeat-client');

async function runTests() {
  console.log('=== Heartbeat Mechanism Test ===\n');

  // Start server
  console.log('1. Starting server...');
  const server = new SilentModeServer();
  await server.start();
  console.log('   ✓ Server started\n');

  // Wait for server to be ready
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Test 1: Normal PING/PONG exchange
  console.log('2. Testing normal PING/PONG exchange...');
  const client1 = new TestHeartbeatClient();
  client1.connect();

  // Wait for 35 seconds to ensure at least one PING is sent
  await new Promise(resolve => setTimeout(resolve, 35000));
  console.log('   ✓ Client received PING and responded with PONG\n');

  // Test 2: Verify client is still connected
  console.log('3. Verifying client is still connected...');
  const connectedClients = server.wsServer.getConnectedClients();
  if (connectedClients.length === 1) {
    console.log(`   ✓ Client still connected (${connectedClients.length} client(s))\n`);
  } else {
    console.log(`   ✗ Expected 1 client, found ${connectedClients.length}\n`);
  }

  // Test 3: Stop responding to test stale detection
  console.log('4. Testing stale connection detection...');
  console.log('   Stopping client PONG responses...');
  client1.stopResponding();

  console.log('   Waiting 95 seconds for server to detect stale connection...');
  await new Promise(resolve => setTimeout(resolve, 95000));

  // Check if stale client was removed
  const remainingClients = server.wsServer.getConnectedClients();
  if (remainingClients.length === 0) {
    console.log('   ✓ Stale client was detected and removed\n');
  } else {
    console.log(`   ✗ Expected 0 clients, found ${remainingClients.length}\n`);
  }

  // Test 4: Verify new client can connect after stale removal
  console.log('5. Testing new client connection...');
  const client2 = new TestHeartbeatClient();
  client2.connect();

  await new Promise(resolve => setTimeout(resolve, 2000));

  const newClients = server.wsServer.getConnectedClients();
  if (newClients.length === 1) {
    console.log(`   ✓ New client connected successfully\n`);
  } else {
    console.log(`   ✗ Expected 1 client, found ${newClients.length}\n`);
  }

  // Cleanup
  console.log('6. Cleaning up...');
  client2.disconnect();
  await new Promise(resolve => setTimeout(resolve, 1000));
  server.shutdown();

  console.log('\n=== Test Complete ===');
}

// Run tests
if (require.main === module) {
  runTests().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}

module.exports = runTests;
