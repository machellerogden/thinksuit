// Drives a training run. Assembles a job spec from the store, spawns the Python
// train.py entrypoint (via uv), reads its JSONL progress off stdout, and on
// success registers the exported model as a new version in the store. This is the
// only Node module that knows Python/livekit-wakeword exist.

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as store from './store.js';

const TRAINING_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'training');

// Run train.py for a trigger. `onProgress({event, phase, status, ...})` is called
// for each JSONL line; library logs stream through to stderr. Resolves with
// `{ version, metrics }`. `mode: 'initial'` forces regeneration of synthetic data.
export function trainTrigger(name, { mode, onProgress } = {}) {
    const manifest = store.readManifest(name);
    const work = mkdtempSync(join(tmpdir(), 'ts-trigger-'));
    const outPath = join(work, `${name}.onnx`);
    const jobPath = join(work, 'job.json');

    const job = {
        name,
        phrase: manifest.phrase,
        positiveDir: store.sampleDir(name, 'positive'),
        negativeDir: store.sampleDir(name, 'negative'),
        outPath
    };
    if (mode) job.mode = mode;
    writeFileSync(jobPath, JSON.stringify(job));

    return new Promise((resolve, reject) => {
        const child = spawn('uv', ['run', 'python', 'train.py', jobPath], {
            cwd: TRAINING_DIR,
            stdio: ['ignore', 'pipe', 'inherit']
        });

        let done = null;
        let failure = null;

        const rl = createInterface({ input: child.stdout });
        rl.on('line', (line) => {
            const trimmed = line.trim();
            if (!trimmed) return;
            let msg;
            try {
                msg = JSON.parse(trimmed);
            } catch {
                return; // non-JSON stdout noise — ignore
            }
            if (msg.event === 'done') done = msg;
            else if (msg.event === 'error') failure = msg.message;
            if (onProgress) onProgress(msg);
        });

        const cleanup = () => rmSync(work, { recursive: true, force: true });

        child.on('error', (err) => {
            cleanup();
            reject(
                err.code === 'ENOENT'
                    ? new Error('`uv` not found on PATH — needed to run the training pipeline')
                    : err
            );
        });

        child.on('close', (code) => {
            if (failure) {
                cleanup();
                return reject(new Error(`training failed: ${failure}`));
            }
            if (code !== 0 || !done) {
                cleanup();
                return reject(new Error(`training exited with code ${code} and no result`));
            }
            try {
                const version = store.registerVersion(name, {
                    onnxPath: done.onnxPath,
                    metrics: done.metrics
                });
                resolve({ version, metrics: done.metrics });
            } catch (err) {
                reject(err);
            } finally {
                cleanup();
            }
        });
    });
}
