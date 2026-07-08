import { describe, it, expect } from 'vitest';
import { createRmsDetector } from '../src/detect/rms.js';

const CHUNK = 512;
const frame = (n, val) => {
    const f = new Int16Array(n);
    f.fill(val);
    return f;
};

describe('createRmsDetector', () => {
    it('emits one decision per completed 512-sample chunk, holding the remainder', async () => {
        const det = createRmsDetector({ threshold: 400 });
        // 1280 = 2*512 + 256 → 2 decisions, 256 held.
        const d1 = await det.push(frame(1280, 4000));
        expect(d1.length).toBe(2);
        expect(d1[0]).toMatchObject({ speech: true, prob: 1, sample: 0, len: CHUNK });
        expect(d1[1].sample).toBe(512);
        // 256 held + 1280 = 1536 → 3 decisions, continuing the absolute offset.
        const d2 = await det.push(frame(1280, 4000));
        expect(d2.length).toBe(3);
        expect(d2[0].sample).toBe(1024);
    });

    it('classifies speech vs silence by the RMS threshold', async () => {
        const det = createRmsDetector({ threshold: 400 });
        const loud = await det.push(frame(512, 4000));
        expect(loud[0].speech).toBe(true);
        const quiet = await det.push(frame(512, 0));
        expect(quiet[0].speech).toBe(false);
    });

    it('reset() zeroes the sample cursor and buffered remainder', async () => {
        const det = createRmsDetector({ threshold: 400 });
        await det.push(frame(1024, 4000));
        det.reset();
        const d = await det.push(frame(512, 4000));
        expect(d[0].sample).toBe(0);
    });

    it('push() returns a Promise (async contract)', () => {
        const det = createRmsDetector();
        expect(det.push(frame(512, 0))).toBeInstanceOf(Promise);
    });
});
