import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { createSileroDetector } from '../src/detect/silero.js';
import { resolveSileroVadModelPath } from '../src/paths.js';

// Skips cleanly if the model asset isn't present (e.g. a checkout without it).
// The speech-rises-on-real-voice behavior is exercised separately by the wav-driven
// verification (tools/endpoint-file.mjs), which needs real recordings.
const suite = existsSync(resolveSileroVadModelPath()) ? describe : describe.skip;

const silence = (n) => new Int16Array(n); // zeros

suite('createSileroDetector (requires committed silero_vad.onnx)', () => {
    it('loads and reports low speech probability on silence', async () => {
        const det = await createSileroDetector({ threshold: 0.5 });
        const decisions = [];
        for (let i = 0; i < 20; i++) decisions.push(...(await det.push(silence(512))));
        expect(decisions.length).toBe(20);
        expect(decisions.every((d) => d.prob < 0.5)).toBe(true);
        expect(decisions.every((d) => d.speech === false)).toBe(true);
    });

    it('emits decisions at 512-sample granularity with absolute sample offsets', async () => {
        const det = await createSileroDetector();
        const d1 = await det.push(silence(1280)); // 2 chunks + 256 held
        expect(d1.length).toBe(2);
        expect(d1[0].sample).toBe(0);
        expect(d1[1].sample).toBe(512);
    });

    it('reset() restores initial state (sample offset back to 0)', async () => {
        const det = await createSileroDetector();
        await det.push(silence(1024));
        det.reset();
        const d = await det.push(silence(512));
        expect(d[0].sample).toBe(0);
    });
});
