/**
 * Session management API
 * Provides high-level functions for querying and managing sessions
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import PQueue from 'p-queue';

import { SESSION_STATUS } from '../constants/events.js';
import { readFirstSecondAndLastLines, readLinesFrom, exists } from '../utils/fs.js';
import { getSessionStatus, loadSessionThread } from '../transports/session-router.js';
import { deriveSessionStatus } from './deriveSessionStatus.js';
import { generateId } from '../utils/id.js';
import {
    getSessionFilePath,
    getMetadataFilePath,
    ensureDirectoryExists,
    SESSIONS_BASE
} from '../utils/paths.js';

/**
 * Extract ISO timestamp from session filename
 * @param {string} filename - Session filename
 * @returns {string|null} ISO timestamp or null if invalid
 */
function extractFilenameTimestamp(filename) {
    const m = filename.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z/);
    if (!m) return null;
    const [, Y, M, D, h, mnt, s, ms] = m;
    return `${Y}-${M}-${D}T${h}:${mnt}:${s}.${ms}Z`;
}

/**
 * List sessions with metadata using hierarchical directory traversal
 * @param {Object} options
 * @param {string} [options.fromTime] - ISO date string for range start
 * @param {string} [options.toTime] - ISO date string for range end
 * @param {string} [options.sortOrder='desc'] - 'asc' | 'desc'
 * @param {number} [options.concurrency=24] - Max concurrent file operations
 * @param {number} [options.limit] - Maximum number of sessions to return
 * @returns {Promise<Array<SessionInfo>>}
 */
export async function listSessions(options = {}) {
    const { fromTime, toTime, sortOrder = 'desc', concurrency = 24, limit } = options;

    const queue = new PQueue({ concurrency });

    // Parse date range
    const fromDate = fromTime ? new Date(fromTime) : null;
    const toDate = toTime ? new Date(toTime) : null;

    // Collect all session files from relevant directories
    const sessionFiles = [];

    // Determine which directories to scan based on date range
    const dirsToScan = await getDirectoriesToScan(SESSIONS_BASE, fromDate, toDate);

    // Read each directory and collect session files
    for (const dirPath of dirsToScan) {
        if (!(await exists(dirPath))) continue;

        try {
            const files = await readdir(dirPath, { withFileTypes: true });

            for (const file of files) {
                if (file.isFile() && file.name.endsWith('.jsonl')) {
                    const timestamp = extractFilenameTimestamp(file.name);
                    if (!timestamp) continue;

                    const fileDate = new Date(timestamp);

                    // Apply date filtering
                    if (fromDate && fileDate < fromDate) continue;
                    if (toDate && fileDate > toDate) continue;

                    sessionFiles.push({
                        filename: file.name,
                        dirPath,
                        timestamp,
                        fileDate
                    });
                }
            }
        } catch (error) {
            console.warn(`Failed to read directory ${dirPath}:`, error);
        }
    }

    // Sort all collected files
    sessionFiles.sort((a, b) => {
        return sortOrder === 'asc'
            ? a.timestamp.localeCompare(b.timestamp)
            : b.timestamp.localeCompare(a.timestamp);
    });

    // Apply limit if specified
    const filesToProcess = limit ? sessionFiles.slice(0, limit) : sessionFiles;

    // Read metadata for each session
    const sessions = await Promise.all(
        filesToProcess.map(({ filename, dirPath }) =>
            queue.add(async () => {
                const sessionId = filename.replace('.jsonl', '');
                const filePath = join(dirPath, filename);

                try {
                    const { first, second, last } = await readFirstSecondAndLastLines(filePath);

                    // Parse events
                    let firstEvent = null,
                        secondEvent = null,
                        lastEvent = null;
                    try {
                        if (first) firstEvent = JSON.parse(first);
                        if (second) secondEvent = JSON.parse(second);
                        if (last) lastEvent = JSON.parse(last);
                    } catch {
                        return {
                            id: sessionId,
                            status: SESSION_STATUS.MALFORMED,
                            firstEvent: null,
                            secondEvent: null,
                            lastEvent: null
                        };
                    }

                    // Build minimal entries array for status derivation
                    const entries = first === last ? [lastEvent] : [firstEvent, lastEvent];
                    const status = deriveSessionStatus(entries);

                    return {
                        id: sessionId,
                        status,
                        firstEvent,
                        secondEvent,
                        lastEvent
                    };
                } catch (error) {
                    return {
                        id: sessionId,
                        status: SESSION_STATUS.NOT_FOUND,
                        firstEvent: null,
                        secondEvent: null,
                        lastEvent: null,
                        error: error.message
                    };
                }
            })
        )
    );

    return sessions;
}

