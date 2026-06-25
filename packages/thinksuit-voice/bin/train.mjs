#!/usr/bin/env node

// Detached training worker. The console spawns this with `<name> <runId>`,
// detached and unref'd, so a ~50-minute run owns its own lifecycle and survives
// a console restart. It wraps trainTrigger() (which registers the exported model
// as a new version on success) and records everything to the trigger's run-log,
// so progress and the final result are durable, inspectable artifacts. On a first
// train (no promoted version yet) it auto-promotes so the trigger is immediately
// usable; a re-train registers a version but leaves promotion to the user.

import process from 'node:process';
import * as store from '../src/wakewords/store.js';
import { trainTrigger } from '../src/wakewords/trainer.js';

const [name, runId] = process.argv.slice(2);

if (!name || !runId) {
    console.error('usage: train.mjs <name> <runId>');
    process.exit(2);
}

function log(entry) {
    store.appendRunLog(name, runId, { ts: new Date().toISOString(), ...entry });
}

async function main() {
    // Record the pid so the console can detect a worker that died without writing
    // a terminal event (otherwise the run-log would read "running" forever).
    log({ event: 'started', name, pid: process.pid });
    try {
        // train.py's JSONL events (start / phase / done) are logged verbatim so the
        // console can key progress off the `phase` events; the worker owns the
        // terminal `complete` / `error` markers below.
        const { version, metrics } = await trainTrigger(name, {
            onProgress: (msg) => log(msg)
        });

        // First train → make it usable immediately. A re-train leaves the
        // currently promoted version in place for the user to compare/promote.
        let promoted = false;
        if (!store.readManifest(name).current) {
            store.promote(name, version);
            promoted = true;
        }

        log({ event: 'complete', version, metrics, promoted });
    } catch (err) {
        log({ event: 'error', message: err.message });
        process.exit(1);
    }
}

main();
