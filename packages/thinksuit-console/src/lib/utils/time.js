/**
 * Time formatting utilities for ThinkSuit Console
 * All formatters accept ISO 8601 timestamp strings or Date objects
 */

/**
 * Format timestamp as time with seconds (12-hour format)
 * Example: "3:45:23 PM"
 * Use for: Message timestamps, general UI
 */
export function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

/**
 * Format timestamp as time with milliseconds (24-hour format)
 * Example: "15:45:23.123"
 * Use for: Trace events, debugging, precision timing
 */
export function formatTimeWithMs(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3
    });
}

/**
 * Format timestamp as full date and time
 * Example: "1/7/2025, 3:45:23 PM"
 * Use for: Session lists, metadata displays
 */
export function formatDateTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleString('en-US');
}

/**
 * Format timestamp as ISO 8601 string
 * Example: "2025-01-07T15:45:23.123Z"
 * Use for: Technical details, API responses, debugging
 */
export function formatISO(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toISOString();
}

/**
 * Format duration in milliseconds as human-readable string
 * Example: "2m 34s" or "45s"
 * Use for: Session durations, elapsed time
 */
export function formatDuration(ms) {
    if (!ms) return '';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
        return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    } else {
        return `${seconds}s`;
    }
}
