import { json } from '@sveltejs/kit';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { wakewordExists, listRunIds, readRunLog } from 'thinksuit-voice/wakewords';

// Start and observe a training run. Training is ~50 minutes — far longer than the
// dev server's stability window — so we don't run it inline. POST spawns a
// detached worker that owns the whole job and writes a JSONL run-log; GET reads
// that log so the UI can poll progress and reattach after a reload. The worker
// registers (and, on a first train, promotes) the model itself.

const TERMINAL = new Set(['complete', 'error']);

function workerPath() {
    return fileURLToPath(import.meta.resolve('thinksuit-voice/training-worker'));
}

function newRunId() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

// A detached worker pid is alive if we can signal it. ESRCH = gone; EPERM = exists
// but not ours (still alive). A run-log without a pid is legacy → assume alive.
function workerAlive(pid) {
    if (!pid) return true;
    try {
        process.kill(pid, 0);
        return true;
    } catch (err) {
        return err.code === 'EPERM';
    }
}

// Collapse a run-log into a status snapshot for the UI.
function summarize(name, runId) {
    const events = readRunLog(name, runId);
    let terminal = events.find((e) => TERMINAL.has(e.event)) || null;

    // No terminal event, but the worker process is gone → it crashed or was killed
    // without recording a result. Surface that instead of a perpetual "running"
    // (which would also wedge POST behind its in-progress 409 guard forever).
    if (!terminal) {
        const started = events.find((e) => e.event === 'started');
        if (started && !workerAlive(started.pid)) {
            terminal = {
                event: 'error',
                message: 'training worker is no longer running (crashed or was killed)'
            };
        }
    }

    const lastPhase = [...events].reverse().find((e) => e.event === 'phase');
    const phase = terminal
        ? terminal.event
        : lastPhase
            ? `${lastPhase.phase}:${lastPhase.status}`
            : 'starting';
    return {
        running: !terminal,
        runId,
        phase,
        events,
        result: terminal
    };
}

export async function POST({ params }) {
    const { name } = params;
    if (!wakewordExists(name)) return json({ error: `no such wakeword: ${name}` }, { status: 404 });
    // Samples are optional: synthetic-only is a valid first pass; your recordings
    // are mixed in as augmentation when present (see train.py mix_real_voice).

    const runs = listRunIds(name);
    const latest = runs[runs.length - 1];
    if (latest && summarize(name, latest).running) {
        return json({ error: 'a training run is already in progress' }, { status: 409 });
    }

    const runId = newRunId();
    try {
        const child = spawn(process.execPath, [workerPath(), name, runId], {
            detached: true,
            stdio: 'ignore'
        });
        child.unref();
    } catch (error) {
        console.error('Failed to spawn training worker:', error);
        return json({ error: error.message }, { status: 500 });
    }
    return json({ runId }, { status: 202 });
}

export async function GET({ params }) {
    const { name } = params;
    if (!wakewordExists(name)) return json({ error: `no such wakeword: ${name}` }, { status: 404 });
    const runs = listRunIds(name);
    const latest = runs[runs.length - 1];
    if (!latest) {
        return json({ running: false, runId: null, phase: null, events: [], result: null });
    }
    return json(summarize(name, latest));
}
