#!/usr/bin/env node

import process from 'node:process';
import { createServiceLogger } from 'thinksuit-log';
import { createVoiceDaemon } from '../src/index.js';

const log = createServiceLogger('voice');

log.info({ event: 'voice.starting' }, 'Starting ThinkSuit voice service');

createVoiceDaemon()
    .then((daemon) => daemon.start())
    .catch((err) => {
        log.fatal({ event: 'voice.start.failed', error: err?.message }, 'Failed to start voice service');
        process.exit(1);
    });
