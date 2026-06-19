import { json } from '@sveltejs/kit';
import * as broker from 'thinksuit-broker';

/**
 * POST /api/approvals/[id] - Resolve a pending tool approval.
 *
 * [id] is the approvalId. The owning turn lives in the broker, so we also need
 * the sessionId (the frontend has it from the approval-requested event) to route
 * the decision to the correct worker.
 */
export async function POST({ params, request }) {
    const { id: approvalId } = params;

    try {
        const { approved, sessionId } = await request.json();

        if (typeof approved !== 'boolean') {
            return json({ error: 'approved must be a boolean' }, { status: 400 });
        }
        if (!sessionId) {
            return json({ error: 'sessionId is required' }, { status: 400 });
        }

        const result = await broker.approve(sessionId, { approved, approvalId });
        return json({ success: true, approvalId: result.approvalId, approved });
    } catch (error) {
        console.error('Error resolving approval:', error);
        return json({ error: error.message }, { status: error.statusCode || 500 });
    }
}
