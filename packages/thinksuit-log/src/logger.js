import pino from 'pino';

/**
 * The ThinkSuit service logging contract. Every resident service logs JSONL to
 * stdout through this preset (launchd routes it to ~/Library/Logs/<label>.stdout.log):
 *
 *   - `time`    ISO-8601 timestamp
 *   - `level`   pino numeric level
 *   - `service` short service id (broker, genai, voice, tty, ...)
 *   - `msg`     human-readable line
 *   - `event`   optional dotted identifier for machine-readable events
 *               (e.g. `genai.call`) — grep/jq on this, not on msg
 *   - anything else: structured payload for the line
 *
 * Credential-shaped fields are redacted defensively at this boundary. Level
 * comes from LOG_LEVEL unless given. `thinkctl logs --pretty` renders these
 * lines humanely (src/format.js).
 *
 * @param {string} service - short service id, e.g. 'genai'
 * @param {Object} [options]
 * @param {string} [options.level] - pino level (default: LOG_LEVEL env or 'info')
 * @param {Object} [options.destination] - writable stream override (tests)
 */
export function createServiceLogger(service, { level, destination } = {}) {
    const config = {
        level: level || process.env.LOG_LEVEL || 'info',
        base: { service, pid: process.pid },
        timestamp: pino.stdTimeFunctions.isoTime,
        redact: {
            paths: [
                'password',
                'token',
                'secret',
                'apiKey',
                'api_key',
                '*.password',
                '*.token',
                '*.secret',
                '*.apiKey',
                '*.api_key'
            ],
            censor: '[REDACTED]'
        }
    };
    return destination ? pino(config, destination) : pino(config);
}
