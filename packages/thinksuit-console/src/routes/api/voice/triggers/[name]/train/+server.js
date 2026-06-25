import { json } from '@sveltejs/kit';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { triggerExists, listRunIds, readRunLog } from 'thinksuit-voice/triggers';

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

// Collapse a run-log into a status snapshot for the UI.
function summarize(name, runId) {
    const events = readRunLog(name, runId);
    const terminal = events.find((e) => TERMINAL.has(e.event)) || null;
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
    if (!triggerExists(name)) return json({ error: `no such trigger: ${name}` }, { status: 404 });
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
    if (!triggerExists(name)) return json({ error: `no such trigger: ${name}` }, { status: 404 });
    const runs = listRunIds(name);
    const latest = runs[runs.length - 1];
    if (!latest) {
        return json({ running: false, runId: null, phase: null, events: [], result: null });
    }
    return json(summarize(name, latest));
}
