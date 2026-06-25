// The trigger library on disk. A trigger is a self-contained bundle under the
// voice home (see paths.js): manifest + recorded samples + trained model
// versions + per-run logs. This module is the sole owner of that layout. It
// knows nothing about the mic or about Python — it only reads and writes files.

import {
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    writeFileSync,
    appendFileSync,
    copyFileSync,
    rmSync
} from 'node:fs';
import { join } from 'node:path';
import { resolveTriggersDir, resolveTriggerPaths } from '../paths.js';
import { ACTIONS } from '../session.js';

const NAME_RE = /^[a-z0-9][a-z0-9_-]*$/i;
const DEFAULT_THRESHOLD = 0.7;

function assertValidName(name) {
    if (!NAME_RE.test(name)) {
        throw new Error(
            `invalid trigger name "${name}" — use letters, digits, dashes, underscores`
        );
    }
}

function now() {
    return new Date().toISOString();
}

function ensureDir(dir) {
    mkdirSync(dir, { recursive: true });
}

export function listTriggers() {
    const root = resolveTriggersDir();
    if (!existsSync(root)) return [];
    return readdirSync(root, { withFileTypes: true })
        .filter((e) => e.isDirectory() && existsSync(join(root, e.name, 'manifest.json')))
        .map((e) => e.name)
        .sort();
}

export function triggerExists(name) {
    return existsSync(resolveTriggerPaths(name).manifest);
}

export function readManifest(name) {
    const { manifest } = resolveTriggerPaths(name);
    if (!existsSync(manifest)) throw new Error(`no such trigger: ${name}`);
    return JSON.parse(readFileSync(manifest, 'utf8'));
}

export function writeManifest(name, manifest) {
    const paths = resolveTriggerPaths(name);
    ensureDir(paths.dir);
    const next = { ...manifest, updatedAt: now() };
    writeFileSync(paths.manifest, JSON.stringify(next, null, 2) + '\n');
    return next;
}

export function createTrigger({ name, phrase, threshold = DEFAULT_THRESHOLD }) {
    assertValidName(name);
    if (!phrase || !phrase.trim()) throw new Error('a trigger needs a phrase');
    if (triggerExists(name)) throw new Error(`trigger already exists: ${name}`);

    const paths = resolveTriggerPaths(name);
    ensureDir(paths.positiveSamples);
    ensureDir(paths.negativeSamples);
    ensureDir(paths.models);
    ensureDir(paths.runs);

    const manifest = {
        name,
        phrase: phrase.trim(),
        threshold,
        enabled: false,
        binding: 'converse', // reserved; only action wired in iteration 1
        current: null,
        versions: [],
        createdAt: now()
    };
    return writeManifest(name, manifest);
}

export function removeTrigger(name) {
    const { dir } = resolveTriggerPaths(name);
    if (!existsSync(dir)) throw new Error(`no such trigger: ${name}`);
    rmSync(dir, { recursive: true, force: true });
}

// ── Samples ──────────────────────────────────────────────────────────────

function kindDir(name, kind) {
    const paths = resolveTriggerPaths(name);
    if (kind === 'positive') return paths.positiveSamples;
    if (kind === 'negative') return paths.negativeSamples;
    throw new Error(`unknown sample kind: ${kind}`);
}

export function sampleDir(name, kind) {
    const dir = kindDir(name, kind);
    ensureDir(dir);
    return dir;
}

export function listSamples(name, kind) {
    const dir = kindDir(name, kind);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
        .filter((f) => /^clip_\d+\.wav$/.test(f))
        .sort();
}

export function countSamples(name, kind) {
    return listSamples(name, kind).length;
}

// Next zero-padded clip index for a kind, continuing the existing numbering.
export function nextSampleIndex(name, kind) {
    const clips = listSamples(name, kind);
    if (clips.length === 0) return 0;
    const last = clips[clips.length - 1];
    return parseInt(last.slice('clip_'.length), 10) + 1;
}

export function sampleClipPath(name, kind, index) {
    return join(sampleDir(name, kind), `clip_${String(index).padStart(6, '0')}.wav`);
}

// Copy an existing directory of clip_*.wav recordings into a trigger's sample set,
// renumbered to continue the existing sequence. Used to migrate prior recordings
// into the library.
export function adoptSamples(name, kind, srcDir) {
    if (!srcDir || !existsSync(srcDir)) return 0;
    const clips = readdirSync(srcDir)
        .filter((f) => /\.wav$/i.test(f))
        .sort();
    let idx = nextSampleIndex(name, kind);
    let n = 0;
    for (const f of clips) {
        copyFileSync(join(srcDir, f), sampleClipPath(name, kind, idx));
        idx++;
        n++;
    }
    return n;
}

// ── Model versions ───────────────────────────────────────────────────────

