#!/usr/bin/env node

import process from 'node:process';
import { createVoiceDaemon } from '../src/index.js';

console.log('Starting ThinkSuit voice service');

createVoiceDaemon()
    .then((daemon) => {
        daemon.start();
        const { phrase, deviceId } = daemon.config.wake;
        console.log(`Listening for wake word (phrase: ${phrase}, device: ${deviceId})`);
    })
    .catch((err) => {
        console.error('Failed to start voice service:', err);
        process.exit(1);
    });
