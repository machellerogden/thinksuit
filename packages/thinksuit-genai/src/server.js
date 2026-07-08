// The genai daemon: an HTTP API over a unix domain socket that fronts every
// generative-model call in ThinkSuit. Credentials are resolved once at boot and
// never leave this process; provider instances (and the ONNX worker) stay warm
// for the daemon's lifetime. Mirrors the voice control server's shape: a small
// route() dispatcher behind a request boundary so a bad request never crashes
// the daemon.

import http from 'node:http';
import fs from 'node:fs';
import { resolveSocketPath } from './paths.js';
import { buildProviderConfig } from './config.js';
import { createProviderPool } from './residency.js';
import { callWithProvider } from './core.js';
import { listAvailableProviders, getProviderMetadata, listConfiguredProviders } from './providers/index.js';
import { getONNXWorkerStatus } from './providers/onnx.js';

function sendJson(res, status, body) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload)
    });
    res.end(payload);
}

function readJson(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (chunk) => (data += chunk));
        req.on('end', () => {
            try {
                resolve(data ? JSON.parse(data) : {});
            } catch {
                reject(Object.assign(new Error('Malformed JSON request body'), { badRequest: true }));
            }
        });
        req.on('error', reject);
    });
}

// Serializable view of a provider error for the wire. Never the whole error —
// SDK errors can carry request headers (credentials).
function serializeError(error) {
    return {
        message: error.message,
        status: error.status ?? error.statusCode,
        code: error.code,
        name: error.name,
        type: error.type
    };
}

/**
 * Build the daemon's HTTP server. Injectable for tests: pass `providerConfig`
 * and/or a `pool` (anything with `get(provider)`) to avoid real credentials.
 */
export function createGenaiServer({
    providerConfig = buildProviderConfig(),
    pool = createProviderPool(providerConfig)
} = {}) {
    const startedAt = Date.now();
    const calls = { total: 0, inFlight: 0 };
    const known = new Set(listAvailableProviders());

    async function handleCall(req, res) {
        const body = await readJson(req);
        const { provider: providerName, ...params } = body;

        if (!providerName || !known.has(providerName)) {
            return sendJson(res, 400, { error: `Unknown provider: ${providerName}` });
        }
        if (!params.model) {
            return sendJson(res, 400, { error: 'Missing required field: model' });
        }

        // Abort: if the client goes away before we respond, cancel the provider
        // call (the engine's interrupt path rides this).
        const ac = new AbortController();
        let responded = false;
        res.on('close', () => {
            if (!responded) ac.abort();
        });

        calls.total += 1;
        calls.inFlight += 1;
        const start = Date.now();
        try {
            const result = await callWithProvider(pool.get(providerName), params, {
                abortSignal: ac.signal
            });
            responded = true;
            console.log(
                JSON.stringify({
                    event: 'genai.call',
                    provider: providerName,
                    model: params.model,
                    durationMs: Date.now() - start,
                    usage: result.usage,
                    finishReason: result.finishReason
                })
            );
            return sendJson(res, 200, result);
        } catch (error) {
            responded = true;
            console.log(
                JSON.stringify({
                    event: 'genai.call',
                    provider: providerName,
                    model: params.model,
                    durationMs: Date.now() - start,
                    error: error.message
                })
            );
            return sendJson(res, 502, {
                error: error.message,
                originalError: serializeError(error),
                request: error.request
            });
        } finally {
            calls.inFlight -= 1;
        }
    }

    async function route(req, res) {
        const { method } = req;
        const url = new URL(req.url, 'http://localhost');
        const path = url.pathname;

        if (method === 'GET' && path === '/health') {
            return sendJson(res, 200, { ok: true, pid: process.pid });
        }
        if (method === 'GET' && path === '/status') {
            return sendJson(res, 200, {
                ok: true,
                pid: process.pid,
                uptime: Date.now() - startedAt,
                providers: listConfiguredProviders({ providerConfig }),
                onnx: getONNXWorkerStatus(),
                calls: { ...calls }
            });
        }
        if (method === 'GET' && path === '/providers') {
            const providers = {};
            const configured = listConfiguredProviders({ providerConfig });
            for (const name of known) {
                providers[name] = {
                    configured: configured[name],
                    description: getProviderMetadata(name).description
                };
            }
            return sendJson(res, 200, { providers });
        }
        if (method === 'POST' && path === '/call') {
            return handleCall(req, res);
        }

        return sendJson(res, 404, { error: `No such verb: ${method} ${path}` });
    }

    // Request boundary: any handler throw becomes a response, never a daemon
    // crash. A bad request must not take inference down.
    const server = http.createServer((req, res) => {
        Promise.resolve()
            .then(() => route(req, res))
            .catch((err) => {
                console.error('genai request error:', err.message);
                if (!res.headersSent) {
                    sendJson(res, err.badRequest ? 400 : 500, { error: err.message });
                } else {
                    res.destroy();
                }
            });
    });

    return { server };
}

/**
 * Start the daemon listening on the unix socket. Clears a stale socket file
 * from a previous run first; if a live daemon already owns it, listen()
 * surfaces EADDRINUSE to the caller. Returns a handle with close().
 */
export function startGenaiServer({ socketPath = resolveSocketPath(), ...opts } = {}) {
    const { server } = createGenaiServer(opts);

    try {
        fs.unlinkSync(socketPath);
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
    }

    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(socketPath, () => {
            server.removeListener('error', reject);
            console.log(`genai service listening on ${socketPath} (pid ${process.pid})`);
            resolve({
                socketPath,
                close: () => new Promise((done) => server.close(done))
            });
        });
    });
}
