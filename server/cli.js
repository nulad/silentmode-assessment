#!/usr/bin/env node
const { program } = require('commander');
const axios = require('axios');
const ora = require('ora');
const chalk = require('chalk');
const Table = require('cli-table3');
const cliProgress = require('cli-progress');

const API_BASE = process.env.SERVER_URL || 'http://localhost:3000/api/v1';

program
  .name('silentmode')
  .version(require('./package.json').version)
  .description('File transfer CLI');

// Download command
program
  .command('download')
  .description('Download a file from a client')
  .argument('<clientId>', 'Client ID to download from')
  .option('-f, --file-path <path>', 'File path on client')
  .option('-o, --output <path>', 'Output path on server (optional)')
  .option('-t, --timeout <ms>', 'Timeout in milliseconds', '30000')
  .option('-w, --watch', 'Watch progress in real-time', false)
  .action(async (clientId, options) => {
    if (!options.filePath) {
      console.error(chalk.red('Error: --file-path is required'));
      process.exit(1);
    }

    const serverUrl = process.env.SERVER_URL || 'http://localhost:3000';
    let spinner;

    try {
      // Step 1: Initiate download
      spinner = ora('Initiating download...').start();
      
      const response = await axios.post(`${serverUrl}/api/v1/downloads`, {
        clientId,
        filePath: options.filePath,
        output: options.output,
        timeout: parseInt(options.timeout)
      });

      if (!response.data.success) {
        spinner.fail('Failed to initiate download');
        console.error(chalk.red('Error:', response.data.error));
        console.error(chalk.red(response.data.error));
        process.exit(1);
      }
      
      const requestId = response.data.requestId;
      spinner.succeed(`Download initiated: ${requestId}`);
      
      if (options.watch) {
        // Poll for progress
        const progressSpinner = ora('Checking progress...').start();
        let lastProgress = 0;
        
        const pollInterval = setInterval(async () => {
          try {
            const statusResponse = await axios.get(`${serverUrl}/api/v1/downloads/${requestId}`);
            const download = statusResponse.data;
            
            if (!download.success) {
              progressSpinner.fail('Failed to get download status');
              clearInterval(pollInterval);
              console.error(chalk.red(download.error));
              process.exit(1);
            }
            
            const progress = download.progress.percentage || 0;
            const status = download.status;
            
            if (progress !== lastProgress) {
              progressSpinner.text = `Progress: ${progress}% (${download.progress.chunksReceived}/${download.progress.totalChunks} chunks)`;
              lastProgress = progress;
            }
            
            if (status === 'completed') {
              progressSpinner.succeed(chalk.green('Download completed!'));
              console.log(chalk.green(`\n✓ File downloaded successfully`));
              console.log(`  Duration: ${download.duration}ms`);
              console.log(`  Size: ${(download.progress.bytesReceived / (1024 * 1024)).toFixed(2)} MB`);
              clearInterval(pollInterval);
              process.exit(0);
            } else if (status === 'failed') {
              progressSpinner.fail(chalk.red('Download failed'));
              console.error(chalk.red(download.error));
              clearInterval(pollInterval);
              process.exit(1);
            } else if (status === 'cancelled') {
              progressSpinner.warn(chalk.yellow('Download cancelled'));
              clearInterval(pollInterval);
              process.exit(0);
            }
          } catch (error) {
            progressSpinner.fail('Error checking progress');
            console.error(chalk.red(error.message));
            clearInterval(pollInterval);
            process.exit(1);
          }
        }, 1000);
        
        // Auto-stop polling after timeout
        setTimeout(() => {
          clearInterval(pollInterval);
          progressSpinner.warn(chalk.yellow(`\nDownload still in progress. Use:\n  silentmode downloads status ${requestId}\nto check status later.`));
          process.exit(0);
        }, parseInt(options.timeout));
      } else {
        console.log(chalk.blue(`\nDownload started. Use:\n  silentmode downloads status ${requestId}\nto check status.`));
      }
      
    } catch (error) {
      if (error.response) {
        console.error(chalk.red(`Error: ${error.response.data.error || error.response.statusText}`));
      } else {
        console.error(chalk.red(`Error: ${error.message}`));
      }
      process.exit(1);
    }
  });

// Clients commands
const clientsCmd = program.command('clients');

