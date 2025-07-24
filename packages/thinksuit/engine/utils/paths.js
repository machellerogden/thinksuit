import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdirSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';

const SESSIONS_BASE =
    process.env.THINKSUIT_SESSION_DIR || join(homedir(), '.thinksuit', 'sessions', 'streams');
const SESSION_METADATA_BASE =
    process.env.THINKSUIT_SESSION_METADATA_DIR ||
    join(homedir(), '.thinksuit', 'sessions', 'metadata');
const TRACES_BASE = process.env.THINKSUIT_TRACE_DIR || join(homedir(), '.thinksuit', 'traces');

/**
 * Extract date components from new format ID
 * @param {string} id - Format: 20241226T164513435Z-xXKTbcJ2
 * @returns {{year: string, month: string, day: string, hour: string}}
 */
export function extractDateParts(id) {
    const match = id.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})/);
    if (!match) throw new Error(`Invalid ID format: ${id}`);

    const [, year, month, day, hour] = match;
    return { year, month, day, hour };
}

/**
 * Build partitioned path for a session file
 * @param {string} sessionId
 * @returns {string} Full path to session file
 */
export function getSessionFilePath(sessionId) {
    const { year, month, day, hour } = extractDateParts(sessionId);
    return join(SESSIONS_BASE, year, month, day, hour, `${sessionId}.jsonl`);
}

/**
 * Build partitioned path for a metadata file
 * @param {string} sessionId
 * @returns {string} Full path to metadata file
 */
export function getMetadataFilePath(sessionId) {
    const { year, month, day, hour } = extractDateParts(sessionId);
    return join(SESSION_METADATA_BASE, year, month, day, hour, `${sessionId}.json`);
}

/**
 * Build partitioned path for a trace file
 * @param {string} traceId
 * @returns {string} Full path to trace file
 */
export function getTraceFilePath(traceId) {
    const { year, month, day, hour } = extractDateParts(traceId);
    return join(TRACES_BASE, year, month, day, hour, `${traceId}.jsonl`);
}

/**
 * Ensure directory exists for a file path (sync version)
 * @param {string} filePath
 */
export function ensureDirectoryExists(filePath) {
    const dir = filePath.substring(0, filePath.lastIndexOf('/'));
    mkdirSync(dir, { recursive: true });
}

/**
 * Ensure directory exists for a file path (async version)
 * @param {string} filePath
 */
export async function ensureDirectoryExistsAsync(filePath) {
    const dir = filePath.substring(0, filePath.lastIndexOf('/'));
    await mkdir(dir, { recursive: true });
}

export { SESSIONS_BASE, SESSION_METADATA_BASE, TRACES_BASE };
