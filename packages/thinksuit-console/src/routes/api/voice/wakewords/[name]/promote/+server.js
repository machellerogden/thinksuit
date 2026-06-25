import { json } from '@sveltejs/kit';
import { promote, wakewordExists } from 'thinksuit-voice/wakewords';

// Make a version current. POST { version? } — omit to promote the latest.
export async function POST({ params, request }) {
    const { name } = params;
    if (!wakewordExists(name)) return json({ error: `no such wakeword: ${name}` }, { status: 404 });
    const { version } = await request.json().catch(() => ({}));
    try {
        const manifest = promote(name, version);
        return json({ success: true, manifest });
    } catch (error) {
        return json({ error: error.message }, { status: 400 });
    }
}
