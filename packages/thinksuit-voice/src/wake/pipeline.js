// Wake-word inference: mel spectrogram -> speech embedding -> classifier, all
// ONNX via onnxruntime-node. The mel/FFT math is frozen inside
// melspectrogram.onnx, so the JS glue is only the x/10+2 post-proc, a
// 76-wide/stride-8 sliding window, and the last 16 embeddings. Matches
// livekit-wakeword's predict() (see tests/parity.test.js).

import * as ort from 'onnxruntime-node';

export { SAMPLE_RATE } from '../audio/constants.js';
export const WINDOW_SAMPLES = 32000; // 2s — yields exactly 16 embeddings
const EMBEDDING_WINDOW = 76; // mel frames per embedding
const EMBEDDING_STRIDE = 8; // mel frames between embeddings
const MIN_EMBEDDINGS = 16; // classifier input length

const createSession = (path) =>
    ort.InferenceSession.create(path, { executionProviders: ['cpu'] });

// Build a stateless scorer over a fixed frozen frontend + one classifier.
export async function createPipeline({ melPath, embeddingPath, classifierPath }) {
    const mel = await createSession(melPath);
    const emb = await createSession(embeddingPath);
    const clf = await createSession(classifierPath);

    const melIn = mel.inputNames[0];
    const melOut = mel.outputNames[0];
    const embIn = emb.inputNames[0];
    const embOut = emb.outputNames[0];
    const clfIn = clf.inputNames[0];
    const clfOut = clf.outputNames[0];

    // window: Float32Array of WINDOW_SAMPLES at 16 kHz, range [-1, 1].
    async function score(window) {
        const m = await mel.run({
            [melIn]: new ort.Tensor('float32', window, [1, window.length])
        });
        const mt = m[melOut];
        const dims = mt.dims; // [1, 1, time, 32]
        const mels = dims[dims.length - 1];
        const time = dims[dims.length - 2];
        if (time < EMBEDDING_WINDOW) return 0;

        // openWakeWord melspec_transform: x/10 + 2.
        const norm = new Float32Array(mt.data.length);
        for (let i = 0; i < norm.length; i++) norm[i] = mt.data[i] / 10.0 + 2.0;

        const embeddings = [];
        for (let s = 0; s + EMBEDDING_WINDOW <= time; s += EMBEDDING_STRIDE) {
            const win = new Float32Array(EMBEDDING_WINDOW * mels);
            win.set(norm.subarray(s * mels, (s + EMBEDDING_WINDOW) * mels));
            const r = await emb.run({
                [embIn]: new ort.Tensor('float32', win, [1, EMBEDDING_WINDOW, mels, 1])
            });
            embeddings.push(Float32Array.from(r[embOut].data));
        }
        if (embeddings.length < MIN_EMBEDDINGS) return 0;

        const last = embeddings.slice(-MIN_EMBEDDINGS);
        const seq = new Float32Array(MIN_EMBEDDINGS * 96);
        last.forEach((e, i) => seq.set(e, i * 96));
        const c = await clf.run({
            [clfIn]: new ort.Tensor('float32', seq, [1, MIN_EMBEDDINGS, 96])
        });
        return c[clfOut].data[0];
    }

    return { score };
}
