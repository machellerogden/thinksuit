import { json } from '@sveltejs/kit';
import { promote, triggerExists } from 'thinksuit-voice/triggers';

// Make a version current. POST { version? } — omit to promote the latest.
export async function POST({ params, request }) {
    const { name } = params;
    if (!triggerExists(name)) return json({ error: `no such trigger: ${name}` }, { status: 404 });
    const { version } = await request.json().catch(() => ({}));
    try {
        const manifest = promote(name, version);
        return json({ success: true, manifest });
    } catch (error) {
        return json({ error: error.message }, { status: 400 });
    }
}
