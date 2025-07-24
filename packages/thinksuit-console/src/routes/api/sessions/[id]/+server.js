import { json } from '@sveltejs/kit';
import { getSession, readSessionLinesFrom } from 'thinksuit';

export async function GET({ params, url }) {
    try {
        const { id } = params;
        const fromIndex = url.searchParams.get('fromIndex');
        
        // If fromIndex is specified, do incremental read
        if (fromIndex !== null) {
            const index = parseInt(fromIndex, 10);
            if (isNaN(index) || index < 0) {
                return json({ error: 'Invalid fromIndex parameter' }, { status: 400 });
            }
            
            const result = await readSessionLinesFrom(id, index);
            
            if (!result) {
                return json({ error: 'Session not found' }, { status: 404 });
            }
            
            return json(result);
        }
        
        // Otherwise, use the full getSession API
        const session = await getSession(id);
        
        if (!session) {
            return json({ error: 'Session not found' }, { status: 404 });
        }

        // Return in the format the console expects
        return json({
            id: session.id,
            entries: session.entries,
            entryCount: session.metadata.entryCount,
            traceId: session.metadata.traceId,
            hasTrace: session.metadata.hasTrace
        });
    } catch (error) {
        console.error('Error reading session:', error);
        return json({ error: 'Failed to read session' }, { status: 500 });
    }
}
