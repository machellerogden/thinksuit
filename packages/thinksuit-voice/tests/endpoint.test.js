import { describe, it, expect } from 'vitest';
import { createEndpointer } from '../src/audio/endpoint.js';
import { createRmsDetector } from '../src/detect/rms.js';

const FRAME = 1280; // 80ms at 16k
const silence = () => new Int16Array(FRAME); // zeros
const speech = () => {
    const f = new Int16Array(FRAME);
    f.fill(4000); // well above the RMS threshold
    return f;
};

// Inject the real rms detector (default threshold 400). speech()=4000 crosses it,
// silence()=0 clears it, so the endpointer sees deterministic decisions. Onset math
// now runs at 512-sample (32ms) chunk granularity rather than the old 20ms scan, so
// window-length bounds carry a one-chunk (±512) tolerance.
const endpointer = (opts) => createEndpointer({ ...opts, detector: createRmsDetector({ threshold: 400 }) });

const pushAll = async (ep, frames) => {
    const out = [];
    for (const f of frames) out.push(await ep.push(f));
    return out;
};

describe('createEndpointer', () => {
    it('captures speech and ends after the trailing-silence gap', async () => {
        const ep = endpointer({ silenceMs: 160, startTimeoutMs: 1000 });
        // 5 speech frames, then trailing silence past the 160ms gap. At 512-sample
        // chunk granularity the speech→silence boundary chunk still reads speech, so
        // the gap needs to fully span clean chunks — 3 silence frames trips done.
        const results = await pushAll(ep, [speech(), speech(), speech(), speech(), speech(), silence(), silence(), silence()]);
        const last = results.at(-1);
        expect(last.done).toBe(true);
        expect(last.aborted).toBe(false);
        // Captured audio includes the speech plus the trailing silence frames.
        expect(ep.result().length).toBeGreaterThanOrEqual(5 * FRAME);
    });

    it('aborts when no speech starts before the timeout', async () => {
        const ep = endpointer({ startTimeoutMs: 160 }); // ~2 frames
        const results = await pushAll(ep, [silence(), silence(), silence()]);
        expect(results.at(-1)).toEqual({ done: true, aborted: true });
    });

    it('does not end on a brief silence shorter than the gap', async () => {
        const ep = endpointer({ silenceMs: 240 }); // 3 frames
        const r = await pushAll(ep, [speech(), speech(), silence(), silence(), speech()]);
        expect(r.every((x) => x.done === false)).toBe(true);
    });

    it('keeps the onset when speech follows a pause, trimming the leading silence', async () => {
        const guardLeadMs = 100; // 1600 samples
        const ep = endpointer({ silenceMs: 160, startTimeoutMs: 2000, guardLeadMs });
        // 3 frames of leading pause, 3 of speech, then silence to end.
        const r = await pushAll(ep, [
            silence(), silence(), silence(),
            speech(), speech(), speech(),
            silence(), silence()
        ]);
        expect(r.at(-1)).toEqual({ done: true, aborted: false });

        const out = ep.result();
        const guardSamples = Math.round((16000 * guardLeadMs) / 1000);
        // The full speech is retained...
        expect(out.length).toBeGreaterThanOrEqual(3 * FRAME);
        // ...but the leading pause is trimmed to ~the guard lead, so we don't keep
        // all three leading-silence frames.
        expect(out.length).toBeLessThan(8 * FRAME);
        // Window starts no earlier than (onset − guard); onset ≈ 3*FRAME, ±one chunk.
        const onset = 3 * FRAME;
        expect(out.length).toBeLessThanOrEqual(8 * FRAME - (onset - guardSamples) + 512);
    });

    it('never re-includes audio before the cue floor', async () => {
        // cueMs covers the first two frames; "speech" inside the floor is ignored
        // for onset, and the window can never start before it.
        const ep = endpointer({ cueMs: 160, silenceMs: 160, guardLeadMs: 0 });
        const r = await pushAll(ep, [speech(), speech(), speech(), speech(), silence(), silence()]);
        expect(r.at(-1).done).toBe(true);
        const out = ep.result();
        // Frames 0–1 (the cue floor) are excluded; ~from frame 2 onward remains.
        expect(out.length).toBeLessThanOrEqual(4 * FRAME + 512);
    });
});
