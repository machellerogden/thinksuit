// The wakeword library. A wakeword has two homes by design:
//   - SETTINGS (the user-tunable knobs: phrase, enabled, binding, threshold,
//     current) live in the shared user config under voice.wakewords.<name>,
//     so config has one source of truth.
//   - ARTIFACTS (recorded samples, trained .onnx versions, run-logs, and the
//     version→metrics catalog) live in a per-wakeword bundle on disk under the
//     voice home (see paths.js), because they can't live in JSON config.
// This module is the sole owner of that layout. The on-disk manifest.json is now
// a slim artifact *catalog* (versions only); readManifest() returns a merged view
// (settings + catalog) so callers see one wakeword object.

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
import { readUserConfig, patchUserConfig } from 'thinksuit';
import { resolveWakewordsDir, resolveWakewordPaths } from '../paths.js';
import { ACTIONS } from '../session.js';

const NAME_RE = /^[a-z0-9][a-z0-9_-]*$/i;
const DEFAULT_THRESHOLD = 0.7;

function assertValidName(name) {
    if (!NAME_RE.test(name)) {
        throw new Error(
            `invalid wakeword name "${name}" — use letters, digits, dashes, underscores`
        );
    }
}

function now() {
    return new Date().toISOString();
}

function ensureDir(dir) {
    mkdirSync(dir, { recursive: true });
}

// ── Settings (in user config: voice.wakewords.<name>) ────────────────────────

function readSettingsAll() {
    return readUserConfig().voice?.wakewords || {};
}

function readSettings(name) {
    return readSettingsAll()[name] || null;
}

function writeSettings(name, patch) {
    patchUserConfig((c) => {
        const wakewords = ((c.voice ??= {}).wakewords ??= {});
        wakewords[name] = { ...(wakewords[name] || {}), ...patch };
    });
}

function deleteSettings(name) {
    patchUserConfig((c) => {
        const wakewords = c.voice?.wakewords;
        if (wakewords) delete wakewords[name];
    });
}

// ── Catalog (on disk: wakewords/<name>/manifest.json — versions only) ─────────

function readCatalog(name) {
    const { manifest } = resolveWakewordPaths(name);
    if (!existsSync(manifest)) return null;
    return JSON.parse(readFileSync(manifest, 'utf8'));
}

function writeCatalog(name, catalog) {
    const paths = resolveWakewordPaths(name);
    ensureDir(paths.dir);
    const next = { ...catalog, updatedAt: now() };
    writeFileSync(paths.manifest, JSON.stringify(next, null, 2) + '\n');
    return next;
}

// ── Wakewords ─────────────────────────────────────────────────────────────────

export function listWakewords() {
    const root = resolveWakewordsDir();
    if (!existsSync(root)) return [];
    return readdirSync(root, { withFileTypes: true })
        .filter((e) => e.isDirectory() && existsSync(join(root, e.name, 'manifest.json')))
        .map((e) => e.name)
        .sort();
}

export function wakewordExists(name) {
    return existsSync(resolveWakewordPaths(name).manifest);
}

// The merged wakeword view: settings (config) + versions catalog (disk).
export function readManifest(name) {
    if (!wakewordExists(name)) throw new Error(`no such wakeword: ${name}`);
    const cat = readCatalog(name) || { name, versions: [], createdAt: now() };
    const s = readSettings(name) || {};
    return {
        name,
        phrase: s.phrase ?? '',
        enabled: s.enabled ?? false,
        binding: s.binding ?? 'converse',
        threshold: s.threshold ?? DEFAULT_THRESHOLD,
        current: s.current ?? null,
        versions: cat.versions || [],
        createdAt: cat.createdAt
    };
}

export function createWakeword({ name, phrase, threshold = DEFAULT_THRESHOLD }) {
    assertValidName(name);
    if (!phrase || !phrase.trim()) throw new Error('a wakeword needs a phrase');
    if (wakewordExists(name)) throw new Error(`wakeword already exists: ${name}`);

    const paths = resolveWakewordPaths(name);
    ensureDir(paths.positiveSamples);
    ensureDir(paths.negativeSamples);
    ensureDir(paths.models);
    ensureDir(paths.runs);

    writeCatalog(name, { name, versions: [], createdAt: now() });
    writeSettings(name, {
        phrase: phrase.trim(),
        enabled: false,
        binding: 'converse',
        threshold,
        current: null
    });
    return readManifest(name);
}

export function removeWakeword(name) {
    const { dir } = resolveWakewordPaths(name);
    if (!existsSync(dir)) throw new Error(`no such wakeword: ${name}`);
    rmSync(dir, { recursive: true, force: true });
    deleteSettings(name);
}

// ── Samples ──────────────────────────────────────────────────────────────

