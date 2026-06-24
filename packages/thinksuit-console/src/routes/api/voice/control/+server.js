import { json } from '@sveltejs/kit';
import { status, micOn, micOff, interrupt } from 'thinksuit-voice/control';

// Proxy the running voice daemon's control socket to the browser. GET returns the
// daemon status; POST {action} runs one of an allowlisted set of verbs. The voice
// client connects over ~/.thinksuit/voice.sock; when the daemon is down it throws
// an actionable "not running" error, surfaced here as 503 so the UI can show a
// distinct "daemon down" state rather than a generic failure.

const ACTIONS = {
    'mic-on': micOn,
    'mic-off': micOff,
    interrupt
};

const isDown = (error) => /not running/.test(error.message);

export async function GET() {
    try {
        return json({ status: await status() });
    } catch (error) {
        return json({ error: error.message }, { status: isDown(error) ? 503 : 500 });
    }
}

export async function POST({ request }) {
    const { action } = await request.json();
    const fn = ACTIONS[action];
    if (!fn) return json({ error: `unknown action: ${action}` }, { status: 400 });
    try {
        const result = await fn();
        return json({ success: true, action, ...result });
    } catch (error) {
        return json({ error: error.message }, { status: isDown(error) ? 503 : 500 });
    }
}
