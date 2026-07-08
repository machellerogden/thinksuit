#!/usr/bin/env node

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { createServiceLogger } from 'thinksuit-log';
import { startServer } from '../server/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = join(__dirname, '..');

const log = createServiceLogger('tty');

const port = process.env.THINKSUIT_TTY_PORT || 60662;
const sslKeyPath = process.env.THINKSUIT_TTY_SSL_KEY || join(packageRoot, 'ssl/thinksuit-tty.key');
const sslCertPath = process.env.THINKSUIT_TTY_SSL_CERT || join(packageRoot, 'ssl/thinksuit-tty.crt');

log.info({ event: 'tty.starting', port }, `Starting ThinkSuit TTY service on port ${port}`);

try {
    startServer({
        port,
        sslKeyPath,
        sslCertPath,
        onReady: (address) => {
            log.info({ event: 'tty.ready', port: address.port }, `TTY service ready at wss://localhost:${address.port}`);
        }
    });
} catch (err) {
    log.fatal({ event: 'tty.start.failed', error: err?.message }, 'Failed to start TTY service');
    process.exit(1);
}
