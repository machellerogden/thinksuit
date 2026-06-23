// Sliding-window wake detection. Capture-agnostic: feed it int16 PCM frames; it
// keeps a 2s ring buffer, scores it every ~80ms, and fires onWake on a
// threshold crossing (debounced). onScore is optional, for live monitoring.

import { WINDOW_SAMPLES } from './pipeline.js';

const HOP_SAMPLES = 1280; // 80ms between predictions
const DEFAULT_THRESHOLD = 0.7;
const DEFAULT_DEBOUNCE_MS = 2000;

export function createDetector({
    pipeline,
    threshold = DEFAULT_THRESHOLD,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    onWake,
    onScore
} = {}) {
    const ring = new Int16Array(WINDOW_SAMPLES);
    let filled = 0;
    let sinceLastPredict = 0;
    let busy = false;
    let lastWake = 0;

    // Accept an Int16Array of new samples (any length).
    async function push(incoming) {
        const n = incoming.length;
        if (n >= WINDOW_SAMPLES) {
            ring.set(incoming.subarray(n - WINDOW_SAMPLES));
            filled = WINDOW_SAMPLES;
        } else {
            ring.copyWithin(0, n);
            ring.set(incoming, WINDOW_SAMPLES - n);
            filled = Math.min(WINDOW_SAMPLES, filled + n);
        }
        sinceLastPredict += n;

        if (filled < WINDOW_SAMPLES || sinceLastPredict < HOP_SAMPLES || busy) return;
        sinceLastPredict = 0;
        busy = true;
        try {
            const f = new Float32Array(WINDOW_SAMPLES);
            for (let i = 0; i < WINDOW_SAMPLES; i++) f[i] = ring[i] / 32768.0;
            const s = await pipeline.score(f);
            if (onScore) onScore(s);
            const now = Date.now();
            if (s >= threshold && now - lastWake > debounceMs) {
                lastWake = now;
                if (onWake) onWake({ confidence: s, timestamp: now });
            }
        } finally {
            busy = false;
        }
    }

    return { push };
}
