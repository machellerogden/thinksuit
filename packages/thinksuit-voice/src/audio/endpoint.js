// Utterance endpointing with a cue-anchored, non-destructive window.
//
// The daemon captures continuously from wake; this module decides which slice of
// that audio is the utterance. Audio is retained first and windowed second, so
// the onset is never clipped — onset detection only chooses how much leading
// silence to drop, with a guard lead as a safety margin.
//
//   [ cue/beep | leading pause | speech ............ | trailing silence ]
//     └ cueMs ─┘               └ onset               └ silenceMs ends it
//
// Final window = [ max(cueMs, onset − guardLead) , end ]. cueMs (beep + latency
// margin) is a hard floor, so the beep can never re-enter even if you speak the
// instant it stops. push() reports {done, aborted}; result() returns the window.

import { SAMPLE_RATE } from './constants.js';

const DEFAULTS = {
    rmsThreshold: 400, // int16 RMS above this counts as speech (mic-gain dependent)
    silenceMs: 700, // trailing silence that ends the utterance
    startTimeoutMs: 3000, // give up if no speech starts (measured after the cue)
    maxMs: 300000, // hard cap on captured utterance length
    cueMs: 0, // audio at the very front to always discard (beep + latency margin)
    guardLeadMs: 180 // silence kept before the onset so the attack isn't clipped
};

const toSamples = (ms) => Math.round((SAMPLE_RATE * ms) / 1000);

function rms(samples, start, len) {
    let sum = 0;
    for (let i = start; i < start + len; i++) sum += samples[i] * samples[i];
    return Math.sqrt(sum / len);
}

export function createEndpointer(opts = {}) {
    const cfg = { ...DEFAULTS, ...opts };
    const silenceLimit = toSamples(cfg.silenceMs);
    const startLimit = toSamples(cfg.startTimeoutMs);
    const maxLimit = toSamples(cfg.maxMs);
    const cueSamples = toSamples(cfg.cueMs);
    const guardSamples = toSamples(cfg.guardLeadMs);

    const chunks = [];
    let elapsed = 0; // total samples pushed
    let onset = -1; // sample index where speech first detected (coarse, for control)
    let silence = 0; // trailing-silence samples since last speech (after onset)

    // Accept an Int16Array of new samples. Returns { done, aborted }.
    function push(frame) {
        chunks.push(frame.slice());
        const start = elapsed;
        elapsed += frame.length;
        const speech = rms(frame, 0, frame.length) > cfg.rmsThreshold;

        if (onset < 0) {
            // Waiting for speech; ignore anything inside the cue floor.
            if (speech && start >= cueSamples) {
                onset = start;
                silence = 0;
            } else if (elapsed - cueSamples >= startLimit) {
                return { done: true, aborted: true };
            }
            return { done: false };
        }

        silence = speech ? 0 : silence + frame.length;
        if (silence >= silenceLimit || elapsed - onset >= maxLimit) {
            return { done: true, aborted: false };
        }
        return { done: false };
    }

    function flatten() {
        const all = new Int16Array(elapsed);
        let off = 0;
        for (const c of chunks) {
            all.set(c, off);
            off += c.length;
        }
        return all;
    }

    // Refine the onset at fine (20ms) resolution within the retained buffer, after
    // the cue floor, requiring two consecutive windows to avoid a transient blip.
    function preciseOnset(all) {
        const win = toSamples(20);
        for (let i = cueSamples; i + 2 * win <= elapsed; i += win) {
            if (rms(all, i, win) > cfg.rmsThreshold && rms(all, i + win, win) > cfg.rmsThreshold) {
                return i;
            }
        }
        return onset < 0 ? cueSamples : onset;
    }

    let lastWindow = null; // { startSamples }

    function result() {
        const all = flatten();
        const startIdx = Math.max(cueSamples, preciseOnset(all) - guardSamples);
        lastWindow = { startSamples: startIdx };
        return all.subarray(startIdx, elapsed).slice();
    }

    function stats() {
        return {
            cueMs: cfg.cueMs,
            onsetMs: onset < 0 ? null : Math.round((onset / SAMPLE_RATE) * 1000),
            capturedMs: Math.round((elapsed / SAMPLE_RATE) * 1000),
            windowStartMs: lastWindow ? Math.round((lastWindow.startSamples / SAMPLE_RATE) * 1000) : null
        };
    }

    return { push, result, stats };
}
