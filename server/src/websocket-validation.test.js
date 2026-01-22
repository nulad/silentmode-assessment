const WebSocket = require('ws');
const { validate: uuidValidate } = require('uuid');
const WebSocketServer = require('../src/websocket-server');

describe('WebSocket Message Validation', () => {
  let wsServer;
  let client1;
  let client2;

  beforeAll(async () => {
    wsServer = new WebSocketServer();
    wsServer.start();
    
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterAll(async () => {
    if (client1) client1.close();
    if (client2) client2.close();
    if (wsServer) {
      wsServer.stop();
    }
  });

  beforeEach(async () => {
    // Create fresh clients for each test
    client1 = new WebSocket(`ws://localhost:${process.env.WS_PORT || 8080}`);
    client2 = new WebSocket(`ws://localhost:${process.env.WS_PORT || 8080}`);
    
    // Wait for connections
    await Promise.all([
      new Promise(resolve => client1.on('open', resolve)),
      new Promise(resolve => client2.on('open', resolve))
    ]);

    // Register client2
    client2.send(JSON.stringify({
      type: 'REGISTER',
      clientId: 'test-client-123'
    }));

    // Wait for registration
    await new Promise(resolve => setTimeout(resolve, 50));
  });

  afterEach(() => {
    if (client1 && client1.readyState === WebSocket.OPEN) client1.close();
    if (client2 && client2.readyState === WebSocket.OPEN) client2.close();
  });

  it('should reject DOWNLOAD_REQUEST with invalid clientId', (done) => {
    client1.on('message', (data) => {
      const message = JSON.parse(data);
      if (message.type === 'ERROR') {
        expect(message.code).toBe('INVALID_REQUEST');
        expect(message.message).toContain('ClientId must be alphanumeric');
        done();
      }
    });

    client1.send(JSON.stringify({
      type: 'DOWNLOAD_REQUEST',
      clientId: 'invalid@client!', // Contains invalid characters
      filePath: '/valid/path/file.txt',
      requestId: '550e8400-e29b-41d4-a716-446655440000'
    }));
  });

  it('should reject DOWNLOAD_REQUEST with invalid filePath', (done) => {
    client1.on('message', (data) => {
      const message = JSON.parse(data);
      if (message.type === 'ERROR') {
        expect(message.code).toBe('INVALID_REQUEST');
        expect(message.message).toContain('FilePath must be an absolute path');
        done();
      }
    });

    client1.send(JSON.stringify({
      type: 'DOWNLOAD_REQUEST',
      clientId: 'valid-client-123',
      filePath: 'relative/path/file.txt', // Not absolute
      requestId: '550e8400-e29b-41d4-a716-446655440000'
    }));
  });

  it('should reject DOWNLOAD_REQUEST with directory traversal', (done) => {
    client1.on('message', (data) => {
      const message = JSON.parse(data);
      if (message.type === 'ERROR') {
        expect(message.code).toBe('INVALID_REQUEST');
        expect(message.message).toContain('without directory traversal');
        done();
      }
    });

    client1.send(JSON.stringify({
      type: 'DOWNLOAD_REQUEST',
      clientId: 'valid-client-123',
      filePath: '/valid/path/../../../etc/passwd', // Directory traversal
      requestId: '550e8400-e29b-41d4-a716-446655440000'
    }));
  });

  it('should reject DOWNLOAD_REQUEST with invalid requestId', (done) => {
    client1.on('message', (data) => {
      const message = JSON.parse(data);
      if (message.type === 'ERROR') {
        expect(message.code).toBe('INVALID_REQUEST');
        expect(message.message).toContain('RequestId must be a valid UUID');
        done();
      }
    });

    client1.send(JSON.stringify({
      type: 'DOWNLOAD_REQUEST',
      clientId: 'valid-client-123',
      filePath: '/valid/path/file.txt',
      requestId: 'not-a-uuid'
    }));
  });

  it('should accept valid DOWNLOAD_REQUEST', (done) => {
    // Register client1 first
    client1.send(JSON.stringify({
      type: 'REGISTER',
      clientId: 'test-client-456'
    }));
    
    // Wait for registration
    setTimeout(() => {
      let messageCount = 0;
      
      client1.on('message', (data) => {
        const message = JSON.parse(data);
        messageCount++;
        
        // Should not receive an error
        if (message.type === 'ERROR') {
          done(new Error('Should not have received an error'));
          return;
        }
        
        // We expect REGISTER_ACK and then DOWNLOAD_REQUEST
        if (message.type === 'DOWNLOAD_REQUEST') {
          // This is the forwarded request to the client itself
          setTimeout(() => done(), 100);
        }
      });

      client1.send(JSON.stringify({
        type: 'DOWNLOAD_REQUEST',
        clientId: 'test-client-456', // Use the registered ID
        filePath: '/valid/path/file.txt', // Valid: absolute path
        requestId: '550e8400-e29b-41d4-a716-446655440000' // Valid: UUID v4
      }));
    }, 50);
  }, 10000);

  it('should accept DOWNLOAD_REQUEST without requestId (will auto-generate)', (done) => {
    // Register client1 first
    client1.send(JSON.stringify({
      type: 'REGISTER',
      clientId: 'test-client-789'
    }));
    
    // Wait for registration
    setTimeout(() => {
      let messageCount = 0;
      
      client1.on('message', (data) => {
        const message = JSON.parse(data);
        messageCount++;
        
        // Should not receive an error
        if (message.type === 'ERROR') {
          done(new Error('Should not have received an error'));
          return;
        }
        
        // We expect REGISTER_ACK and then DOWNLOAD_REQUEST
        if (message.type === 'DOWNLOAD_REQUEST') {
          // This is the forwarded request to the client itself
          setTimeout(() => done(), 100);
        }
      });

      client1.send(JSON.stringify({
        type: 'DOWNLOAD_REQUEST',
        clientId: 'test-client-789', // Use the registered ID
        filePath: '/valid/path/file.txt' // Valid
        // No requestId provided
      }));
    }, 50);
  }, 10000);
});
