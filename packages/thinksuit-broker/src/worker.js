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
    flushAllSessionStreams,
    generateId,
    provisionWorkspace
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

// Provider credential metadata: which providerConfig key holds creds, what's
// required, and the env var that supplies it. Mirrors engine config.js so the
// worker can fill gaps from its own environment.
const PROVIDERS = {
    openai: { key: 'openai', required: (c) => !!c.apiKey, env: 'OPENAI_API_KEY' },
    anthropic: { key: 'anthropic', required: (c) => !!c.apiKey, env: 'ANTHROPIC_API_KEY' },
    'hugging-face': { key: 'huggingFace', required: (c) => !!c.apiKey, env: 'HF_TOKEN' },
    google: { key: 'google', required: (c) => !!c.projectId, env: 'GOOGLE_CLOUD_PROJECT' },
    onnx: { key: 'onnx', required: () => true, env: '' }
};

/**
 * Merge the worker's own environment into the client-supplied providerConfig.
 * Client-provided real values win; the environment fills gaps (undefined/empty).
 * This is what lets launchctl-setenv'd keys on the broker be used when a client
 * (e.g. the console LaunchAgent) has no keys of its own.
 */
function mergeProviderConfig(clientProviderConfig = {}) {
    const envConfig = {
        openai: { apiKey: process.env.OPENAI_API_KEY },
        anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
        google: {
            projectId: process.env.GOOGLE_CLOUD_PROJECT,
            location: process.env.GOOGLE_CLOUD_LOCATION || 'global'
        },
        huggingFace: { apiKey: process.env.HF_TOKEN },
        onnx: { dtype: process.env.ONNX_DTYPE || 'q4' }
    };

    const merged = {};
    for (const providerKey of Object.keys(envConfig)) {
        const out = { ...envConfig[providerKey] };
        const over = clientProviderConfig[providerKey] || {};
        for (const [k, v] of Object.entries(over)) {
            if (v !== undefined && v !== null && v !== '') out[k] = v;
        }
        merged[providerKey] = out;
    }
    return merged;
}

async function start(config) {
    if (started) return;
    started = true;

    const provider = config.provider || 'openai';
    const providerConfig = mergeProviderConfig(config.providerConfig);

    // Fail fast (before acquiring a session) when the selected provider has no
    // usable credential, so clients get an actionable error instead of a silent,
    // half-created session.
    const meta = PROVIDERS[provider];
    if (meta && !meta.required(providerConfig[meta.key] || {})) {
        send({
            type: 'error',
            reason:
                `No credential for provider '${provider}'. Set ${meta.env} in the broker's ` +
                `environment (run thinksuit-broker-service-setenv) or pass it in the run config.`
        });
        process.exit(1);
        return;
    }

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

    // Determine the sessionId up front (schedule would otherwise generate it) so
    // we can provision the workspace and anchor execution in it BEFORE the run
    // starts. `workdir` binds an explicit dir (resolved against the client's
    // invocation cwd); absent it, a fresh per-session workspace is provisioned.
    // Existing sessions reuse their workspace. The resolved workspace becomes the
    // engine `cwd`, which drives allowedDirectories + the filesystem MCP roots.
    const sessionId = config.sessionId || generateId();
    const workspace = await provisionWorkspace(sessionId, {
        workdir: config.workdir,
        baseCwd: config.cwd
    });

    const scheduleConfig = {
        ...config,
        sessionId,
        provider,
        providerConfig,
        cwd: workspace,
        modules,
        logger
    };
    delete scheduleConfig.modulesPackage; // schedule() takes loaded modules, not a path
    delete scheduleConfig.workdir; // resolved into cwd above

    const { scheduled, isNew, execution, interrupt, reason } = await schedule(scheduleConfig);

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
