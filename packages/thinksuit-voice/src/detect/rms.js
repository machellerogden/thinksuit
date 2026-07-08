// Energy-threshold speech detector — the zero-dependency fallback. This is the
// original endpoint.js decision (RMS > threshold), lifted out into a detector so
// it's a peer plugin, not a privileged default baked into the windowing.

import { createChunker } from './chunker.js';

const CHUNK = 512;

function rms(samples) {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
    return Math.sqrt(sum / samples.length);
}

export function createRmsDetector({ threshold = 400 } = {}) {
    const chunker = createChunker(CHUNK);

    return {
        reset() {
            chunker.reset();
        },
        // async to satisfy the shared detector contract; the math is synchronous.
        async push(frame) {
            return chunker.push(frame).map(({ chunk, sample }) => {
                const speech = rms(chunk) > threshold;
                return { speech, prob: speech ? 1 : 0, sample, len: CHUNK };
            });
        }
    };
}
