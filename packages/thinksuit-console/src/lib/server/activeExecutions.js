/**
 * In-memory registry of active ThinkSuit executions
 * Maps sessionId to interrupt function and metadata
 */

// Map<sessionId, { interrupt: Function, startTime: Date }>
const activeExecutions = new Map();

/**
 * Register an active execution
 */
export function registerExecution(sessionId, interrupt) {
    activeExecutions.set(sessionId, {
        interrupt,
        startTime: new Date()
    });
}

/**
 * Get an active execution
 */
export function getExecution(sessionId) {
    return activeExecutions.get(sessionId);
}

/**
 * Remove an execution from the registry
 */
export function removeExecution(sessionId) {
    activeExecutions.delete(sessionId);
}

/**
 * Check if an execution is active
 */
export function hasExecution(sessionId) {
    return activeExecutions.has(sessionId);
}

/**
 * Get all active executions (for debugging/monitoring)
 */
export function getAllExecutions() {
    return Array.from(activeExecutions.entries()).map(([sessionId, data]) => ({
        sessionId,
        startTime: data.startTime
    }));
}