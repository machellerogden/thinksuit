import { json } from '@sveltejs/kit';
import { getTrace } from 'thinksuit';

export async function GET({ params }) {
    try {
        const { id } = params;
        
        const traceData = await getTrace(id);
        
        if (!traceData) {
            return json({ error: 'Trace not found' }, { status: 404 });
        }
        
        return json(traceData);
    } catch (error) {
        console.error('Error reading trace:', error);
        return json({ error: 'Failed to read trace' }, { status: 500 });
    }
}