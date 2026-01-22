const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const logger = require('./utils/logger');
const config = require('./config');
const packageJson = require('../package.json');
const { v4: uuidv4 } = require('uuid');
const { AppError, errorMiddleware, asyncHandler } = require('./utils/error-handler');
const { ERROR_CODES } = require('../../shared/protocol');

class ExpressServer {
  constructor(wsServer) {
    this.app = express();
    this.server = null;
    this.wsServer = wsServer;
    this.startTime = Date.now();
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(express.json());
    
    this.app.use((req, res, next) => {
      logger.debug(`${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
    this.app.get('/api/v1/health', (req, res) => {
      const uptime = Math.floor((Date.now() - this.startTime) / 1000);
      const connectedClients = this.wsServer.clients.size;

      const activeDownloads = Array.from(this.wsServer.downloadManager.downloads.values())
        .filter(download => download.status === 'in_progress').length;

      res.json({
        status: 'healthy',
        uptime,
        connectedClients,
        activeDownloads,
        version: packageJson.version
      });
    });

    // POST /api/v1/downloads - Initiate a new download
    this.app.post('/api/v1/downloads', (req, res) => {
      const { url, filename, clientId, chunks } = req.body;

      // Validation
      if (!url || typeof url !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'URL is required and must be a string'
        });
      }

      if (!filename || typeof filename !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Filename is required and must be a string'
        });
      }

      if (!clientId || typeof clientId !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Client ID is required and must be a string'
        });
      }

      // Check if client exists
      const client = Array.from(this.wsServer.clients.values())
        .find(c => (c.registeredId || c.id) === clientId);

      if (!client) {
        return res.status(404).json({
          success: false,
          error: 'Client not found or not connected'
        });
      }

      // Generate request ID
      const requestId = uuidv4();

      try {
        // Create download request
        const downloadRequest = {
          type: 'DOWNLOAD_REQUEST',
          requestId,
          url,
          filename,
          chunks: chunks || 0, // 0 means let client decide
          timestamp: new Date().toISOString()
        };

        // Send request to client
        client.send(JSON.stringify(downloadRequest));
        logger.info(`Sent download request ${requestId} to client ${clientId}`);

        // Initialize download in download manager
        this.wsServer.downloadManager.createDownload(requestId, clientId, {
          url,
          filename,
          totalChunks: chunks
        });

        res.status(202).json({
          success: true,
          requestId,
          status: 'pending',
          message: 'Download request sent to client'
        });

      } catch (error) {
        logger.error('Error initiating download:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to initiate download'
        });
      }
    });

    // GET /api/v1/downloads - List all downloads
    this.app.get('/api/v1/downloads', (req, res) => {
      const { status, clientId } = req.query;

      let downloads = Array.from(this.wsServer.downloadManager.downloads.values());

      // Apply filters
      if (status) {
        downloads = downloads.filter(d => d.status === status);
      }

      if (clientId) {
        downloads = downloads.filter(d => d.clientId === clientId);
      }

      const downloadList = downloads.map(download => ({
        requestId: download.id,
        clientId: download.clientId,
        status: download.status,
        progress: {
          chunksReceived: download.chunksReceived,
          totalChunks: download.totalChunks,
          percentage: download.progress
        },
        startedAt: download.createdAt.toISOString(),
        completedAt: download.completedAt?.toISOString(),
        url: download.url,
        filename: download.filename
      }));

      res.json({
        success: true,
        downloads: downloadList,
        total: downloadList.length
      });
    });

    this.app.get('/api/v1/downloads/:requestId', (req, res, next) => {
      try {
        const { requestId } = req.params;
        const download = this.wsServer.downloadManager.getDownload(requestId);

        if (!download) {
          throw new AppError(ERROR_CODES.INVALID_REQUEST, 'Download not found');
        }
      
      const response = {
        success: true,
        requestId: download.id,
        clientId: download.clientId,
        status: download.status,
        progress: {
          chunksReceived: download.chunksReceived,
          totalChunks: download.totalChunks,
          percentage: download.progress,
          bytesReceived: download.chunksReceived * 1048576, // 1MB per chunk
          retriedChunks: Array.from(download.failedChunks.entries()).map(([index, info]) => ({
            chunkIndex: index,
            attempts: info.attempts || 1,
            lastRetryAt: info.lastRetryAt,
            error: info.error
          }))
        },
        startedAt: download.createdAt.toISOString()
      };
      
      if (download.completedAt) {
        response.completedAt = download.completedAt.toISOString();
        response.duration = download.duration;
      }
      
      if (download.error) {
        response.error = download.error;
      }

      res.json(response);
      } catch (error) {
        next(error);
      }
    });

    this.app.delete('/api/v1/downloads/:requestId', asyncHandler(async (req, res) => {
      const { requestId } = req.params;
      const download = this.wsServer.downloadManager.getDownload(requestId);

      if (!download) {
        throw new AppError(ERROR_CODES.INVALID_REQUEST, 'Download not found');
      }

      // Cannot cancel completed downloads
      if (download.status === 'completed' || download.status === 'failed') {
        throw new AppError(ERROR_CODES.INVALID_REQUEST, 'Cannot cancel completed download');
      }
      
      // Send CANCEL_DOWNLOAD message to client
      const client = this.wsServer.clients.get(download.clientId);
      if (client && client.readyState === 1) { // WebSocket.OPEN
        client.send(JSON.stringify({
          type: 'CANCEL_DOWNLOAD',
          requestId: requestId
        }));
        logger.info(`Sent CANCEL_DOWNLOAD to client ${download.clientId} for request ${requestId}`);
      }

      // Update download status to cancelled
      await this.wsServer.downloadManager.cancelDownload(requestId, 'Cancelled by user request');

      // Clean up temp files
      if (download.tempFilePath && require('fs').existsSync(download.tempFilePath)) {
        try {
          await require('fs').promises.unlink(download.tempFilePath);
          logger.info(`Cleaned up temp file for cancelled download ${requestId}`);
        } catch (cleanupError) {
          logger.error(`Error cleaning up temp file for ${requestId}:`, cleanupError);
        }
      }

      res.json({
        success: true,
        requestId: requestId,
        status: 'cancelled'
      });
    }));

    this.app.get('/api/v1/clients', (req, res) => {
      const statusFilter = req.query.status;

      const allClients = Array.from(this.wsServer.clients.values()).map(client => ({
        clientId: client.registeredId || client.id,
        connectedAt: client.connectedAt.toISOString(),
        lastHeartbeat: client.lastHeartbeat.toISOString(),
        status: 'connected',
        metadata: {}
      }));

      let clients = allClients;
      if (statusFilter) {
        if (statusFilter === 'connected') {
          clients = allClients;
        } else {
          clients = [];
        }
      }

      res.json({
        success: true,
        clients,
        total: clients.length
      });
    });

    // GET /api/v1/clients/:clientId - Get specific client info
    this.app.get('/api/v1/clients/:clientId', (req, res) => {
      const { clientId } = req.params;

      const client = Array.from(this.wsServer.clients.values())
        .find(c => (c.registeredId || c.id) === clientId);

      if (!client) {
        return res.status(404).json({
          success: false,
          error: 'Client not found'
        });
      }

      // Get client's download history
      const clientDownloads = Array.from(this.wsServer.downloadManager.downloads.values())
        .filter(d => d.clientId === clientId);

      const clientInfo = {
        clientId: client.registeredId || client.id,
        connectedAt: client.connectedAt.toISOString(),
        lastHeartbeat: client.lastHeartbeat.toISOString(),
        status: 'connected',
        metadata: {},
        downloads: {
          total: clientDownloads.length,
          active: clientDownloads.filter(d => d.status === 'in_progress').length,
          completed: clientDownloads.filter(d => d.status === 'completed').length,
          failed: clientDownloads.filter(d => d.status === 'failed').length
        }
      };

      res.json({
        success: true,
        client: clientInfo
      });
    });

    // 404 handler - must come before error middleware
    this.app.use((req, res, next) => {
      next(new AppError(ERROR_CODES.INVALID_REQUEST, 'Not found'));
    });

    // Error handling middleware - must be last
    this.app.use(errorMiddleware);
  }

  start() {
    const port = config.PORT;
    
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(port, (err) => {
        if (err) {
          reject(err);
        } else {
          logger.info(`HTTP server listening on port ${port}`);
          resolve();
        }
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('HTTP server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = ExpressServer;
