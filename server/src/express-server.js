const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const logger = require('./utils/logger');
const config = require('./config');
const packageJson = require('../package.json');

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

    this.app.get('/api/v1/downloads/:requestId', (req, res) => {
      const { requestId } = req.params;
      const download = this.wsServer.downloadManager.getDownload(requestId);
      
      if (!download) {
        return res.status(404).json({
          success: false,
          error: 'Download not found'
        });
      }
      
      // Format retried chunks array
      const retriedChunks = Array.from(download.failedChunks.entries()).map(([chunkIndex, failure]) => ({
        chunkIndex,
        attempts: failure.attempts || 1,
        lastRetryAt: failure.lastRetryAt,
        error: failure.error
      }));
      
      // Calculate bytes received based on chunks received and chunk size
      const CHUNK_SIZE = 1048576; // 1MB
      const bytesReceived = download.chunksReceived * CHUNK_SIZE;
      
      const response = {
        success: true,
        requestId: download.id,
        clientId: download.clientId,
        status: download.status,
        progress: {
          chunksReceived: download.chunksReceived,
          totalChunks: download.totalChunks,
          percentage: download.progress,
          bytesReceived: bytesReceived,
          retriedChunks: retriedChunks
        },
        startedAt: download.createdAt.toISOString()
      };
      
      // Add additional fields based on status
      if (download.status === 'completed') {
        response.completedAt = download.completedAt?.toISOString();
        response.duration = download.duration;
        response.filePath = download.finalFilePath;
        response.fileSize = download.finalFileSize;
        response.checksumVerified = download.checksumVerified;
      } else if (download.status === 'failed' || download.status === 'cancelled') {
        response.error = download.error;
        response.completedAt = download.completedAt?.toISOString();
      }
      
      res.json(response);
    });

    this.app.use((req, res) => {
      res.status(404).json({ error: 'Not found' });
    });

    this.app.use((err, req, res, next) => {
      logger.error('Express error:', err);
      res.status(500).json({ error: 'Internal server error' });
    });
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
