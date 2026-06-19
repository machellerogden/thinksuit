import { json } from '@sveltejs/kit';
import * as broker from 'thinksuit-broker';

export async function POST({ params }) {
    const { id: sessionId } = params;

    try {
        await broker.interrupt(sessionId, 'User requested cancellation from console');
        return json({ success: true, message: 'Session interrupted successfully', sessionId });
    } catch (error) {
        console.error(`Failed to interrupt session ${sessionId}:`, error);
        return json(
            { success: false, error: error.message, sessionId },
            { status: error.statusCode || 500 }
        );
    }
}

// GET endpoint to check if a session can be interrupted (i.e. has an in-flight turn).
export async function GET({ params }) {
    const { id: sessionId } = params;
    try {
        const status = await broker.status(sessionId);
        return json({ sessionId, canInterrupt: !!status.live, startTime: null });
    } catch {
        return json({ sessionId, canInterrupt: false, startTime: null });
    }
}
