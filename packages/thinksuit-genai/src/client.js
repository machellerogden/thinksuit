import http from 'node:http';
import { resolveSocketPath } from './paths.js';

export const GENAI_DOWN_HINT =
    'ThinkSuit genai service is not running. Start it with `thinkctl start genai` ' +
    '(or `npm -w thinksuit-genai run dev` for a foreground instance).';

function isGenaiDown(err) {
    return err && (err.code === 'ECONNREFUSED' || err.code === 'ENOENT');
}

/** True when an error is the actionable service-down error this client throws. */
export function isGenaiDownError(err) {
    return err?.code === 'E_GENAI_DOWN';
}

/**
 * Apply the engine's E_PROVIDER contract to a client error: prefixed message
 * plus `.originalError` carrying whatever the daemon rehydrated (status, code,
 * name, type survive the socket). Service-down errors pass through unwrapped —
 * they are operational, not provider failures.
 */
export function wrapProviderError(error) {
    if (isGenaiDownError(error)) return error;
    const wrapped = new Error(`E_PROVIDER: ${error.message}`);
    wrapped.originalError = error.originalError ?? error;
    if (error.request !== undefined) wrapped.request = error.request;
    return wrapped;
}

/**
 * Single JSON request/response over the genai daemon's unix domain socket.
 */
function request(method, path, body, { socketPath = resolveSocketPath(), signal } = {}) {
    return new Promise((resolve, reject) => {
        const payload = body == null ? null : JSON.stringify(body);
        const req = http.request(
            {
                socketPath,
                method,
                path,
                signal,
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
                        return reject(new Error(`Malformed genai response: ${data}`));
                    }
                    if (res.statusCode >= 400) {
                        const err = new Error(parsed.error || `genai error ${res.statusCode}`);
                        err.statusCode = res.statusCode;
                        // Rehydrate the provider error facts (status/code/name/type)
                        // so callers can branch on them across the socket.
                        if (parsed.originalError) err.originalError = parsed.originalError;
                        if (parsed.request !== undefined) err.request = parsed.request;
                        return reject(err);
                    }
                    resolve(parsed);
                });
            }
        );
        req.on('error', (err) => {
            if (err.name === 'AbortError' || err.code === 'ABORT_ERR') {
                return reject(new Error('Request aborted'));
            }
            if (isGenaiDown(err)) {
                return reject(Object.assign(new Error(GENAI_DOWN_HINT), { code: 'E_GENAI_DOWN' }));
            }
            reject(err);
        });
        if (payload) req.write(payload);
        req.end();
    });
}

/** Liveness check. Resolves the health payload or throws the down hint. */
export async function health(opts) {
    return request('GET', '/health', null, opts);
}

/** Daemon status: uptime, configured providers, onnx worker, call counters. */
export async function status(opts) {
    return request('GET', '/status', null, opts);
}

/** Provider metadata + configured flags: `{ openai: { configured, description }, ... }`. */
export async function providers(opts) {
    const res = await request('GET', '/providers', null, opts);
    return res.providers;
}

/**
 * Call a generative model through the daemon. `params` is
 * `{ provider, model, thread, maxTokens, temperature?, tools?, toolSchemas?,
 * responseFormat?, stop? }`. Resolves the provider contract response
 * (`original` normalized to `{request, response}`). Pass `{ signal }` to abort:
 * the daemon cancels the underlying provider call when this request dies.
 */
export async function call(params, opts) {
    return request('POST', '/call', params, opts);
}
