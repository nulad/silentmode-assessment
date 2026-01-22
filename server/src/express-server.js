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
    this.app.post('/api/v1/downloads', async (req, res) => {
      const { clientId, filePath, outputPath, timeout } = req.body;
      
      if (!clientId || !filePath) {
        return res.status(400).json({
          success: false,
          error: 'clientId and filePath are required'
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
      
      try {
        // Create download request
        const requestId = this.wsServer.downloadManager.createDownload(clientId, filePath, null, null);
        
        // Send DOWNLOAD_REQUEST to client
        this.wsServer.sendToClient(clientId, {
          type: 'DOWNLOAD_REQUEST',
          requestId,
          filePath,
          outputPath: outputPath || null,
          timeout: timeout || 30000
        });
        
        logger.info(`Initiated download ${requestId} for client ${clientId}, file: ${filePath}`);
        
        res.status(202).json({
          success: true,
          requestId,
          status: 'pending'
        });
      } catch (error) {
        logger.error('Error initiating download:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to initiate download'
        });
      }
    });

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
    });

    this.app.delete('/api/v1/downloads/:requestId', async (req, res) => {
      const { requestId } = req.params;
      const download = this.wsServer.downloadManager.getDownload(requestId);
      
      if (!download) {
        return res.status(404).json({
          success: false,
          error: 'Download not found'
        });
      }
      
      // Cannot cancel completed downloads
      if (download.status === 'completed' || download.status === 'failed') {
        return res.status(409).json({
          success: false,
          error: 'Cannot cancel completed download'
        });
      }
      
      try {
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
        
      } catch (error) {
        logger.error(`Error cancelling download ${requestId}:`, error);
        res.status(500).json({
          success: false,
          error: 'Failed to cancel download'
        });
      }
    });

    this.app.post('/api/v1/downloads', async (req, res) => {
      const { clientId, filePath, output, timeout = 30000 } = req.body;
      
      if (!clientId || !filePath) {
        return res.status(400).json({
          success: false,
          error: 'clientId and filePath are required'
        });
      }
      
      try {
        // Generate a unique request ID
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Create download in manager
        this.wsServer.downloadManager.createDownload(clientId, filePath, requestId, 'cli');
        
        // Find the target client
        let targetClientId = null;
        for (const [cid, client] of this.wsServer.clients.entries()) {
          if (client.registeredId === clientId) {
            targetClientId = cid;
            break;
          }
        }
        
        if (!targetClientId) {
          logger.error(`Target client ${clientId} not found`);
          this.wsServer.downloadManager.failDownload(requestId, new Error('Client not found'));
          return res.status(404).json({
            success: false,
            error: 'Client not found'
          });
        }
        
        // Send DOWNLOAD_REQUEST to target client
        const success = this.wsServer.sendToClient(targetClientId, {
          type: 'DOWNLOAD_REQUEST',
          requestId: requestId,
          clientId: clientId,
          filePath: filePath
        });
        
        if (!success) {
          logger.error(`Failed to send DOWNLOAD_REQUEST to client ${clientId}`);
          this.wsServer.downloadManager.failDownload(requestId, new Error('Failed to contact client'));
          return res.status(500).json({
            success: false,
            error: 'Failed to contact client'
          });
        }
        
        logger.info(`Download request ${requestId} sent to client ${clientId} for file: ${filePath}`);
        
        res.json({
          success: true,
          requestId: requestId,
          status: 'pending',
          message: 'Download request sent'
        });
        
      } catch (error) {
        logger.error(`Error creating download request:`, error);
        res.status(500).json({
          success: false,
          error: 'Failed to create download request'
        });
      }
    });

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
