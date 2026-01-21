/**
 * Test client for verifying heartbeat mechanism
 * This client connects to the server and responds to PING messages with PONG
 */
const WebSocket = require('ws');
const { MESSAGE_TYPES } = require('../shared/protocol');

class TestHeartbeatClient {
  constructor(serverUrl = 'ws://localhost:8080') {
    this.serverUrl = serverUrl;
    this.ws = null;
    this.clientId = `test_client_${Date.now()}`;
    this.respondToPing = true; // Set to false to test stale connection
  }

  connect() {
    console.log(`Connecting to ${this.serverUrl}...`);

    this.ws = new WebSocket(this.serverUrl);

    this.ws.on('open', () => {
      console.log('Connected to server');
      this.register();
    });

    this.ws.on('message', (data) => {
      this.handleMessage(data);
    });

    this.ws.on('close', (code, reason) => {
      console.log(`Disconnected: ${code} - ${reason}`);
    });

    this.ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  }

  register() {
    console.log(`Registering as ${this.clientId}`);
    this.send({
      type: MESSAGE_TYPES.REGISTER,
      clientId: this.clientId
    });
  }

  handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      console.log(`Received: ${message.type}`, message.timestamp || '');

      switch (message.type) {
        case MESSAGE_TYPES.REGISTER_ACK:
          console.log('Registration acknowledged:', message.message);
          break;

        case MESSAGE_TYPES.PING:
          if (this.respondToPing) {
            console.log(`Received PING at ${message.timestamp}, sending PONG`);
            this.send({
              type: MESSAGE_TYPES.PONG,
              timestamp: new Date().toISOString()
            });
          } else {
            console.log(`Received PING at ${message.timestamp}, NOT responding (testing stale detection)`);
          }
          break;

        case MESSAGE_TYPES.PONG:
          console.log(`Received PONG at ${message.timestamp}`);
          break;

        default:
          console.log('Received message:', message);
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  }

  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  disconnect() {
    if (this.ws) {
      console.log('Disconnecting...');
      this.ws.close();
    }
  }

  // Test: Stop responding to PINGs to trigger stale connection detection
  stopResponding() {
    console.log('\n*** STOPPING PONG RESPONSES - Server should detect stale connection in ~90s ***\n');
    this.respondToPing = false;
  }
}

// Run test if executed directly
if (require.main === module) {
  const client = new TestHeartbeatClient();
  client.connect();

  // Graceful shutdown
  process.on('SIGINT', () => {
    client.disconnect();
    process.exit(0);
  });

  // Optional: Test stale connection detection after 2 minutes
  // Uncomment to test:
  // setTimeout(() => client.stopResponding(), 120000); // 2 minutes
}

module.exports = TestHeartbeatClient;
