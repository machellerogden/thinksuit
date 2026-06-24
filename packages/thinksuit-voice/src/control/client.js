// Thin client over the voice daemon's control socket. Used by the control CLI
// and the console. Mirrors the broker client's request() shape.

import http from 'node:http';
import { resolveControlSocketPath } from '../paths.js';

const VOICE_DOWN_HINT =
    'ThinkSuit voice daemon is not running. Start it with `thinksuit-voice-service-start` ' +
    '(or `npm -w thinksuit-voice run dev` for a foreground instance).';

function isVoiceDown(err) {
    return err && (err.code === 'ECONNREFUSED' || err.code === 'ENOENT');
}

function request(method, path, { socketPath = resolveControlSocketPath() } = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request({ socketPath, method, path }, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                let parsed;
                try {
                    parsed = data ? JSON.parse(data) : {};
                } catch {
                    return reject(new Error(`Malformed voice response: ${data}`));
                }
                if (res.statusCode >= 400) {
                    const err = new Error(parsed.error || `Voice error ${res.statusCode}`);
                    err.statusCode = res.statusCode;
                    return reject(err);
                }
                resolve(parsed);
            });
        });
        req.on('error', (err) => {
            reject(isVoiceDown(err) ? new Error(VOICE_DOWN_HINT) : err);
        });
        req.end();
    });
}

/** Liveness check. */
export async function health(opts) {
    return request('GET', '/health', opts);
}

/** Full daemon status snapshot. */
export async function status(opts) {
    return request('GET', '/status', opts);
}

/** Re-acquire the mic and resume listening. */
export async function micOn(opts) {
    return request('POST', '/mic/on', opts);
}

/** Release the mic (device off, indicator dark); daemon stays warm. */
export async function micOff(opts) {
    return request('POST', '/mic/off', opts);
}

/** Cancel the in-flight turn and stop any spoken response. */
export async function interrupt(opts) {
    return request('POST', '/interrupt', opts);
}
