// Sliding-window wake detection. Capture-agnostic: feed it int16 PCM frames; it
// keeps a 2s ring buffer, scores it every ~80ms, and fires onWake on a
// threshold crossing (debounced). onScore is optional, for live monitoring.
//
// Multi-head: the pipeline scores every enabled wakeword head and returns
// { name: score }. Among the heads at or above their own threshold, the highest
// score wins and onWake reports its name. A single debounce window is shared
// across all heads.

import { WINDOW_SAMPLES } from './pipeline.js';

const HOP_SAMPLES = 1280; // 80ms between predictions
const DEFAULT_THRESHOLD = 0.7;
const DEFAULT_DEBOUNCE_MS = 2000;

export function createDetector({
    pipeline,
    thresholds = {},
    debounceMs = DEFAULT_DEBOUNCE_MS,
    onWake,
    onScore
} = {}) {
    const ring = new Int16Array(WINDOW_SAMPLES);
    let filled = 0;
    let sinceLastPredict = 0;
    let busy = false;
    let lastWake = 0;

    const thresholdFor = (name) =>
        Object.prototype.hasOwnProperty.call(thresholds, name) ? thresholds[name] : DEFAULT_THRESHOLD;

    // Pick the highest-scoring head that meets its own threshold.
    function winner(scores) {
        let best = null;
        for (const [name, score] of Object.entries(scores)) {
            if (score >= thresholdFor(name) && (best === null || score > best.score)) {
                best = { name, score };
            }
        }
        return best;
    }

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
            const scores = await pipeline.score(f);
            if (onScore) onScore(scores);
            const win = winner(scores);
            const now = Date.now();
            if (win && now - lastWake > debounceMs) {
                lastWake = now;
                // Consume the triggering audio: the daemon stops feeding us during
                // capture, which freezes this buffer holding the wake word. Captures
                // outlast the debounce, so without clearing, the same audio re-fires
                // a phantom wake when detection resumes. Reset so we rebuild from
                // fresh frames after the turn.
                ring.fill(0);
                filled = 0;
                sinceLastPredict = 0;
                if (onWake) onWake({ name: win.name, confidence: win.score, timestamp: now });
            }
        } finally {
            busy = false;
        }
    }

    return { push };
}
