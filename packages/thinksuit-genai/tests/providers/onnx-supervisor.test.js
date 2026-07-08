import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STUB_WORKER = join(__dirname, '..', 'fixtures', 'onnx-stub-worker.js');

// A model name the provider's metadata table knows.
const MODEL = 'Qwen/Qwen2.5-0.5B-Instruct';

let createONNXProvider;
let getONNXWorkerStatus;
let prevWorkerEnv;

beforeAll(async () => {
    prevWorkerEnv = process.env.THINKSUIT_ONNX_WORKER;
    process.env.THINKSUIT_ONNX_WORKER = STUB_WORKER;
    vi.resetModules();
    const mod = await import('../../src/providers/onnx.js');
    createONNXProvider = mod.createONNXProvider;
    getONNXWorkerStatus = mod.getONNXWorkerStatus;
});

afterAll(() => {
    if (prevWorkerEnv === undefined) delete process.env.THINKSUIT_ONNX_WORKER;
    else process.env.THINKSUIT_ONNX_WORKER = prevWorkerEnv;
});

const params = (extra = {}) => ({
    model: MODEL,
    thread: [{ role: 'user', content: 'hi' }],
    maxTokens: 16,
    ...extra
});

describe('ONNX supervised resident worker', () => {
    it('round-trips a request and reports worker status', async () => {
        const provider = createONNXProvider({ dtype: 'q4' });

        const result = await provider.callLLM({}, params({ stubText: 'one' }));

        expect(result.output).toBe('echo:one');
        expect(result.finishReason).toBe('complete');
        expect(result.original).toHaveProperty('request');
        expect(result.original).toHaveProperty('response');

        const status = getONNXWorkerStatus();
        expect(status.workerPid).toBeTypeOf('number');
        expect(status.loadedModels).toContain('onnx-community/Qwen2.5-0.5B-Instruct-ONNX:q4');
        expect(status.queueDepth).toBe(0);
    });

    it('keeps the worker resident across calls (no per-call fork)', async () => {
        const provider = createONNXProvider({ dtype: 'q4' });

        await provider.callLLM({}, params({ stubText: 'a' }));
        const pidAfterFirst = getONNXWorkerStatus().workerPid;
        await provider.callLLM({}, params({ stubText: 'b' }));
        const pidAfterSecond = getONNXWorkerStatus().workerPid;

        expect(pidAfterFirst).toBeTypeOf('number');
        expect(pidAfterSecond).toBe(pidAfterFirst);
    });

    it('serializes concurrent requests FIFO through the single worker', async () => {
        const provider = createONNXProvider({ dtype: 'q4' });

        const [r1, r2] = await Promise.all([
            provider.callLLM({}, params({ stubText: 'first', stubDelayMs: 30 })),
            provider.callLLM({}, params({ stubText: 'second' }))
        ]);

        expect(r1.output).toBe('echo:first');
        expect(r2.output).toBe('echo:second');
    });

    it('rejects unknown models without touching the worker', async () => {
        const provider = createONNXProvider({ dtype: 'q4' });
        await expect(
            provider.callLLM({}, params({ model: 'not/a-model' }))
        ).rejects.toThrow('E_GRANITE_MODEL');
    });

    it('surfaces a worker-reported failure and keeps the worker alive', async () => {
        const provider = createONNXProvider({ dtype: 'q4' });

        const pidBefore = getONNXWorkerStatus().workerPid;
        await expect(provider.callLLM({}, params({ stubMode: 'error' }))).rejects.toThrow(
            'stub failure'
        );
        expect(getONNXWorkerStatus().workerPid).toBe(pidBefore);

        // Still serviceable
        const result = await provider.callLLM({}, params({ stubText: 'after-error' }));
        expect(result.output).toBe('echo:after-error');
    });

    it('on crash: rejects in-flight and queued requests, then respawns lazily', async () => {
        const provider = createONNXProvider({ dtype: 'q4' });

        // Prime and record the current worker pid
        await provider.callLLM({}, params({ stubText: 'prime' }));
        const pidBefore = getONNXWorkerStatus().workerPid;

        const inFlight = provider.callLLM({}, params({ stubMode: 'crash' }));
        const queued = provider.callLLM({}, params({ stubText: 'queued' }));

        await expect(inFlight).rejects.toThrow('ONNX worker crashed');
        await expect(queued).rejects.toThrow('ONNX worker crashed');

        // Next request forks a fresh worker (one reload per crash, not per call)
        const result = await provider.callLLM({}, params({ stubText: 'recovered' }));
        expect(result.output).toBe('echo:recovered');
        expect(getONNXWorkerStatus().workerPid).not.toBe(pidBefore);
    });

    it('abort kills the worker, rejects the in-flight request, and recovers', async () => {
        const provider = createONNXProvider({ dtype: 'q4' });

        // Prime and record the current worker pid
        await provider.callLLM({}, params({ stubText: 'prime' }));
        const pidBefore = getONNXWorkerStatus().workerPid;

        const ac = new AbortController();
        const hanging = provider.callLLM({ abortSignal: ac.signal }, params({ stubMode: 'hang' }));

        // Give the job a beat to reach the worker, then abort
        await new Promise((r) => setTimeout(r, 50));
        ac.abort();

        await expect(hanging).rejects.toThrow('Request aborted');

        const result = await provider.callLLM({}, params({ stubText: 'post-abort' }));
        expect(result.output).toBe('echo:post-abort');
        expect(getONNXWorkerStatus().workerPid).not.toBe(pidBefore);
    });

    it('rejects immediately when the signal is already aborted', async () => {
        const provider = createONNXProvider({ dtype: 'q4' });
        const ac = new AbortController();
        ac.abort();

        await expect(
            provider.callLLM({ abortSignal: ac.signal }, params())
        ).rejects.toThrow('Request aborted');
    });
});
