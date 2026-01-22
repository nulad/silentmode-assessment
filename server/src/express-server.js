const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const logger = require('./utils/logger');
const config = require('./config');
const packageJson = require('../package.json');
const { errorHandler, asyncHandler, createError, ERROR_CODES } = require('./middleware/error-handler');

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

  /**
   * Helper method to send error responses consistently
   */
  sendError(res, code, message, details = {}) {
    const error = createError(code, message, details);
    errorHandler(error, {}, res, () => {});
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

    this.app.get('/api/v1/downloads/:requestId', asyncHandler(async (req, res) => {
      const { requestId } = req.params;
      const download = this.wsServer.downloadManager.getDownload(requestId);
      
      if (!download) {
        return this.sendError(res, ERROR_CODES.FILE_NOT_FOUND, 'Download not found');
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
          retriedChunks: download.retriedChunks || []
        },
        retryStats: {
          totalRetries: download.totalRetries || 0,
          retriedChunks: download.retriedChunks || [],
          retrySuccessRate: download.retriedChunks && download.retriedChunks.length > 0 
            ? download.retriedChunks.filter(r => r.status === 'succeeded').length / download.retriedChunks.length 
            : 0
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
    }));

    this.app.delete('/api/v1/downloads/:requestId', asyncHandler(async (req, res) => {
      const { requestId } = req.params;
      const download = this.wsServer.downloadManager.getDownload(requestId);
      
      if (!download) {
        return this.sendError(res, ERROR_CODES.FILE_NOT_FOUND, 'Download not found');
      }
      
      // Cannot cancel completed downloads
      if (download.status === 'completed' || download.status === 'failed') {
        return this.sendError(res, ERROR_CODES.DOWNLOAD_IN_PROGRESS, 'Cannot cancel completed download');
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

    // 404 handler - must be before error handler
    this.app.use((req, res) => {
      this.sendError(res, ERROR_CODES.FILE_NOT_FOUND, 'Endpoint not found', {
        method: req.method,
        path: req.path
      });
    });

    // Global error handler - must be last
    this.app.use(errorHandler);
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
