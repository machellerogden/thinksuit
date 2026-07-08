import http from 'node:http';
import fs from 'node:fs';
import { readFileSync } from 'node:fs';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
    listSessions,
    getSessionStatus,
    getSessionMetadata,
    getSessionWorkspace,
    readSessionLinesFrom,
    subscribeToSession,
    setDesignation
} from 'thinksuit';
import { createServiceLogger } from 'thinksuit-log';
import { resolveSocketPath } from './paths.js';
import { derivePendingApproval, derivePendingApprovalDetail } from './approvals.js';

const log = createServiceLogger('broker');

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
const WORKER_PATH = join(__dirname, 'worker.js');

function sendJson(res, status, body) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload)
    });
    res.end(payload);
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (chunk) => {
            data += chunk;
            // Guard against unbounded bodies on a trusted-but-local socket.
            if (data.length > 50 * 1024 * 1024) {
                reject(new Error('Request body too large'));
                req.destroy();
            }
        });
        req.on('end', () => {
            if (!data) return resolve({});
            try {
                resolve(JSON.parse(data));
            } catch (err) {
                reject(new Error(`Invalid JSON body: ${err.message}`));
            }
        });
        req.on('error', reject);
    });
}

/**
 * Build the broker daemon: the in-memory registry of hosted executions plus the
 * socket router. The registry is keyed by sessionId; each entry owns the forked
 * worker child for that turn.
 */
