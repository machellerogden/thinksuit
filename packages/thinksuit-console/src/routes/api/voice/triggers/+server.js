import { json } from '@sveltejs/kit';
import { listTriggers, readManifest, countSamples, createTrigger } from 'thinksuit-voice/triggers';
import { ACTIONS } from 'thinksuit-voice/session';
import { NEG_PROMPTS } from 'thinksuit-voice/recorder';

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
        return json({ triggers, actions: ACTIONS, negPrompts: NEG_PROMPTS });
    } catch (error) {
        console.error('Error listing triggers:', error);
        return json({ error: error.message }, { status: 500 });
    }
}

// Create a new (empty) trigger from a name + phrase. Samples are enrolled
// separately via [name]/samples; training is still a CLI step until Slice 3.
export async function POST({ request }) {
    const { name, phrase } = await request.json().catch(() => ({}));
    try {
        createTrigger({ name, phrase });
        return json({ success: true, trigger: summarize(name) }, { status: 201 });
    } catch (error) {
        // Bad name, missing phrase, or already-exists are user errors.
        return json({ error: error.message }, { status: 400 });
    }
}
