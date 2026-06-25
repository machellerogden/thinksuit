import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readUserConfig, patchUserConfig } from '../engine/config.js';

// readUserConfig / patchUserConfig target the global user config file. A
// THINKSUIT_CONFIG override isolates the file per test (no homedir writes).
describe('user config read/patch', () => {
    let dir;
    let configPath;

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'ts-user-config-'));
        configPath = join(dir, 'config.json');
        process.env.THINKSUIT_CONFIG = configPath;
    });

    afterEach(() => {
        delete process.env.THINKSUIT_CONFIG;
        rmSync(dir, { recursive: true, force: true });
    });

    it('returns {} when the file is absent', () => {
        expect(readUserConfig()).toEqual({});
    });

    it('round-trips a partial deep-merge without touching siblings', () => {
        writeFileSync(
            configPath,
            JSON.stringify({ provider: 'openai', voice: { wake: { defaultThreshold: 0.7 } } })
        );

        patchUserConfig({ voice: { wake: { triggers: { demo: { enabled: true } } } } });

        const after = readUserConfig();
        expect(after.provider).toBe('openai'); // untouched sibling
        expect(after.voice.wake.defaultThreshold).toBe(0.7); // untouched nested sibling
        expect(after.voice.wake.triggers.demo).toEqual({ enabled: true }); // merged in
    });

    it('applies a function mutator and persists to disk', () => {
        patchUserConfig((c) => {
            ((c.voice ??= {}).wake ??= {}).triggers = { a: { enabled: false } };
        });
        patchUserConfig((c) => {
            c.voice.wake.triggers.a.enabled = true;
            c.voice.wake.triggers.b = { enabled: true };
        });

        const onDisk = JSON.parse(readFileSync(configPath, 'utf-8'));
        expect(onDisk.voice.wake.triggers).toEqual({
            a: { enabled: true },
            b: { enabled: true }
        });
    });

    it('creates the file on first patch', () => {
        expect(existsSync(configPath)).toBe(false);
        patchUserConfig({ module: 'thinksuit/mu' });
        expect(existsSync(configPath)).toBe(true);
        expect(readUserConfig().module).toBe('thinksuit/mu');
    });
});
