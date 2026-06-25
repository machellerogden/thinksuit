import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

// SESSIONS_BASE is resolved from THINKSUIT_SESSION_DIR at import time, so set it
// before any dynamic import of the path/session modules.
let tempDir;
let getSessionFilePath;
let loadSessionThread;

beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ts-thread-'));
    process.env.THINKSUIT_SESSION_DIR = tempDir;
    ({ getSessionFilePath } = await import('../../engine/utils/paths.js'));
    ({ loadSessionThread } = await import('../../engine/transports/session-router.js'));
});

afterAll(() => {
    delete process.env.THINKSUIT_SESSION_DIR;
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
});

function writeSession(sessionId, entries) {
    const file = getSessionFilePath(sessionId);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
}

describe('loadSessionThread — interrupt marker', () => {
    it('renders session.interrupted as a user-side marker, no fabricated assistant turn', async () => {
        const id = '20250101T000000000Z-intrupt1';
        writeSession(id, [
            { event: 'session.input', data: { input: 'do X' } },
            { event: 'session.interrupted', data: { reason: 'Task interrupted by user' } },
            { event: 'session.turn.complete' }
        ]);

        const thread = await loadSessionThread(id);

        expect(thread).toEqual([
            { role: 'user', content: 'do X' },
            { role: 'user', content: '[Request interrupted by user]' }
        ]);
    });

    it('still reconstructs normal user/assistant turns', async () => {
        const id = '20250101T000000000Z-normal01';
        writeSession(id, [
            { event: 'session.input', data: { input: 'hello' } },
            { event: 'session.response', data: { response: 'hi there' } },
            { event: 'session.turn.complete' }
        ]);

        const thread = await loadSessionThread(id);

        expect(thread).toEqual([
            { role: 'user', content: 'hello' },
            { role: 'assistant', content: 'hi there' }
        ]);
    });
});
