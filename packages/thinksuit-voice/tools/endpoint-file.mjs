#!/usr/bin/env node
// Drive a 16 kHz mono wav through the REAL endpointer + a chosen detector, mic-free.
// This is the measured-behavior instrument for endpointing: it reports where speech
// onset was detected and when end-of-turn fired, per detector — and can inject
// synthetic background noise to recreate noisy conditions.
//
//   node tools/endpoint-file.mjs --wav clip.wav --detector silero
//   node tools/endpoint-file.mjs --wav clip.wav --detector rms --noise 700
//
// --noise <int16 rms> adds broadband noise everywhere (including the trailing
// silence), which is exactly what defeats an energy threshold: RMS then reads
// "speech" forever and end-of-turn never fires; a real VAD ignores it.

import { readFileSync } from 'node:fs';
import { createEndpointer } from '../src/audio/endpoint.js';
import { createSpeechDetector } from '../src/detect/index.js';

const args = process.argv.slice(2);
const opt = (name, def) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : def;
};

const wav = opt('wav');
const provider = opt('detector', 'silero');
const noiseRms = Number(opt('noise', '0'));
const padMs = Number(opt('padMs', '1000')); // trailing silence appended, so a turn can end
const silenceMs = Number(opt('silenceMs', '700'));
const FRAME = Number(opt('frame', '1280'));

if (!wav) {
    console.error('usage: node tools/endpoint-file.mjs --wav <16k mono wav> [--detector rms|silero] [--noise <int16 rms>] [--padMs 1000] [--silenceMs 700]');
    process.exit(1);
}

function readWav(path) {
    const b = readFileSync(path);
    let off = 12;
    let fmt = null;
    let dataOff = null;
    let dataLen = null;
    while (off + 8 <= b.length) {
        const id = b.toString('ascii', off, off + 4);
        const sz = b.readUInt32LE(off + 4);
        if (id === 'fmt ') fmt = { channels: b.readUInt16LE(off + 10), sampleRate: b.readUInt32LE(off + 12) };
        else if (id === 'data') {
            dataOff = off + 8;
            dataLen = sz;
        }
        off += 8 + sz + (sz & 1);
    }
    const n = Math.floor(dataLen / 2);
    const ch = fmt.channels;
    const frames = Math.floor(n / ch);
    const mono = new Int16Array(frames);
    for (let i = 0; i < frames; i++) mono[i] = b.readInt16LE(dataOff + i * ch * 2);
    return { sampleRate: fmt.sampleRate, mono };
}

// Deterministic (seeded) broadband noise at ~target int16 RMS. Uniform on [-A,A]
// has rms A/sqrt(3), so A = rms*sqrt(3).
function withNoise(mono, padSamples, rms) {
    const out = new Int16Array(mono.length + padSamples); // pad region starts as silence
    out.set(mono, 0);
    if (!rms) return out;
    const A = rms * Math.sqrt(3);
    let seed = 12345;
    for (let i = 0; i < out.length; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const noise = ((seed / 0x7fffffff) * 2 - 1) * A;
        out[i] = Math.max(-32768, Math.min(32767, out[i] + noise));
    }
    return out;
}

const { sampleRate, mono } = readWav(wav);
if (sampleRate !== 16000) {
    console.error(`expected 16 kHz mono, got ${sampleRate} Hz`);
    process.exit(1);
}

const padSamples = Math.round((16000 * padMs) / 1000);
const audio = withNoise(mono, padSamples, noiseRms);

const detector = await createSpeechDetector({
    provider,
    rms: { threshold: 400 },
    silero: { threshold: 0.5 }
});
const ep = createEndpointer({ silenceMs, detector });

let outcome = null;
for (let i = 0; i < audio.length; i += FRAME) {
    const frame = audio.subarray(i, Math.min(i + FRAME, audio.length));
    const r = await ep.push(frame);
    if (r.done) {
        outcome = r;
        break;
    }
}

const durMs = Math.round((audio.length / 16000) * 1000);
console.log(`\nwav=${wav.split('/').pop()} detector=${provider} noise=${noiseRms} pad=${padMs}ms duration=${durMs}ms`);
if (!outcome) {
    console.log(`RESULT: ✗ end-of-turn NEVER FIRED within ${durMs}ms (on a live mic it would run to maxMs) — meanProb=${ep.stats().meanProb}`);
} else if (outcome.aborted) {
    console.log('RESULT: aborted — no speech onset before startTimeout');
} else {
    const keptMs = Math.round(ep.result().length / 16); // result() first — it sets windowStart
    const s = ep.stats();
    console.log(`RESULT: ✓ ended. onset=${s.onsetMs}ms end≈${s.capturedMs}ms windowStart=${s.windowStartMs}ms kept=${keptMs}ms meanProb=${s.meanProb}`);
}