export function createBroker() {
    const registry = new Map();
    // sessionId -> Set<{ res, flush }> of open tail SSE streams. `flush` reads
    // any JSONL not yet delivered from that stream's cursor.
    const tailStreams = new Map();
    const startTime = Date.now();

    // Called when a worker exits. The worker flushes its JSONL before exiting,
    // but chokidar's awaitWriteFinish debounce can lag behind the instant exit
    // signal — so we explicitly flush each tail stream's remaining events FIRST,
    // then send the synthetic terminal event. This guarantees clients receive
    // session.response/turn.complete before broker.worker.exited.
    async function finalizeTailStreams(sessionId, event) {
        const set = tailStreams.get(sessionId);
        if (!set) return;
        for (const record of set) {
            try {
                await record.flush();
                record.res.write(`data: ${JSON.stringify(event)}\n\n`);
            } catch {
                // Stream already gone; cleanup handler will remove it.
            }
        }
    }

    function handleHealth(req, res) {
        sendJson(res, 200, {
            ok: true,
            pid: process.pid,
            version: pkg.version,
            uptimeMs: Date.now() - startTime,
            sessions: registry.size
        });
    }

    /**
     * Fork a worker, send it the run config, and resolve once it reports
     * `started` (with the real sessionId) or `error` (could not schedule).
     * Wires the persistent lifecycle listeners so the registry stays accurate.
     */
    function spawnWorker(config, entry) {
        return new Promise((resolve) => {
            const child = fork(WORKER_PATH, [], { env: process.env });
            entry.child = child;
            let settled = false;

            child.on('message', (msg) => {
                if (!msg || typeof msg !== 'object') return;
                switch (msg.type) {
                    case 'started':
                        entry.sessionId = msg.sessionId;
                        entry.status = 'running';
                        registry.set(msg.sessionId, entry);
                        if (!settled) {
                            settled = true;
                            resolve({ ok: true, sessionId: msg.sessionId, isNew: msg.isNew });
                        }
                        break;
                    case 'error':
                        entry.status = 'error';
                        if (!settled) {
                            settled = true;
                            resolve({ ok: false, reason: msg.reason });
                        }
                        break;
                    case 'done':
                        entry.status = 'done';
                        break;
                    case 'failed':
                        entry.status = 'failed';
                        // A throw before `started` (e.g. provisionWorkspace
                        // rejecting a workdir mismatch) settles here — otherwise
                        // the exit handler masks the real reason with the generic
                        // "Worker exited before starting".
                        if (!settled) {
                            settled = true;
                            resolve({ ok: false, reason: msg.error });
                        }
                        break;
                    default:
                        break;
                }
            });

            child.on('exit', () => {
                if (entry.sessionId) {
                    registry.delete(entry.sessionId);
                    // Flush remaining JSONL to tail streams, then signal exit, so
                    // clients see the real terminal events before the failsafe.
                    finalizeTailStreams(entry.sessionId, {
                        event: 'broker.worker.exited',
                        sessionId: entry.sessionId,
                        status: entry.status
                    }).catch(() => {});
                }
                if (!settled) {
                    settled = true;
                    resolve({ ok: false, reason: 'Worker exited before starting' });
                }
            });

            child.on('error', (err) => {
                if (!settled) {
                    settled = true;
                    resolve({ ok: false, reason: `Worker failed to start: ${err.message}` });
                }
            });

            child.send({ type: 'start', config });
        });
    }

    async function handleRun(req, res) {
        let body;
        try {
            body = await readBody(req);
        } catch (err) {
            return sendJson(res, 400, { ok: false, error: err.message });
        }

        const config = body.config;
        if (!config || typeof config.input !== 'string' || config.input.length === 0) {
            return sendJson(res, 400, { ok: false, error: 'config.input (string) is required' });
        }

        // Reserve the session synchronously — before any await — so a second /run
        // for the same session can't slip in before this worker reports 'started'
        // (that gap is the acquireSession race). schedule()'s acquireSession stays a
        // backstop; this request-time reservation is the real gate. A new session
        // gets its id inside the worker, so there is nothing to collide on.
        let entry;
        if (config.sessionId) {
            const existing = registry.get(config.sessionId);
            if (existing && (existing.status === 'running' || existing.status === 'starting')) {
                return sendJson(res, 409, {
                    ok: false,
                    error: `Session ${config.sessionId} already has an in-flight turn`
                });
            }
            entry = { child: null, sessionId: config.sessionId, status: 'starting', startTime: Date.now() };
            registry.set(config.sessionId, entry);
        } else {
            entry = { child: null, sessionId: null, status: 'starting', startTime: Date.now() };
        }

        // Pre-run entry count, so a client can tail only the new turn (from this
        // offset) instead of replaying the session's history.
        let from = 0;
        if (config.sessionId) {
            try {
                const existing = await readSessionLinesFrom(config.sessionId, 0);
                from = existing ? existing.entries.length : 0;
            } catch {
                from = 0;
            }
        }

        const result = await spawnWorker(config, entry);
        if (!result.ok) {
            // Free the reservation if the worker never started (the exit handler
            // also cleans up, but may not fire if the fork itself failed).
            if (config.sessionId && registry.get(config.sessionId) === entry) {
                registry.delete(config.sessionId);
            }
            return sendJson(res, 409, { ok: false, error: result.reason });
        }
        return sendJson(res, 200, {
            ok: true,
            sessionId: result.sessionId,
            isNew: result.isNew,
            status: 'running',
            from
        });
    }

    async function handleInterrupt(req, res, sessionId) {
        const entry = registry.get(sessionId);
        if (!entry || entry.status !== 'running') {
            return sendJson(res, 404, {
                ok: false,
                error: `No in-flight turn for session ${sessionId}`
            });
        }
        let body = {};
        try {
            body = await readBody(req);
        } catch {
            body = {};
        }
        // The worker may have exited during readBody; sending on a closed IPC
        // channel is a silent no-op, so report honestly instead of a false 200.
        if (!entry.child.connected) {
            return sendJson(res, 409, {
                ok: false,
                error: `Turn for session ${sessionId} already ended`
            });
        }
        entry.child.send({ type: 'interrupt', reason: body.reason || 'Interrupted via broker' });
        sendJson(res, 200, { ok: true, sessionId });
    }

    // Fan-out interrupt: stop every live turn, leaving the daemon up. Idempotent —
    // no live turns yields { interrupted: [], count: 0 }, not an error. (Taking the
    // daemon itself down is a separate service-management concern.)
    async function handleInterruptAll(req, res) {
        let body = {};
        try {
            body = await readBody(req);
        } catch {
            body = {};
        }
        const reason = body.reason || 'Interrupted via broker (all)';
        const interrupted = [];
        for (const [sessionId, entry] of registry.entries()) {
            if (entry.status !== 'running') continue;
            if (!entry.child.connected) continue; // worker already exited; nothing to signal
            entry.child.send({ type: 'interrupt', reason });
            interrupted.push(sessionId);
        }
        sendJson(res, 200, { ok: true, interrupted, count: interrupted.length });
    }

    // Derive the most recent still-pending approvalId for a session from its
    // JSONL (filesystem-driven — see derivePendingApproval), so it works
    // regardless of which client requested the turn.
    async function findPendingApproval(sessionId) {
        const data = await readSessionLinesFrom(sessionId, 0);
        if (!data) return null;
        return derivePendingApproval(data.entries);
    }

    async function handleApprove(req, res, sessionId) {
        const entry = registry.get(sessionId);
        if (!entry || entry.status !== 'running') {
            return sendJson(res, 404, {
                ok: false,
                error: `No in-flight turn for session ${sessionId}`
            });
        }

        let body = {};
        try {
            body = await readBody(req);
        } catch {
            body = {};
        }

        const approved = body.approved !== false; // default approve; deny is explicit
        let approvalId = body.approvalId;
        if (!approvalId) {
            approvalId = await findPendingApproval(sessionId);
        }
        if (!approvalId) {
            return sendJson(res, 409, {
                ok: false,
                error: `No pending approval for session ${sessionId}`
            });
        }

        // The worker may have exited during readBody/findPendingApproval; sending on
        // a closed IPC channel is a silent no-op, so report honestly.
        if (!entry.child.connected) {
            return sendJson(res, 409, {
                ok: false,
                error: `Turn for session ${sessionId} already ended`
            });
        }
        entry.child.send({ type: 'resolve-approval', approvalId, approved });
        sendJson(res, 200, { ok: true, sessionId, approvalId, approved });
    }

    async function handleSessions(req, res, all = false) {
        // Default: active executions only (the in-memory registry of live
        // workers). No disk scan on the common path.
        const live = new Map();
        for (const [sessionId, entry] of registry.entries()) {
            live.set(sessionId, {
                id: sessionId,
                status: entry.status,
                live: true,
                startTime: entry.startTime,
                workdir: await getSessionWorkspace(sessionId)
            });
        }

        const sessions = [...live.values()];

        // With `all`, also include on-disk session history (every session, not a
        // paged slice). Bounded only by what exists on disk.
        if (all) {
            try {
                const disk = await listSessions();
                for (const s of disk) {
                    if (!live.has(s.id)) {
                        sessions.push({ id: s.id, status: s.status, live: false });
                    }
                }
            } catch {
                // Disk read failed; still return the live set.
            }
        }

        sendJson(res, 200, { ok: true, sessions });
    }

    // The HITL discovery view: across all live sessions, which are blocked
    // waiting on a tool approval? Derived from each session's JSONL, so it
    // reflects the source of truth regardless of which client requested the turn.
    async function handleQueue(req, res) {
        const queue = [];
        for (const [sessionId, entry] of registry.entries()) {
            if (entry.status !== 'running') continue;
            const data = await readSessionLinesFrom(sessionId, 0);
            if (!data) continue;
            const pending = derivePendingApprovalDetail(data.entries);
            if (pending) {
                queue.push({ sessionId, approvalId: pending.approvalId, tool: pending.tool });
            }
        }
        sendJson(res, 200, { ok: true, queue });
    }

    // The broker is the single writer of ~/.thinksuit/state.json. Surfaces
    // (console, voice) route designation writes here instead of writing the file
    // themselves, so there is never more than one process mutating it. Reads stay
    // direct — an atomic rename means readers never see a torn write.
    async function handleDesignations(req, res) {
        let body;
        try {
            body = await readBody(req);
        } catch (err) {
            return sendJson(res, 400, { ok: false, error: err.message });
        }
        const { name, sessionId } = body;
        if (typeof name !== 'string' || !name.trim()) {
            return sendJson(res, 400, { ok: false, error: 'name (string) is required' });
        }
        if (typeof sessionId !== 'string' || !sessionId.trim()) {
            return sendJson(res, 400, { ok: false, error: 'sessionId (string) is required' });
        }
        try {
            setDesignation(name.trim(), sessionId.trim());
        } catch (err) {
            // Invalid-name errors from the kernel are client errors.
            const status = /invalid designation name/.test(err.message) ? 400 : 500;
            return sendJson(res, status, { ok: false, error: err.message });
        }
        sendJson(res, 200, { ok: true, name: name.trim(), sessionId: sessionId.trim() });
    }

    async function handleStatus(req, res, sessionId) {
        // Errors (e.g. malformed id) propagate to the request boundary, which
        // maps them to a 4xx/5xx response without crashing the daemon.
        const status = await getSessionStatus(sessionId);
        const live = registry.has(sessionId);
        const workdir = await getSessionWorkspace(sessionId);
        sendJson(res, 200, { ok: true, sessionId, status, live, workdir });
    }

    async function handleLog(req, res, sessionId, tail, from = 0) {
        // Read (and implicitly validate the id) BEFORE writing any SSE headers,
        // so a malformed id surfaces as a clean 4xx at the request boundary
        // rather than throwing mid-stream after headers are committed.
        const initial = await readSessionLinesFrom(sessionId, from);

        if (!tail) {
            if (!initial) {
                return sendJson(res, 404, { ok: false, error: `No such session: ${sessionId}` });
            }
            return sendJson(res, 200, { ok: true, sessionId, entries: initial.entries });
        }

        // Tail mode: SSE. Emit existing entries from `from`, then stream new ones
        // on each file-change event by re-reading from a moving cursor. `from`
        // lets a client observe only a new turn rather than replaying history.
        res.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive'
        });

        let cursor = from;
        if (initial && initial.entries.length) {
            for (const entry of initial.entries) {
                res.write(`data: ${JSON.stringify(entry)}\n\n`);
            }
            cursor = from + initial.entries.length;
        }

        // Serialize flushes: two rapid change events must not both read from the
        // same cursor and double-emit. Each flush advances the cursor before the
        // next runs. Callers can await the returned promise (worker-exit does).
        let flushChain = Promise.resolve();
        const flushFrom = () => {
            flushChain = flushChain
                .then(async () => {
                    const data = await readSessionLinesFrom(sessionId, cursor);
                    if (data && data.entries.length) {
                        for (const entry of data.entries) {
                            res.write(`data: ${JSON.stringify(entry)}\n\n`);
                        }
                        cursor += data.entries.length;
                    }
                })
                .catch(() => {});
            return flushChain;
        };

        const sub = subscribeToSession(
            sessionId,
            () => {
                flushFrom().catch(() => {});
            },
            () => {}
        );

        // Track this stream (with its flush) so worker-exit can deliver any
        // remaining JSONL before the synthetic terminal event.
        const record = { res, flush: flushFrom };
        let set = tailStreams.get(sessionId);
        if (!set) {
            set = new Set();
            tailStreams.set(sessionId, set);
        }
        set.add(record);

        const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);

        const cleanup = () => {
            clearInterval(heartbeat);
            sub.unsubscribe().catch(() => {});
            const streams = tailStreams.get(sessionId);
            if (streams) {
                streams.delete(record);
                if (streams.size === 0) tailStreams.delete(sessionId);
            }
        };
        req.on('close', cleanup);
        res.on('error', cleanup);
    }

    async function route(req, res) {
        const { method } = req;
        const url = new URL(req.url, 'http://localhost');
        const path = url.pathname;

        if (method === 'GET' && path === '/health') return handleHealth(req, res);
        if (method === 'POST' && path === '/run') return handleRun(req, res);
        if (method === 'GET' && path === '/sessions') {
            return handleSessions(req, res, url.searchParams.get('all') === '1');
        }
        if (method === 'GET' && path === '/queue') return handleQueue(req, res);
        if (method === 'POST' && path === '/designations') return handleDesignations(req, res);

        if (method === 'POST' && path === '/interrupt' && url.searchParams.get('all') === '1') {
            return handleInterruptAll(req, res);
        }

        const interruptMatch = path.match(/^\/interrupt\/(.+)$/);
        if (method === 'POST' && interruptMatch) {
            return handleInterrupt(req, res, decodeURIComponent(interruptMatch[1]));
        }

        const approveMatch = path.match(/^\/approve\/(.+)$/);
        if (method === 'POST' && approveMatch) {
            return handleApprove(req, res, decodeURIComponent(approveMatch[1]));
        }

        const statusMatch = path.match(/^\/status\/(.+)$/);
        if (method === 'GET' && statusMatch) {
            return handleStatus(req, res, decodeURIComponent(statusMatch[1]));
        }

        const logMatch = path.match(/^\/log\/(.+)$/);
        if (method === 'GET' && logMatch) {
            const tail = url.searchParams.get('tail') === '1';
            const fromRaw = url.searchParams.get('from');
            const fromParsed = fromRaw != null ? parseInt(fromRaw, 10) : 0;
            const from = Number.isFinite(fromParsed) && fromParsed >= 0 ? fromParsed : 0;
            return handleLog(req, res, decodeURIComponent(logMatch[1]), tail, from);
        }

        return sendJson(res, 404, { ok: false, error: `No such verb: ${method} ${path}` });
    }

    // Request boundary: any handler throw becomes a response, never a daemon
    // crash. A bad request must not destabilize the broker.
    const server = http.createServer((req, res) => {
        Promise.resolve()
            .then(() => route(req, res))
            .catch((err) => {
                log.error({ event: 'broker.request.error', error: err.message }, 'request error');
                if (!res.headersSent) {
                    const status = /Invalid ID format/.test(err.message) ? 400 : 500;
                    sendJson(res, status, { ok: false, error: err.message });
                } else {
                    res.destroy();
                }
            });
    });

    return { server, registry };
}

