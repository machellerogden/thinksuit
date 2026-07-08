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
//
// The speech/silence decision is DELEGATED to an injected detector (see src/detect/):
// this module owns only the windowing — cue floor, guard lead, onset refinement,
// trailing-silence timing — and consumes the detector's per-chunk Decisions
// ({ speech, prob, sample, len }). push() is async because a neural detector's
// inference is async.

import { SAMPLE_RATE } from './constants.js';

const DEFAULTS = {
    silenceMs: 700, // trailing silence that ends the utterance
    startTimeoutMs: 3000, // give up if no speech starts (measured after the cue)
    maxMs: 300000, // hard cap on captured utterance length
    cueMs: 0, // audio at the very front to always discard (beep + latency margin)
    guardLeadMs: 180 // silence kept before the onset so the attack isn't clipped
};

const toSamples = (ms) => Math.round((SAMPLE_RATE * ms) / 1000);

export function createEndpointer({ detector, ...opts } = {}) {
    if (!detector) throw new Error('createEndpointer requires a detector');
    const cfg = { ...DEFAULTS, ...opts };
    const silenceLimit = toSamples(cfg.silenceMs);
    const startLimit = toSamples(cfg.startTimeoutMs);
    const maxLimit = toSamples(cfg.maxMs);
    const cueSamples = toSamples(cfg.cueMs);
    const guardSamples = toSamples(cfg.guardLeadMs);

    const chunks = []; // raw audio frames, for the final window
    const perChunk = []; // recorded detector decisions, for onset refinement
    let elapsed = 0; // total samples pushed
    let onset = -1; // sample offset where speech first detected (coarse, for control)
    let silence = 0; // trailing-silence samples since last speech (after onset)

    // Accept an Int16Array of new samples. Returns { done, aborted }.
    async function push(frame) {
        chunks.push(frame.slice());
        elapsed += frame.length;
        const decisions = await detector.push(frame);

        for (const d of decisions) {
            perChunk.push(d);
            if (onset < 0) {
                // Waiting for speech; ignore anything inside the cue floor.
                if (d.speech && d.sample >= cueSamples) {
                    onset = d.sample;
                    silence = 0;
                }
            } else {
                silence = d.speech ? 0 : silence + d.len;
                if (silence >= silenceLimit || elapsed - onset >= maxLimit) {
                    return { done: true, aborted: false };
                }
            }
        }

        // Time-based abort: no speech yet and we've waited past the limit. Checked on
        // elapsed (not decisions) so a run of sub-chunk frames still times out.
        if (onset < 0 && elapsed - cueSamples >= startLimit) {
            return { done: true, aborted: true };
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

    // Refine onset to the first of two consecutive speech chunks past the cue floor,
    // reusing recorded decisions (no re-scan — so a stateful neural detector needn't
    // be re-run mid-buffer). Two-in-a-row avoids a transient blip.
    function preciseOnset() {
        for (let i = 0; i + 1 < perChunk.length; i++) {
            const a = perChunk[i];
            const b = perChunk[i + 1];
            if (a.sample >= cueSamples && a.speech && b.speech) return a.sample;
        }
        return onset < 0 ? cueSamples : onset;
    }

    let lastWindow = null; // { startSamples }

    function result() {
        const all = flatten();
        const startIdx = Math.max(cueSamples, preciseOnset() - guardSamples);
        lastWindow = { startSamples: startIdx };
        return all.subarray(startIdx, elapsed).slice();
    }

    function stats() {
        const probs = perChunk.map((d) => d.prob);
        const meanProb = probs.length ? probs.reduce((a, b) => a + b, 0) / probs.length : null;
        return {
            cueMs: cfg.cueMs,
            onsetMs: onset < 0 ? null : Math.round((onset / SAMPLE_RATE) * 1000),
            capturedMs: Math.round((elapsed / SAMPLE_RATE) * 1000),
            windowStartMs: lastWindow ? Math.round((lastWindow.startSamples / SAMPLE_RATE) * 1000) : null,
            meanProb: meanProb == null ? null : Math.round(meanProb * 1000) / 1000
        };
    }

    return { push, result, stats };
}
