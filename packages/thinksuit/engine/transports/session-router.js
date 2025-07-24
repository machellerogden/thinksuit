/**
 * Pino transport that routes logs to session files based on sessionId in message
 * Each unique sessionId gets its own JSONL file
 */

import { stderr } from 'node:process';
import { once } from 'node:events';
import { createWriteStream, existsSync } from 'node:fs';
import { readFile, writeFile, appendFile, stat } from 'node:fs/promises';

import build from 'pino-abstract-transport';
import { SESSION_EVENTS, SESSION_STATUS } from '../constants/events.js';
import { exists, readSessionStatusData } from '../utils/fs.js';
import { deriveSessionStatus } from '../sessions/deriveSessionStatus.js';
import {
    getSessionFilePath,
    ensureDirectoryExists,
    ensureDirectoryExistsAsync
} from '../utils/paths.js';

// Map of sessionId -> write stream
const streams = new Map();

// Note: Directory creation now happens per-file in ensureDirectoryExists

/**
 * Check if a session file exists (async version)
 */
export async function sessionExists(sessionId) {
    const filePath = getSessionFilePath(sessionId);
    return await exists(filePath);
}

/**
 * Check if a session file exists (sync version for pino transport)
 */
export function sessionExistsSync(sessionId) {
    const filePath = getSessionFilePath(sessionId);
    return existsSync(filePath);
}

/**
 * Touch a session file to ensure it exists
 * Creates an empty file if it doesn't exist
 */
export async function touchSessionFile(sessionId) {
    const filePath = getSessionFilePath(sessionId);
    try {
        await stat(filePath);
        // File exists, nothing to do
    } catch {
        // File doesn't exist, create it
        await ensureDirectoryExistsAsync(filePath);
        await writeFile(filePath, '');
    }
}

/**
 * Load thread history from a session file
 * Reconstructs the conversation thread from user_input and assistant_response events
 */
export async function loadSessionThread(sessionId) {
    const filePath = getSessionFilePath(sessionId);

    try {
        const content = await readFile(filePath, 'utf-8');
        const lines = content.trim().split('\n');
        const thread = [];

        for (const line of lines) {
            if (!line.trim()) continue;

            try {
                const entry = JSON.parse(line);

                // Extract user inputs and assistant responses
                if (entry.event === SESSION_EVENTS.INPUT && entry.data?.input) {
                    thread.push({
                        role: 'user',
                        content: entry.data.input
                    });
                } else if (entry.event === SESSION_EVENTS.RESPONSE && entry.data?.response) {
                    thread.push({
                        role: 'assistant',
                        content: entry.data.response
                    });
                }
            } catch {
                // Skip malformed lines
                stderr.write(
                    `[SESSION] Warning: Skipping malformed line in session ${sessionId}\n`
                );
            }
        }

        return thread;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
        stderr.write(`[SESSION] Error loading session ${sessionId}: ${error.message}\n`);
        return [];
    }
}

/**
 * Get the status of a session
 * Derives status by analyzing the session events
 *
 * @param {string} sessionId - The session ID to check
 * @returns {Promise<string>} One of SESSION_STATUS values
 */
export async function getSessionStatus(sessionId) {
    const filePath = getSessionFilePath(sessionId);

    try {
        // Check if file exists and get size
        const stats = await stat(filePath);
        if (stats.size === 0) {
            return SESSION_STATUS.EMPTY;
        }

        // Get just what we need for status determination
        const { lastLine, isSingleLine } = await readSessionStatusData(filePath);

        if (!lastLine) {
            return SESSION_STATUS.EMPTY;
        }

        // Parse the last event
        let lastEvent;
        try {
            lastEvent = JSON.parse(lastLine);
        } catch {
            stderr.write(`[SESSION] Warning: Malformed JSON in session ${sessionId}\n`);
            return SESSION_STATUS.MALFORMED;
        }

        // Build minimal entries array for status derivation
        // If single line, just the event. Otherwise use null for first (we don't need it)
        const entries = isSingleLine ? [lastEvent] : [null, lastEvent];

        return deriveSessionStatus(entries);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return SESSION_STATUS.NOT_FOUND;
        }
        stderr.write(`[SESSION] Error checking session status ${sessionId}: ${error.message}\n`);
        return SESSION_STATUS.NOT_FOUND;
    }
}

/**
 * Append an event to a session file
 * Used for atomic writes when not using the streaming logger
 */
export async function appendSessionEvent(sessionId, event) {
    const filePath = getSessionFilePath(sessionId);
    await ensureDirectoryExistsAsync(filePath);
    const line =
        JSON.stringify({
            ...event,
            time: new Date().toISOString(),
            pid: process.pid
        }) + '\n';
    await appendFile(filePath, line);
}

/**
 * Acquire a session for execution
 * Checks if session is ready and marks it as pending
 *
 * @param {string} sessionId - The session ID
 * @returns {Promise<{success: boolean, reason?: string}>}
 */
export async function acquireSession(sessionId) {
    // Check current status
    const status = await getSessionStatus(sessionId);

    if (status === SESSION_STATUS.NOT_FOUND || status === SESSION_STATUS.EMPTY) {
        // Session doesn't exist or is empty, initialize it
        await appendSessionEvent(sessionId, {
            event: SESSION_EVENTS.PENDING,
            sessionId,
            msg: 'Session initialized and pending execution'
        });
        return { success: true };
    }

    if (status === SESSION_STATUS.BUSY) {
        // Session is busy, fail
        return { success: false, reason: 'Session is currently processing' };
    }

    // Status is INITIALIZED or READY - can proceed
    // No need to add another PENDING event if already initialized
    return { success: true };
}

/**
 * Get or create a write stream for a given sessionId
 */
function getStream(sessionId) {
    if (!sessionId) {
        return null; // No sessionId, don't write to session file
    }

    if (streams.has(sessionId)) {
        return streams.get(sessionId);
    }

    // Create write stream for this session
    const filePath = getSessionFilePath(sessionId);
    ensureDirectoryExists(filePath);
    const stream = createWriteStream(filePath, { flags: 'a' });

    // Store stream reference
    streams.set(sessionId, stream);

    // Clean up on close
    stream.on('close', () => {
        streams.delete(sessionId);
    });

    // Log where we're writing (once per session)
    stderr.write(`[SESSION] Writing to: ${filePath}\n`);

    return stream;
}

/**
 * Main transport function
 */
export default async function (_opts) {
    stderr.write('[SESSION-ROUTER] Transport initialized\n');
    return build(
        async function (source) {
            for await (const obj of source) {
                // Extract sessionId from the log object
                const sessionId = obj.sessionId || obj.context?.sessionId;

                if (!sessionId) {
                    // No sessionId, skip this log
                    continue;
                }

                // Get or create stream for this sessionId
                const stream = getStream(sessionId);

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
