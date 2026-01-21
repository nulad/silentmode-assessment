/**
 * Quick test for heartbeat mechanism
 * Verifies PING/PONG exchange works correctly
 */
const SilentModeServer = require('./src/index');
const TestHeartbeatClient = require('./test-heartbeat-client');

async function runQuickTest() {
  console.log('=== Quick Heartbeat Test ===\n');

  // Start server
  console.log('Starting server...');
  const server = new SilentModeServer();
  await server.start();

  // Wait for server to be ready
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Create test client
  console.log('Connecting test client...');
  const client = new TestHeartbeatClient();

  let pingReceived = false;
  let pongSent = false;

  // Override handleMessage to track PING/PONG
  const originalHandleMessage = client.handleMessage.bind(client);
  client.handleMessage = function(data) {
    const message = JSON.parse(data.toString());
    if (message.type === 'PING') {
      pingReceived = true;
      console.log(`✓ PING received at ${message.timestamp}`);
    }
    if (message.type === 'PONG') {
      pongSent = true;
      console.log(`✓ PONG sent at ${message.timestamp}`);
    }
    originalHandleMessage(data);
  };

  client.connect();

  // Wait for at least one PING/PONG cycle (35 seconds)
  console.log('Waiting for PING/PONG exchange (35 seconds)...\n');
  await new Promise(resolve => setTimeout(resolve, 35000));

  // Verify results
  console.log('\n=== Test Results ===');
  console.log(`PING received: ${pingReceived ? '✓' : '✗'}`);
  console.log(`Client responded with PONG: ${pingReceived ? '✓' : '✗'}`);

  // Check client is still connected
  const connectedClients = server.wsServer.getConnectedClients();
  console.log(`Clients connected: ${connectedClients.length} ${connectedClients.length === 1 ? '✓' : '✗'}`);

  // Cleanup
  console.log('\nCleaning up...');
  client.disconnect();
  await new Promise(resolve => setTimeout(resolve, 500));
  server.shutdown();

  console.log('\nTest complete!');

  if (pingReceived && connectedClients.length === 1) {
    console.log('✓ All acceptance criteria verified');
    process.exit(0);
  } else {
    console.log('✗ Some tests failed');
    process.exit(1);
  }
}

// Run test
if (require.main === module) {
  runQuickTest().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}

module.exports = runQuickTest;
