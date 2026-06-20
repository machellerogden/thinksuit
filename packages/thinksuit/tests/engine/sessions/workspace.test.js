import { describe, it, expect, afterAll } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { rm, mkdir, lstat, realpath } from 'node:fs/promises';

// Isolate the workspace base BEFORE the module reads it at import time.
const WS_BASE = join(tmpdir(), `ts-ws-test-${randomBytes(5).toString('hex')}`);
process.env.THINKSUIT_WORKSPACE_DIR = WS_BASE;

const { provisionWorkspace, getSessionWorkspace } = await import(
    '../../../engine/sessions/index.js'
);

afterAll(async () => {
    await rm(WS_BASE, { recursive: true, force: true });
});

describe('provisionWorkspace', () => {
    it('provisions a fresh directory and returns its resolved path', async () => {
        const ws = await provisionWorkspace('sess-fresh', {});
        expect(ws.endsWith('sess-fresh')).toBe(true);
        const st = await lstat(ws);
        expect(st.isDirectory()).toBe(true);
    });

    it('is idempotent — reuses the same workspace on subsequent calls', async () => {
        const a = await provisionWorkspace('sess-reuse', {});
        const b = await provisionWorkspace('sess-reuse', {});
        expect(b).toBe(a);
    });

    it('binds an explicit workdir via a symlink that resolves to the target', async () => {
        const target = join(tmpdir(), `ts-ws-target-${randomBytes(5).toString('hex')}`);
        await mkdir(target, { recursive: true });
        try {
            const ws = await provisionWorkspace('sess-bound', { workdir: target });
            // Resolved path points at the bound target (canonicalized)...
            expect(ws).toBe(await realpath(target));
            // ...and the workspace entry itself is a symlink.
            const entry = await lstat(join(WS_BASE, 'sess-bound'));
            expect(entry.isSymbolicLink()).toBe(true);
        } finally {
            await rm(target, { recursive: true, force: true });
        }
    });
});

describe('getSessionWorkspace', () => {
    it('returns the resolved path for a provisioned session', async () => {
        const ws = await provisionWorkspace('sess-get', {});
        expect(await getSessionWorkspace('sess-get')).toBe(ws);
    });

    it('returns null for a session with no workspace', async () => {
        expect(await getSessionWorkspace('sess-missing')).toBe(null);
    });
});
