// Secret resolution. thinksuit knows nothing about any secret vendor: a secret is
// read from the environment first, then from a vendor-neutral dotenv file in the
// config dir (~/.thinksuit/secrets.env). How that file gets populated — a secrets
// manager, a keychain wrapper, hand-editing — is the operator's concern, not
// thinksuit's.
//
// Resolution is per-name, so a service only ever pulls the secrets it asks for;
// it never loads the whole file into its environment (least-privilege).

import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

function secretsFilePath() {
    return process.env.THINKSUIT_SECRETS_FILE || join(homedir(), '.thinksuit', 'secrets.env');
}

// path -> parsed map (or null when the file is absent/unreadable). Read once per
// process; a regenerated file is picked up on the next service restart.
const cache = new Map();

function parseDotenv(text) {
    const out = {};
    for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        if (!key) continue;
        let value = line.slice(eq + 1).trim();
        if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) {
            value = value.slice(1, -1);
        }
        out[key] = value;
    }
    return out;
}

function loadFile(path) {
    if (cache.has(path)) return cache.get(path);
    let parsed = null;
    try {
        parsed = parseDotenv(readFileSync(path, 'utf8'));
    } catch {
        parsed = null; // absent/unreadable → env-only
    }
    cache.set(path, parsed);
    return parsed;
}

/**
 * Resolve a secret by name: environment first, then the config-dir secrets file.
 * Returns the value, or undefined when it's set nowhere.
 */
export function resolveSecret(name) {
    const fromEnv = process.env[name];
    if (fromEnv) return fromEnv;
    const file = loadFile(secretsFilePath());
    return file ? file[name] : undefined;
}

// Test-only: drop the parsed-file cache so a test can point at a fresh file.
export function clearSecretsCache() {
    cache.clear();
}
