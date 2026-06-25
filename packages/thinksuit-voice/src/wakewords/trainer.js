// Drives a training run. Assembles a job spec from the store, spawns the Python
// train.py entrypoint (via uv), reads its JSONL progress off stdout, and on
// success registers the exported model as a new version in the store. This is the
// only Node module that knows Python/livekit-wakeword exist.

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, dirname, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as store from './store.js';

const TRAINING_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'training');

// `uv` is spawned to drive the Python pipeline. A GUI- or service-launched
// console can have a minimal PATH that omits uv's install dir, so prepend the
// usual user bin locations (uv installs to ~/.local/bin by default) — otherwise
// the worker fails with ENOENT even though `uv` works in an interactive shell.
function spawnEnv() {
    const extra = [
        join(homedir(), '.local', 'bin'),
        join(homedir(), '.cargo', 'bin'),
        '/opt/homebrew/bin',
        '/usr/local/bin'
    ];
    const current = (process.env.PATH || '').split(delimiter);
    const PATH = [...extra.filter((p) => !current.includes(p)), ...current].join(delimiter);
    return { ...process.env, PATH };
}

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
            stdio: ['ignore', 'pipe', 'inherit'],
            env: spawnEnv()
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
