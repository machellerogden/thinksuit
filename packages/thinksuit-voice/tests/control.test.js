import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startControlServer } from '../src/control/server.js';
import * as client from '../src/control/client.js';

// The control server/client are pure (no mic), so we round-trip them over a temp
// socket with mock controls — no PortAudio, no Node-22-native modules involved.
describe('voice control API', () => {
    let handle;
    let socketPath;
    let calls;

    const controls = {
        getStatus: () => ({ micOn: true, mode: 'listening', device: { id: 1, name: 'Test Mic' } }),
        micOn: () => calls.push('micOn'),
        micOff: () => calls.push('micOff'),
        interrupt: () => {
            calls.push('interrupt');
            return { interrupted: true };
        }
    };

    beforeEach(async () => {
        calls = [];
        socketPath = join(tmpdir(), `ts-voice-test-${process.pid}-${Date.now()}.sock`);
        handle = await startControlServer(controls, { socketPath });
    });

    afterEach(async () => {
        await handle?.close();
    });

    it('health responds', async () => {
        const res = await client.health({ socketPath });
        expect(res.ok).toBe(true);
    });

    it('status returns the snapshot', async () => {
        const res = await client.status({ socketPath });
        expect(res).toMatchObject({ micOn: true, mode: 'listening', device: { name: 'Test Mic' } });
    });

    it('mic on/off invoke the controls', async () => {
        expect(await client.micOn({ socketPath })).toEqual({ ok: true, micOn: true });
        expect(await client.micOff({ socketPath })).toEqual({ ok: true, micOn: false });
        expect(calls).toEqual(['micOn', 'micOff']);
    });

    it('interrupt returns the interrupted flag', async () => {
        expect(await client.interrupt({ socketPath })).toEqual({ ok: true, interrupted: true });
        expect(calls).toEqual(['interrupt']);
    });

    it('reports the daemon as down when the socket is absent', async () => {
        const absent = join(tmpdir(), `ts-voice-absent-${process.pid}-${Date.now()}.sock`);
        await expect(client.status({ socketPath: absent })).rejects.toThrow(/not running/);
    });
});
