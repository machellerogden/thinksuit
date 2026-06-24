// Control/status server: an HTTP API over a unix domain socket that lets the CLI
// and the console steer the running daemon (mic on/off, interrupt) and read its
// state. Mirrors the broker's socket server shape: a small route() dispatcher
// behind a request boundary so a bad request never crashes the daemon.

import http from 'node:http';
import fs from 'node:fs';
import { resolveControlSocketPath } from '../paths.js';

function sendJson(res, status, body) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload)
    });
    res.end(payload);
}

/**
 * Build the control server wired to the daemon's control surface.
 * `controls` = { getStatus(), micOn(), micOff(), interrupt() }.
 */
export function createControlServer(controls) {
    async function route(req, res) {
        const { method } = req;
        const url = new URL(req.url, 'http://localhost');
        const path = url.pathname;

        if (method === 'GET' && path === '/health') {
            return sendJson(res, 200, { ok: true, pid: process.pid });
        }
        if (method === 'GET' && path === '/status') {
            return sendJson(res, 200, await controls.getStatus());
        }
        if (method === 'POST' && path === '/mic/on') {
            await controls.micOn();
            return sendJson(res, 200, { ok: true, micOn: true });
        }
        if (method === 'POST' && path === '/mic/off') {
            await controls.micOff();
            return sendJson(res, 200, { ok: true, micOn: false });
        }
        if (method === 'POST' && path === '/interrupt') {
            const { interrupted } = await controls.interrupt();
            return sendJson(res, 200, { ok: true, interrupted });
        }

        return sendJson(res, 404, { ok: false, error: `No such verb: ${method} ${path}` });
    }

    // Request boundary: any handler throw becomes a response, never a daemon
    // crash. A bad request must not take the mic down.
    const server = http.createServer((req, res) => {
        Promise.resolve()
            .then(() => route(req, res))
            .catch((err) => {
                console.error('voice control request error:', err.message);
                if (!res.headersSent) sendJson(res, 500, { ok: false, error: err.message });
                else res.destroy();
            });
    });

    return { server };
}

/**
 * Start the control server listening on the unix socket. Clears a stale socket
 * file from a previous run first; if a live daemon already owns it, listen()
 * surfaces EADDRINUSE to the caller. Returns a handle with close().
 */
export function startControlServer(controls, { socketPath = resolveControlSocketPath() } = {}) {
    const { server } = createControlServer(controls);

    try {
        fs.unlinkSync(socketPath);
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
    }

    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(socketPath, () => {
            server.removeListener('error', reject);
            console.log(`voice control listening on ${socketPath} (pid ${process.pid})`);
            resolve({
                socketPath,
                close: () => new Promise((done) => server.close(done))
            });
        });
    });
}
