#!/usr/bin/env node

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { startServer } from '../server/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = join(__dirname, '..');

const port = process.env.TTW_PORT || 60662;
const sslKeyPath = process.env.TTW_SSL_KEY || join(packageRoot, 'ssl/ttw.key');
const sslCertPath = process.env.TTW_SSL_CERT || join(packageRoot, 'ssl/ttw.crt');

console.log(`Starting ThinkSuit TTY service on port ${port}`);

try {
    startServer({
        port,
        sslKeyPath,
        sslCertPath,
        onReady: (address) => {
            console.log(`TTY service ready at wss://localhost:${address.port}`);
        }
    });
} catch (err) {
    console.error('Failed to start TTY service:', err);
    process.exit(1);
}
