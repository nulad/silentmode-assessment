const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const logger = require('./utils/logger');
const config = require('./config');
const { v4: uuidv4 } = require('uuid');

class ExpressServer {
  constructor(wsServer) {
    this.app = express();
    this.wsServer = wsServer;
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    // Security middleware
    this.app.use(helmet());
    
    // CORS middleware
    this.app.use(cors());
    
    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // Request logging
    this.app.use((req, res, next) => {
      logger.debug(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      next();
    });
  }

  setupRoutes() {
    // Health check endpoint
    this.app.get('/api/v1/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    // List connected clients
    this.app.get('/api/v1/clients', (req, res) => {
      const clients = Array.from(this.wsServer.clients.values()).map(client => ({
        clientId: client.id,
        ip: client.ip,
        connectedAt: client.connectedAt,
        lastHeartbeat: client.lastHeartbeat
      }));
      
      res.json({
        success: true,
        clients
      });
    });

    // List downloads
    this.app.get('/api/v1/downloads', (req, res) => {
      const downloads = this.wsServer.downloadManager.getAllDownloads();
      
      res.json({
        success: true,
        downloads: downloads.map(d => ({
          requestId: d.id,
          clientId: d.clientId,
          filePath: d.filePath,
          status: d.status,
          progress: d.progress,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt
        }))
      });
    });

    // Initiate download
    this.app.post('/api/v1/downloads', (req, res) => {
      const { clientId, filePath } = req.body;

      // Validation
      if (!clientId || !filePath) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: clientId, filePath'
        });
      }

      // Check if client is connected
      const client = this.wsServer.clients.get(clientId);
      if (!client) {
        return res.status(404).json({
          success: false,
          error: 'Client not connected'
        });
      }

      // Check if download already exists for this client and file
      const existingDownloads = this.wsServer.downloadManager.getAllDownloads()
        .filter(d => d.clientId === clientId && d.filePath === filePath && 
                    (d.status === 'pending' || d.status === 'in_progress'));
      
      if (existingDownloads.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'Download already in progress',
          requestId: existingDownloads[0].id
        });
      }

      // Create download request
      const requestId = uuidv4();
      this.wsServer.downloadManager.createDownload(clientId, filePath, requestId);

      // Send DOWNLOAD_REQUEST to client
      const message = {
        type: 'DOWNLOAD_REQUEST',
        requestId: requestId,
        filePath: filePath
      };

      if (this.wsServer.sendToClient(clientId, message)) {
        logger.info(`Download request sent to client ${clientId} for file: ${filePath}`);
        
        res.status(202).json({
          success: true,
          requestId: requestId,
          clientId: clientId,
          filePath: filePath,
          status: 'pending'
        });
      } else {
        // Failed to send message to client
        this.wsServer.downloadManager.failDownload(requestId, new Error('Failed to send message to client'));
        
        res.status(500).json({
          success: false,
          error: 'Failed to communicate with client'
        });
      }
    });

    // Get download status
    this.app.get('/api/v1/downloads/:requestId', (req, res) => {
      const { requestId } = req.params;
      const download = this.wsServer.downloadManager.getDownload(requestId);
      
      if (!download) {
        return res.status(404).json({
          success: false,
          error: 'Download not found'
        });
      }

      res.json({
        success: true,
        download: {
          requestId: download.id,
          clientId: download.clientId,
          filePath: download.filePath,
          status: download.status,
          progress: download.progress,
          totalChunks: download.totalChunks,
          chunksReceived: download.chunksReceived,
          createdAt: download.createdAt,
          updatedAt: download.updatedAt,
          error: download.error
        }
      });
    });

    // Cancel download
    this.app.delete('/api/v1/downloads/:requestId', (req, res) => {
      const { requestId } = req.params;
      const download = this.wsServer.downloadManager.getDownload(requestId);
      
      if (!download) {
        return res.status(404).json({
          success: false,
          error: 'Download not found'
        });
      }

      if (download.status === 'completed' || download.status === 'failed' || download.status === 'cancelled') {
        return res.status(400).json({
          success: false,
          error: `Cannot cancel download in status: ${download.status}`
        });
      }

      // Send CANCEL_DOWNLOAD to client
      const message = {
        type: 'CANCEL_DOWNLOAD',
        requestId: requestId,
        reason: 'Cancelled via API'
      };

      this.wsServer.sendToClient(download.clientId, message);
      this.wsServer.downloadManager.cancelDownload(requestId, 'Cancelled via API');

      res.json({
        success: true,
        message: 'Download cancelled'
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found'
      });
    });

    // Error handler
    this.app.use((err, req, res, next) => {
      logger.error('Express error:', err);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    });
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(config.PORT, (err) => {
        if (err) {
          reject(err);
        } else {
          logger.info(`Express server listening on port ${config.PORT}`);
          resolve();
        }
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('Express server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = ExpressServer;
