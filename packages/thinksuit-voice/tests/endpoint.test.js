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
});
