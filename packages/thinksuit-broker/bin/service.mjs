#!/usr/bin/env node

import process from 'node:process';
import { startBroker } from '../src/broker.js';
import { resolveSocketPath } from '../src/paths.js';

const socketPath = resolveSocketPath();

console.log(`Starting ThinkSuit broker service (socket: ${socketPath})`);

startBroker({ socketPath }).catch((err) => {
    if (err && err.code === 'EADDRINUSE') {
        console.error(
            `Broker socket ${socketPath} is already in use. Another broker is likely running.`
        );
    } else {
        console.error('Failed to start broker service:', err);
    }
    process.exit(1);
});
