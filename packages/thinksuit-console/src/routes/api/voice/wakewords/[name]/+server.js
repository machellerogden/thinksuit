import { json } from '@sveltejs/kit';
import {
    readManifest,
    countSamples,
    setBinding,
    setThreshold,
    setEnabled,
    removeWakeword,
    wakewordExists
} from 'thinksuit-voice/wakewords';

// One wakeword. GET returns its manifest + sample counts. PATCH applies an
// allowlisted set of mutable fields (binding / threshold / enabled) via the
// store, which validates and throws on bad input (unknown action, out-of-range
// threshold, enabling with no promoted version) — surfaced as 400. DELETE
// removes the bundle. Changes apply on the next daemon restart.

export async function GET({ params }) {
    const { name } = params;
    if (!wakewordExists(name)) return json({ error: `no such wakeword: ${name}` }, { status: 404 });
    try {
        const manifest = readManifest(name);
        return json({
            ...manifest,
            samples: {
                positive: countSamples(name, 'positive'),
                negative: countSamples(name, 'negative')
            }
        });
    } catch (error) {
        return json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH({ params, request }) {
    const { name } = params;
    if (!wakewordExists(name)) return json({ error: `no such wakeword: ${name}` }, { status: 404 });
    const body = await request.json();
    try {
        let manifest;
        if ('binding' in body) manifest = setBinding(name, body.binding);
        if ('threshold' in body) manifest = setThreshold(name, body.threshold);
        if ('enabled' in body) manifest = setEnabled(name, body.enabled);
        if (!manifest) return json({ error: 'no recognized fields to update' }, { status: 400 });
        return json({ success: true, manifest });
    } catch (error) {
        // Store validation errors (bad action/threshold/enable) are user errors.
        return json({ error: error.message }, { status: 400 });
    }
}

export async function DELETE({ params }) {
    const { name } = params;
    if (!wakewordExists(name)) return json({ error: `no such wakeword: ${name}` }, { status: 404 });
    try {
        removeWakeword(name);
        return json({ success: true });
    } catch (error) {
        return json({ error: error.message }, { status: 500 });
    }
}