clientsCmd
  .command('list')
  .description('List all connected clients')
  .option('-s, --status <status>', 'Filter by status (connected)')
  .action(async (options) => {
    try {
      const spinner = ora('Fetching clients...').start();
      const response = await axios.get(`${API_BASE}/clients`, {
        params: { status: options.status }
      });
      
      spinner.stop();
      
      if (!response.data.success) {
        console.error(chalk.red('Error:', response.data.error));
        process.exit(1);
      }
      
      if (response.data.clients.length === 0) {
        console.log(chalk.yellow('No clients found.'));
        return;
      }
      
      const table = new Table({
        head: [chalk.cyan('Client ID'), chalk.cyan('Connected At'), chalk.cyan('Last Heartbeat'), chalk.cyan('Status')],
        colWidths: [30, 25, 25, 15]
      });
      
      response.data.clients.forEach(client => {
        const status = client.status === 'connected' ? chalk.green('● ' + client.status) : chalk.red('● ' + client.status);
        table.push([
          client.clientId,
          new Date(client.connectedAt).toLocaleString(),
          new Date(client.lastHeartbeat).toLocaleString(),
          status
        ]);
      });
      
      console.log(table.toString());
      console.log(chalk.gray(`\nTotal: ${response.data.total} clients`));
      
    } catch (error) {
      if (error.response) {
        console.error(chalk.red(`Error: ${error.response.data.error || error.response.statusText}`));
      } else {
        console.error(chalk.red(`Error: ${error.message}`));
      }
      process.exit(1);
    }
  });

clientsCmd
  .command('get <clientId>')
  .description('Get details of a specific client')
  .option('-f, --format <fmt>', 'Output format (table|json)', 'table')
  .action(async (clientId, options) => {
    try {
      const spinner = ora('Fetching client details...').start();
      const response = await axios.get(`${API_BASE}/clients/${clientId}`);
      
      spinner.stop();
      
      if (!response.data.success) {
        console.error(chalk.red('Error:', response.data.error));
        process.exit(1);
      }
      
      const client = response.data.client;
      
      if (options.format === 'json') {
        console.log(JSON.stringify(client, null, 2));
      } else {
        const table = new Table();
        table.push(
          { [chalk.cyan('Client ID')]: client.clientId },
          { [chalk.cyan('Connected At')]: new Date(client.connectedAt).toLocaleString() },
          { [chalk.cyan('Last Heartbeat')]: new Date(client.lastHeartbeat).toLocaleString() },
          { [chalk.cyan('Status')]: client.status === 'connected' ? chalk.green(client.status) : chalk.red(client.status) }
        );
        
        console.log(table.toString());
      }
      
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.error(chalk.red(`Client ${clientId} not found.`));
      } else if (error.response) {
        console.error(chalk.red(`Error: ${error.response.data.error || error.response.statusText}`));
      } else {
        console.error(chalk.red(`Error: ${error.message}`));
      }
      process.exit(1);
    }
  });

// Downloads commands
const downloadsCmd = program.command('downloads');

downloadsCmd
  .command('list')
  .description('List all downloads')
  .option('-s, --status <status>', 'Filter by status (pending, in_progress, completed, failed, cancelled)')
  .action(async (options) => {
    console.log(chalk.yellow('Downloads list endpoint not yet implemented in server.'));
    console.log(chalk.gray('This will be available when the server maintains a download history.'));
  });

