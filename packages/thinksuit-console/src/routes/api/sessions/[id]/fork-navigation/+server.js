import { json } from '@sveltejs/kit';
import { getSessionForks } from 'thinksuit';

export async function GET({ params }) {
    try {
        const { id } = params;
        
        // Get fork navigation structure for this session
        const forkNavigation = await getSessionForks(id);
        
        return json(forkNavigation);
    } catch (error) {
        console.error('Error getting fork navigation:', error);
        return json({ error: 'Failed to get fork navigation' }, { status: 500 });
    }
}