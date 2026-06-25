import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as store from 'thinksuit-voice/triggers';

import { GET as listGET } from '../src/routes/api/voice/triggers/+server.js';
import { GET as oneGET, PATCH, DELETE } from '../src/routes/api/voice/triggers/[name]/+server.js';
import { POST as promotePOST } from '../src/routes/api/voice/triggers/[name]/promote/+server.js';

// Exercise the Studio endpoints against the real store pointed at a temp voice
// home — no mocking. Mirrors tests/wakewords.store.test.js in thinksuit-voice.
const jsonRequest = (method, body) =>
    new Request('http://localhost', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

describe('voice triggers API', () => {
    let home;
    let dummyOnnx;

    beforeEach(() => {
        home = mkdtempSync(join(tmpdir(), 'ts-console-triggers-'));
        process.env.THINKSUIT_VOICE_HOME = home;
        dummyOnnx = join(home, 'fake.onnx');
        writeFileSync(dummyOnnx, 'not-a-real-model');
    });

    afterEach(() => {
        delete process.env.THINKSUIT_VOICE_HOME;
        rmSync(home, { recursive: true, force: true });
    });

    function seedPromoted(name) {
        store.createTrigger({ name, phrase: 'Hey ThinkSuit' });
        store.registerVersion(name, { onnxPath: dummyOnnx, metrics: { recall: 0.9 } });
        store.promote(name);
    }

    it('GET lists triggers with a summary and the action vocabulary', async () => {
        seedPromoted('demo');
        const res = await listGET();
        const data = await res.json();
        expect(res.status).toBe(200);
        expect(data.actions).toEqual(['converse', 'new']);
        expect(data.triggers).toHaveLength(1);
        expect(data.triggers[0]).toMatchObject({
            name: 'demo',
            phrase: 'Hey ThinkSuit',
            binding: 'converse',
            enabled: false,
            current: 'v1'
        });
    });

    it('PATCH binding persists and is reflected on re-GET', async () => {
        seedPromoted('demo');
        const res = await PATCH({ params: { name: 'demo' }, request: jsonRequest('PATCH', { binding: 'new' }) });
        expect(res.status).toBe(200);
        const after = await (await oneGET({ params: { name: 'demo' } })).json();
        expect(after.binding).toBe('new');
    });

    it('PATCH enable (additive) works once a version is promoted', async () => {
        seedPromoted('demo');
        const res = await PATCH({ params: { name: 'demo' }, request: jsonRequest('PATCH', { enabled: true }) });
        expect(res.status).toBe(200);
        expect(store.readManifest('demo').enabled).toBe(true);
    });

    it('PATCH rejects an out-of-range threshold with 400', async () => {
        seedPromoted('demo');
        const res = await PATCH({ params: { name: 'demo' }, request: jsonRequest('PATCH', { threshold: 1.5 }) });
        expect(res.status).toBe(400);
    });

    it('PATCH rejects enabling a trigger with no promoted version with 400', async () => {
        store.createTrigger({ name: 'green', phrase: 'Hey ThinkSuit' });
        const res = await PATCH({ params: { name: 'green' }, request: jsonRequest('PATCH', { enabled: true }) });
        expect(res.status).toBe(400);
    });

    it('PATCH rejects an unknown binding with 400', async () => {
        seedPromoted('demo');
        const res = await PATCH({ params: { name: 'demo' }, request: jsonRequest('PATCH', { binding: 'bogus' }) });
        expect(res.status).toBe(400);
    });

    it('GET/PATCH/DELETE on a missing trigger return 404', async () => {
        expect((await oneGET({ params: { name: 'ghost' } })).status).toBe(404);
        expect(
            (await PATCH({ params: { name: 'ghost' }, request: jsonRequest('PATCH', { binding: 'new' }) })).status
        ).toBe(404);
        expect((await DELETE({ params: { name: 'ghost' } })).status).toBe(404);
    });

    it('POST promote makes the latest version current', async () => {
        store.createTrigger({ name: 'demo', phrase: 'Hey ThinkSuit' });
        store.registerVersion('demo', { onnxPath: dummyOnnx });
        store.registerVersion('demo', { onnxPath: dummyOnnx });
        const res = await promotePOST({ params: { name: 'demo' }, request: jsonRequest('POST', {}) });
        expect(res.status).toBe(200);
        expect(store.readManifest('demo').current).toBe('v2');
    });

    it('DELETE removes the trigger', async () => {
        seedPromoted('demo');
        const res = await DELETE({ params: { name: 'demo' } });
        expect(res.status).toBe(200);
        expect(store.listTriggers()).toEqual([]);
    });
});