downloadsCmd
  .command('status <requestId>')
  .description('Get status of a specific download')
  .option('-w, --watch', 'Watch progress in real-time', false)
  .action(async (requestId, options) => {
    const serverUrl = process.env.SERVER_URL || 'http://localhost:3000';
    
    try {
      if (options.watch) {
        const progressBar = new cliProgress.SingleBar({
          format: chalk.cyan('Progress') + ' |{bar}| {percentage}% | {value}/{total} Chunks | {speed}',
          barCompleteChar: '\u2588',
          barIncompleteChar: '\u2591',
          hideCursor: true
        });
        
        let progressBarStarted = false;
        
        const pollInterval = setInterval(async () => {
          try {
            const response = await axios.get(`${serverUrl}/api/v1/downloads/${requestId}`);
            const download = response.data;
            
            if (!download.success) {
              console.error(chalk.red('Error:', download.error));
              clearInterval(pollInterval);
              process.exit(1);
            }
            
            if (!progressBarStarted && download.progress.totalChunks > 0) {
              progressBar.start(download.progress.totalChunks, download.progress.chunksReceived, { speed: '0 MB/s' });
              progressBarStarted = true;
            }
            
            if (progressBarStarted) {
              progressBar.update(download.progress.chunksReceived, { 
                speed: `${((download.progress.bytesReceived / 1024 / 1024) / ((Date.now() - new Date(download.startedAt).getTime()) / 1000)).toFixed(2)} MB/s` 
              });
            }
            
            if (download.status === 'completed') {
              if (progressBarStarted) progressBar.stop();
              console.log(chalk.green('\n✓ Download completed!'));
              console.log(`  Duration: ${download.duration}ms`);
              console.log(`  Size: ${(download.progress.bytesReceived / (1024 * 1024)).toFixed(2)} MB`);
              if (download.retryStats.totalRetries > 0) {
                console.log(`  Retries: ${download.retryStats.totalRetries}`);
                console.log(`  Retry Success Rate: ${(download.retryStats.retrySuccessRate * 100).toFixed(1)}%`);
              }
              clearInterval(pollInterval);
              process.exit(0);
            } else if (download.status === 'failed') {
              if (progressBarStarted) progressBar.stop();
              console.error(chalk.red('\n✗ Download failed'));
              console.error(chalk.red(download.error));
              clearInterval(pollInterval);
              process.exit(1);
            } else if (download.status === 'cancelled') {
              if (progressBarStarted) progressBar.stop();
              console.log(chalk.yellow('\n⚠ Download cancelled'));
              clearInterval(pollInterval);
              process.exit(0);
            }
          } catch (error) {
            if (progressBarStarted) progressBar.stop();
            console.error(chalk.red('Error checking progress:', error.message));
            clearInterval(pollInterval);
            process.exit(1);
          }
        }, 1000);
        
        process.on('SIGINT', () => {
          if (progressBarStarted) progressBar.stop();
          console.log('\nStopped watching download progress.');
          clearInterval(pollInterval);
          process.exit(0);
        });
        
      } else {
        const spinner = ora('Fetching download status...').start();
        const response = await axios.get(`${serverUrl}/api/v1/downloads/${requestId}`);
        
        spinner.stop();
        
        if (!response.data.success) {
          console.error(chalk.red('Error:', response.data.error));
          process.exit(1);
        }
        
        const download = response.data;
        const table = new Table();
        
        table.push(
          { [chalk.cyan('Request ID')]: download.requestId },
          { [chalk.cyan('Client ID')]: download.clientId },
          { [chalk.cyan('Status')]: getStatusColored(download.status) },
          { [chalk.cyan('Progress')]: `${download.progress.chunksReceived}/${download.progress.totalChunks} chunks (${download.progress.percentage}%)` },
          { [chalk.cyan('Size')]: `${(download.progress.bytesReceived / (1024 * 1024)).toFixed(2)} MB` }
        );
        
        if (download.startedAt) {
          table.push({ [chalk.cyan('Started At')]: new Date(download.startedAt).toLocaleString() });
        }
        
        if (download.completedAt) {
          table.push(
            { [chalk.cyan('Completed At')]: new Date(download.completedAt).toLocaleString() },
            { [chalk.cyan('Duration')]: `${download.duration}ms` }
          );
        }
        
        if (download.retryStats.totalRetries > 0) {
          table.push(
            { [chalk.cyan('Total Retries')]: download.retryStats.totalRetries },
            { [chalk.cyan('Retry Success Rate')]: `${(download.retryStats.retrySuccessRate * 100).toFixed(1)}%` }
          );
        }
        
        if (download.error) {
          table.push({ [chalk.cyan('Error')]: chalk.red(download.error) });
        }
        
        console.log(table.toString());
      }
      
    } catch (error) {
      if (error.response) {
        console.error(chalk.red(`Error: ${error.response.data.error || error.response.statusText}`));
      } else {
        console.error(chalk.red(`Error: ${error.message}`));
      }
      process.exit(1);
    }
  });

downloadsCmd
  .command('cancel <requestId>')
  .description('Cancel a download')
  .action(async (requestId) => {
    try {
      const spinner = ora('Cancelling download...').start();
      const response = await axios.delete(`${API_BASE}/downloads/${requestId}`);
      
      spinner.stop();
      
      if (!response.data.success) {
        console.error(chalk.red('Error:', response.data.error));
        process.exit(1);
      }
      
      console.log(chalk.green(`✓ Download ${requestId} cancelled successfully`));
      
    } catch (error) {
      if (error.response) {
        console.error(chalk.red(`Error: ${error.response.data.error || error.response.statusText}`));
      } else {
        console.error(chalk.red(`Error: ${error.message}`));
      }
      process.exit(1);
    }
  });

// Health command
program
  .command('health')
  .description('Check server health')
  .option('-v, --verbose', 'Show detailed health information')
  .action(async (options) => {
    try {
      const spinner = ora('Checking server health...').start();
      const response = await axios.get(`${API_BASE}/health`);
      
      spinner.stop();
      
      if (!response.data.success) {
        console.error(chalk.red('Server is unhealthy'));
        process.exit(1);
      }
      
      const health = response.data;
      const table = new Table();
      
      table.push(
        { [chalk.cyan('Status')]: chalk.green('Healthy') },
        { [chalk.cyan('Uptime')]: `${health.uptime}ms` },
        { [chalk.cyan('Memory Used')]: `${Math.round(health.memoryUsed / 1024 / 1024)} MB` },
        { [chalk.cyan('Active Downloads')]: health.activeDownloads },
        { [chalk.cyan('Version')]: health.version }
      );
      
      console.log(table.toString());
      
      if (options.verbose) {
        console.log(chalk.gray('\nDetailed information:'));
        console.log(JSON.stringify(health, null, 2));
      }
      
    } catch (error) {
      if (error.response) {
        console.error(chalk.red(`Error: ${error.response.data.error || error.response.statusText}`));
      } else {
        console.error(chalk.red(`Error: ${error.message}`));
      }
      process.exit(1);
    }
  });

// Helper function for colored status
function getStatusColored(status) {
  switch (status) {
    case 'completed': return chalk.green(status);
    case 'failed': return chalk.red(status);
    case 'cancelled': return chalk.yellow(status);
    case 'in_progress': return chalk.blue(status);
    case 'pending': return chalk.gray(status);
    default: return status;
  }
}

program.parse();