// Copy an exported .onnx into the bundle as the next version and record its
// metrics. Does not change `current` — promotion is a separate, explicit step.
export function registerVersion(name, { onnxPath, metrics = null }) {
    const manifest = readManifest(name);
    const paths = resolveTriggerPaths(name);
    ensureDir(paths.models);
    const version = `v${manifest.versions.length + 1}`;
    const rel = join('models', `${name}.${version}.onnx`);
    copyFileSync(onnxPath, join(paths.dir, rel));
    manifest.versions.push({ version, model: rel, metrics, createdAt: now() });
    writeManifest(name, manifest);
    return version;
}

export function versionModelPath(name, version) {
    const manifest = readManifest(name);
    const entry = manifest.versions.find((v) => v.version === version);
    if (!entry) throw new Error(`no such version ${version} for trigger ${name}`);
    return join(resolveTriggerPaths(name).dir, entry.model);
}

export function currentModelPath(name) {
    const manifest = readManifest(name);
    if (!manifest.current) throw new Error(`trigger ${name} has no promoted version`);
    return versionModelPath(name, manifest.current);
}

export function promote(name, version) {
    const manifest = readManifest(name);
    const target = version || manifest.versions[manifest.versions.length - 1]?.version;
    if (!target) throw new Error(`trigger ${name} has no trained versions to promote`);
    if (!manifest.versions.some((v) => v.version === target)) {
        throw new Error(`no such version ${target} for trigger ${name}`);
    }
    manifest.current = target;
    return writeManifest(name, manifest);
}

export function setThreshold(name, value) {
    const v = Number(value);
    if (!Number.isFinite(v) || v < 0 || v > 1) {
        throw new Error(`threshold must be between 0 and 1, got ${value}`);
    }
    const manifest = readManifest(name);
    manifest.threshold = v;
    return writeManifest(name, manifest);
}

// Bind a trigger to the session-lifecycle action it fires (converse/new/prior).
export function setBinding(name, action) {
    if (!ACTIONS.includes(action)) {
        throw new Error(`unknown action "${action}" — use one of: ${ACTIONS.join(', ')}`);
    }
    const manifest = readManifest(name);
    manifest.binding = action;
    return writeManifest(name, manifest);
}

// ── Enablement (additive — many triggers can be active at once) ─────────────

export function getEnabledTriggers() {
    return listTriggers().filter((name) => readManifest(name).enabled);
}

function resolveOne(name, wakeConfig) {
    const manifest = readManifest(name);
    const classifierPath = wakeConfig.classifierPath || currentModelPath(name);
    const threshold = manifest.threshold ?? wakeConfig.threshold;
    const binding = manifest.binding ?? 'converse';
    return { name, classifierPath, threshold, binding };
}

// Resolve the set of triggers the daemon should load: an explicit config name
// pins a single trigger, otherwise every enabled trigger. Each trigger owns its
// model + threshold (the config threshold is only a fallback). Throws if the
// resolved set is empty.
export function resolveActiveTriggers(wakeConfig = {}) {
    const names = wakeConfig.trigger ? [wakeConfig.trigger] : getEnabledTriggers();
    if (names.length === 0) {
        throw new Error(
            'no enabled wake triggers — create and enable one: `thinksuit-voice trigger init <name> --phrase "..."`'
        );
    }
    return names.map((name) => resolveOne(name, wakeConfig));
}

// Additive: enabling adds a trigger to the listening set without touching the
// others; disabling removes just that one. The daemon listens for every enabled
// trigger at once.
export function setEnabled(name, enabled) {
    if (!triggerExists(name)) throw new Error(`no such trigger: ${name}`);
    const manifest = readManifest(name);
    if (enabled && !manifest.current) {
        throw new Error(`cannot enable ${name}: no promoted version (run train + promote first)`);
    }
    manifest.enabled = enabled;
    return writeManifest(name, manifest);
}

// ── Run logs ────────────────────────────────────────────────────────────────
// A training run writes a JSONL log under the trigger's runs/ dir, one event per
// line. The detached worker appends; the console reads to drive progress + result.

export function runLogPath(name, runId) {
    return join(resolveTriggerPaths(name).runs, `${runId}.jsonl`);
}

// Run IDs are the log filenames without extension, sorted ascending so the last
// is the most recent (IDs are timestamp-prefixed).
export function listRunIds(name) {
    const dir = resolveTriggerPaths(name).runs;
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
        .filter((f) => f.endsWith('.jsonl'))
        .map((f) => f.slice(0, -'.jsonl'.length))
        .sort();
}

export function appendRunLog(name, runId, entry) {
    const path = runLogPath(name, runId);
    ensureDir(resolveTriggerPaths(name).runs);
    appendFileSync(path, JSON.stringify(entry) + '\n');
}

// Parse a run-log into an array of events. Tolerates a partial trailing line (a
// run still being written, or one cut off by a crash): unparseable lines are
// skipped rather than throwing.
export function readRunLog(name, runId) {
    const path = runLogPath(name, runId);
    if (!existsSync(path)) return [];
    const out = [];
    for (const line of readFileSync(path, 'utf8').split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
            out.push(JSON.parse(trimmed));
        } catch {
            // partial trailing line — ignore
        }
    }
    return out;
}
