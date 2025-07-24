import { json } from '@sveltejs/kit';
import { resolveApproval, getApprovalInfo } from 'thinksuit';

/**
 * GET /api/approvals/[id] - Get approval info
 */
export async function GET({ params }) {
    const { id } = params;
    
    const info = getApprovalInfo(id);
    if (!info) {
        return json({ error: 'Approval not found' }, { status: 404 });
    }
    
    return json(info);
}

/**
 * POST /api/approvals/[id] - Resolve an approval
 */
export async function POST({ params, request }) {
    const { id } = params;
    
    try {
        const { approved } = await request.json();
        
        if (typeof approved !== 'boolean') {
            return json({ error: 'approved must be a boolean' }, { status: 400 });
        }
        
        const resolved = resolveApproval(id, approved);
        
        if (!resolved) {
            return json({ error: 'Approval not found or already resolved' }, { status: 404 });
        }
        
        return json({ 
            success: true, 
            approvalId: id,
            approved 
        });
    } catch (error) {
        console.error('Error resolving approval:', error);
        return json({ 
            error: error.message 
        }, { status: 500 });
    }
}