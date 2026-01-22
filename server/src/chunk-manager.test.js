const ChunkManager = require('./chunk-manager');

describe('ChunkManager', () => {
  let chunkManager;

  beforeEach(() => {
    chunkManager = new ChunkManager();
  });

  test('should initialize chunk tracking', () => {
    chunkManager.initChunkTracking('req1', 10);
    const missing = chunkManager.getMissingChunks('req1');

    expect(missing.length).toBe(10);
    expect(missing).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  test('should mark chunks as received', () => {
    chunkManager.initChunkTracking('req1', 5);

    chunkManager.markChunkReceived('req1', 0);
    chunkManager.markChunkReceived('req1', 2);
    chunkManager.markChunkReceived('req1', 4);

    const missing = chunkManager.getMissingChunks('req1');
    expect(missing).toEqual([1, 3]);
    expect(chunkManager.getProgress('req1')).toBe(60);
  });

  test('should track failed chunks with retry attempts', () => {
    chunkManager.initChunkTracking('req1', 10);

    chunkManager.markChunkFailed('req1', 3, 'Checksum mismatch');
    chunkManager.markChunkFailed('req1', 3, 'Checksum mismatch');
    chunkManager.markChunkFailed('req1', 5, 'Timeout');

    const retryInfo = chunkManager.getRetryInfo('req1');

    expect(retryInfo.chunksWithRetries).toBe(2);
    expect(retryInfo.totalRetries).toBe(3);
    expect(retryInfo.failedChunks).toEqual([3, 5]);

    const chunk3 = retryInfo.chunks.find(c => c.chunkIndex === 3);
    expect(chunk3.attempts).toBe(2);
    expect(chunk3.reason).toBe('Checksum mismatch');
  });

  test('should update retry status when chunk succeeds after failure', () => {
    chunkManager.initChunkTracking('req1', 5);

    chunkManager.markChunkFailed('req1', 2, 'Network error');
    chunkManager.markChunkReceived('req1', 2);

    const retryInfo = chunkManager.getRetryInfo('req1');
    const chunk2 = retryInfo.chunks.find(c => c.chunkIndex === 2);

    expect(chunk2.status).toBe('succeeded');
    expect(chunk2.attempts).toBe(1);
  });

  test('should detect completion', () => {
    chunkManager.initChunkTracking('req1', 3);

    expect(chunkManager.isComplete('req1')).toBe(false);

    chunkManager.markChunkReceived('req1', 0);
    chunkManager.markChunkReceived('req1', 1);
    expect(chunkManager.isComplete('req1')).toBe(false);

    chunkManager.markChunkReceived('req1', 2);
    expect(chunkManager.isComplete('req1')).toBe(true);
    expect(chunkManager.getProgress('req1')).toBe(100);
  });

  test('should cleanup request tracking', () => {
    chunkManager.initChunkTracking('req1', 10);
    chunkManager.markChunkReceived('req1', 0);

    expect(chunkManager.cleanup('req1')).toBe(true);
    expect(chunkManager.getMissingChunks('req1')).toEqual([]);
    expect(chunkManager.cleanup('req1')).toBe(false);
  });

  test('should return overall statistics', () => {
    chunkManager.initChunkTracking('req1', 10);
    chunkManager.initChunkTracking('req2', 5);

    chunkManager.markChunkReceived('req1', 0);
    chunkManager.markChunkReceived('req1', 1);
    chunkManager.markChunkReceived('req2', 0);

    chunkManager.markChunkFailed('req1', 5, 'Error');
    chunkManager.markChunkFailed('req1', 5, 'Error');

    const stats = chunkManager.getStats();

    expect(stats.totalRequests).toBe(2);
    expect(stats.totalChunks).toBe(15);
    expect(stats.totalReceived).toBe(3);
    expect(stats.totalMissing).toBe(12);
    expect(stats.totalRetries).toBe(2);
  });

  test('should handle missing request gracefully', () => {
    expect(chunkManager.markChunkReceived('nonexistent', 0)).toBe(false);
    expect(chunkManager.markChunkFailed('nonexistent', 0, 'error')).toBe(false);
    expect(chunkManager.getMissingChunks('nonexistent')).toEqual([]);
    expect(chunkManager.getRetryInfo('nonexistent')).toBe(null);
    expect(chunkManager.isComplete('nonexistent')).toBe(false);
    expect(chunkManager.getProgress('nonexistent')).toBe(0);
  });
});
