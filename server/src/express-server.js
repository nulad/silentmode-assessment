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

    this.app.get('/api/v1/clients', (req, res) => {
      const { status } = req.query;
      let clients = this.wsServer.getConnectedClients();
      
      // Filter by status if provided
      if (status === 'connected') {
        clients = clients.filter(client => {
          const clientInfo = this.wsServer.clients.get(client.id);
          return clientInfo && clientInfo.ws.readyState === 1; // WebSocket.OPEN
        });
      }
      
      // Transform to match required response format
      const clientList = clients.map(client => {
        const clientInfo = this.wsServer.clients.get(client.id);
        return {
          clientId: client.registeredId || client.id,
          connectedAt: client.connectedAt.toISOString(),
          lastHeartbeat: clientInfo ? clientInfo.lastHeartbeat.toISOString() : client.connectedAt.toISOString(),
          status: clientInfo && clientInfo.ws.readyState === 1 ? 'connected' : 'disconnected',
          metadata: {
            ip: client.ip,
            internalId: client.id
          }
        };
      });
      
      res.json({
        success: true,
        clients: clientList,
        total: clientList.length
      });
    });

    this.app.get('/api/v1/clients/:clientId', (req, res) => {
      const { clientId } = req.params;
      const clients = this.wsServer.getConnectedClients();
      
      // Find the client with matching clientId
      const client = clients.find(c => (c.registeredId || c.id) === clientId);
      
      if (!client) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'CLIENT_NOT_FOUND',
            message: `Client with ID '${clientId}' not found`
          }
        });
      }
      
      const clientInfo = this.wsServer.clients.get(client.id);
      
      // Get download history for this client
      const downloadHistory = [];
      if (clientInfo && clientInfo.downloadHistory) {
        clientInfo.downloadHistory.forEach(download => {
          downloadHistory.push({
            requestId: download.requestId,
            filename: download.filename,
            status: download.status,
            createdAt: download.createdAt,
            completedAt: download.completedAt
          });
        });
      }
      
      res.json({
        success: true,
        client: {
          clientId: client.registeredId || client.id,
          connectedAt: client.connectedAt.toISOString(),
          lastHeartbeat: clientInfo ? clientInfo.lastHeartbeat.toISOString() : client.connectedAt.toISOString(),
          status: clientInfo && clientInfo.ws.readyState === 1 ? 'connected' : 'disconnected',
          metadata: {
            ip: client.ip,
            internalId: client.id
          },
          downloadHistory
        }
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
