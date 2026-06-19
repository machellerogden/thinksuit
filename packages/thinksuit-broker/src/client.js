import http from 'node:http';
import { resolveSocketPath } from './paths.js';

const BROKER_DOWN_HINT =
    'ThinkSuit broker is not running. Start it with `thinksuit-broker-service-start` ' +
    '(or `npm -w thinksuit-broker run dev` for a foreground instance).';

function isBrokerDown(err) {
    return err && (err.code === 'ECONNREFUSED' || err.code === 'ENOENT');
}

/**
 * Single JSON request/response over the broker's unix domain socket.
 */
function request(method, path, body, { socketPath = resolveSocketPath() } = {}) {
    return new Promise((resolve, reject) => {
        const payload = body == null ? null : JSON.stringify(body);
        const req = http.request(
            {
                socketPath,
                method,
                path,
                headers: payload
                    ? {
                          'content-type': 'application/json',
                          'content-length': Buffer.byteLength(payload)
                      }
                    : {}
            },
            (res) => {
                let data = '';
                res.on('data', (chunk) => (data += chunk));
                res.on('end', () => {
                    let parsed;
                    try {
                        parsed = data ? JSON.parse(data) : {};
                    } catch {
                        return reject(new Error(`Malformed broker response: ${data}`));
                    }
                    if (res.statusCode >= 400) {
                        const err = new Error(parsed.error || `Broker error ${res.statusCode}`);
                        err.statusCode = res.statusCode;
                        return reject(err);
                    }
                    resolve(parsed);
                });
            }
        );
        req.on('error', (err) => {
            reject(isBrokerDown(err) ? new Error(BROKER_DOWN_HINT) : err);
        });
        if (payload) req.write(payload);
        req.end();
    });
}

/** Liveness check. Resolves the health payload or throws the broker-down hint. */
export async function health(opts) {
    return request('GET', '/health', null, opts);
}

/**
 * Start a broker-hosted turn. `config` is a serializable run config (input,
 * sessionId?, module, modulesPackage, provider, model, providerConfig, cwd,
 * allowedDirectories, mcpServers, allowedTools, policy, trace, selectedPlan,
 * frame, autoApproveTools). Returns `{ sessionId, isNew, status }` immediately.
 */
export async function run(config, opts) {
    return request('POST', '/run', { config }, opts);
}

/** Interrupt the in-flight turn for a session. */
export async function interrupt(sessionId, reason, opts) {
    return request('POST', `/interrupt/${encodeURIComponent(sessionId)}`, { reason }, opts);
}

/**
 * Resolve a pending tool approval for a session. `approved` defaults to true;
 * pass false to deny. `approvalId` is optional — when omitted the broker
 * resolves the session's most recent pending approval (derived from the log).
 */
export async function approve(sessionId, { approved = true, approvalId } = {}, opts) {
    return request(
        'POST',
        `/approve/${encodeURIComponent(sessionId)}`,
        { approved, approvalId },
        opts
    );
}

/**
 * List sessions. By default returns only active (live) sessions; pass
 * `all: true` to also include on-disk session history.
 */
export async function sessions({ all = false, socketPath } = {}) {
    const path = all ? '/sessions?all=1' : '/sessions';
    const res = await request('GET', path, null, { socketPath });
    return res.sessions;
}

/**
 * List sessions currently blocked awaiting a tool approval (the HITL queue):
 * `[{ sessionId, approvalId, tool }]`.
 */
export async function queue({ socketPath } = {}) {
    const res = await request('GET', '/queue', null, { socketPath });
    return res.queue;
}

/** Current status for a session. */
export async function status(sessionId, opts) {
    return request('GET', `/status/${encodeURIComponent(sessionId)}`, null, opts);
}

/** Read all recorded entries for a session (non-tailing). */
export async function log(sessionId, opts) {
    const res = await request('GET', `/log/${encodeURIComponent(sessionId)}`, null, opts);
    return res.entries;
}

/**
 * Tail a session's event stream. Calls `onEntry(entry)` for each event (existing
 * then live). Returns a handle with `close()`. `onError` is optional.
 */
export function tail(sessionId, onEntry, { socketPath = resolveSocketPath(), onError, from = 0 } = {}) {
    const req = http.request(
        {
            socketPath,
            method: 'GET',
            path: `/log/${encodeURIComponent(sessionId)}?tail=1&from=${encodeURIComponent(from)}`,
            headers: { accept: 'text/event-stream' }
        },
        (res) => {
            res.setEncoding('utf8');
            let buffer = '';
            res.on('data', (chunk) => {
                buffer += chunk;
                let idx;
                while ((idx = buffer.indexOf('\n\n')) !== -1) {
                    const frame = buffer.slice(0, idx);
                    buffer = buffer.slice(idx + 2);
                    for (const line of frame.split('\n')) {
                        if (line.startsWith('data: ')) {
                            const json = line.slice(6);
                            try {
                                onEntry(JSON.parse(json));
                            } catch {
                                // Skip malformed frame.
                            }
                        }
                    }
                }
            });
            res.on('error', (err) => onError && onError(err));
        }
    );
    req.on('error', (err) => {
        if (onError) onError(isBrokerDown(err) ? new Error(BROKER_DOWN_HINT) : err);
    });
    req.end();

    return {
        close: () => req.destroy()
    };
}
