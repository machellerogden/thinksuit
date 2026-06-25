import { json } from '@sveltejs/kit';
import { listWakewords, readManifest, countSamples, createWakeword } from 'thinksuit-voice/wakewords';
import { ACTIONS } from 'thinksuit-voice/session';
import { NEG_PROMPTS } from 'thinksuit-voice/recorder';

// The wakeword library, read through the voice package's store (never the
// filesystem directly). GET returns a summary per wakeword plus the action
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
        const wakewords = listWakewords().map(summarize);
        return json({ wakewords, actions: ACTIONS, negPrompts: NEG_PROMPTS });
    } catch (error) {
        console.error('Error listing wakewords:', error);
        return json({ error: error.message }, { status: 500 });
    }
}

// Create a new (empty) wakeword from a name + phrase. Samples are enrolled
// separately via [name]/samples; training is still a CLI step until Slice 3.
export async function POST({ request }) {
    const { name, phrase } = await request.json().catch(() => ({}));
    try {
        createWakeword({ name, phrase });
        return json({ success: true, wakeword: summarize(name) }, { status: 201 });
    } catch (error) {
        // Bad name, missing phrase, or already-exists are user errors.
        return json({ error: error.message }, { status: 400 });
    }
}
