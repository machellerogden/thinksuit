import { Writable } from 'node:stream';

/**
 * Custom writable stream for capturing Pino log events and forwarding to TUI.
 *
 * This stream receives JSON log lines from Pino and parses them to update
 * the TUI with progress information.
 */
export class TuiLoggerStream extends Writable {
    constructor(options = {}) {
        super({ objectMode: false });

        this.logPane = options.logPane;
        this.screen = options.screen;
        this.onEvent = options.onEvent || null;
    }

    /**
     * Handle incoming log chunks from Pino
     * @param {Buffer|string} chunk - Log data
     * @param {string} encoding - Encoding type
     * @param {Function} callback - Completion callback
     */
    _write(chunk, encoding, callback) {
        try {
            // Parse the JSON log line
            const logLine = chunk.toString().trim();
            if (!logLine) {
                callback();
                return;
            }

            const event = JSON.parse(logLine);

            // Forward to event handler if provided
            if (this.onEvent) {
                this.onEvent(event);
            }

            callback();
        } catch (error) {
            // Ignore parse errors - some output may not be JSON
            callback();
        }
    }
}

/**
 * Create a TUI logger stream instance
 * @param {Object} logPane - Log pane for output
 * @param {Object} screen - Screen manager
 * @param {Function} onEvent - Event handler callback
 * @returns {TuiLoggerStream}
 */
export function createTuiLoggerStream(logPane, screen, onEvent) {
    return new TuiLoggerStream({ logPane, screen, onEvent });
}
