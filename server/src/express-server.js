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

    this.app.get('/api/v1/downloads', (req, res) => {
      try {
        const { status, clientId, limit = 50, offset = 0 } = req.query;
        
        // Get all downloads from download manager
        let downloads = this.wsServer.downloadManager.getAllDownloads();
        
        // Apply filters
        if (status) {
          downloads = downloads.filter(d => d.status === status);
        }
        
        if (clientId) {
          downloads = downloads.filter(d => d.clientId === clientId);
        }
        
        // Sort by creation date (newest first)
        downloads.sort((a, b) => b.createdAt - a.createdAt);
        
        // Get total count before pagination
        const total = downloads.length;
        
        // Apply pagination
        const limitNum = parseInt(limit, 10);
        const offsetNum = parseInt(offset, 10);
        
        const paginatedDownloads = downloads.slice(offsetNum, offsetNum + limitNum);
        
        // Transform downloads for response (remove internal fields)
        const responseDownloads = paginatedDownloads.map(d => ({
          id: d.id,
          clientId: d.clientId,
          filePath: d.filePath,
          status: d.status,
          progress: d.progress,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
          completedAt: d.completedAt,
          fileSize: d.fileSize,
          totalChunks: d.totalChunks,
          chunksReceived: d.chunksReceived,
          error: d.error,
          duration: d.duration,
          finalFilePath: d.finalFilePath,
          finalFileSize: d.finalFileSize,
          checksumVerified: d.checksumVerified
        }));
        
        res.json({
          success: true,
          downloads: responseDownloads,
          total,
          limit: limitNum,
          offset: offsetNum
        });
      } catch (error) {
        logger.error('Error fetching downloads:', error);
        res.status(500).json({
          success: false,
          error: 'Internal server error'
        });
      }
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
