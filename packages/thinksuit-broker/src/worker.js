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
    provisionWorkspace,
    resolveSecret
} from 'thinksuit';
import { modules as defaultModules } from 'thinksuit-modules';
import { assertValidTurnRequest } from 'thinksuit/schemas/validate';
import { getFrame } from 'thinksuit/frames';

let interruptFn = null;
let started = false;

// Project the serializable broker payload down to the surface turnRequest for
// validation. Transport bits the worker needs (modulesPackage, workdir,
// providerConfig) are intentionally excluded — they are not part of the contract.
// The allow-list rides as `allowedTools` on the wire but is `tools` in the contract.
function toTurnRequest(config) {
    const r = {};
    const tools = config.tools ?? config.allowedTools;
    const surface = {
        input: config.input,
        sessionId: config.sessionId,
        module: config.module,
        provider: config.provider,
        model: config.model,
        policy: config.policy,
        plan: config.plan,
        frame: config.frame,
        modality: config.modality,
        tools,
        workdir: config.workdir,
        cwd: config.cwd,
        allowedDirectories: config.allowedDirectories,
        mcpServers: config.mcpServers,
        autoApproveTools: config.autoApproveTools,
        trace: config.trace,
        output: config.output
    };
    for (const [k, v] of Object.entries(surface)) {
        // Omit null as well as undefined: a nullish optional is "absent", not a
        // wire value (e.g. the REPL sends `frame: null` for no frame).
        if (v != null) r[k] = v;
    }
    return r;
}

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
 * Merge broker-resolved provider credentials into the client-supplied
 * providerConfig. Client-provided real values win; resolveSecret fills the gaps
 * (from the environment or ~/.thinksuit/secrets.env), so a client that carries no
 * keys of its own (e.g. the console) still runs.
 */
function mergeProviderConfig(clientProviderConfig = {}) {
    const envConfig = {
        openai: { apiKey: resolveSecret('OPENAI_API_KEY') },
        anthropic: { apiKey: resolveSecret('ANTHROPIC_API_KEY') },
        google: {
            projectId: process.env.GOOGLE_CLOUD_PROJECT,
            location: process.env.GOOGLE_CLOUD_LOCATION || 'global'
        },
        huggingFace: { apiKey: resolveSecret('HF_TOKEN') },
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

    // Door: validate the turn request (IN contract) before any session work, so a
    // malformed request fails fast with an actionable error (409 to the client)
    // rather than a silent half-session.
    try {
        assertValidTurnRequest(toTurnRequest(config));
    } catch (err) {
        send({ type: 'error', reason: err.message });
        await flushSafe();
        process.exit(1);
        return;
    }

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
                `No credential for provider '${provider}'. Set ${meta.env} in the environment or ` +
                `in ~/.thinksuit/secrets.env, or pass it in the run config.`
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

    // Determine the sessionId up front (schedule would otherwise generate it) so we
    // can provision the workspace BEFORE the run starts. `workdir` is the session's
    // owned home base; it defaults to the client's invocation directory when not
    // given, binds an explicit dir, or reuses an existing session's (rejecting a
    // mismatch). The resolved workspace is the engine `workdir`; the turn's `cwd`
    // defaults to it in normalizeConfig, which drives allowedDirectories + MCP roots.
    const sessionId = config.sessionId || generateId();
    const workspace = await provisionWorkspace(sessionId, {
        workdir: config.workdir,
        baseCwd: config.cwd
    });

    // Resolve the frame NAME (contract surface) to the { text } object the engine
    // consumes. execute.js does this at its door; the broker door must too, or
    // frames silently never apply on this path.
    let resolvedFrame = null;
    if (config.frame) {
        const moduleName = config.module || 'thinksuit/mu';
        resolvedFrame = await getFrame(config.frame, moduleName, modules[moduleName]);
        if (!resolvedFrame) {
            logger.warn({ frame: config.frame }, 'Frame not found; proceeding without it');
        }
    }

    const scheduleConfig = {
        ...config,
        sessionId,
        provider,
        providerConfig,
        workdir: workspace,
        frame: resolvedFrame,
        modules,
        logger
    };
    delete scheduleConfig.modulesPackage; // schedule() takes loaded modules, not a path
    delete scheduleConfig.cwd; // the turn's cwd defaults to workdir in normalizeConfig

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
