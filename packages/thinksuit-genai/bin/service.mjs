#!/usr/bin/env node

import process from 'node:process';
import { startGenaiServer } from '../src/server.js';
import { resolveSocketPath } from '../src/paths.js';

const socketPath = resolveSocketPath();

console.log(`Starting ThinkSuit genai service (socket: ${socketPath})`);

startGenaiServer({ socketPath }).catch((err) => {
    if (err && err.code === 'EADDRINUSE') {
        console.error(
            `genai socket ${socketPath} is already in use. Another genai service is likely running.`
        );
    } else {
        console.error('Failed to start genai service:', err);
    }
    process.exit(1);
});
