#!/usr/bin/env node

import { Command } from 'commander';
import { initiate } from './cli/initiate';

const program = new Command();

program
    .name('treasury-funds')
    .description('Treasury funds CLI tool')
    .version('1.0.0');

program
    .command('initiate')
    .description('Initiate treasury and vendor contracts')
    .action(async () => {
        await initiate()
    });

program.parse(process.argv);