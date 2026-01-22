#!/usr/bin/env node
const { program } = require('commander');
const axios = require('axios');
const ora = require('ora');
const chalk = require('chalk');

const API_BASE = process.env.SERVER_URL || 'http://localhost:3001/api/v1';

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

    const serverUrl = process.env.SERVER_URL || 'http://localhost:3001';
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
            const statusResponse = await axios.get(`${serverUrl}/downloads/${requestId}`);
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
            } else if (status === 'failed') {
              progressSpinner.fail(chalk.red('Download failed'));
              console.error(chalk.red(download.error));
              clearInterval(pollInterval);
              process.exit(1);
            } else if (status === 'cancelled') {
              progressSpinner.warn(chalk.yellow('Download cancelled'));
              clearInterval(pollInterval);
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

// Clients command group
const clientsCmd = program
  .command('clients')
  .description('Manage clients');

// Clients get command
clientsCmd
  .command('get')
  .description('Get specific client details')
  .argument('<clientId>', 'Client ID to retrieve')
  .option('-f, --format <fmt>', 'Output format (table|json)', 'table')
  .action(async (clientId, options) => {
    const spinner = ora('Fetching client details...').start();
    
    try {
      const response = await axios.get(`${API_BASE}/clients/${clientId}`);
      
      if (!response.data.success) {
        spinner.fail('Failed to fetch client');
        console.error(chalk.red('Error:', response.data.error));
        process.exit(1);
      }
      
      spinner.succeed('Client retrieved');
      
      const client = response.data.client;
      
      if (options.format === 'json') {
        console.log(JSON.stringify(client, null, 2));
      } else {
        // Table format
        console.log(chalk.bold('\nClient Details:'));
        console.log(`  Client ID:      ${chalk.cyan(client.clientId)}`);
        console.log(`  Connection ID:  ${chalk.gray(client.connectionId)}`);
        console.log(`  Status:         ${chalk.green(client.status)}`);
        console.log(`  Connected At:   ${client.connectedAt}`);
        console.log(`  Last Heartbeat: ${client.lastHeartbeat}`);
        
        if (Object.keys(client.metadata).length > 0) {
          console.log(chalk.bold('\nMetadata:'));
          Object.entries(client.metadata).forEach(([key, value]) => {
            console.log(`  ${key}: ${value}`);
          });
        }
      }
      
    } catch (error) {
      if (error.response && error.response.status === 404) {
        spinner.fail('Client not found');
        console.error(chalk.red(`Client '${clientId}' is not connected or does not exist`));
      } else if (error.response) {
        spinner.fail('Failed to fetch client');
        console.error(chalk.red(`Error: ${error.response.data.error || error.response.statusText}`));
      } else {
        spinner.fail('Connection error');
        console.error(chalk.red(`Error: ${error.message}`));
      }
      process.exit(1);
    }
  });

// Subcommands added in other tasks

program.parse();
