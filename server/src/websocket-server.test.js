const WebSocket = require('ws');
const WebSocketServer = require('./websocket-server');
const config = require('./config');
const logger = require('./utils/logger');

describe('WebSocket Server', () => {
  let server;
  let wsUrl;

  beforeAll(async () => {
    // Use a different port for testing
    config.WS_PORT = 8081;
    server = new WebSocketServer();
    server.start();
    wsUrl = `ws://localhost:${config.WS_PORT}`;
    
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterAll(() => {
    server.stop();
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

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'PING' }));
    });

    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      if (message.type === 'PONG') {
        pongReceived = true;
        ws.close();
      }
    });

    ws.on('close', () => {
      if (pongReceived) {
        done();
      }
    });

    ws.on('error', (error) => {
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
