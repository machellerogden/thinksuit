// Guided sample capture for wakeword enrollment. Owns the mic (via the shared
// PortAudio capture) and turns spoken utterances into trimmed 16 kHz mono WAVs.
//
// Mic ownership: the daemon owns the mic while listening. Rather than fight over
// the device, we refuse up front if a running daemon has the mic on, and tell the
// caller how to release it. No auto-toggling — releasing the mic is the operator's
// explicit choice.

import { writeFileSync } from 'node:fs';
import { SAMPLE_RATE } from '../audio/constants.js';
import { status as daemonStatus } from '../control/client.js';

// Prompts cycled through when recording negatives — things to say that are NOT
// the phrase, so the model learns to discriminate (esp. the onset and partials).
export const NEG_PROMPTS = [
    'hey',
    'hey there',
    "hey what's up",
    'hey hold on',
    'hey can you hear me',
    'okay',
    'hello',
    'good morning',
    'what time is it',
    '(say any random sentence)',
    '(just talk normally for a second)'
];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Refuse if a running daemon currently holds the mic. A daemon that is down or
// has the mic off leaves the device free.
export async function assertMicAvailable() {
    try {
        const s = await daemonStatus();
        if (s && s.micOn) {
            throw new Error(
                'voice daemon holds the mic — run `thinksuit-voice mic-off` (or stop the daemon) before recording'
            );
        }
    } catch (err) {
        if (/holds the mic/.test(err.message)) throw err;
        // daemon not running / unreachable → mic is free; proceed.
    }
}

export function peakOf(samples) {
    let peak = 0;
    for (let i = 0; i < samples.length; i++) {
        const v = Math.abs(samples[i]);
        if (v > peak) peak = v;
    }
    return peak / 32768;
}

// Energy-trim to the spoken region with a little padding.
export function trim(samples, padMs = 120) {
    if (samples.length === 0) return samples;
    let peak = 0;
    for (let i = 0; i < samples.length; i++) {
        const v = Math.abs(samples[i]);
        if (v > peak) peak = v;
    }
    if (peak === 0) peak = 1;
    const thr = 0.08 * peak;
    const FRAME = 320; // 20ms
    const nFrames = Math.floor(samples.length / FRAME);
    let first = -1;
    let last = -1;
    for (let f = 0; f < nFrames; f++) {
        let m = 0;
        for (let i = f * FRAME; i < (f + 1) * FRAME; i++) {
            const v = Math.abs(samples[i]);
            if (v > m) m = v;
        }
        if (m > thr) {
            if (first < 0) first = f;
            last = f;
        }
    }
    if (first < 0) return samples;
    const pad = Math.round((SAMPLE_RATE * padMs) / 1000);
    const start = Math.max(0, first * FRAME - pad);
    const end = Math.min(samples.length, (last + 1) * FRAME + pad);
    return samples.subarray(start, end).slice();
}

export function writeWavFile(path, samples) {
    const dataBytes = samples.length * 2;
    const buf = Buffer.alloc(44 + dataBytes);
    buf.write('RIFF', 0);
    buf.writeUInt32LE(36 + dataBytes, 4);
    buf.write('WAVE', 8);
    buf.write('fmt ', 12);
    buf.writeUInt32LE(16, 16); // PCM fmt chunk size
    buf.writeUInt16LE(1, 20); // PCM
    buf.writeUInt16LE(1, 22); // mono
    buf.writeUInt32LE(SAMPLE_RATE, 24);
    buf.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
    buf.writeUInt16LE(2, 32); // block align
    buf.writeUInt16LE(16, 34); // bits per sample
    buf.write('data', 36);
    buf.writeUInt32LE(dataBytes, 40);
    for (let i = 0; i < samples.length; i++) buf.writeInt16LE(samples[i], 44 + i * 2);
    writeFileSync(path, buf);
}

function concat(chunks) {
    let n = 0;
    for (const c of chunks) n += c.length;
    const out = new Int16Array(n);
    let off = 0;
    for (const c of chunks) {
        out.set(c, off);
        off += c.length;
    }
    return out;
}

// Open the mic and hold it for the duration of an enrollment session. captureClip
// records `seconds` of audio from the moment it's called; audio buffered between
// clips (e.g. while the operator reads the prompt) is naturally dropped because we
// only accumulate frames while a capture is in flight.
export async function createRecorderSession({ deviceId = -1 } = {}) {
    // Loaded lazily so importing this module (e.g. for `wakeword ls`) doesn't pull
    // in the PortAudio native binding.
    const { createCapture } = await import('../audio/capture.js');

    let chunks = [];
    let collecting = false;
    let lastError = null;

    const capture = createCapture({
        deviceId,
        onFrames: (frames) => {
            if (collecting) chunks.push(frames.slice());
        },
        onError: (err) => {
            lastError = err;
        }
    });
    capture.start();

    async function captureClip(seconds = 2.0) {
        if (lastError) throw lastError;
        chunks = [];
        collecting = true;
        await delay(seconds * 1000);
        collecting = false;
        if (lastError) throw lastError;
        return concat(chunks);
    }

    function close() {
        collecting = false;
        capture.stop();
    }

    return { captureClip, close };
}