/**
 * Read session lines starting from a specific index
 * @param {string} sessionId
 * @param {number} fromIndex - Starting line index (0-based)
 * @returns {Promise<Object|null>}
 */
export async function readSessionLinesFrom(sessionId, fromIndex) {
    const filePath = getSessionFilePath(sessionId);

    if (!(await exists(filePath))) {
        return null;
    }

    try {
        const lines = await readLinesFrom(filePath, fromIndex);

        const entries = lines
            .map((line) => {
                try {
                    return JSON.parse(line);
                } catch {
                    return null;
                }
            })
            .filter(Boolean);

        return {
            id: sessionId,
            entries,
            fromIndex,
            entryCount: entries.length
        };
    } catch (error) {
        console.error(`Error reading session lines from ${sessionId}:`, error);
        return null;
    }
}

/**
 * Get full session data
 * @param {string} sessionId
 * @returns {Promise<SessionData|null>}
 */
export async function getSession(sessionId) {
    const filePath = getSessionFilePath(sessionId);

    if (!(await exists(filePath))) {
        return null;
    }

    try {
        // Get status
        const status = await getSessionStatus(sessionId);

        // Read full file for entries
        const content = await readFile(filePath, 'utf-8');
        const lines = content.trim().split('\n').filter(Boolean);

        const entries = lines
            .map((line) => {
                try {
                    return JSON.parse(line);
                } catch {
                    return null;
                }
            })
            .filter(Boolean);

        // Load thread (reconstructed conversation)
        const thread = await loadSessionThread(sessionId);

        // Extract metadata
        let traceId = null;
        let hasTrace = undefined;
        for (const entry of entries) {
            if (entry.traceId && !traceId) {
                traceId = entry.traceId;
            }
            if (entry.hasTrace !== undefined && hasTrace === undefined) {
                hasTrace = entry.hasTrace;
            }
            if (traceId && hasTrace !== undefined) break;
        }

        return {
            id: sessionId,
            status,
            entries,
            thread,
            metadata: {
                traceId,
                hasTrace,
                entryCount: entries.length
            }
        };
    } catch {
        return null;
    }
}

/**
 * Get session metadata without reading full content
 * @param {string} sessionId
 * @returns {Promise<SessionMetadata|null>}
 */
export async function getSessionMetadata(sessionId) {
    const filePath = getSessionFilePath(sessionId);

    if (!(await exists(filePath))) {
        return null;
    }

    try {
        const { first, second, last } = await readFirstSecondAndLastLines(filePath);

        // Parse events
        let firstEvent = null,
            secondEvent = null,
            lastEvent = null;
        try {
            if (first) firstEvent = JSON.parse(first);
            if (second) secondEvent = JSON.parse(second);
            if (last) lastEvent = JSON.parse(last);
        } catch {
            return {
                id: sessionId,
                status: SESSION_STATUS.MALFORMED,
                firstEvent: null,
                secondEvent: null,
                lastEvent: null
            };
        }

        // Build minimal entries array for status derivation
        const entries = first === last ? [lastEvent] : [firstEvent, lastEvent];
        const status = deriveSessionStatus(entries);

        return {
            id: sessionId,
            status,
            firstEvent,
            secondEvent,
            lastEvent
        };
    } catch {
        return null;
    }
}

/**
 * Get sessions directory path
 * @returns {string}
 */
export function getSessionsDir() {
    return SESSIONS_BASE;
}

/**
 * Read session metadata file if it exists
 * @param {string} sessionId
 * @returns {Promise<Object>} Metadata object or empty object if not found
 */
async function readSessionMetadata(sessionId) {
    const metadataPath = getMetadataFilePath(sessionId);

    if (!(await exists(metadataPath))) {
        return {};
    }

    try {
        const content = await readFile(metadataPath, 'utf-8');
        return JSON.parse(content);
    } catch (error) {
        console.error(`Error reading metadata for ${sessionId}:`, error);
        return {};
    }
}

/**
 * Create or update session metadata file
 * @param {string} sessionId
 * @param {Object} updates - Updates to merge with existing metadata
 */
async function updateSessionMetadata(sessionId, updates) {
    const metadataPath = getMetadataFilePath(sessionId);
    ensureDirectoryExists(metadataPath);
    const existing = await readSessionMetadata(sessionId);

    // Deep merge updates with existing
    const merged = deepMerge(existing, updates);

    await writeFile(metadataPath, JSON.stringify(merged, null, 2));
}

