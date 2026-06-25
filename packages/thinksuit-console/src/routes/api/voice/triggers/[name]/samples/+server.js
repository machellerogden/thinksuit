import { json } from '@sveltejs/kit';
import { sampleClipPath, nextSampleIndex, countSamples, listSamples, triggerExists } from 'thinksuit-voice/triggers';
import { trim, peakOf, writeWavFile } from 'thinksuit-voice/recorder';

// Persist one enrollment clip recorded in the browser. Body is raw 16 kHz mono
// Int16 PCM (application/octet-stream); ?kind=positive|negative. We trim to the
// spoken region and write a WAV into the trigger's sample set, reusing the same
// helpers the CLI enroll uses. Training stays a separate step.

const SAMPLE_RATE = 16000;
const MIN_SAMPLES = SAMPLE_RATE * 0.2; // reject clips shorter than ~0.2s of speech

// List the saved clips per kind so the manage-samples view can render them.
export async function GET({ params }) {
    const { name } = params;
    if (!triggerExists(name)) return json({ error: `no such trigger: ${name}` }, { status: 404 });
    return json({
        positive: listSamples(name, 'positive'),
        negative: listSamples(name, 'negative')
    });
}

export async function POST({ params, request, url }) {
    const { name } = params;
    const kind = url.searchParams.get('kind');
    if (!triggerExists(name)) return json({ error: `no such trigger: ${name}` }, { status: 404 });
    if (kind !== 'positive' && kind !== 'negative') {
        return json({ error: `kind must be positive or negative, got ${kind}` }, { status: 400 });
    }
    try {
        const buf = await request.arrayBuffer();
        // Int16Array requires an even byte length; copy to be safe on alignment.
        const raw = new Int16Array(buf.byteLength >> 1);
        new Uint8Array(raw.buffer).set(new Uint8Array(buf, 0, raw.length * 2));
        const clip = trim(raw);
        if (clip.length < MIN_SAMPLES) {
            return json({ error: 'clip too short — speak a little longer' }, { status: 400 });
        }
        const index = nextSampleIndex(name, kind);
        writeWavFile(sampleClipPath(name, kind, index), clip);
        return json({
            index,
            peak: peakOf(clip),
            durationMs: Math.round((clip.length / SAMPLE_RATE) * 1000),
            samples: {
                positive: countSamples(name, 'positive'),
                negative: countSamples(name, 'negative')
            }
        });
    } catch (error) {
        console.error('Error saving sample:', error);
        return json({ error: error.message }, { status: 500 });
    }
}
