#!/usr/bin/env node
const { program } = require('commander');
const chalk = require('chalk');
const ora = require('ora');
const ApiClient = require('./src/api-client');

program
  .name('silentmode')
  .version(require('./package.json').version)
  .description('File transfer CLI');

// Download command
program
  .command('download <clientId>')
  .description('Download a file from a client')
  .option('-f, --file-path <path>', 'File path on client')
  .option('-o, --output <path>', 'Output path on server')
  .option('-t, --timeout <ms>', 'Timeout in milliseconds', '30000')
  .option('-w, --watch', 'Watch progress in real-time')
  .option('--api-url <url>', 'API server URL', 'http://localhost:3000')
  .action(async (clientId, options) => {
    const api = new ApiClient(options.apiUrl);
    
    if (!options.filePath) {
      console.error(chalk.red('Error: --file-path is required'));
      process.exit(1);
    }

    try {
      // Initiate download
      const spinner = ora('Initiating download...').start();
      const initResponse = await api.initiateDownload(clientId, options.filePath, {
        outputPath: options.output,
        timeout: parseInt(options.timeout)
      });
      
      if (!initResponse.success) {
        spinner.fail('Failed to initiate download');
        console.error(chalk.red(initResponse.error));
        process.exit(1);
      }

      const requestId = initResponse.requestId;
      spinner.succeed(`Download initiated with ID: ${requestId}`);

      if (!options.watch) {
        console.log(chalk.green(`\nDownload started. Use 'silentmode downloads status ${requestId}' to check progress.`));
        return;
      }

      // Watch progress
      let lastStatus = null;
      const progressSpinner = ora('Checking progress...').start();
      
      const pollInterval = setInterval(async () => {
        try {
          const status = await api.getDownloadStatus(requestId);
          
          if (!status) {
            progressSpinner.fail('Download not found');
            clearInterval(pollInterval);
            return;
          }

          if (status.status !== lastStatus) {
            lastStatus = status.status;
            progressSpinner.text = `Status: ${status.status}`;
          }

          if (status.progress) {
            const { percentage, chunksReceived, totalChunks, bytesReceived } = status.progress;
            progressSpinner.text = `Progress: ${percentage.toFixed(1)}% (${chunksReceived}/${totalChunks} chunks, ${(bytesReceived / 1024 / 1024).toFixed(1)}MB)`;
          }

          if (status.status === 'completed') {
            progressSpinner.succeed(chalk.green('Download completed!'));
            console.log(chalk.gray(`Duration: ${status.duration}ms`));
            clearInterval(pollInterval);
          } else if (status.status === 'failed') {
            progressSpinner.fail(chalk.red('Download failed'));
            if (status.error) {
              console.error(chalk.red(`Error: ${status.error}`));
            }
            clearInterval(pollInterval);
          } else if (status.status === 'cancelled') {
            progressSpinner.warn(chalk.yellow('Download cancelled'));
            clearInterval(pollInterval);
          }
        } catch (error) {
          progressSpinner.fail(`Error checking progress: ${error.message}`);
          clearInterval(pollInterval);
        }
      }, 1000);

      // Handle Ctrl+C
      process.on('SIGINT', () => {
        progressSpinner.warn(chalk.yellow('\nStopping progress watch...'));
        clearInterval(pollInterval);
        console.log(chalk.gray(`Download ${requestId} is still running. Use 'silentmode downloads status ${requestId}' to check later.`));
        process.exit(0);
      });

    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// Subcommands added in other tasks

program.parse();
