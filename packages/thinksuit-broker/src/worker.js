#!/usr/bin/env node

/**
 * Broker execution worker.
 *
 * One worker process hosts exactly one turn. The broker forks this file, then
 * sends a `start` message carrying a serializable run config. The worker loads
 * its own modules (from `modulesPackage`, a string), schedules the execution,
 * and streams observation to the session JSONL via the session-router transport.
 *
 * Control flows back over the fork IPC channel:
 *   inbound:  { type: 'start', config }
 *             { type: 'interrupt', reason }
 *             { type: 'resolve-approval', approvalId, approved }
 *   outbound: { type: 'started', sessionId, isNew }
 *             { type: 'done', result }
 *             { type: 'error', reason }      (could not schedule)
 *             { type: 'failed', error }      (threw mid-execution)
 *
 * Crash isolation is structural: a thrown error or process death affects only
 * this worker, never the broker.
 */

import { join } from 'node:path';
import process from 'node:process';
import {
    schedule,
    createLogger,
    loadModules,
    resolveApproval,
    flushAllSessionStreams
} from 'thinksuit';
import { modules as defaultModules } from 'thinksuit-modules';

let interruptFn = null;
let started = false;

function send(message) {
    if (process.send) process.send(message);
}

async function flushSafe() {
    try {
        await flushAllSessionStreams();
    } catch {
        // Best-effort flush; never block exit on a flush failure.
    }
}

function serializeResult(result) {
    if (!result || typeof result !== 'object') {
        return { success: false, response: null, error: 'No result' };
    }
    return {
        success: result.success ?? !result.error,
        response: result.response ?? null,
        error: result.error ?? null
    };
}

async function start(config) {
    if (started) return;
    started = true;

    // Resolve modules from the package string the broker forwarded.
    let modules;
    if (config.modulesPackage) {
        const basePath = config.cwd || process.cwd();
        const resolvedPath = config.modulesPackage.startsWith('/')
            ? config.modulesPackage
            : join(basePath, config.modulesPackage);
        modules = await loadModules(resolvedPath);
    } else {
        modules = defaultModules;
    }

    // Headless logger: JSON to stdout (captured by the broker) plus session
    // JSONL via the session-router transport — the cross-process observation
    // channel every client reads.
    const logger = createLogger({
        level: 'info',
        silent: false,
        trace: config.trace,
        session: true,
        format: 'json'
    });

    const scheduleConfig = { ...config, modules, logger };
    delete scheduleConfig.modulesPackage; // schedule() takes loaded modules, not a path

    const { sessionId, scheduled, isNew, execution, interrupt, reason } =
        await schedule(scheduleConfig);

    if (!scheduled) {
        send({ type: 'error', reason });
        await flushSafe();
        process.exit(1);
        return;
    }

    interruptFn = interrupt;
    send({ type: 'started', sessionId, isNew });

    try {
        const result = await execution;
        await flushSafe();
        send({ type: 'done', result: serializeResult(result) });
        process.exit(result?.error ? 1 : 0);
    } catch (err) {
        await flushSafe();
        send({ type: 'failed', error: err?.message ?? String(err) });
        process.exit(1);
    }
}

process.on('message', (msg) => {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
        case 'start':
            start(msg.config).catch(async (err) => {
                await flushSafe();
                send({ type: 'failed', error: err?.message ?? String(err) });
                process.exit(1);
            });
            break;
        case 'interrupt':
            if (interruptFn) interruptFn(msg.reason || 'Interrupted via broker');
            break;
        case 'resolve-approval':
            resolveApproval(msg.approvalId, msg.approved);
            break;
        default:
            break;
    }
});

// If the parent dies, take the worker down with it rather than orphaning the run.
process.on('disconnect', () => process.exit(1));
