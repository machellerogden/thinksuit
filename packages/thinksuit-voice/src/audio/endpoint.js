// Utterance endpointing: after a wake, accumulate int16 frames until the speaker
// stops, then return the captured buffer for STT. Energy-based (RMS) VAD — no
// extra deps. Drive it by pushing frames; push() reports when the utterance is
// done so the daemon can hand off the buffer and resume wake detection.

import { SAMPLE_RATE } from '../wake/pipeline.js';

const DEFAULTS = {
    rmsThreshold: 400, // int16 RMS above this counts as speech (mic-gain dependent)
    silenceMs: 700, // trailing silence that ends the utterance
    startTimeoutMs: 3000, // give up if no speech starts
    maxMs: 10000 // hard cap on utterance length
};

function rms(frames) {
    let sum = 0;
    for (let i = 0; i < frames.length; i++) sum += frames[i] * frames[i];
    return Math.sqrt(sum / frames.length);
}

export function createEndpointer(opts = {}) {
    const { rmsThreshold, silenceMs, startTimeoutMs, maxMs } = { ...DEFAULTS, ...opts };
    const silenceLimit = (SAMPLE_RATE * silenceMs) / 1000;
    const startLimit = (SAMPLE_RATE * startTimeoutMs) / 1000;
    const maxLimit = (SAMPLE_RATE * maxMs) / 1000;

    const chunks = [];
    let started = false;
    let captured = 0;
    let elapsed = 0;
    let silence = 0;

    // Push an Int16Array of new frames. Returns { done, aborted }: aborted=true
    // means no speech ever started (timeout); aborted=false with done=true means a
    // complete utterance was captured.
    function push(frames) {
        elapsed += frames.length;
        const speech = rms(frames) > rmsThreshold;

        if (!started) {
            if (speech) {
                started = true;
                chunks.push(frames.slice());
                captured += frames.length;
            } else if (elapsed >= startLimit) {
                return { done: true, aborted: true };
            }
            return { done: false };
        }

        chunks.push(frames.slice());
        captured += frames.length;
        silence = speech ? 0 : silence + frames.length;

        if (silence >= silenceLimit || captured >= maxLimit) return { done: true, aborted: false };
        return { done: false };
    }

    function result() {
        const out = new Int16Array(captured);
        let offset = 0;
        for (const c of chunks) {
            out.set(c, offset);
            offset += c.length;
        }
        return out;
    }

    return { push, result };
}
