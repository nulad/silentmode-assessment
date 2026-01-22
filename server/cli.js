#!/usr/bin/env node
const { program } = require('commander');

program
  .name('silentmode')
  .version(require('./package.json').version)
  .description('File transfer CLI');

// Subcommands added in other tasks

program.parse();
