// Regression guard: the all-Node wake pipeline must reproduce livekit-wakeword's
// Python predict() exactly. The expected score was captured from Python
// (tools/parity_ref.py) on the fixture window. Frontend models are committed;
// the personal classifier is not, so the test skips when it's absent.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { createPipeline } from '../src/wake/pipeline.js';
import { resolveMelModelPath, resolveEmbeddingModelPath } from '../src/paths.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLASSIFIER = join(__dirname, '../training/output/hey_thinksuit/hey_thinksuit.onnx');
const INPUT = join(__dirname, 'fixtures/parity_input.f32');
const EXPECTED = 0.915209; // Python predict() on the same window
const TOLERANCE = 1e-4;

describe('wake pipeline parity with Python', () => {
    it.skipIf(!existsSync(CLASSIFIER))(
        'scores the fixture window identically to Python',
        async () => {
            const buf = readFileSync(INPUT);
            const window = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
            const pipeline = await createPipeline({
                melPath: resolveMelModelPath(),
                embeddingPath: resolveEmbeddingModelPath(),
                heads: [{ name: 'hey_thinksuit', classifierPath: CLASSIFIER }]
            });
            const scores = await pipeline.score(window);
            expect(Math.abs(scores.hey_thinksuit - EXPECTED)).toBeLessThan(TOLERANCE);
        }
    );

    it.skipIf(!existsSync(CLASSIFIER))(
        'scores multiple heads on the shared frontend (same model under two names)',
        async () => {
            const buf = readFileSync(INPUT);
            const window = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
            const pipeline = await createPipeline({
                melPath: resolveMelModelPath(),
                embeddingPath: resolveEmbeddingModelPath(),
                heads: [
                    { name: 'one', classifierPath: CLASSIFIER },
                    { name: 'two', classifierPath: CLASSIFIER }
                ]
            });
            const scores = await pipeline.score(window);
            expect(Math.abs(scores.one - EXPECTED)).toBeLessThan(TOLERANCE);
            expect(Math.abs(scores.two - EXPECTED)).toBeLessThan(TOLERANCE);
        }
    );
});
