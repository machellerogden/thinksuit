/**
 * Derive session status from session entries
 * Shared logic between frontend and backend
 */

import { SESSION_EVENTS, SESSION_STATUS, READY_EVENTS } from '../constants/events.js';

/**
 * Derive session status from an array of session entries
 * @param {Array} entries - Array of session event entries
 * @returns {string} - One of the SESSION_STATUS values
 */
export function deriveSessionStatus(entries) {
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
        return SESSION_STATUS.EMPTY;
    }

    const firstEntry = entries[0];
    const lastEntry = entries[entries.length - 1];

    // Check if only PENDING event (initialized)
    if (entries.length === 1 && firstEntry?.event === SESSION_EVENTS.PENDING) {
        return SESSION_STATUS.INITIALIZED;
    }

    // Check if ready (last event is in READY_EVENTS set)
    // READY_EVENTS includes SESSION_EVENTS.RESPONSE and SESSION_EVENTS.PENDING
    if (lastEntry && READY_EVENTS.has(lastEntry?.event)) {
        return SESSION_STATUS.READY;
    }

    // If has input but no response yet - busy
    if (entries.some((e) => e?.event === SESSION_EVENTS.INPUT)) {
        return SESSION_STATUS.BUSY;
    }

    // Default to busy for any other state
    return SESSION_STATUS.BUSY;
}
