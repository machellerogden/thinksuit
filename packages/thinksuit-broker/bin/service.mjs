#!/usr/bin/env node

import process from 'node:process';
import { createServiceLogger } from 'thinksuit-log';
import { startBroker } from '../src/broker.js';
import { resolveSocketPath } from '../src/paths.js';

const log = createServiceLogger('broker');
const socketPath = resolveSocketPath();

log.info({ event: 'broker.starting', socketPath }, `Starting ThinkSuit broker service (socket: ${socketPath})`);

startBroker({ socketPath }).catch((err) => {
    if (err && err.code === 'EADDRINUSE') {
        log.fatal(
            { event: 'broker.start.failed', code: err.code, socketPath },
            `Broker socket ${socketPath} is already in use. Another broker is likely running.`
        );
    } else {
        log.fatal({ event: 'broker.start.failed', error: err?.message }, 'Failed to start broker service');
    }
    process.exit(1);
});
