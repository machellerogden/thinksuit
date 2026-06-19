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

/**
 * Like derivePendingApproval, but returns the pending request's detail
 * ({ approvalId, tool, args }) so a queue view can show what's being asked, not
 * just an opaque id. Returns null when nothing is pending.
 *
 * @param {Array<{event?: string, approvalId?: string, data?: {tool?: string, args?: unknown}}>} entries
 * @returns {{ approvalId: string, tool: string|undefined, args: unknown }|null}
 */
export function derivePendingApprovalDetail(entries) {
    let pending = null;
    for (const entry of entries) {
        const { event, approvalId } = entry;
        if (!approvalId) continue;
        if (event === 'execution.tool.approval-requested') {
            pending = { approvalId, tool: entry.data?.tool, args: entry.data?.args };
        } else if (event === 'execution.tool.approved' || event === 'execution.tool.denied') {
            if (pending && pending.approvalId === approvalId) pending = null;
        }
    }
    return pending;
}
