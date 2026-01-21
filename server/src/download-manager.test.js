const DownloadManager = require('./download-manager');
const { MESSAGE_TYPES } = require('../../shared/protocol');

describe('DownloadManager', () => {
  let manager;

  beforeEach(() => {
    manager = new DownloadManager();
  });

  describe('handleDownloadAck', () => {
    test('should update download status to in_progress on success', () => {
      const requestId = 'test-request-1';
      const clientId = 'client-001';
      const filePath = '/test/file.txt';
      
      // Create a download
      manager.createDownload(clientId, filePath, requestId);
      
      // Simulate successful ACK
      const ack = {
        type: MESSAGE_TYPES.DOWNLOAD_ACK,
        requestId: requestId,
        success: true,
        fileSize: 1048576,
        totalChunks: 1,
        fileChecksum: 'sha256-hash',
        timestamp: new Date().toISOString()
      };
      
      manager.handleDownloadAck(requestId, ack);
      
      const download = manager.getDownload(requestId);
      expect(download.status).toBe('in_progress');
      expect(download.fileSize).toBe(1048576);
      expect(download.totalChunks).toBe(1);
      expect(download.checksum).toBe('sha256-hash');
    });

    test('should update download status to failed on failure', () => {
      const requestId = 'test-request-2';
      const clientId = 'client-001';
      const filePath = '/test/nonexistent.txt';
      
      // Create a download
      manager.createDownload(clientId, filePath, requestId);
      
      // Simulate failed ACK
      const ack = {
        type: MESSAGE_TYPES.DOWNLOAD_ACK,
        requestId: requestId,
        success: false,
        error: {
          code: 'FILE_NOT_FOUND',
          message: 'File not found'
        },
        timestamp: new Date().toISOString()
      };
      
      manager.handleDownloadAck(requestId, ack);
      
      const download = manager.getDownload(requestId);
      expect(download.status).toBe('failed');
      expect(download.error.code).toBe('FILE_NOT_FOUND');
      expect(download.error.message).toBe('File not found');
    });

    test('should handle unknown request ID gracefully', () => {
      const requestId = 'unknown-request';
      
      const ack = {
        type: MESSAGE_TYPES.DOWNLOAD_ACK,
        requestId: requestId,
        success: true,
        fileSize: 1048576,
        totalChunks: 1,
        fileChecksum: 'sha256-hash',
        timestamp: new Date().toISOString()
      };
      
      // Should not throw
      expect(() => {
        manager.handleDownloadAck(requestId, ack);
      }).not.toThrow();
    });
  });
});
