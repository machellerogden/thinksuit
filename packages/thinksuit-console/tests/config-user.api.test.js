import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PUT } from '../src/routes/api/config/user/+server.js';

// The User Configuration form rebuilds `voice` wholesale and PUTs it. Per-trigger
// settings (voice.wake.triggers) are owned by the trigger store, not the form, so
// the endpoint must carry that subtree forward — a form save can never wipe it.
const putEvent = (config) => ({
    request: new Request('http://localhost', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config })
    })
});

describe('user config PUT', () => {
    let dir;
    let configPath;

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'ts-console-config-'));
        configPath = join(dir, 'config.json');
        process.env.THINKSUIT_CONFIG = configPath;
    });

    afterEach(() => {
        delete process.env.THINKSUIT_CONFIG;
        rmSync(dir, { recursive: true, force: true });
    });

    it('preserves voice.wake.triggers when the form omits it', async () => {
        // Existing file has trigger settings (written by the store).
        writeFileSync(
            configPath,
            JSON.stringify({
                voice: {
                    wake: { triggers: { hey_thinksuit: { enabled: true, binding: 'converse', current: 'v1' } } }
                }
            })
        );

        // Form-style payload: rebuilds voice without the triggers subtree.
        const res = await PUT(putEvent({ voice: { input: { deviceName: 'Yeti' }, wake: { defaultThreshold: 0.7 } } }));
        expect(res.status).toBe(200);

        const after = JSON.parse(readFileSync(configPath, 'utf-8'));
        expect(after.voice.input.deviceName).toBe('Yeti'); // form change applied
        expect(after.voice.wake.defaultThreshold).toBe(0.7);
        expect(after.voice.wake.triggers).toEqual({
            hey_thinksuit: { enabled: true, binding: 'converse', current: 'v1' }
        }); // store-owned subtree survived
    });

    it('writes cleanly when there is no existing triggers subtree', async () => {
        const res = await PUT(putEvent({ provider: 'openai', voice: { wake: { defaultThreshold: 0.6 } } }));
        expect(res.status).toBe(200);
        const after = JSON.parse(readFileSync(configPath, 'utf-8'));
        expect(after.provider).toBe('openai');
        expect(after.voice.wake.defaultThreshold).toBe(0.6);
        expect(after.voice.wake.triggers).toBeUndefined();
    });
});
