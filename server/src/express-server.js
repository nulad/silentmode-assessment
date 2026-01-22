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
