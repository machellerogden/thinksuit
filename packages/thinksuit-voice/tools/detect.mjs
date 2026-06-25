#!/usr/bin/env node
// Live wake-word diagnostic — exercises the wake stage in isolation using the
// package modules: mic capture -> detector -> live score bar + WAKE lines.
//
//   node tools/detect.mjs [--device 4] [--threshold 0.7] [--classifier path.onnx]
//
// Defaults the classifier to the locally-trained training/output model so you can
// test before a model is enrolled into ~/.thinksuit/voice.

import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPipeline } from '../src/wake/pipeline.js';
import { createDetector } from '../src/wake/detector.js';
import { createCapture } from '../src/audio/capture.js';
import { resolveMelModelPath, resolveEmbeddingModelPath } from '../src/paths.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const arg = (flag, def) => {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : def;
};

const deviceId = parseInt(arg('--device', '-1'), 10);
const threshold = parseFloat(arg('--threshold', '0.7'));
const classifierPath = resolve(
    __dirname,
    arg('--classifier', '../training/output/hey_thinksuit/hey_thinksuit.onnx')
);
const name = basename(classifierPath, '.onnx');

const pipeline = await createPipeline({
    melPath: resolveMelModelPath(),
    embeddingPath: resolveEmbeddingModelPath(),
    heads: [{ name, classifierPath }]
});

const detector = createDetector({
    pipeline,
    thresholds: { [name]: threshold },
    onScore: (scores) => {
        const s = scores[name] ?? 0;
        const bar = '#'.repeat(Math.round(s * 30));
        process.stdout.write(`\rscore=${s.toFixed(3)} |${bar.padEnd(30)}|`);
    },
    onWake: ({ name: fired, confidence }) =>
        process.stdout.write(`\nWAKE  ${fired}  confidence=${confidence.toFixed(3)}\n`)
});

const capture = createCapture({
    deviceId,
    onFrames: (frames) => detector.push(frames),
    onError: (e) => console.error('\naudio error:', e)
});

console.log(`device=${deviceId} threshold=${threshold}`);
console.log(`classifier=${classifierPath}`);
console.log('listening... say the wake word (Ctrl-C to stop)');
capture.start();
