/**
 * Pino transport that routes logs to trace files based on traceId in message
 * Each unique traceId gets its own JSONL file
 */

import { stderr } from 'node:process';
import { once } from 'node:events';
import { createWriteStream } from 'node:fs';

import build from 'pino-abstract-transport';
import { getTraceFilePath, ensureDirectoryExists } from '../utils/paths.js';

// Map of traceId -> write stream
const streams = new Map();

// Note: Directory creation now happens per-file in ensureDirectoryExists

/**
 * Get or create a write stream for a given traceId
 */
function getStream(traceId) {
    if (!traceId) {
        return null; // No traceId, don't write to trace file
    }

    if (streams.has(traceId)) {
        return streams.get(traceId);
    }

    // Create write stream for this trace
    const filePath = getTraceFilePath(traceId);
    ensureDirectoryExists(filePath);
    const stream = createWriteStream(filePath, { flags: 'a' });

    // Store stream reference
    streams.set(traceId, stream);

    // Clean up on close
    stream.on('close', () => {
        streams.delete(traceId);
    });

    // Log where we're writing (once per trace)
    stderr.write(`[TRACE] Writing to: ${filePath}\n`);

    return stream;
}

/**
 * Main transport function
 */
export default async function (_opts) {
    stderr.write('[TRACE-ROUTER] Transport initialized\n');
    return build(
        async function (source) {
            for await (const obj of source) {
                // Extract traceId from the log object
                const traceId = obj.traceId || obj.context?.traceId;

                if (!traceId) {
                    // No traceId, skip this log
                    continue;
                }

                // Get or create stream for this traceId
                const stream = getStream(traceId);

                if (stream) {
                    // Write the log line as JSONL
                    const line = JSON.stringify(obj) + '\n';
                    const toDrain = !stream.write(line);

                    // Handle backpressure
                    if (toDrain) {
                        await once(stream, 'drain');
                    }
                }
            }
        },
        {
            async close(_err) {
                // Close all open streams
                const closePromises = Array.from(streams.values()).map(
                    (stream) =>
                        new Promise((resolve) => {
                            stream.end(resolve);
                        })
                );

                await Promise.all(closePromises);
            }
        }
    );
}