/**
 * Simple deep merge helper
 * @param {Object} target
 * @param {Object} source
 * @returns {Object}
 */
function deepMerge(target, source) {
    const result = { ...target };

    for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            result[key] = deepMerge(result[key] || {}, source[key]);
        } else {
            result[key] = source[key];
        }
    }

    return result;
}

/**
 * Fork a session at a specific point
 * Creates a new session with all events up to the fork point
 * @param {string} sourceSessionId - The session to fork from
 * @param {number} forkPoint - The event index to fork at (exclusive - fork happens after this event)
 * @returns {Promise<{sessionId: string, success: boolean, error?: string}>}
 */
export async function forkSession(sourceSessionId, forkPoint) {
    const sourceFilePath = getSessionFilePath(sourceSessionId);

    if (!(await exists(sourceFilePath))) {
        return { success: false, error: 'Source session not found' };
    }

    try {
        // Read source session
        const content = await readFile(sourceFilePath, 'utf-8');
        const lines = content.trim().split('\n').filter(Boolean);

        // Validate fork point
        if (forkPoint < 0 || forkPoint >= lines.length) {
            return { success: false, error: 'Invalid fork point' };
        }

        // Parse the event at the fork point to validate it's a turn.complete
        const forkEvent = JSON.parse(lines[forkPoint]);
        if (forkEvent.event !== 'session.turn.complete') {
            return { success: false, error: 'Can only fork from turn.complete events' };
        }

        // Generate new session ID
        const newSessionId = generateId();
        const newFilePath = getSessionFilePath(newSessionId);
        ensureDirectoryExists(newFilePath);

        // Copy events up to and including fork point, adding sourceSessionId
        const forkedEvents = [];
        for (let i = 0; i <= forkPoint; i++) {
            const event = JSON.parse(lines[i]);
            forkedEvents.push(
                JSON.stringify({
                    ...event,
                    sessionId: newSessionId,
                    sourceSessionId: sourceSessionId
                }) + '\n'
            );
        }

        // Write forked session
        await writeFile(newFilePath, forkedEvents.join(''));

        // Get the eventId from the fork point (lines array contains raw JSON strings)
        const forkEventId = lines[forkPoint] ? JSON.parse(lines[forkPoint]).eventId : null;

        // Validate we have an eventId
        if (!forkEventId) {
            return { success: false, error: 'Fork point event missing eventId' };
        }

        // Update parent's metadata using eventId as key
        const parentMetadata = await readSessionMetadata(sourceSessionId);
        const forks = parentMetadata.forks || {};
        if (!forks[forkEventId]) {
            forks[forkEventId] = [];
        }
        forks[forkEventId].push({
            sessionId: newSessionId,
            time: new Date().toISOString(),
            forkPoint: forkPoint // Keep the numeric index for reference
        });
        await updateSessionMetadata(sourceSessionId, { forks });
        await updateSessionMetadata(newSessionId, {
            source: {
                sessionId: sourceSessionId,
                forkPoint: forkPoint,
                eventId: forkEventId
            }
        });

        return { sessionId: newSessionId, success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Get fork navigation data for a session
 * Returns zipper-like structure for navigating between forks
 * @param {string} sessionId - The session to get fork navigation for
 * @returns {Promise<Object>} Navigation structure with fork points as keys
 */
export async function getSessionForks(sessionId) {
    const result = {};
    const metadata = await readSessionMetadata(sessionId);

    // If this session is a fork, build navigation for its fork point
    if (metadata.source) {
        const { sessionId: sourceSessionId, eventId } = metadata.source;
        const parentMetadata = await readSessionMetadata(sourceSessionId);

        // Build list of all siblings (parent + forks at same point)
        const siblings = [
            { sessionId: sourceSessionId, forkIndex: 0 } // Parent is always index 0
        ];

        // Add all forks at this fork point, sorted by time
        if (parentMetadata.forks && parentMetadata.forks[eventId]) {
            const sortedForks = [...parentMetadata.forks[eventId]].sort(
                (a, b) => new Date(a.time) - new Date(b.time)
            );

            sortedForks.forEach((fork, i) => {
                siblings.push({
                    sessionId: fork.sessionId,
                    forkIndex: i + 1
                });
            });
        }

        // Find our position
        const ourIndex = siblings.findIndex((s) => s.sessionId === sessionId);

        if (ourIndex >= 0 && eventId) {
            result[eventId] = {
                forkCount: siblings.length,
                forkIndex: ourIndex,
                left:
                ourIndex > 0
                    ? {
                        forkIndex: siblings[ourIndex - 1].forkIndex,
                        sessionId: siblings[ourIndex - 1].sessionId,
                        eventId: eventId // Same event in different session
                    }
                    : null,
                right:
                ourIndex < siblings.length - 1
                    ? {
                        forkIndex: siblings[ourIndex + 1].forkIndex,
                        sessionId: siblings[ourIndex + 1].sessionId,
                        eventId: eventId // Same event in different session
                    }
                    : null
            };
        }
    }

    // Also build navigation for fork points FROM this session (when viewing parent)
    if (metadata.forks) {
        for (const [eventId, forks] of Object.entries(metadata.forks)) {
            // Build sibling list: parent (this session) + all forks
            const siblings = [{ sessionId: sessionId, forkIndex: 0 }];

            const sortedForks = [...forks].sort((a, b) => new Date(a.time) - new Date(b.time));

            sortedForks.forEach((fork, i) => {
                siblings.push({
                    sessionId: fork.sessionId,
                    forkIndex: i + 1
                });
            });

            // Parent is always at index 0
            result[eventId] = {
                forkCount: siblings.length,
                forkIndex: 0,
                left: null, // Parent is always leftmost
                right:
                siblings.length > 1
                    ? {
                        forkIndex: 1,
                        sessionId: siblings[1].sessionId,
                        eventId: eventId
                    }
                    : null
            };
        }
    }

    return result;
}

/**
 * Determine which directories to scan based on date range
 * Implements hierarchical traversal - reads at coarsest granularity possible
 */
async function getDirectoriesToScan(baseDir, fromDate, toDate) {
    const dirs = [];

    if (!fromDate && !toDate) {
        // No date range - need to scan everything
        // This is expensive but necessary for "all sessions"
        return getAllHourDirectories(baseDir);
    }

    // Determine year range
    const startYear = fromDate ? fromDate.getFullYear() : 2020;
    const endYear = toDate ? toDate.getFullYear() : new Date().getFullYear();

    for (let year = startYear; year <= endYear; year++) {
        const yearPath = join(baseDir, year.toString());
        if (!(await exists(yearPath))) continue;

        // Determine month range for this year
        const startMonth = year === startYear && fromDate ? fromDate.getMonth() : 0;
        const endMonth = year === endYear && toDate ? toDate.getMonth() : 11;

        for (let month = startMonth; month <= endMonth; month++) {
            const monthPath = join(yearPath, (month + 1).toString().padStart(2, '0'));
            if (!(await exists(monthPath))) continue;

            // Determine day range for this month
            const startDay =
                year === startYear && month === startMonth && fromDate ? fromDate.getDate() : 1;
            const endDay = year === endYear && month === endMonth && toDate ? toDate.getDate() : 31;

            for (let day = startDay; day <= endDay; day++) {
                const dayPath = join(monthPath, day.toString().padStart(2, '0'));
                if (!(await exists(dayPath))) continue;

                // Determine hour range for this day
                const startHour =
                    year === startYear && month === startMonth && day === startDay && fromDate
                        ? fromDate.getHours()
                        : 0;
                const endHour =
                    year === endYear && month === endMonth && day === endDay && toDate
                        ? toDate.getHours()
                        : 23;

                for (let hour = startHour; hour <= endHour; hour++) {
                    const hourPath = join(dayPath, hour.toString().padStart(2, '0'));
                    if (await exists(hourPath)) {
                        dirs.push(hourPath);
                    }
                }
            }
        }
    }

    return dirs;
}

/**
 * Get all hour directories (expensive operation for listing all sessions)
 */
async function getAllHourDirectories(baseDir) {
    const dirs = [];

    if (!(await exists(baseDir))) return dirs;

    try {
        // Read years
        const years = await readdir(baseDir, { withFileTypes: true });
        for (const year of years) {
            if (!year.isDirectory()) continue;

            const yearPath = join(baseDir, year.name);
            const months = await readdir(yearPath, { withFileTypes: true });

            for (const month of months) {
                if (!month.isDirectory()) continue;

                const monthPath = join(yearPath, month.name);
                const days = await readdir(monthPath, { withFileTypes: true });

                for (const day of days) {
                    if (!day.isDirectory()) continue;

                    const dayPath = join(monthPath, day.name);
                    const hours = await readdir(dayPath, { withFileTypes: true });

                    for (const hour of hours) {
                        if (!hour.isDirectory()) continue;

                        const hourPath = join(dayPath, hour.name);
                        dirs.push(hourPath);
                    }
                }
            }
        }
    } catch (error) {
        console.warn('Error scanning directories:', error);
    }

    return dirs;
}

