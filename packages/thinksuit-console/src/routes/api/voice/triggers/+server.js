import { json } from '@sveltejs/kit';
import { listTriggers, readManifest, countSamples } from 'thinksuit-voice/triggers';
import { ACTIONS } from 'thinksuit-voice/session';

// The trigger library, read through the voice package's store (never the
// filesystem directly). GET returns a summary per trigger plus the action
// vocabulary so the UI can render the binding control. Mutations live on
// [name]/.

function summarize(name) {
    const m = readManifest(name);
    const current = m.versions?.find((v) => v.version === m.current) || null;
    return {
        name,
        phrase: m.phrase,
        binding: m.binding ?? 'converse',
        enabled: !!m.enabled,
        threshold: m.threshold,
        current: m.current,
        versionCount: m.versions?.length ?? 0,
        metrics: current?.metrics ?? null,
        samples: {
            positive: countSamples(name, 'positive'),
            negative: countSamples(name, 'negative')
        }
    };
}

export async function GET() {
    try {
        const triggers = listTriggers().map(summarize);
        return json({ triggers, actions: ACTIONS });
    } catch (error) {
        console.error('Error listing triggers:', error);
        return json({ error: error.message }, { status: 500 });
    }
}
