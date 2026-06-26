// Designations: a kernel-owned registry of named pointers to sessions, a flat
// `name -> sessionId` map. Cardinality is one per name (a name resolves to
// exactly one session); the inverse is many (a session may carry several names).
//
// This is the dumb registrar — it stores strings and knows nothing of what any
// name *means*. Meaning lives at the surfaces (e.g. thinksuit-voice owns the
// `voice` name). The map persists in ~/.thinksuit/state.json, the kernel's home
// for system-authored state (distinct from the user-authored ~/.thinksuit.json).

import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

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
    writeFileSync(path, JSON.stringify(state, null, 4), 'utf-8');
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
    const state = readState();
    (state.designations ??= {})[name] = sessionId;
    writeState(state);
    return sessionId;
}
