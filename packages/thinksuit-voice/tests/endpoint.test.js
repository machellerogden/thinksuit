import { describe, it, expect } from 'vitest';
import { createEndpointer } from '../src/audio/endpoint.js';

const FRAME = 1280; // 80ms at 16k
const silence = () => new Int16Array(FRAME); // zeros
const speech = () => {
    const f = new Int16Array(FRAME);
    for (let i = 0; i < FRAME; i++) f[i] = 4000; // well above the RMS threshold
    return f;
};

const pushAll = (ep, frames) => frames.map((f) => ep.push(f));

describe('createEndpointer', () => {
    it('captures speech and ends after the trailing-silence gap', () => {
        const ep = createEndpointer({ silenceMs: 160, startTimeoutMs: 1000 });
        // 5 speech frames, then silence until the 160ms gap (2 frames) trips done.
        const results = pushAll(ep, [speech(), speech(), speech(), speech(), speech(), silence(), silence()]);
        const last = results.at(-1);
        expect(last.done).toBe(true);
        expect(last.aborted).toBe(false);
        // Captured audio includes the speech plus the trailing silence frames.
        expect(ep.result().length).toBeGreaterThanOrEqual(5 * FRAME);
    });

    it('aborts when no speech starts before the timeout', () => {
        const ep = createEndpointer({ startTimeoutMs: 160 }); // ~2 frames
        const results = pushAll(ep, [silence(), silence(), silence()]);
        expect(results.at(-1)).toEqual({ done: true, aborted: true });
    });

    it('does not end on a brief silence shorter than the gap', () => {
        const ep = createEndpointer({ silenceMs: 240 }); // 3 frames
        const r = pushAll(ep, [speech(), speech(), silence(), silence(), speech()]);
        expect(r.every((x) => x.done === false)).toBe(true);
    });

    it('keeps the onset when speech follows a pause, trimming the leading silence', () => {
        const guardLeadMs = 100; // 1600 samples
        const ep = createEndpointer({ silenceMs: 160, startTimeoutMs: 2000, guardLeadMs });
        // 3 frames of leading pause, 3 of speech, then silence to end.
        const r = pushAll(ep, [
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
        // Window starts no earlier than (onset − guard): onset is at 3*FRAME.
        const onset = 3 * FRAME;
        expect(out.length).toBeLessThanOrEqual(8 * FRAME - (onset - guardSamples));
    });

    it('never re-includes audio before the cue floor', () => {
        // cueMs covers the first two frames; "speech" inside the floor is ignored
        // for onset, and the window can never start before it.
        const ep = createEndpointer({ cueMs: 160, silenceMs: 160, guardLeadMs: 0 });
        const r = pushAll(ep, [speech(), speech(), speech(), speech(), silence(), silence()]);
        expect(r.at(-1).done).toBe(true);
        const out = ep.result();
        // Frames 0–1 (the cue floor) are excluded; ~from frame 2 onward remains.
        expect(out.length).toBeLessThanOrEqual(4 * FRAME);
    });
});
