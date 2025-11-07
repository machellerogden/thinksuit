import { randomBytes } from 'crypto';
import { DEFAULT_APPROVAL_TIMEOUT_MS } from '../constants/defaults.js';
import { EXECUTION_EVENTS } from '../constants/events.js';

// In-memory registry of pending approvals
const pendingApprovals = new Map();

/**
 * Generate a unique approval ID
 */
function generateApprovalId() {
    return randomBytes(16).toString('hex');
}

/**
 * Request tool approval asynchronously
 * @param {Object} request - Tool request { tool, args }
 * @param {string} sessionId - Session ID for correlation
 * @param {Object} logger - Logger instance
 * @param {number} timeoutMs - Optional timeout in milliseconds (use -1 to disable timeout)
 * @param {string} parentBoundaryId - Optional parent boundary ID for nesting
 * @returns {Promise<{approved: boolean, approvalId: string}>} - Resolves to approval decision and ID
 */
export async function requestToolApproval(request, sessionId, logger, timeoutMs = DEFAULT_APPROVAL_TIMEOUT_MS, parentBoundaryId = null) {
    const approvalId = generateApprovalId();

    // Log event that console will see via session events
    const logData = {
        event: EXECUTION_EVENTS.TOOL_APPROVAL_REQUESTED,
        approvalId,
        sessionId,
        data: request
    };

    if (parentBoundaryId) {
        logData.parentBoundaryId = parentBoundaryId;
    }

    logger.info(logData, `Tool approval requested: ${request.tool}`);

    // Create timeout that we can cancel
    let timeoutId;

    // Create promise that will resolve when approval comes in
    const approvalPromise = new Promise((resolve) => {
        pendingApprovals.set(approvalId, {
            resolve,
            request,
            sessionId,
            requestedAt: Date.now(),
            timeoutId: null // Will be set below
        });
    });

    // Create timeout promise if enabled (use -1 to disable)
    let timeoutPromise;
    if (timeoutMs === -1) {
        // No timeout - approval waits indefinitely
        timeoutPromise = new Promise(() => {}); // Never resolves
    } else {
        const actualTimeout = timeoutMs || DEFAULT_APPROVAL_TIMEOUT_MS;
        timeoutPromise = new Promise((resolve) => {
            timeoutId = setTimeout(() => {
                pendingApprovals.delete(approvalId);
                // Don't log the timeout event to avoid polluting session state
                // Just silently deny after timeout
                resolve(false); // Timeout = deny
            }, actualTimeout);
        });
    }

    // Store timeout ID so we can cancel it
    const pending = pendingApprovals.get(approvalId);
    if (pending) {
        pending.timeoutId = timeoutId;
    }

    // Race between approval and timeout
    const approved = await Promise.race([approvalPromise, timeoutPromise]);
    return { approved, approvalId };
}

/**
 * Resolve a pending approval
 * @param {string} approvalId - Approval ID to resolve
 * @param {boolean} approved - Approval decision
 * @returns {boolean} - True if approval was found and resolved
 */
export function resolveApproval(approvalId, approved) {
    const pending = pendingApprovals.get(approvalId);
    if (!pending) {
        return false; // Approval not found or already resolved
    }

    // Cancel the timeout
    if (pending.timeoutId) {
        clearTimeout(pending.timeoutId);
    }

    pendingApprovals.delete(approvalId);
    pending.resolve(approved);
    return true;
}

/**
 * Get pending approval info (for debugging/UI)
 * @param {string} approvalId - Approval ID
 * @returns {Object|null} - Approval info or null if not found
 */
export function getApprovalInfo(approvalId) {
    const pending = pendingApprovals.get(approvalId);
    if (!pending) return null;

    return {
        request: pending.request,
        sessionId: pending.sessionId,
        requestedAt: pending.requestedAt
    };
}

/**
 * Clean up old approvals (housekeeping)
 * @param {number} maxAgeMs - Maximum age in milliseconds before auto-deny
 */
export function cleanupOldApprovals(maxAgeMs = DEFAULT_APPROVAL_TIMEOUT_MS) {
    const now = Date.now();
    const maxAge = maxAgeMs === -1 ? Infinity : (maxAgeMs || DEFAULT_APPROVAL_TIMEOUT_MS);

    for (const [id, pending] of pendingApprovals.entries()) {
        if (now - pending.requestedAt > maxAge) {
            pendingApprovals.delete(id);
            pending.resolve(false); // Auto-deny old approvals
        }
    }
}
