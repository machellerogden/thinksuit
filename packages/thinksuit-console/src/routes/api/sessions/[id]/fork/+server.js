import { json } from '@sveltejs/kit';
import { forkSession } from 'thinksuit';

export async function POST({ params, request }) {
    try {
        const { id } = params;
        const body = await request.json();
        const { forkPoint, sourceSessionId } = body;
        
        if (forkPoint === undefined || forkPoint === null) {
            return json({ error: 'forkPoint is required' }, { status: 400 });
        }
        
        // Fork from the original session if sourceSessionId is provided (for replayed events)
        // Otherwise fork from the current session (for original events)
        const sessionToFork = sourceSessionId || id;
        
        // Fork the session
        const result = await forkSession(sessionToFork, forkPoint);
        
        if (!result.success) {
            return json({ error: result.error }, { status: 400 });
        }
        
        return json({
            sessionId: result.sessionId,
            success: true
        });
    } catch (error) {
        console.error('Error forking session:', error);
        return json({ error: 'Failed to fork session' }, { status: 500 });
    }
}