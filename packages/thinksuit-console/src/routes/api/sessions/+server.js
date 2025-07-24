import { json } from '@sveltejs/kit';
import { listSessions } from 'thinksuit';

export async function GET({ url }) {
    try {
        // Get query parameters
        const fromTime = url.searchParams.get('fromTime');
        const toTime = url.searchParams.get('toTime');
        const sortOrder = url.searchParams.get('sortOrder') || 'desc';

        // Use the new listSessions API
        const sessions = await listSessions({
            fromTime,
            toTime,
            sortOrder
        });

        // Transform to match the existing console expectations
        const transformedSessions = sessions.map(session => ({
            id: session.id,
            filename: `${session.id}.jsonl`,
            status: session.status,
            timestamp: session.firstEvent?.time || null,
            lastUpdate: session.lastEvent?.time || null,
            firstInput: session.firstEvent?.input || session.secondEvent?.input || null,
            // Approximate line count from events (at minimum 1 per event we have)
            lineCount: [session.firstEvent, session.secondEvent, session.lastEvent]
                .filter(Boolean)
                .filter((e, i, arr) => arr.indexOf(e) === i).length // dedupe if same
        }));

        return json(transformedSessions);
    } catch (error) {
        console.error('Error reading sessions:', error);
        return json({ error: 'Failed to read sessions' }, { status: 500 });
    }
}
