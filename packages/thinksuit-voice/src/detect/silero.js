// Silero VAD speech detector — neural, local, keyless (ONNX via onnxruntime-node,
// the same runtime as wake/pipeline.js). Stateful: the LSTM state (h/c) is carried
// across 512-sample chunks within an utterance and cleared by reset(). Contract
// probed in spec/groundwork.md: x[1,512] float32, h/c[2,1,64], out prob/new_h/new_c.

import * as ort from 'onnxruntime-node';
import { createChunker } from './chunker.js';
import { resolveSileroVadModelPath } from '../paths.js';

const CHUNK = 512;
const STATE_DIMS = [2, 1, 64];
const STATE_SIZE = 2 * 1 * 64;

const zeroState = () => new ort.Tensor('float32', new Float32Array(STATE_SIZE), STATE_DIMS);

export async function createSileroDetector({ threshold = 0.5, modelPath = resolveSileroVadModelPath() } = {}) {
    const session = await ort.InferenceSession.create(modelPath, { executionProviders: ['cpu'] });
    const chunker = createChunker(CHUNK);
    let h = zeroState();
    let c = zeroState();

    return {
        reset() {
            chunker.reset();
            h = zeroState();
            c = zeroState();
        },
        async push(frame) {
            const out = [];
            for (const { chunk, sample } of chunker.push(frame)) {
                const x = new Float32Array(CHUNK);
                for (let i = 0; i < CHUNK; i++) x[i] = chunk[i] / 32768;
                const res = await session.run({ x: new ort.Tensor('float32', x, [1, CHUNK]), h, c });
                const prob = res.prob.data[0];
                h = res.new_h;
                c = res.new_c;
                out.push({ speech: prob > threshold, prob, sample, len: CHUNK });
            }
            return out;
        }
    };
}
