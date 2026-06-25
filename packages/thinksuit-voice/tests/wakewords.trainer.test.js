import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

// Mock the subprocess so no Python/uv runs; we drive the JSONL stream by hand.
const h = vi.hoisted(() => ({ child: null }));
vi.mock('node:child_process', () => ({
    spawn: () => h.child
}));

const { trainWakeword } = await import('../src/wakewords/trainer.js');
const store = await import('../src/wakewords/store.js');

function makeChild() {
    const c = new EventEmitter();
    c.stdout = new PassThrough();
    return c;
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('trainer', () => {
    let home;
    let onnx;

    beforeEach(() => {
        home = mkdtempSync(join(tmpdir(), 'ts-trainer-'));
        process.env.THINKSUIT_VOICE_HOME = home;
        process.env.THINKSUIT_CONFIG = join(home, 'config.json');
        onnx = join(home, 'exported.onnx');
        writeFileSync(onnx, 'model-bytes');
        h.child = makeChild();
        store.createWakeword({ name: 'demo', phrase: 'Hey ThinkSuit' });
    });

    afterEach(() => {
        delete process.env.THINKSUIT_VOICE_HOME;
        delete process.env.THINKSUIT_CONFIG;
        rmSync(home, { recursive: true, force: true });
    });

    it('parses JSONL, registers the version, returns metrics', async () => {
        const progress = [];
        const p = trainWakeword('demo', { onProgress: (m) => progress.push(m.event) });

        await tick();
        h.child.stdout.write(JSON.stringify({ event: 'phase', phase: 'train', status: 'start' }) + '\n');
        h.child.stdout.write('rich progress bar noise that is not json\n');
        h.child.stdout.write(
            JSON.stringify({
                event: 'done',
                onnxPath: onnx,
                metrics: { aut: 0.98, fpph: 0.5, recall: 0.97, threshold: 0.6 }
            }) + '\n'
        );
        await tick();
        h.child.emit('close', 0);

        const result = await p;
        expect(result.version).toBe('v1');
        expect(result.metrics).toMatchObject({ recall: 0.97 });
        expect(progress).toContain('phase');
        expect(progress).toContain('done');

        const m = store.readManifest('demo');
        expect(m.versions).toHaveLength(1);
        expect(existsSync(store.versionModelPath('demo', 'v1'))).toBe(true);
    });

    it('rejects when train.py reports an error', async () => {
        const p = trainWakeword('demo');
        await tick();
        h.child.stdout.write(JSON.stringify({ event: 'error', message: 'boom' }) + '\n');
        await tick();
        h.child.emit('close', 1);
        await expect(p).rejects.toThrow(/training failed: boom/);
        expect(store.readManifest('demo').versions).toHaveLength(0);
    });

    it('rejects on nonzero exit with no result', async () => {
        const p = trainWakeword('demo');
        await tick();
        h.child.emit('close', 1);
        await expect(p).rejects.toThrow(/exited with code 1/);
    });
});
