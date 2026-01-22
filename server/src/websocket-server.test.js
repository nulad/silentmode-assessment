// Set test environment ports to avoid conflicts
process.env.WS_PORT = '0'; // Use random available port

// Clear config cache to ensure environment variables are picked up
delete require.cache[require.resolve('./config')];

const WebSocket = require('ws');
const WebSocketServer = require('./websocket-server');
const config = require('./config');
const logger = require('./utils/logger');

describe('WebSocket Server', () => {
  let server;
  let wsUrl;

  beforeAll(async () => {
    // Use a different port for testing to avoid conflicts
    server = new WebSocketServer();
    await server.start();
    
    // Get the actual port the server is listening on
    const address = server.wss.address();
    const port = address.port;
    wsUrl = `ws://localhost:${port}`;
  });

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
  });

  test('server starts and accepts connections', (done) => {
    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
    });

    ws.on('close', () => {
      done();
    });

    ws.on('error', (error) => {
      done(error);
    });
  });

  test('sends REGISTER_ACK on connection', (done) => {
    const ws = new WebSocket(wsUrl);
    let messageReceived = false;

    ws.on('open', () => {
      // Connection established, wait for message
    });

    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      expect(message.type).toBe('REGISTER_ACK');
      expect(message.success).toBe(true);
      messageReceived = true;
      ws.close();
    });

    ws.on('close', () => {
      if (messageReceived) {
        done();
      }
    });

    ws.on('error', (error) => {
      done(error);
    });
  });

  test('handles ping/pong', (done) => {
    const ws = new WebSocket(wsUrl);
    let pongReceived = false;
    let timeoutId;

    // Set a timeout to fail the test if it takes too long
    timeoutId = setTimeout(() => {
      ws.close();
      done(new Error('Test timed out waiting for PONG message'));
    }, 5000); // 5 second timeout

    ws.on('open', () => {
      // Wait a bit for connection to be fully established
      setTimeout(() => {
        ws.send(JSON.stringify({ 
          type: 'PING',
          timestamp: new Date().toISOString()
        }));
      }, 100);
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'PONG') {
          pongReceived = true;
          clearTimeout(timeoutId);
          ws.close();
        }
      } catch (e) {
        // Ignore errors parsing non-JSON messages
      }
    });

    ws.on('close', () => {
      clearTimeout(timeoutId);
      if (pongReceived) {
        done();
      } else {
        done(new Error('Connection closed without receiving PONG'));
      }
    });

    ws.on('error', (error) => {
      clearTimeout(timeoutId);
      done(error);
    });
  });

  test('handles invalid messages', (done) => {
    const ws = new WebSocket(wsUrl);
    let errorReceived = false;

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'INVALID_TYPE' }));
    });

    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      if (message.type === 'ERROR') {
        expect(message.code).toBe('INVALID_REQUEST');
        errorReceived = true;
        ws.close();
      }
    });

    ws.on('close', () => {
      if (errorReceived) {
        done();
      }
    });

    ws.on('error', (error) => {
      done(error);
    });
  });
});
