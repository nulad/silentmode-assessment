const DownloadManager = require('../src/download-manager');
const fs = require('fs');
const path = require('path');

describe('DownloadManager', () => {
  let downloadManager;
  const testClientId = 'test-client-1';
  const testFilePath = '/test/file.txt';

  beforeEach(() => {
    downloadManager = new DownloadManager();
  });

  describe('createDownload', () => {
    it('should create a new download with a unique request ID', () => {
      const requestId1 = downloadManager.createDownload(testClientId, testFilePath);
      const requestId2 = downloadManager.createDownload(testClientId, testFilePath);
      
      expect(requestId1).toBeDefined();
      expect(requestId2).toBeDefined();
      expect(requestId1).not.toBe(requestId2);
    });

    it('should initialize download with correct properties', () => {
      const requestId = downloadManager.createDownload(testClientId, testFilePath);
      const download = downloadManager.getDownload(requestId);
      
      expect(download.requestId).toBe(requestId);
      expect(download.clientId).toBe(testClientId);
      expect(download.filePath).toBe(testFilePath);
      expect(download.status).toBe('pending');
      expect(download.startedAt).toBeInstanceOf(Date);
      expect(download.completedAt).toBeNull();
      expect(download.totalChunks).toBe(0);
      expect(download.chunksReceived).toBe(0);
      expect(download.bytesReceived).toBe(0);
    });
  });

  describe('updateDownload', () => {
    it('should update download properties', () => {
      const requestId = downloadManager.createDownload(testClientId, testFilePath);
      const updates = {
        status: 'in_progress',
        totalChunks: 10
      };
      
      const result = downloadManager.updateDownload(requestId, updates);
      const download = downloadManager.getDownload(requestId);
      
      expect(result).toBe(true);
      expect(download.status).toBe('in_progress');
      expect(download.totalChunks).toBe(10);
    });

    it('should return false for non-existent download', () => {
      const result = downloadManager.updateDownload('non-existent', { status: 'completed' });
      expect(result).toBe(false);
    });
  });

  describe('getDownload', () => {
    it('should return download by request ID', () => {
      const requestId = downloadManager.createDownload(testClientId, testFilePath);
      const download = downloadManager.getDownload(requestId);
      
      expect(download).toBeDefined();
      expect(download.requestId).toBe(requestId);
    });

    it('should return null for non-existent download', () => {
      const download = downloadManager.getDownload('non-existent');
      expect(download).toBeNull();
    });

    it('should return a copy to prevent external modification', () => {
      const requestId = downloadManager.createDownload(testClientId, testFilePath);
      const download = downloadManager.getDownload(requestId);
      
      download.status = 'modified';
      const original = downloadManager.getDownload(requestId);
      
      expect(original.status).toBe('pending');
    });
  });

  describe('getDownloads', () => {
    beforeEach(() => {
      // Create test downloads
      downloadManager.createDownload('client1', 'file1.txt');
      downloadManager.createDownload('client2', 'file2.txt');
      downloadManager.createDownload('client1', 'file3.txt');
    });

    it('should return all downloads when no filters provided', () => {
      const downloads = downloadManager.getDownloads();
      expect(downloads).toHaveLength(3);
    });

    it('should filter by client ID', () => {
      const downloads = downloadManager.getDownloads({ clientId: 'client1' });
      expect(downloads).toHaveLength(2);
      downloads.forEach(d => expect(d.clientId).toBe('client1'));
    });

    it('should filter by status', () => {
      const requestId = downloadManager.createDownload(testClientId, testFilePath);
      downloadManager.updateDownload(requestId, { status: 'completed' });
      
      const downloads = downloadManager.getDownloads({ status: 'completed' });
      expect(downloads).toHaveLength(1);
      expect(downloads[0].status).toBe('completed');
    });

    it('should sort by start time (newest first)', () => {
      const downloads = downloadManager.getDownloads();
      for (let i = 1; i < downloads.length; i++) {
        expect(downloads[i-1].startedAt.getTime()).toBeGreaterThanOrEqual(
          downloads[i].startedAt.getTime()
        );
      }
    });
  });

  describe('cancelDownload', () => {
    it('should cancel a pending download', () => {
      const requestId = downloadManager.createDownload(testClientId, testFilePath);
      const result = downloadManager.cancelDownload(requestId, 'Test cancellation');
      
      expect(result).toBe(true);
      
      const download = downloadManager.getDownload(requestId);
      expect(download.status).toBe('cancelled');
      expect(download.completedAt).toBeInstanceOf(Date);
      expect(download.error.code).toBe('CANCELLED');
      expect(download.error.message).toBe('Test cancellation');
    });

    it('should not cancel an already completed download', () => {
      const requestId = downloadManager.createDownload(testClientId, testFilePath);
      downloadManager.updateDownload(requestId, { status: 'completed' });
      
      const result = downloadManager.cancelDownload(requestId);
      expect(result).toBe(false);
    });

    it('should return false for non-existent download', () => {
      const result = downloadManager.cancelDownload('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('getClientDownloads', () => {
    it('should return downloads for specific client', () => {
      downloadManager.createDownload('client1', 'file1.txt');
      downloadManager.createDownload('client2', 'file2.txt');
      downloadManager.createDownload('client1', 'file3.txt');
      
      const client1Downloads = downloadManager.getClientDownloads('client1');
      expect(client1Downloads).toHaveLength(2);
      client1Downloads.forEach(d => expect(d.clientId).toBe('client1'));
    });
  });

  describe('startDownload', () => {
    it('should mark download as in progress with metadata', () => {
      const requestId = downloadManager.createDownload(testClientId, testFilePath);
      const metadata = {
        totalChunks: 100,
        fileChecksum: 'abc123',
        localPath: '/tmp/file.txt'
      };
      
      downloadManager.startDownload(requestId, metadata);
      
      const download = downloadManager.getDownload(requestId);
      expect(download.status).toBe('in_progress');
      expect(download.totalChunks).toBe(100);
      expect(download.fileChecksum).toBe('abc123');
      expect(download.localPath).toBe('/tmp/file.txt');
    });
  });

  describe('completeDownload', () => {
    it('should mark download as completed', () => {
      const requestId = downloadManager.createDownload(testClientId, testFilePath);
      
      downloadManager.completeDownload(requestId, { finalSize: 1024 });
      
      const download = downloadManager.getDownload(requestId);
      expect(download.status).toBe('completed');
      expect(download.completedAt).toBeInstanceOf(Date);
      expect(download.finalSize).toBe(1024);
    });
  });

  describe('failDownload', () => {
    it('should mark download as failed with error details', () => {
      const requestId = downloadManager.createDownload(testClientId, testFilePath);
      const error = new Error('Test error');
      error.code = 'TEST_ERROR';
      
      downloadManager.failDownload(requestId, error);
      
      const download = downloadManager.getDownload(requestId);
      expect(download.status).toBe('failed');
      expect(download.error.code).toBe('TEST_ERROR');
      expect(download.error.message).toBe('Test error');
    });
  });

  describe('addChunkProgress', () => {
    it('should update chunk and byte progress', () => {
      const requestId = downloadManager.createDownload(testClientId, testFilePath);
      
      downloadManager.addChunkProgress(requestId, 1024);
      downloadManager.addChunkProgress(requestId, 2048);
      
      const download = downloadManager.getDownload(requestId);
      expect(download.chunksReceived).toBe(2);
      expect(download.bytesReceived).toBe(3072);
    });
  });

  describe('getStatistics', () => {
    it('should return accurate statistics', () => {
      // Create downloads with different statuses
      const id1 = downloadManager.createDownload('client1', 'file1.txt');
      const id2 = downloadManager.createDownload('client2', 'file2.txt');
      const id3 = downloadManager.createDownload('client3', 'file3.txt');
      
      downloadManager.updateDownload(id1, { status: 'completed' });
      downloadManager.updateDownload(id2, { status: 'failed' });
      downloadManager.addChunkProgress(id1, 1024);
      downloadManager.addChunkProgress(id2, 512);
      
      const stats = downloadManager.getStatistics();
      
      expect(stats.total).toBe(3);
      expect(stats.pending).toBe(1);
      expect(stats.completed).toBe(1);
      expect(stats.failed).toBe(1);
      expect(stats.totalBytesTransferred).toBe(1536);
    });
  });

  describe('cleanup', () => {
    it('should remove old completed downloads', () => {
      const requestId = downloadManager.createDownload(testClientId, testFilePath);
      downloadManager.updateDownload(requestId, { 
        status: 'completed',
        startedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) // 8 days ago
      });
      
      const cleaned = downloadManager.cleanup({ olderThan: 7 });
      
      expect(cleaned).toBe(1);
      expect(downloadManager.getDownload(requestId)).toBeNull();
    });

    it('should keep recent downloads', () => {
      const requestId = downloadManager.createDownload(testClientId, testFilePath);
      downloadManager.updateDownload(requestId, { status: 'completed' });
      
      const cleaned = downloadManager.cleanup({ olderThan: 7 });
      
      expect(cleaned).toBe(0);
      expect(downloadManager.getDownload(requestId)).toBeDefined();
    });
  });
});