function kindDir(name, kind) {
    const paths = resolveWakewordPaths(name);
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

// Validate a caller-supplied clip filename (guards against path traversal).
function assertClipFile(file) {
    if (!/^clip_\d+\.wav$/.test(file)) throw new Error(`invalid sample file: ${file}`);
    return file;
}

export function readSampleClip(name, kind, file) {
    const path = join(kindDir(name, kind), assertClipFile(file));
    if (!existsSync(path)) throw new Error(`no such sample: ${file}`);
    return readFileSync(path);
}

export function deleteSample(name, kind, file) {
    const path = join(kindDir(name, kind), assertClipFile(file));
    if (!existsSync(path)) throw new Error(`no such sample: ${file}`);
    rmSync(path);
}

// Copy an existing directory of clip_*.wav recordings into a wakeword's sample set,
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

// ── Model versions (catalog on disk) ──────────────────────────────────────

// Copy an exported .onnx into the bundle as the next version and record its
// metrics. Does not change `current` — promotion is a separate, explicit step.
export function registerVersion(name, { onnxPath, metrics = null }) {
    const cat = readCatalog(name) || { name, versions: [], createdAt: now() };
    const paths = resolveWakewordPaths(name);
    ensureDir(paths.models);
    const version = `v${cat.versions.length + 1}`;
    const rel = join('models', `${name}.${version}.onnx`);
    copyFileSync(onnxPath, join(paths.dir, rel));
    cat.versions.push({ version, model: rel, metrics, createdAt: now() });
    writeCatalog(name, cat);
    return version;
}

export function versionModelPath(name, version) {
    const cat = readCatalog(name);
    const entry = cat?.versions.find((v) => v.version === version);
    if (!entry) throw new Error(`no such version ${version} for wakeword ${name}`);
    return join(resolveWakewordPaths(name).dir, entry.model);
}

export function currentModelPath(name) {
    const current = readSettings(name)?.current;
    if (!current) throw new Error(`wakeword ${name} has no promoted version`);
    return versionModelPath(name, current);
}

// Promote a trained version: writes `current` to config (the user's choice of
// which on-disk model is active).
export function promote(name, version) {
    const cat = readCatalog(name);
    const target = version || cat?.versions[cat.versions.length - 1]?.version;
    if (!target) throw new Error(`wakeword ${name} has no trained versions to promote`);
    if (!cat.versions.some((v) => v.version === target)) {
        throw new Error(`no such version ${target} for wakeword ${name}`);
    }
    writeSettings(name, { current: target });
    return readManifest(name);
}

export function setThreshold(name, value) {
    const v = Number(value);
    if (!Number.isFinite(v) || v < 0 || v > 1) {
        throw new Error(`threshold must be between 0 and 1, got ${value}`);
    }
    if (!wakewordExists(name)) throw new Error(`no such wakeword: ${name}`);
    writeSettings(name, { threshold: v });
    return readManifest(name);
}

// Bind a wakeword to the session-lifecycle action it fires (converse/new).
export function setBinding(name, action) {
    if (!ACTIONS.includes(action)) {
        throw new Error(`unknown action "${action}" — use one of: ${ACTIONS.join(', ')}`);
    }
    if (!wakewordExists(name)) throw new Error(`no such wakeword: ${name}`);
    writeSettings(name, { binding: action });
    return readManifest(name);
}

// ── Enablement (additive — many wakewords can be active at once) ─────────────

export function getEnabledWakewords() {
    return listWakewords().filter((name) => readManifest(name).enabled);
}

function resolveOne(name) {
    const m = readManifest(name);
    return {
        name,
        classifierPath: currentModelPath(name),
        threshold: m.threshold,
        binding: m.binding
    };
}

// Resolve the set of wakewords the daemon should load: every enabled wakeword.
// Each owns its model + threshold. Throws if the resolved set is empty.
export function resolveActiveWakewords() {
    const names = getEnabledWakewords();
    if (names.length === 0) {
        throw new Error(
            'no enabled wakewords — create and enable one: `thinksuit-voice wakeword init <name> --phrase "..."`'
        );
    }
    return names.map((name) => resolveOne(name));
}

// Additive: enabling adds a wakeword to the listening set without touching the
// others; disabling removes just that one. The daemon listens for every enabled
// wakeword at once.
export function setEnabled(name, enabled) {
    if (!wakewordExists(name)) throw new Error(`no such wakeword: ${name}`);
    if (enabled && !readSettings(name)?.current) {
        throw new Error(`cannot enable ${name}: no promoted version (run train + promote first)`);
    }
    writeSettings(name, { enabled });
    return readManifest(name);
}

// ── Run logs ────────────────────────────────────────────────────────────────
// A training run writes a JSONL log under the wakeword's runs/ dir, one event per
// line. The detached worker appends; the console reads to drive progress + result.

export function runLogPath(name, runId) {
    return join(resolveWakewordPaths(name).runs, `${runId}.jsonl`);
}

// Run IDs are the log filenames without extension, sorted ascending so the last
// is the most recent (IDs are timestamp-prefixed).
export function listRunIds(name) {
    const dir = resolveWakewordPaths(name).runs;
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
        .filter((f) => f.endsWith('.jsonl'))
        .map((f) => f.slice(0, -'.jsonl'.length))
        .sort();
}

export function appendRunLog(name, runId, entry) {
    const path = runLogPath(name, runId);
    ensureDir(resolveWakewordPaths(name).runs);
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
