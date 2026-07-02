import { json } from '@sveltejs/kit';
import { listDesignations } from 'thinksuit';
import * as broker from 'thinksuit-broker';

// The designations registry: named pointers to sessions (name -> sessionId).
// GET returns the whole map (direct read — atomic writes mean no torn reads);
// POST points a name at a session through the broker, the single writer of
// state.json.
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
        await broker.setDesignation(name.trim(), sessionId.trim());
        return json({ success: true });
    } catch (error) {
        // The broker maps invalid names to a 4xx; propagate its status when present.
        const status = error.statusCode || (/invalid designation name/.test(error.message) ? 400 : 500);
        console.error('Error setting designation:', error);
        return json({ error: error.message }, { status });
    }
}
