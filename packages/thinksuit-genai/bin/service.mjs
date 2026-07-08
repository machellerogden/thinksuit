#!/usr/bin/env node

import process from 'node:process';
import { createServiceLogger } from 'thinksuit-log';
import { startGenaiServer } from '../src/server.js';
import { resolveSocketPath } from '../src/paths.js';

const log = createServiceLogger('genai');
const socketPath = resolveSocketPath();

log.info({ event: 'genai.starting', socketPath }, `Starting ThinkSuit genai service (socket: ${socketPath})`);

startGenaiServer({ socketPath }).catch((err) => {
    if (err && err.code === 'EADDRINUSE') {
        log.fatal(
            { event: 'genai.start.failed', code: err.code, socketPath },
            `genai socket ${socketPath} is already in use. Another genai service is likely running.`
        );
    } else {
        log.fatal({ event: 'genai.start.failed', error: err?.message }, 'Failed to start genai service');
    }
    process.exit(1);
});
