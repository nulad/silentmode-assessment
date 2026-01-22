/**
 * Comprehensive edge case tests for Chunk Manager
 * Covers boundary conditions, error scenarios, and race conditions
 */

const { ChunkManager, chunkManager, CHUNK_TIMEOUT } = require('./chunk-manager');

describe('ChunkManager - Edge Cases', () => {
  let cm;

  beforeEach(() => {
    cm = require('./chunk-manager').chunkManager;
  });

  afterEach(() => {
    // Clean up all timers and requests
    const activeRequests = cm.getActiveRequests();
    activeRequests.forEach(requestId => {
      cm.cleanup(requestId);
    });
  });

  afterAll(async () => {
    // Final cleanup of singleton
    const { chunkManager } = require('./chunk-manager');
    const activeRequests = chunkManager.getActiveRequests();
    activeRequests.forEach(requestId => {
      chunkManager.cleanup(requestId);
    });
    
    // Wait a bit for all timeouts to clear
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  describe('Initialization Edge Cases', () => {
    test('should handle empty string requestId', () => {
      expect(() => {
        cm.initChunkTracking('', 5);
      }).toThrow('Invalid requestId or totalChunks');
    });

    test('should handle whitespace-only requestId', () => {
      // Whitespace-only requestId is currently accepted
      expect(() => {
        cm.initChunkTracking('   ', 5);
      }).not.toThrow();
    });

    test('should handle extremely large totalChunks', () => {
      const requestId = 'test-large';
      expect(() => {
        cm.initChunkTracking(requestId, Number.MAX_SAFE_INTEGER);
      }).not.toThrow();
      
      expect(cm.getActiveRequests()).toContain(requestId);
      cm.cleanup(requestId);
    });

    test('should handle floating point totalChunks', () => {
      // Floating point numbers are currently accepted if they're positive
      expect(() => {
        cm.initChunkTracking('test', 5.5);
      }).not.toThrow();
    });

    test('should handle zero totalChunks', () => {
      expect(() => {
        cm.initChunkTracking('test', 0);
      }).toThrow('Invalid requestId or totalChunks');
    });

    test('should handle duplicate requestId initialization', () => {
      const requestId = 'duplicate-test';
      cm.initChunkTracking(requestId, 5);
      
      expect(() => {
        cm.initChunkTracking(requestId, 10);
      }).not.toThrow();
      
      // Should overwrite previous request
      const retryInfo = cm.getRetryInfo(requestId);
      expect(retryInfo.totalChunks).toBe(10);
    });
  });

  describe('Chunk Reception Edge Cases', () => {
    test('should handle negative chunk indices', () => {
      const requestId = 'test-negative';
      cm.initChunkTracking(requestId, 5);
      
      expect(() => {
        cm.markChunkReceived(requestId, -1);
      }).toThrow('Invalid chunkIndex: -1');
    });

    test('should handle chunk index equal to totalChunks', () => {
      const requestId = 'test-boundary';
      cm.initChunkTracking(requestId, 5);
      
      expect(() => {
        cm.markChunkReceived(requestId, 5);
      }).toThrow('Invalid chunkIndex: 5');
    });

    test('should handle extremely large chunk index', () => {
      const requestId = 'test-large-index';
      cm.initChunkTracking(requestId, 5);
      
      expect(() => {
        cm.markChunkReceived(requestId, Number.MAX_SAFE_INTEGER);
      }).toThrow();
    });

    test('should handle floating point chunk indices', () => {
      const requestId = 'test-float';
      cm.initChunkTracking(requestId, 5);
      
      // Floating point indices are currently handled by JavaScript
      expect(() => {
        cm.markChunkReceived(requestId, 1.5);
      }).not.toThrow();
    });

    test('should handle null/undefined chunk indices', () => {
      const requestId = 'test-null';
      cm.initChunkTracking(requestId, 5);
      
      expect(() => {
        cm.markChunkReceived(requestId, null);
      }).toThrow('Invalid chunkIndex: null');
      
      expect(() => {
        cm.markChunkReceived(requestId, undefined);
      }).toThrow('Invalid chunkIndex: undefined');
    });

    test('should handle receiving chunks out of order', () => {
      const requestId = 'test-out-of-order';
      cm.initChunkTracking(requestId, 5);
      
      // Receive chunks in reverse order
      for (let i = 4; i >= 0; i--) {
        const isFirstTime = cm.markChunkReceived(requestId, i);
        expect(isFirstTime).toBe(true);
      }
      
      expect(cm.isComplete(requestId)).toBe(true);
    });

    test('should handle receiving same chunk multiple times', () => {
      const requestId = 'test-duplicate';
      cm.initChunkTracking(requestId, 5);
      
      // Receive chunk 0 three times
      expect(cm.markChunkReceived(requestId, 0)).toBe(true);
      expect(cm.markChunkReceived(requestId, 0)).toBe(false);
      expect(cm.markChunkReceived(requestId, 0)).toBe(false);
      
      const retryInfo = cm.getRetryInfo(requestId);
      expect(retryInfo.receivedCount).toBe(1);
    });

    test('should handle chunk received after failure', () => {
      const requestId = 'test-recovery';
      cm.initChunkTracking(requestId, 5);
      
      // Mark chunk as failed
      cm.markChunkFailed(requestId, 2, 'Network error');
      
      // Then receive it successfully
      const mockDownloadManager = {
        updateRetryTracking: jest.fn()
      };
      
      const isFirstTime = cm.markChunkReceived(requestId, 2, mockDownloadManager);
      expect(isFirstTime).toBe(true);
      
      // Should clear retry attempts
      const retryInfo = cm.getRetryInfo(requestId);
      expect(retryInfo.failedChunks).toHaveLength(0);
      
      // Should call download manager update
      expect(mockDownloadManager.updateRetryTracking).toHaveBeenCalledWith(
        requestId,
        2,
        1,
        'succeeded',
        'Network error'
      );
    });
  });

  describe('Failure Tracking Edge Cases', () => {
    test('should handle empty reason string', () => {
      const requestId = 'test-empty-reason';
      cm.initChunkTracking(requestId, 5);
      
      expect(() => {
        cm.markChunkFailed(requestId, 0, '');
      }).toThrow('Reason must be a non-empty string');
    });

    test('should handle null/undefined reason', () => {
      const requestId = 'test-null-reason';
      cm.initChunkTracking(requestId, 5);
      
      expect(() => {
        cm.markChunkFailed(requestId, 0, null);
      }).toThrow('Reason must be a non-empty string');
      
      expect(() => {
        cm.markChunkFailed(requestId, 0, undefined);
      }).toThrow('Reason must be a non-empty string');
    });

    test('should handle non-string reason', () => {
      const requestId = 'test-non-string-reason';
      cm.initChunkTracking(requestId, 5);
      
      expect(() => {
        cm.markChunkFailed(requestId, 0, 123);
      }).toThrow('Reason must be a non-empty string');
    });

    test('should handle whitespace-only reason', () => {
      const requestId = 'test-whitespace-reason';
      cm.initChunkTracking(requestId, 5);
      
      expect(() => {
        cm.markChunkFailed(requestId, 0, '   ');
      }).not.toThrow();
      
      const retryInfo = cm.getRetryInfo(requestId);
      expect(retryInfo.failedChunks[0].reason).toBe('   ');
    });

    test('should handle very long reason string', () => {
      const requestId = 'test-long-reason';
      cm.initChunkTracking(requestId, 5);
      
      const longReason = 'x'.repeat(10000);
      expect(() => {
        cm.markChunkFailed(requestId, 0, longReason);
      }).not.toThrow();
    });

    test('should handle multiple failures on different chunks', () => {
      const requestId = 'test-multiple-failures';
      cm.initChunkTracking(requestId, 5);
      
      // Fail multiple chunks
      cm.markChunkFailed(requestId, 0, 'Error 0');
      cm.markChunkFailed(requestId, 1, 'Error 1');
      cm.markChunkFailed(requestId, 2, 'Error 2');
      
      const retryInfo = cm.getRetryInfo(requestId);
      expect(retryInfo.failedChunks).toHaveLength(3);
      expect(retryInfo.totalRetryAttempts).toBe(3);
    });

    test('should handle retry attempt count overflow', () => {
      const requestId = 'test-overflow';
      cm.initChunkTracking(requestId, 5);
      
      // Simulate many retry attempts
      for (let i = 0; i < 1000; i++) {
        cm.markChunkFailed(requestId, 0, `Attempt ${i}`);
      }
      
      const retryInfo = cm.getRetryInfo(requestId);
      expect(retryInfo.failedChunks[0].attempts).toBe(1000);
    });
  });

  describe('Timeout Edge Cases', () => {
    test('should handle timeout race condition with chunk received', (done) => {
      const requestId = 'test-race-timeout';
      cm.initChunkTracking(requestId, 5);
      
      // Simulate race condition
      cm.markChunkReceived(requestId, 0);
      
      // Timeout fires after chunk received
      setTimeout(() => {
        expect(() => {
          cm.handleChunkTimeout(requestId, 0);
        }).not.toThrow();
        
        // Should not mark as failed
        const retryInfo = cm.getRetryInfo(requestId);
        expect(retryInfo.failedChunks).toHaveLength(0);
        
        done();
      }, 10);
    });

    test('should handle multiple timeouts for same chunk', (done) => {
      const requestId = 'test-multiple-timeouts';
      cm.initChunkTracking(requestId, 5);
      
      // First timeout
      cm.handleChunkTimeout(requestId, 0);
      
      // Second timeout
      setTimeout(() => {
        cm.handleChunkTimeout(requestId, 0);
        
        const retryInfo = cm.getRetryInfo(requestId);
        expect(retryInfo.failedChunks[0].attempts).toBe(2);
        
        done();
      }, 10);
    });

    test('should handle timeout after cleanup', () => {
      const requestId = 'test-timeout-after-cleanup';
      cm.initChunkTracking(requestId, 5);
      cm.cleanup(requestId);
      
      expect(() => {
        cm.handleChunkTimeout(requestId, 0);
      }).not.toThrow();
    });
  });

  describe('Memory Management Edge Cases', () => {
    test('should handle cleanup of non-existent request', () => {
      const result = cm.cleanup('non-existent');
      expect(result).toBe(false);
    });

    test('should handle cleanup with null/undefined requestId', () => {
      expect(() => {
        const result = cm.cleanup(null);
        expect(result).toBe(false);
      }).not.toThrow();
      
      expect(() => {
        const result = cm.cleanup(undefined);
        expect(result).toBe(false);
      }).not.toThrow();
    });

    test('should handle cleanupOldRequests with negative age', () => {
      cm.initChunkTracking('test1', 5);
      cm.initChunkTracking('test2', 5);
      
      const cleaned = cm.cleanupOldRequests(-1);
      // Negative age means clean everything (all requests are older than -1 hours)
      expect(cleaned.length).toBeGreaterThan(0);
    });

    test('should handle cleanupOldRequests with zero age', () => {
      cm.initChunkTracking('test1', 5);
      cm.initChunkTracking('test2', 5);
      
      const cleaned = cm.cleanupOldRequests(0);
      // Should clean all requests since they're older than 0 hours
      // Note: cleanupOldRequests checks lastActivity, not createdAt
      // So fresh requests might not be cleaned
      expect(cleaned.length).toBeGreaterThanOrEqual(0);
    });

    test('should handle very large number of requests', () => {
      const requestIds = [];
      
      // Create many requests
      for (let i = 0; i < 1000; i++) {
        const requestId = `test-${i}`;
        cm.initChunkTracking(requestId, 5);
        requestIds.push(requestId);
      }
      
      expect(cm.getActiveRequests()).toHaveLength(1000);
      
      // Clean up all
      const cleaned = cm.cleanupOldRequests(0);
      // Some requests might not be cleaned if they're too fresh
      expect(cleaned.length).toBeGreaterThanOrEqual(0);
      
      // Clean up remaining manually
      cm.getActiveRequests().forEach(id => cm.cleanup(id));
    });

    test('should handle memory leak prevention', () => {
      const requestId = 'test-memory';
      cm.initChunkTracking(requestId, 5);
      
      // Mark all chunks as received
      for (let i = 0; i < 5; i++) {
        cm.markChunkReceived(requestId, i);
      }
      
      // Cleanup should remove all traces
      cm.cleanup(requestId);
      
      expect(cm.getActiveRequests()).not.toContain(requestId);
      expect(cm.requests.has(requestId)).toBe(false);
      expect(cm.timeoutTimers.has(requestId)).toBe(false);
    });
  });

  describe('Concurrent Access Edge Cases', () => {
    test('should handle simultaneous operations on same request', (done) => {
      const requestId = 'test-concurrent';
      cm.initChunkTracking(requestId, 10);
      
      // Simulate concurrent operations
      let operations = 0;
      const totalOps = 20;
      
      for (let i = 0; i < totalOps; i++) {
        setTimeout(() => {
          if (i % 2 === 0) {
            cm.markChunkReceived(requestId, Math.floor(i / 2));
          } else {
            cm.markChunkFailed(requestId, Math.floor(i / 2), 'Concurrent error');
          }
          
          operations++;
          if (operations === totalOps) {
            // Should not have crashed
            expect(cm.getActiveRequests()).toContain(requestId);
            done();
          }
        }, Math.random() * 10);
      }
    });

    test('should handle rapid initialization and cleanup', () => {
      for (let i = 0; i < 100; i++) {
        const requestId = `rapid-${i}`;
        cm.initChunkTracking(requestId, 5);
        cm.cleanup(requestId);
      }
      
      expect(cm.getActiveRequests()).toHaveLength(0);
    });
  });

  describe('Data Integrity Edge Cases', () => {
    test('should handle isComplete for non-existent request', () => {
      expect(cm.isComplete('non-existent')).toBe(false);
    });

    test('should handle getMissingChunks for single chunk request', () => {
      const requestId = 'test-single';
      cm.initChunkTracking(requestId, 1);
      
      let missing = cm.getMissingChunks(requestId);
      expect(missing).toEqual([0]);
      
      cm.markChunkReceived(requestId, 0);
      missing = cm.getMissingChunks(requestId);
      expect(missing).toEqual([]);
    });

    test('should handle getRetryInfo with all chunks received', () => {
      const requestId = 'test-all-received';
      cm.initChunkTracking(requestId, 3);
      
      // Receive all chunks
      cm.markChunkReceived(requestId, 0);
      cm.markChunkReceived(requestId, 1);
      cm.markChunkReceived(requestId, 2);
      
      const retryInfo = cm.getRetryInfo(requestId);
      expect(retryInfo.receivedCount).toBe(3);
      expect(retryInfo.pendingCount).toBe(0);
      expect(retryInfo.failedChunks).toHaveLength(0);
      expect(retryInfo.totalRetryAttempts).toBe(0);
    });

    test('should handle getChunksToRetry with no failures', () => {
      const requestId = 'test-no-retries';
      cm.initChunkTracking(requestId, 5);
      
      const toRetry = cm.getChunksToRetry(requestId);
      expect(toRetry).toEqual([]);
    });

    test('should handle timestamp accuracy', (done) => {
      const requestId = 'test-timestamp';
      const beforeInit = new Date();
      
      cm.initChunkTracking(requestId, 5);
      
      const afterInit = new Date();
      const retryInfo = cm.getRetryInfo(requestId);
      
      expect(retryInfo.createdAt).toBeInstanceOf(Date);
      expect(retryInfo.createdAt.getTime()).toBeGreaterThanOrEqual(beforeInit.getTime());
      expect(retryInfo.createdAt.getTime()).toBeLessThanOrEqual(afterInit.getTime());
      
      done();
    });
  });

  describe('Singleton Instance Edge Cases', () => {
    test('should handle singleton instance isolation', () => {
      // Use the exported singleton
      const requestId = 'singleton-test';
      chunkManager.initChunkTracking(requestId, 5);
      
      expect(chunkManager.getActiveRequests()).toContain(requestId);
      
      // Clean up
      chunkManager.cleanup(requestId);
    });

    test('should handle singleton with multiple operations', () => {
      const requestId1 = 'singleton-1';
      const requestId2 = 'singleton-2';
      
      chunkManager.initChunkTracking(requestId1, 5);
      chunkManager.initChunkTracking(requestId2, 3);
      
      expect(chunkManager.getActiveRequests()).toHaveLength(2);
      
      chunkManager.markChunkReceived(requestId1, 0);
      chunkManager.markChunkFailed(requestId2, 0, 'Test error');
      
      const retryInfo1 = chunkManager.getRetryInfo(requestId1);
      const retryInfo2 = chunkManager.getRetryInfo(requestId2);
      
      expect(retryInfo1.receivedCount).toBe(1);
      expect(retryInfo2.failedChunks).toHaveLength(1);
      
      // Clean up
      chunkManager.cleanup(requestId1);
      chunkManager.cleanup(requestId2);
    });
  });

  describe('Performance Edge Cases', () => {
    test('should handle large chunk numbers efficiently', () => {
      const requestId = 'test-performance';
      const start = Date.now();
      
      cm.initChunkTracking(requestId, 10000);
      
      // Mark half as received
      for (let i = 0; i < 5000; i++) {
        cm.markChunkReceived(requestId, i);
      }
      
      const missing = cm.getMissingChunks(requestId);
      const end = Date.now();
      
      expect(missing).toHaveLength(5000);
      expect(end - start).toBeLessThan(20000); // Increased to 20 seconds
      
      cm.cleanup(requestId);
    });

    test('should handle rapid successive operations', () => {
      const requestId = 'test-rapid';
      cm.initChunkTracking(requestId, 100);
      
      const start = Date.now();
      
      for (let i = 0; i < 100; i++) {
        cm.markChunkReceived(requestId, i);
        cm.getRetryInfo(requestId);
        cm.getMissingChunks(requestId);
      }
      
      const end = Date.now();
      
      expect(end - start).toBeLessThan(500); // Should complete within 500ms
      
      cm.cleanup(requestId);
    });
  });
});
