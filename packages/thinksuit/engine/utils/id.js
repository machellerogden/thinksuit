import { randomBytes } from 'node:crypto';

/**
 * Generate a timestamp-prefixed ID
 * Format: {ISO8601_timestamp_no_separators}-{shortId}
 * Example: 20250821T160152286Z-a8Kd9xQ2
 *
 * @returns {string} The generated ID
 */
export function generateId() {
    const timestamp = new Date()
        .toISOString()
        .replace(/[-:]/g, '') // Remove dashes and colons
        .replace('.', ''); // Remove decimal point
    const shortId = randomBytes(6).toString('base64url');
    return `${timestamp}-${shortId}`;
}

/**
 * Extract timestamp from a generated ID
 * @param {string} id - The generated ID
 * @returns {Date|null} The extracted date or null if invalid
 */
export function extractTimestamp(id) {
    const match = id.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z/);
    if (!match) return null;

    const [, year, month, day, hour, min, sec, ms] = match;
    return new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}.${ms}Z`);
}

/**
 * Extract prefix from a generated ID
 * @param {string} id - The generated ID
 * @returns {string|null} The prefix or null if invalid
 */
export function extractPrefix(id) {
    const parts = id.split('-');
    return parts.length >= 2 ? parts[0] : null;
}
