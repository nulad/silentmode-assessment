const DownloadManager = require('./download-manager');
const WebSocketServer = require('./websocket-server');

// Mock WebSocketServer
jest.mock('./websocket-server');

describe('DownloadManager', () => {
  let downloadManager;
  let mockWsServer;

  beforeEach(() => {
    mockWsServer = {
      sendDownloadRequest: jest.fn()
    };
    downloadManager = new DownloadManager(mockWsServer);
  });

  describe('initiateDownload', () => {
    it('should create a download request and send it to the client', async () => {
      const clientId = 'test-client-1';
      const filePath = '/home/user/test.txt';

      mockWsServer.sendDownloadRequest.mockResolvedValue();

      const requestId = await downloadManager.initiateDownload(clientId, filePath);

      expect(requestId).toBeDefined();
      expect(typeof requestId).toBe('string');

      const download = downloadManager.getDownload(requestId);
      expect(download).toEqual({
        requestId,
        clientId,
        filePath,
        status: 'pending',
        createdAt: expect.any(Date),
        chunkSize: 1048576
      });

      expect(mockWsServer.sendDownloadRequest).toHaveBeenCalledWith(
        clientId,
        requestId,
        filePath
      );
    });

    it('should handle client not connected error', async () => {
      const clientId = 'offline-client';
      const filePath = '/home/user/test.txt';

      mockWsServer.sendDownloadRequest.mockRejectedValue(
        new Error('Client offline-client is not connected')
      );

      await expect(downloadManager.initiateDownload(clientId, filePath))
        .rejects.toThrow('Client offline-client is not connected');

      // Check that the download status was updated to failed
      const downloads = downloadManager.listDownloads();
      const failedDownload = downloads.find(d => d.clientId === clientId);
      expect(failedDownload.status).toBe('failed');
      expect(failedDownload.error).toBe('Client offline-client is not connected');
    });
  });

  describe('getDownload', () => {
    it('should return download info for valid request ID', async () => {
      const clientId = 'test-client';
      const filePath = '/home/user/test.txt';

      mockWsServer.sendDownloadRequest.mockResolvedValue();
      const requestId = await downloadManager.initiateDownload(clientId, filePath);

      const download = downloadManager.getDownload(requestId);
      expect(download.requestId).toBe(requestId);
      expect(download.clientId).toBe(clientId);
      expect(download.filePath).toBe(filePath);
    });

    it('should return undefined for invalid request ID', () => {
      const download = downloadManager.getDownload('invalid-id');
      expect(download).toBeUndefined();
    });
  });

  describe('listDownloads', () => {
    it('should return all downloads', async () => {
      mockWsServer.sendDownloadRequest.mockResolvedValue();

      await downloadManager.initiateDownload('client1', '/file1.txt');
      await downloadManager.initiateDownload('client2', '/file2.txt');

      const downloads = downloadManager.listDownloads();
      expect(downloads).toHaveLength(2);
      expect(downloads[0].status).toBe('pending');
      expect(downloads[1].status).toBe('pending');
    });
  });

  describe('updateDownload', () => {
    it('should update download status and additional fields', async () => {
      mockWsServer.sendDownloadRequest.mockResolvedValue();

      const requestId = await downloadManager.initiateDownload('client1', '/file1.txt');
      
      downloadManager.updateDownload(requestId, 'downloading', {
        totalChunks: 10,
        downloadedChunks: 3
      });

      const download = downloadManager.getDownload(requestId);
      expect(download.status).toBe('downloading');
      expect(download.totalChunks).toBe(10);
      expect(download.downloadedChunks).toBe(3);
      expect(download.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('cancelDownload', () => {
    it('should cancel a download and send cancel message', async () => {
      mockWsServer.sendDownloadRequest.mockResolvedValue();
      mockWsServer.sendCancelDownload = jest.fn();

      const requestId = await downloadManager.initiateDownload('client1', '/file1.txt');
      
      downloadManager.cancelDownload(requestId);

      const download = downloadManager.getDownload(requestId);
      expect(download.status).toBe('cancelled');
      expect(mockWsServer.sendCancelDownload).toHaveBeenCalledWith(
        'client1',
        requestId,
        'Cancelled by server'
      );
    });
  });
});
