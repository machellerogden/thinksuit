import { json } from '@sveltejs/kit';
import * as broker from 'thinksuit-broker';

// Interrupt every live turn at once; the broker daemon stays up.
export async function POST() {
    try {
        const res = await broker.interruptAll('User requested interrupt-all from console');
        return json({ success: true, interrupted: res.interrupted, count: res.count });
    } catch (error) {
        console.error('Failed to interrupt all sessions:', error);
        return json(
            { success: false, error: error.message },
            { status: error.statusCode || 500 }
        );
    }
}

// Live-session count, so the UI can show/enable the control only when there is
// in-flight work. The broker registry is the authoritative live set (the disk-based
// /api/sessions does not know liveness).
export async function GET() {
    try {
        const sessions = await broker.sessions();
        return json({ count: sessions.length, sessions });
    } catch {
        return json({ count: 0, sessions: [] });
    }
}
