import { json } from '@sveltejs/kit';
import { listDesignations, setDesignation } from 'thinksuit';

// The designations registry: named pointers to sessions (name -> sessionId).
// GET returns the whole map; POST points a name at a session.
export async function GET() {
    try {
        return json({ designations: listDesignations() });
    } catch (error) {
        console.error('Error reading designations:', error);
        return json({ error: 'Failed to read designations' }, { status: 500 });
    }
}

export async function POST({ request }) {
    try {
        const { name, sessionId } = await request.json();
        if (typeof name !== 'string' || !name.trim()) {
            return json({ error: 'name is required' }, { status: 400 });
        }
        if (typeof sessionId !== 'string' || !sessionId.trim()) {
            return json({ error: 'sessionId is required' }, { status: 400 });
        }
        setDesignation(name.trim(), sessionId.trim());
        return json({ success: true });
    } catch (error) {
        // Invalid-name errors from the kernel are client errors.
        const status = /invalid designation name/.test(error.message) ? 400 : 500;
        console.error('Error setting designation:', error);
        return json({ error: error.message }, { status });
    }
}