/**
 * Start the broker listening on the unix domain socket. Cleans up a stale
 * socket file from a previous run; if a live broker already owns the socket the
 * listen() will EADDRINUSE and the caller surfaces it.
 */
export function startBroker({ socketPath = resolveSocketPath() } = {}) {
    const { server, registry } = createBroker();

    // Last-resort guard: a stray rejection should be logged loudly, not take
    // the daemon down. The request boundary handles the known cases; this keeps
    // the broker resident if something slips through.
    process.on('unhandledRejection', (reason) => {
        log.error({ event: 'broker.unhandledRejection', error: String(reason) }, 'unhandled rejection');
    });

    try {
        fs.unlinkSync(socketPath);
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
    }

    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(socketPath, () => {
            server.removeListener('error', reject);
            // Keep a persistent error handler after startup — otherwise a
            // post-listen socket error is an unhandled 'error' event and crashes
            // the resident daemon.
            server.on('error', (err) => {
                log.error({ event: 'broker.server.error', error: err.message }, 'server error');
            });
            log.info({ event: 'broker.listening', socketPath }, `ThinkSuit broker listening on ${socketPath}`);

            const shutdown = (signal) => {
                log.info({ event: 'broker.shutdown', signal }, `Received ${signal}, shutting down broker`);
                for (const entry of registry.values()) {
                    if (entry.child && !entry.child.killed) {
                        entry.child.kill('SIGTERM');
                    }
                }
                server.close(() => process.exit(0));
                setTimeout(() => process.exit(0), 2000).unref();
            };

            process.on('SIGTERM', () => shutdown('SIGTERM'));
            process.on('SIGINT', () => shutdown('SIGINT'));

            resolve({ server, registry, socketPath });
        });
    });
}
