const ClientRegistry = require('./client-registry');
const WebSocket = require('ws');

describe('ClientRegistry', () => {
  let registry;
  let mockWs;

  beforeEach(() => {
    registry = new ClientRegistry();
    mockWs = {
      READY_STATE: 1,
      readyState: 1
    };
  });

  describe('addClient', () => {
    it('should add a new client', () => {
      const client = registry.addClient('client1', mockWs, {
        version: '1.0.0',
        hostname: 'test-host',
        platform: 'linux'
      });

      expect(client.clientId).toBe('client1');
      expect(client.ws).toBe(mockWs);
      expect(client.status).toBe('connected');
      expect(client.metadata.version).toBe('1.0.0');
      expect(client.metadata.hostname).toBe('test-host');
      expect(client.metadata.platform).toBe('linux');
      expect(client.connectedAt).toBeInstanceOf(Date);
      expect(client.lastHeartbeat).toBeInstanceOf(Date);
    });

    it('should prevent duplicate clientIds', () => {
      const client1 = registry.addClient('client1', mockWs);
      const mockWs2 = { ...mockWs, readyState: 1 };
      const client2 = registry.addClient('client1', mockWs2);

      expect(registry.getAllClients()).toHaveLength(1);
      expect(registry.getClient('client1').ws).toBe(mockWs2);
    });
  });

  describe('removeClient', () => {
    it('should remove an existing client', () => {
      registry.addClient('client1', mockWs);
      const removed = registry.removeClient('client1');

      expect(removed).toBe(true);
      expect(registry.getClient('client1')).toBeNull();
      expect(registry.getAllClients()).toHaveLength(0);
    });

    it('should return false for non-existent client', () => {
      const removed = registry.removeClient('nonexistent');
      expect(removed).toBe(false);
    });
  });

  describe('getClient', () => {
    it('should return existing client', () => {
      const addedClient = registry.addClient('client1', mockWs);
      const retrievedClient = registry.getClient('client1');

      expect(retrievedClient).toBe(addedClient);
    });

    it('should return null for non-existent client', () => {
      const client = registry.getClient('nonexistent');
      expect(client).toBeNull();
    });
  });

  describe('getAllClients', () => {
    it('should return all connected clients', () => {
      registry.addClient('client1', mockWs);
      registry.addClient('client2', { ...mockWs, readyState: 1 });

      const clients = registry.getAllClients();
      expect(clients).toHaveLength(2);
      expect(clients[0].clientId).toBe('client1');
      expect(clients[1].clientId).toBe('client2');
    });

    it('should return empty array when no clients', () => {
      const clients = registry.getAllClients();
      expect(clients).toHaveLength(0);
    });
  });

  describe('updateHeartbeat', () => {
    it('should update heartbeat timestamp', () => {
      const client = registry.addClient('client1', mockWs);
      const originalHeartbeat = client.lastHeartbeat;

      setTimeout(() => {
        const updated = registry.updateHeartbeat('client1');
        expect(updated).toBe(true);
        expect(registry.getClient('client1').lastHeartbeat).not.toBe(originalHeartbeat);
      }, 10);
    });

    it('should return false for non-existent client', () => {
      const updated = registry.updateHeartbeat('nonexistent');
      expect(updated).toBe(false);
    });
  });

  describe('isClientConnected', () => {
    it('should return true for connected client', () => {
      registry.addClient('client1', mockWs);
      expect(registry.isClientConnected('client1')).toBe(true);
    });

    it('should return false for non-existent client', () => {
      expect(registry.isClientConnected('nonexistent')).toBe(false);
    });
  });

  describe('getConnectedCount', () => {
    it('should return correct count', () => {
      expect(registry.getConnectedCount()).toBe(0);
      
      registry.addClient('client1', mockWs);
      expect(registry.getConnectedCount()).toBe(1);
      
      registry.addClient('client2', { ...mockWs, readyState: 1 });
      expect(registry.getConnectedCount()).toBe(2);
      
      registry.removeClient('client1');
      expect(registry.getConnectedCount()).toBe(1);
    });
  });
});
