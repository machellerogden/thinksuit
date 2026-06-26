import { describe, it, expect, beforeEach } from 'vitest';
import { createDetector } from '../src/wake/detector.js';
import { WINDOW_SAMPLES } from '../src/wake/pipeline.js';

// The detector is pure aside from the pipeline it's handed, so we stub the
// pipeline with canned score dicts — no ONNX, no mic.
describe('wake detector (multi-head)', () => {
    let scores;
    let pipeline;
    const full = () => new Int16Array(WINDOW_SAMPLES); // one full window per push
    const delay = (ms) => new Promise((r) => setTimeout(r, ms));

    beforeEach(() => {
        scores = {};
        pipeline = { score: async () => scores };
    });

    it('fires the highest head that meets its own threshold; onScore gets the dict', async () => {
        const wakes = [];
        const seen = [];
        const d = createDetector({
            pipeline,
            thresholds: { a: 0.7, b: 0.7 },
            onWake: (w) => wakes.push(w),
            onScore: (s) => seen.push(s)
        });
        scores = { a: 0.72, b: 0.91 };
        await d.push(full());
        expect(seen).toEqual([{ a: 0.72, b: 0.91 }]);
        expect(wakes).toHaveLength(1);
        expect(wakes[0]).toMatchObject({ name: 'b', confidence: 0.91 });
    });

    it('a high score below its own threshold loses to a lower score above its threshold', async () => {
        const wakes = [];
        const d = createDetector({
            pipeline,
            thresholds: { loud: 0.95, quiet: 0.5 },
            onWake: (w) => wakes.push(w)
        });
        scores = { loud: 0.9, quiet: 0.6 }; // loud is higher but under its 0.95 bar
        await d.push(full());
        expect(wakes).toHaveLength(1);
        expect(wakes[0].name).toBe('quiet');
    });

    it('does not fire when every head is below threshold', async () => {
        const wakes = [];
        const d = createDetector({ pipeline, thresholds: { a: 0.7 }, onWake: (w) => wakes.push(w) });
        scores = { a: 0.5 };
        await d.push(full());
        expect(wakes).toHaveLength(0);
    });

    it('uses the default threshold for unlisted heads', async () => {
        const wakes = [];
        const d = createDetector({ pipeline, thresholds: {}, onWake: (w) => wakes.push(w) });
        scores = { a: 0.8 }; // default 0.7
        await d.push(full());
        expect(wakes).toHaveLength(1);
        expect(wakes[0].name).toBe('a');
    });

    it('clears its buffer on wake so the frozen window cannot re-fire a phantom wake', async () => {
        // The daemon stops feeding the detector during capture, freezing the ring
        // with the wake word. Captures outlast the debounce, so on resume the stale
        // audio used to re-fire. Model the model: a window holding any non-zero
        // sample is "the wake word"; pure silence scores zero.
        const wakes = [];
        const contentPipeline = {
            score: async (f) => ({ a: f.some((x) => x !== 0) ? 0.9 : 0.0 })
        };
        const d = createDetector({
            pipeline: contentPipeline,
            thresholds: { a: 0.7 },
            debounceMs: 10,
            onWake: (w) => wakes.push(w)
        });

        await d.push(new Int16Array(WINDOW_SAMPLES).fill(1000)); // wake word → fires once
        expect(wakes).toHaveLength(1);

        await delay(20); // capture/turn: no frames fed; debounce expires

        // Resume in a quiet room: small silence frames, as the live mic streams them.
        for (let i = 0; i < 30; i++) await d.push(new Int16Array(1280));
        expect(wakes).toHaveLength(1); // no phantom — buffer was cleared on the first wake
    });

    it('debounces repeat fires within the window, then fires again after it', async () => {
        const wakes = [];
        const d = createDetector({
            pipeline,
            thresholds: { a: 0.7 },
            debounceMs: 30,
            onWake: (w) => wakes.push(w)
        });
        scores = { a: 0.9 };
        await d.push(full());
        await d.push(full());
        expect(wakes).toHaveLength(1); // second suppressed by debounce
        await delay(45);
        await d.push(full());
        expect(wakes).toHaveLength(2);
    });
});
