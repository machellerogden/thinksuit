/**
 * Derive the most recent still-pending approvalId from a session's event
 * entries: an `approval-requested` id that has not been followed by a matching
 * `approved`/`denied`. The JSONL event log is the source of truth, so this works
 * regardless of which client (or process) requested the turn.
 *
 * @param {Array<{event?: string, approvalId?: string}>} entries
 * @returns {string|null}
 */
export function derivePendingApproval(entries) {
    let pending = null;
    for (const entry of entries) {
        const { event, approvalId } = entry;
        if (!approvalId) continue;
        if (event === 'execution.tool.approval-requested') {
            pending = approvalId;
        } else if (event === 'execution.tool.approved' || event === 'execution.tool.denied') {
            if (pending === approvalId) pending = null;
        }
    }
    return pending;
}
