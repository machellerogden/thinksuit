import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as store from '../src/wakewords/store.js';

// The store is pure filesystem (no mic, no Python). Point the voice home at a
// temp dir so each run is isolated. resolveVoiceHome() reads the env per call.
describe('wakeword store', () => {
    let home;
    let dummyOnnx;

    beforeEach(() => {
        home = mkdtempSync(join(tmpdir(), 'ts-voice-store-'));
        process.env.THINKSUIT_VOICE_HOME = home;
        process.env.THINKSUIT_CONFIG = join(home, 'config.json');
        dummyOnnx = join(home, 'fake.onnx');
        writeFileSync(dummyOnnx, 'not-a-real-model');
    });

    afterEach(() => {
        delete process.env.THINKSUIT_VOICE_HOME;
        delete process.env.THINKSUIT_CONFIG;
        rmSync(home, { recursive: true, force: true });
    });

    it('creates, lists, reads and removes a wakeword', () => {
        expect(store.listWakewords()).toEqual([]);
        store.createWakeword({ name: 'demo', phrase: 'Hey ThinkSuit' });
        expect(store.listWakewords()).toEqual(['demo']);
        expect(store.wakewordExists('demo')).toBe(true);

        const m = store.readManifest('demo');
        expect(m).toMatchObject({
            name: 'demo',
            phrase: 'Hey ThinkSuit',
            threshold: 0.7,
            enabled: false,
            binding: 'converse',
            current: null,
            versions: []
        });

        store.removeWakeword('demo');
        expect(store.listWakewords()).toEqual([]);
    });

    it('rejects invalid names, duplicates, and missing phrase', () => {
        expect(() => store.createWakeword({ name: 'bad name', phrase: 'x' })).toThrow(/invalid/);
        expect(() => store.createWakeword({ name: 'demo', phrase: '' })).toThrow(/phrase/);
        store.createWakeword({ name: 'demo', phrase: 'Hey ThinkSuit' });
        expect(() => store.createWakeword({ name: 'demo', phrase: 'x' })).toThrow(/already exists/);
    });

    it('numbers samples per kind, continuing from existing clips', () => {
        store.createWakeword({ name: 'demo', phrase: 'Hey ThinkSuit' });
        expect(store.nextSampleIndex('demo', 'positive')).toBe(0);
        writeFileSync(store.sampleClipPath('demo', 'positive', 0), 'x');
        writeFileSync(store.sampleClipPath('demo', 'positive', 1), 'x');
        expect(store.countSamples('demo', 'positive')).toBe(2);
        expect(store.nextSampleIndex('demo', 'positive')).toBe(2);
        expect(store.nextSampleIndex('demo', 'negative')).toBe(0);
    });

    it('registers versions without changing current; promote sets current', () => {
        store.createWakeword({ name: 'demo', phrase: 'Hey ThinkSuit' });
        const v1 = store.registerVersion('demo', { onnxPath: dummyOnnx, metrics: { acc: 0.9 } });
        const v2 = store.registerVersion('demo', { onnxPath: dummyOnnx, metrics: { acc: 0.95 } });
        expect([v1, v2]).toEqual(['v1', 'v2']);
        expect(store.readManifest('demo').current).toBeNull();
        expect(existsSync(store.versionModelPath('demo', 'v1'))).toBe(true);

        store.promote('demo'); // latest by default
        expect(store.readManifest('demo').current).toBe('v2');
        expect(store.currentModelPath('demo')).toBe(store.versionModelPath('demo', 'v2'));

        store.promote('demo', 'v1');
        expect(store.readManifest('demo').current).toBe('v1');
    });

    it('cannot enable a wakeword with no promoted version', () => {
        store.createWakeword({ name: 'demo', phrase: 'Hey ThinkSuit' });
        expect(() => store.setEnabled('demo', true)).toThrow(/no promoted version/);
    });

    it('enable is additive — many wakewords can be active at once', () => {
        for (const name of ['a', 'b']) {
            store.createWakeword({ name, phrase: 'Hey ThinkSuit' });
            store.registerVersion(name, { onnxPath: dummyOnnx });
            store.promote(name);
        }
        store.setEnabled('a', true);
        expect(store.getEnabledWakewords()).toEqual(['a']);
        store.setEnabled('b', true); // does not disable 'a'
        expect(store.getEnabledWakewords()).toEqual(['a', 'b']);
        store.setEnabled('a', false); // removes only 'a'
        expect(store.getEnabledWakewords()).toEqual(['b']);
        store.setEnabled('b', false);
        expect(store.getEnabledWakewords()).toEqual([]);
    });

    it('setBinding persists a valid action and rejects unknown ones', () => {
        store.createWakeword({ name: 'demo', phrase: 'Hey ThinkSuit' });
        expect(store.readManifest('demo').binding).toBe('converse'); // seeded default
        store.setBinding('demo', 'new');
        expect(store.readManifest('demo').binding).toBe('new');
        expect(() => store.setBinding('demo', 'bogus')).toThrow(/unknown action/);
    });

    it('validates the threshold range', () => {
        store.createWakeword({ name: 'demo', phrase: 'Hey ThinkSuit' });
        expect(() => store.setThreshold('demo', 1.5)).toThrow(/between 0 and 1/);
        store.setThreshold('demo', 0.55);
        expect(store.readManifest('demo').threshold).toBe(0.55);
    });

    it('adoptSamples copies a directory of clips in, renumbered and continued', () => {
        store.createWakeword({ name: 'demo', phrase: 'Hey ThinkSuit' });
        const src = mkdtempSync(join(tmpdir(), 'ts-src-'));
        writeFileSync(join(src, 'clip_000000.wav'), 'a');
        writeFileSync(join(src, 'clip_000007.wav'), 'b'); // gappy source numbering
        writeFileSync(join(src, 'notes.txt'), 'ignored'); // non-wav filtered out

        expect(store.adoptSamples('demo', 'positive', src)).toBe(2);
        expect(store.listSamples('demo', 'positive')).toEqual(['clip_000000.wav', 'clip_000001.wav']);

        // a second adopt continues the numbering rather than clobbering
        expect(store.adoptSamples('demo', 'positive', src)).toBe(2);
        expect(store.countSamples('demo', 'positive')).toBe(4);

        expect(store.adoptSamples('demo', 'negative', join(tmpdir(), 'does-not-exist'))).toBe(0);
        rmSync(src, { recursive: true, force: true });
    });

    it('round-trips run logs and tolerates a partial trailing line', () => {
        store.createWakeword({ name: 'demo', phrase: 'Hey ThinkSuit' });
        expect(store.listRunIds('demo')).toEqual([]);
        expect(store.readRunLog('demo', 'nope')).toEqual([]);

        store.appendRunLog('demo', 'run-a', { event: 'started' });
        store.appendRunLog('demo', 'run-a', { event: 'progress', phase: 'train', status: 'start' });
        store.appendRunLog('demo', 'run-b', { event: 'complete', version: 'v1' });

        expect(store.listRunIds('demo')).toEqual(['run-a', 'run-b']); // sorted
        const a = store.readRunLog('demo', 'run-a');
        expect(a).toHaveLength(2);
        expect(a[1]).toMatchObject({ event: 'progress', phase: 'train' });

        // a crash mid-write leaves a partial JSON line — it should be skipped, not throw
        appendFileSync(store.runLogPath('demo', 'run-a'), '{"event":"progr');
        const stillTwo = store.readRunLog('demo', 'run-a');
        expect(stillTwo).toHaveLength(2);
    });

    it('resolveActiveWakewords returns every enabled wakeword with its model + threshold', () => {
        expect(() => store.resolveActiveWakewords()).toThrow(/no enabled wakeword/);

        store.createWakeword({ name: 'demo', phrase: 'Hey ThinkSuit', threshold: 0.6 });
        store.registerVersion('demo', { onnxPath: dummyOnnx });
        store.promote('demo');
        store.setEnabled('demo', true);

        const one = store.resolveActiveWakewords();
        expect(one).toHaveLength(1);
        expect(one[0].name).toBe('demo');
        expect(one[0].threshold).toBe(0.6); // the wakeword's own threshold
        expect(one[0].classifierPath).toBe(store.currentModelPath('demo'));
        expect(one[0].binding).toBe('converse'); // default binding carried

        // a second enabled wakeword joins the set (additive), with its own binding
        store.createWakeword({ name: 'other', phrase: 'Yo', threshold: 0.8 });
        store.registerVersion('other', { onnxPath: dummyOnnx });
        store.promote('other');
        store.setBinding('other', 'new');
        store.setEnabled('other', true);

        const both = store.resolveActiveWakewords();
        expect(both.map((w) => w.name)).toEqual(['demo', 'other']);
        expect(both.map((w) => w.threshold)).toEqual([0.6, 0.8]);
        expect(both.map((w) => w.binding)).toEqual(['converse', 'new']);
    });
});
