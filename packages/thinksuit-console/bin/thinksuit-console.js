#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = join(__dirname, '..');

const args = process.argv.slice(2);
const port = args.find(arg => arg.startsWith('--port='))?.split('=')[1] || '5173';

console.log('Starting ThinkSuit Console...');
console.log(`Navigate to http://localhost:${port}`);

const child = spawn('npm', ['run', 'dev', '--', '--port', port], {
    cwd: packageRoot,
    stdio: 'inherit',
    shell: true
});

child.on('error', (err) => {
    console.error('Failed to start ThinkSuit Console:', err);
    process.exit(1);
});

child.on('exit', (code) => {
    process.exit(code);
});