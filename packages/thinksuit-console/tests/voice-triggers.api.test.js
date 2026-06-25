import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as store from 'thinksuit-voice/triggers';

import { GET as listGET, POST as createPOST } from '../src/routes/api/voice/triggers/+server.js';
import { GET as oneGET, PATCH, DELETE } from '../src/routes/api/voice/triggers/[name]/+server.js';
import { POST as promotePOST } from '../src/routes/api/voice/triggers/[name]/promote/+server.js';
import { GET as samplesGET, POST as samplesPOST } from '../src/routes/api/voice/triggers/[name]/samples/+server.js';
import { GET as clipGET, DELETE as clipDELETE } from '../src/routes/api/voice/triggers/[name]/samples/[file]/+server.js';
import { POST as trainPOST, GET as trainGET } from '../src/routes/api/voice/triggers/[name]/train/+server.js';

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
        process.env.THINKSUIT_CONFIG = join(home, 'config.json');
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

    // ── enrollment (Slice 2) ──────────────────────────────────────────────
    const loud = (n) => {
        const a = new Int16Array(n);
        a.fill(8000);
        return a;
    };
    const pcmReq = (int16) =>
        new Request('http://localhost', {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: int16.buffer
        });
    const samplesUrl = (name, kind) =>
        new URL(`http://localhost/api/voice/triggers/${name}/samples?kind=${kind}`);

    it('POST create makes a trigger from name + phrase', async () => {
        const res = await createPOST({ request: jsonRequest('POST', { name: 'fresh', phrase: 'Hey ThinkSuit' }) });
        expect(res.status).toBe(201);
        expect(store.triggerExists('fresh')).toBe(true);
    });

    it('POST create rejects bad name / missing phrase / duplicate with 400', async () => {
        expect((await createPOST({ request: jsonRequest('POST', { name: 'bad name', phrase: 'x' }) })).status).toBe(400);
        expect((await createPOST({ request: jsonRequest('POST', { name: 'ok', phrase: '' }) })).status).toBe(400);
        store.createTrigger({ name: 'dup', phrase: 'Hey ThinkSuit' });
        expect((await createPOST({ request: jsonRequest('POST', { name: 'dup', phrase: 'x' }) })).status).toBe(400);
    });

    it('GET exposes the negative-prompt list for the enrollment UI', async () => {
        const data = await (await listGET()).json();
        expect(Array.isArray(data.negPrompts)).toBe(true);
        expect(data.negPrompts.length).toBeGreaterThan(0);
    });

    it('POST samples writes a clip and increments the count', async () => {
        store.createTrigger({ name: 'demo', phrase: 'Hey ThinkSuit' });
        const res = await samplesPOST({
            params: { name: 'demo' },
            request: pcmReq(loud(16000)),
            url: samplesUrl('demo', 'positive')
        });
        const data = await res.json();
        expect(res.status).toBe(200);
        expect(data.samples.positive).toBe(1);
        expect(data.peak).toBeGreaterThan(0.05);
        expect(store.countSamples('demo', 'positive')).toBe(1);
    });

    it('POST samples rejects a too-short clip with 400', async () => {
        store.createTrigger({ name: 'demo', phrase: 'Hey ThinkSuit' });
        const res = await samplesPOST({
            params: { name: 'demo' },
            request: pcmReq(loud(200)),
            url: samplesUrl('demo', 'positive')
        });
        expect(res.status).toBe(400);
    });

    it('POST samples rejects unknown kind (400) and missing trigger (404)', async () => {
        store.createTrigger({ name: 'demo', phrase: 'Hey ThinkSuit' });
        expect(
            (await samplesPOST({ params: { name: 'demo' }, request: pcmReq(loud(16000)), url: samplesUrl('demo', 'bogus') })).status
        ).toBe(400);
        expect(
            (await samplesPOST({ params: { name: 'ghost' }, request: pcmReq(loud(16000)), url: samplesUrl('ghost', 'positive') })).status
        ).toBe(404);
    });

    // ── manage samples (list / serve / delete) ─────────────────────────────
    const clipUrl = (name, file, kind) =>
        new URL(`http://localhost/api/voice/triggers/${name}/samples/${file}?kind=${kind}`);

    async function seedClip(name, kind) {
        await samplesPOST({ params: { name }, request: pcmReq(loud(16000)), url: samplesUrl(name, kind) });
    }

    it('GET samples lists clips per kind', async () => {
        store.createTrigger({ name: 'demo', phrase: 'Hey ThinkSuit' });
        await seedClip('demo', 'positive');
        await seedClip('demo', 'negative');
        const data = await (await samplesGET({ params: { name: 'demo' } })).json();
        expect(data.positive).toEqual(['clip_000000.wav']);
        expect(data.negative).toEqual(['clip_000000.wav']);
    });

    it('GET a clip streams audio/wav bytes', async () => {
        store.createTrigger({ name: 'demo', phrase: 'Hey ThinkSuit' });
        await seedClip('demo', 'positive');
        const res = await clipGET({ params: { name: 'demo', file: 'clip_000000.wav' }, url: clipUrl('demo', 'clip_000000.wav', 'positive') });
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('audio/wav');
        expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(44); // WAV header + data
    });

    it('DELETE a clip removes it and drops the count', async () => {
        store.createTrigger({ name: 'demo', phrase: 'Hey ThinkSuit' });
        await seedClip('demo', 'positive');
        const res = await clipDELETE({ params: { name: 'demo', file: 'clip_000000.wav' }, url: clipUrl('demo', 'clip_000000.wav', 'positive') });
        expect(res.status).toBe(200);
        expect(store.countSamples('demo', 'positive')).toBe(0);
    });

    it('clip GET/DELETE 404 a missing trigger; DELETE 400s a bad filename', async () => {
        store.createTrigger({ name: 'demo', phrase: 'Hey ThinkSuit' });
        expect(
            (await clipGET({ params: { name: 'ghost', file: 'clip_000000.wav' }, url: clipUrl('ghost', 'clip_000000.wav', 'positive') })).status
        ).toBe(404);
        expect(
            (await clipDELETE({ params: { name: 'demo', file: 'evil.txt' }, url: clipUrl('demo', 'evil.txt', 'positive') })).status
        ).toBe(400);
    });

    // ── training (Slice 3) ─────────────────────────────────────────────────
    // The happy-path POST spawns a real ~50-min worker, so we only exercise the
    // guard branches (which short-circuit before spawn) and GET's run-log parsing.
    it('POST train returns 404 for a missing trigger', async () => {
        expect((await trainPOST({ params: { name: 'ghost' } })).status).toBe(404);
    });

    it('POST train returns 409 when a run is already in progress', async () => {
        store.createTrigger({ name: 'demo', phrase: 'Hey ThinkSuit' });
        store.appendRunLog('demo', 'run-1', { event: 'started' });
        store.appendRunLog('demo', 'run-1', { event: 'phase', phase: 'train', status: 'start' });
        expect((await trainPOST({ params: { name: 'demo' } })).status).toBe(409);
    });

    it('GET train reports no run before any training', async () => {
        store.createTrigger({ name: 'demo', phrase: 'Hey ThinkSuit' });
        const data = await (await trainGET({ params: { name: 'demo' } })).json();
        expect(data).toMatchObject({ running: false, runId: null, phase: null, result: null });
    });

    it('GET train surfaces a running run with its current phase', async () => {
        store.createTrigger({ name: 'demo', phrase: 'Hey ThinkSuit' });
        store.appendRunLog('demo', 'run-1', { event: 'started' });
        store.appendRunLog('demo', 'run-1', { event: 'phase', phase: 'augment', status: 'start' });
        const data = await (await trainGET({ params: { name: 'demo' } })).json();
        expect(data.running).toBe(true);
        expect(data.runId).toBe('run-1');
        expect(data.phase).toBe('augment:start');
    });

    it('GET train surfaces a completed run with its result', async () => {
        store.createTrigger({ name: 'demo', phrase: 'Hey ThinkSuit' });
        store.appendRunLog('demo', 'run-1', { event: 'started' });
        store.appendRunLog('demo', 'run-1', { event: 'complete', version: 'v1', promoted: true });
        const data = await (await trainGET({ params: { name: 'demo' } })).json();
        expect(data.running).toBe(false);
        expect(data.phase).toBe('complete');
        expect(data.result).toMatchObject({ event: 'complete', version: 'v1', promoted: true });
    });
});
