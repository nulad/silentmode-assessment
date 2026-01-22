/**
 * Tests for chunk timeout detection functionality
 */

const { ChunkManager, CHUNK_TIMEOUT } = require('./chunk-manager');

describe('ChunkManager - Timeout Detection', () => {
  let chunkManager;

  beforeEach(() => {
    chunkManager = new ChunkManager();
  });

  afterEach(() => {
    // Clean up all timers
    const activeRequests = chunkManager.getActiveRequests();
    activeRequests.forEach(requestId => {
      chunkManager.cleanup(requestId);
    });
  });

  afterAll(async () => {
    // Wait for any remaining timeouts to clear
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  describe('Timeout Initialization', () => {
    test('should start timeout for first chunk on init', () => {
      const requestId = 'test-request-1';
      chunkManager.initChunkTracking(requestId, 5);

      const timers = chunkManager.timeoutTimers.get(requestId);
      expect(timers).toBeDefined();
      expect(timers.size).toBe(1);
      expect(timers.has(0)).toBe(true);
    });

    test('should initialize timeout timers map', () => {
      const requestId = 'test-request-2';
      chunkManager.initChunkTracking(requestId, 3);

      expect(chunkManager.timeoutTimers.has(requestId)).toBe(true);
    });
  });

  describe('Timeout on Chunk Reception', () => {
    test('should clear timeout when chunk is received', () => {
      const requestId = 'test-request-3';
      chunkManager.initChunkTracking(requestId, 3);

      // Receive chunk 0
      chunkManager.markChunkReceived(requestId, 0);

      const timers = chunkManager.timeoutTimers.get(requestId);
      expect(timers.has(0)).toBe(false);
    });

    test('should start timeout for next chunk after receiving current chunk', () => {
      const requestId = 'test-request-4';
      chunkManager.initChunkTracking(requestId, 5);

      // Receive chunk 0
      chunkManager.markChunkReceived(requestId, 0);

      const timers = chunkManager.timeoutTimers.get(requestId);
      expect(timers.has(1)).toBe(true);
    });

    test('should not start timeout after receiving last chunk', () => {
      const requestId = 'test-request-5';
      chunkManager.initChunkTracking(requestId, 2);

      // Receive chunk 0
      chunkManager.markChunkReceived(requestId, 0);
      // Receive chunk 1 (last chunk)
      chunkManager.markChunkReceived(requestId, 1);

      const timers = chunkManager.timeoutTimers.get(requestId);
      expect(timers.size).toBe(0);
    });
  });

  describe('Timeout Event Handling', () => {
    test('should emit chunkTimeout event when timeout occurs', (done) => {
      const requestId = 'test-request-6';
      const expectedChunkIndex = 0;

      chunkManager.on('chunkTimeout', (data) => {
        expect(data.requestId).toBe(requestId);
        expect(data.chunkIndex).toBe(expectedChunkIndex);
        expect(data.totalChunks).toBe(3);
        done();
      });

      chunkManager.initChunkTracking(requestId, 3);

      // Manually trigger timeout
      chunkManager.handleChunkTimeout(requestId, expectedChunkIndex);
    }, 1000);

    test('should mark chunk as failed with timeout reason on timeout', () => {
      const requestId = 'test-request-7';
      chunkManager.initChunkTracking(requestId, 3);

      chunkManager.handleChunkTimeout(requestId, 0);

      const retryInfo = chunkManager.getRetryInfo(requestId);
      expect(retryInfo.failedChunks.length).toBe(1);
      expect(retryInfo.failedChunks[0].chunkIndex).toBe(0);
      expect(retryInfo.failedChunks[0].reason).toBe('timeout');
    });

    test('should not trigger timeout if chunk already received', () => {
      const requestId = 'test-request-8';
      chunkManager.initChunkTracking(requestId, 3);

      // Receive chunk 0
      chunkManager.markChunkReceived(requestId, 0);

      // Try to trigger timeout for already received chunk
      const eventSpy = jest.fn();
      chunkManager.on('chunkTimeout', eventSpy);

      chunkManager.handleChunkTimeout(requestId, 0);

      expect(eventSpy).not.toHaveBeenCalled();
    });
  });

  describe('Timeout Timer Management', () => {
    test('should clear specific chunk timeout', () => {
      const requestId = 'test-request-9';
      chunkManager.initChunkTracking(requestId, 3);

      chunkManager.clearChunkTimeout(requestId, 0);

      const timers = chunkManager.timeoutTimers.get(requestId);
      expect(timers.has(0)).toBe(false);
    });

    test('should clear all timeouts for a request', () => {
      const requestId = 'test-request-10';
      chunkManager.initChunkTracking(requestId, 5);

      // Manually add more timers
      chunkManager.startChunkTimeout(requestId, 1);
      chunkManager.startChunkTimeout(requestId, 2);

      chunkManager.clearAllTimeouts(requestId);

      const timers = chunkManager.timeoutTimers.get(requestId);
      expect(timers.size).toBe(0);
    });

    test('should clear all timeouts on cleanup', () => {
      const requestId = 'test-request-11';
      chunkManager.initChunkTracking(requestId, 3);

      chunkManager.cleanup(requestId);

      expect(chunkManager.timeoutTimers.has(requestId)).toBe(false);
    });
  });

  describe('Timeout Configuration', () => {
    test('CHUNK_TIMEOUT should be 30 seconds', () => {
      expect(CHUNK_TIMEOUT).toBe(30000);
    });
  });

  describe('Integration - Timeout Flow', () => {
    test('should handle complete timeout and retry flow', (done) => {
      const requestId = 'test-request-12';
      let timeoutEventFired = false;

      chunkManager.on('chunkTimeout', (data) => {
        timeoutEventFired = true;
        expect(data.requestId).toBe(requestId);
        expect(data.chunkIndex).toBe(0);
      });

      chunkManager.initChunkTracking(requestId, 3);

      // Trigger timeout manually
      chunkManager.handleChunkTimeout(requestId, 0);

      // Verify timeout was handled
      expect(timeoutEventFired).toBe(true);

      const retryInfo = chunkManager.getRetryInfo(requestId);
      expect(retryInfo.failedChunks.length).toBe(1);
      expect(retryInfo.failedChunks[0].reason).toBe('timeout');

      done();
    }, 1000);

    test('should track expected next chunk correctly', () => {
      const requestId = 'test-request-13';
      chunkManager.initChunkTracking(requestId, 5);

      const request = chunkManager.requests.get(requestId);
      expect(request.expectedNextChunk).toBe(0);

      chunkManager.markChunkReceived(requestId, 0);
      expect(request.expectedNextChunk).toBe(1);

      chunkManager.markChunkReceived(requestId, 1);
      expect(request.expectedNextChunk).toBe(2);
    });
  });

  describe('Edge Cases', () => {
    test('should handle timeout for non-existent request gracefully', () => {
      expect(() => {
        chunkManager.handleChunkTimeout('non-existent', 0);
      }).not.toThrow();
    });

    test('should handle clearChunkTimeout for non-existent request gracefully', () => {
      expect(() => {
        chunkManager.clearChunkTimeout('non-existent', 0);
      }).not.toThrow();
    });

    test('should handle clearAllTimeouts for non-existent request gracefully', () => {
      expect(() => {
        chunkManager.clearAllTimeouts('non-existent');
      }).not.toThrow();
    });

    test('should handle startChunkTimeout for non-existent request gracefully', () => {
      expect(() => {
        chunkManager.startChunkTimeout('non-existent', 0);
      }).not.toThrow();
    });
  });
});
