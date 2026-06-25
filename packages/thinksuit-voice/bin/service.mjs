#!/usr/bin/env node

import process from 'node:process';
import { createVoiceDaemon } from '../src/index.js';

console.log('Starting ThinkSuit voice service');

createVoiceDaemon()
    .then((daemon) => daemon.start())
    .catch((err) => {
        console.error('Failed to start voice service:', err);
        process.exit(1);
    });
