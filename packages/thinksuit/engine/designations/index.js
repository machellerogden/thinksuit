// Designations: a kernel-owned registry of named pointers to sessions, a flat
// `name -> sessionId` map. Cardinality is one per name (a name resolves to
// exactly one session); the inverse is many (a session may carry several names).
//
// This is the dumb registrar — it stores strings and knows nothing of what any
// name *means*. Meaning lives at the surfaces (e.g. thinksuit-voice owns the
// `voice` name). The map persists in ~/.thinksuit/state.json, the kernel's home
// for system-authored state (distinct from the user-authored ~/.thinksuit.json).
//
// Single writer: surfaces (console, voice) route *writes* through the broker
// (POST /designations → setDesignation here), so only one process ever mutates
// state.json. Reads (getDesignation/listDesignations) stay direct — writeState's
// atomic rename means a reader never sees a torn write.

import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';

const NAME_RE = /^[a-z0-9][a-z0-9_-]*$/i;

function stateFilePath() {
    return process.env.THINKSUIT_STATE_FILE || join(homedir(), '.thinksuit', 'state.json');
}

function readState() {
    const path = stateFilePath();
    if (!existsSync(path)) return {};
    try {
        return JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
        return {};
    }
}

function writeState(state) {
    const path = stateFilePath();
    mkdirSync(dirname(path), { recursive: true });
    // Write to a temp file then rename — an interrupted write can't truncate the
    // real file (rename is atomic on POSIX) and readers never see a partial write.
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(state, null, 4), 'utf-8');
    renameSync(tmp, path);
}

// Like readState, but for the write path: a present-but-unparseable file is an
// error, not an empty object. Refuse to overwrite it — otherwise a single corrupt
// read would silently wipe every existing designation.
function readStateForWrite() {
    const path = stateFilePath();
    if (!existsSync(path)) return {};
    const raw = readFileSync(path, 'utf-8');
    try {
        return JSON.parse(raw);
    } catch (err) {
        throw new Error(
            `refusing to write: state file ${path} is corrupt (${err.message}); ` +
                'fix or remove it to avoid losing designations'
        );
    }
}

function assertValidName(name) {
    if (typeof name !== 'string' || !NAME_RE.test(name)) {
        throw new Error(
            `invalid designation name "${name}" — use letters, digits, dashes, underscores`
        );
    }
}

/** All designations as a plain `{ name: sessionId }` map. */
export function listDesignations() {
    return readState().designations || {};
}

/** The session a designation points at, or null. */
export function getDesignation(name) {
    return listDesignations()[name] || null;
}

/** Point a designation at a session (read-modify-write). Returns the sessionId. */
export function setDesignation(name, sessionId) {
    assertValidName(name);
    if (typeof sessionId !== 'string' || !sessionId) {
        throw new Error('setDesignation requires a non-empty sessionId');
    }
    const state = readStateForWrite();
    (state.designations ??= {})[name] = sessionId;
    writeState(state);
    return sessionId;
}
