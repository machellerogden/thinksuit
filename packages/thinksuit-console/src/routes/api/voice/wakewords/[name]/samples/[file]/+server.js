import { json } from '@sveltejs/kit';
import { readSampleClip, deleteSample, wakewordExists } from 'thinksuit-voice/wakewords';

// One saved enrollment clip. GET streams the WAV (so a native <audio> can play
// it); DELETE removes it. ?kind=positive|negative selects the set. The store
// validates the filename (guards path traversal) and throws on a bad kind/file.

function kindOf(url) {
    return url.searchParams.get('kind');
}

export async function GET({ params, url }) {
    const { name, file } = params;
    if (!wakewordExists(name)) return json({ error: `no such wakeword: ${name}` }, { status: 404 });
    try {
        const bytes = readSampleClip(name, kindOf(url), file);
        return new Response(bytes, {
            headers: {
                'Content-Type': 'audio/wav',
                'Content-Length': String(bytes.length),
                'Cache-Control': 'no-store'
            }
        });
    } catch (error) {
        return json({ error: error.message }, { status: 404 });
    }
}

export async function DELETE({ params, url }) {
    const { name, file } = params;
    if (!wakewordExists(name)) return json({ error: `no such wakeword: ${name}` }, { status: 404 });
    try {
        deleteSample(name, kindOf(url), file);
        return json({ success: true });
    } catch (error) {
        return json({ error: error.message }, { status: 400 });
    }
}
