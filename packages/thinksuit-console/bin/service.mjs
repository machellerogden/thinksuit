#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import process from 'node:process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = join(__dirname, '..');

const port = process.env.THINKSUIT_CONSOLE_PORT || '60660';
const host = process.env.THINKSUIT_CONSOLE_HOST || 'localhost';

console.log(`Starting ThinkSuit Console service on http://${host}:${port}`);

const child = spawn('npm', ['run', 'dev', '--', '--host', host, '--port', port], {
    cwd: packageRoot,
    stdio: 'inherit',
    shell: true
});

child.on('error', (err) => {
    console.error('Failed to start ThinkSuit Console:', err);
    process.exit(1);
});

child.on('exit', (code) => {
    console.log(`ThinkSuit Console exited with code ${code}`);
    process.exit(code || 0);
});

process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down...');
    child.kill('SIGTERM');
});

process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down...');
    child.kill('SIGINT');
});