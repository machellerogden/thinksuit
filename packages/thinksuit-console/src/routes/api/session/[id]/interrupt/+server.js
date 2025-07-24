import { json } from '@sveltejs/kit';
import { getExecution, removeExecution } from '$lib/server/activeExecutions.js';

export async function POST({ params }) {
    const { id: sessionId } = params;

    // Check if session is in our active registry
    const execution = getExecution(sessionId);

    if (!execution) {
        return json({
            success: false,
            error: 'No active execution found for this session',
            sessionId
        }, { status: 404 });
    }

    try {
        // Call the interrupt function
        const result = await execution.interrupt('User requested cancellation from console');

        if (result.success) {
            // Remove from registry after successful interrupt
            removeExecution(sessionId);

            return json({
                success: true,
                message: 'Session interrupted successfully',
                sessionId
            });
        } else {
            return json({
                success: false,
                error: result.error || 'Failed to interrupt session',
                sessionId
            }, { status: 500 });
        }
    } catch (error) {
        console.error(`Failed to interrupt session ${sessionId}:`, error);
        return json({
            success: false,
            error: error.message || 'Interrupt operation failed',
            sessionId
        }, { status: 500 });
    }
}

// GET endpoint to check if a session can be interrupted
export async function GET({ params }) {
    const { id: sessionId } = params;
    const execution = getExecution(sessionId);

    return json({
        sessionId,
        canInterrupt: !!execution,
        startTime: execution?.startTime || null
    });
}