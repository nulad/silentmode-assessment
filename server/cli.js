#!/usr/bin/env node
const { program } = require('commander');
const http = require('http');
const Table = require('cli-table3');

// Helper function to make HTTP requests
function makeRequest(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
        } catch (err) {
          reject(new Error(`Failed to parse response: ${err.message}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Connection failed: ${err.message}`));
    });

    req.end();
  });
}

program
  .name('silentmode')
  .version(require('./package.json').version)
  .description('File transfer CLI');

// Clients command
const clients = program.command('clients')
  .description('Manage connected clients');

clients
  .command('list')
  .description('List connected clients')
  .option('-s, --status <status>', 'Filter by status')
  .option('-f, --format <format>', 'Output format (table|json)', 'table')
  .action(async (options) => {
    try {
      let path = '/api/v1/clients';
      if (options.status) {
        path += `?status=${encodeURIComponent(options.status)}`;
      }

      const response = await makeRequest(path);

      if (response.statusCode !== 200) {
        console.error('Error:', response.data.error || 'Failed to fetch clients');
        process.exit(1);
      }

      if (!response.data || !response.data.clients) {
        console.error('Error: Invalid response format from server');
        process.exit(1);
      }

      const clientsData = response.data.clients;

      if (options.format === 'json') {
        console.log(JSON.stringify(clientsData, null, 2));
      } else {
        // Table format
        const table = new Table({
          head: ['Client ID', 'Status', 'Connected At', 'Last Heartbeat'],
          colWidths: [40, 12, 28, 28]
        });

        if (clientsData.length === 0) {
          console.log('No clients found');
        } else {
          clientsData.forEach(client => {
            table.push([
              client.clientId,
              client.status,
              new Date(client.connectedAt).toLocaleString(),
              new Date(client.lastHeartbeat).toLocaleString()
            ]);
          });
          console.log(table.toString());
        }
      }
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  });

// Subcommands added in other tasks

program.parse();
