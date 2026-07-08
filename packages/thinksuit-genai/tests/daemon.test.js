import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { startGenaiServer } from '../src/server.js';
import {
    call,
    health,
    status,
    providers,
    wrapProviderError,
    isGenaiDownError,
    GENAI_DOWN_HINT
} from '../src/client.js';

// Fake provider wired straight into the daemon's pool — no credentials, no SDKs.
function makeFakeProvider() {
    const seen = { calls: [], aborted: false };
    const provider = {
        async callLLM(ctx, params) {
            seen.calls.push(params);

            if (params.thread?.[0]?.content === 'fail-me') {
                const err = new Error('provider exploded');
                err.status = 401;
                err.code = 'invalid_api_key';
                err.type = 'auth_error';
                err.request = { model: params.model, redacted: true };
                throw err;
            }

            if (params.thread?.[0]?.content === 'hang-me') {
                return new Promise((_, reject) => {
                    ctx.abortSignal?.addEventListener('abort', () => {
                        seen.aborted = true;
                        reject(new Error('Request aborted'));
                    });
                });
            }

            return {
                output: `echo:${params.thread?.[0]?.content ?? ''}`,
                usage: { prompt: 1, completion: 2 },
                model: params.model,
                finishReason: 'end_turn',
                original: { request: { model: params.model }, response: { ok: true } }
            };
        },
        getCapabilities() {
            return { maxContext: 1000, maxOutput: 64, supports: { toolCalls: true, temperature: true } };
        }
    };
    return { provider, seen };
}

describe('genai daemon ↔ client over a temp socket', () => {
    let dir;
    let socketPath;
    let handle;
    let fake;

    beforeAll(async () => {
        dir = mkdtempSync(join(tmpdir(), 'ts-genai-'));
        socketPath = join(dir, 'genai.sock');
        fake = makeFakeProvider();
        handle = await startGenaiServer({
            socketPath,
            providerConfig: { openai: { apiKey: 'fake' }, onnx: { dtype: 'q4' } },
            pool: { get: () => fake.provider, names: () => ['openai'] }
        });
    });

    afterAll(async () => {
        await handle.close();
        rmSync(dir, { recursive: true, force: true });
    });

    it('answers /health', async () => {
        const res = await health({ socketPath });
        expect(res.ok).toBe(true);
        expect(res.pid).toBe(process.pid);
    });

    it('answers /status with presence booleans and no key material', async () => {
        const res = await status({ socketPath });
        expect(res.ok).toBe(true);
        expect(res.uptime).toBeTypeOf('number');
        expect(res.calls).toMatchObject({ inFlight: 0 });
        expect(res.onnx).toHaveProperty('workerPid');
        for (const value of Object.values(res.providers)) {
            expect(value).toBeTypeOf('boolean');
        }
        expect(JSON.stringify(res)).not.toContain('fake'); // the injected key never leaves
    });

    it('answers /providers with configured flags and descriptions', async () => {
        const res = await providers({ socketPath });
        expect(res.openai).toEqual({ configured: true, description: expect.any(String) });
        expect(res.anthropic.configured).toBe(false);
        expect(res.onnx.configured).toBe(true);
    });

    it('round-trips a /call through the provider contract', async () => {
        const result = await call(
            {
                provider: 'openai',
                model: 'gpt-4o-mini',
                thread: [{ role: 'user', content: 'hello' }],
                maxTokens: 5000
            },
            { socketPath }
        );

        expect(result.output).toBe('echo:hello');
        expect(result.usage).toEqual({ prompt: 1, completion: 2 });
        expect(result.original).toEqual({ request: { model: 'gpt-4o-mini' }, response: { ok: true } });

        // The daemon normalizes: maxTokens clamped to the provider's maxOutput
        const sent = fake.seen.calls.at(-1);
        expect(sent.maxTokens).toBe(64);
        expect(sent.systemInstructions).toBeNull();
    });

    it('rehydrates provider error facts across the socket', async () => {
        let caught;
        try {
            await call(
                {
                    provider: 'openai',
                    model: 'gpt-4o-mini',
                    thread: [{ role: 'user', content: 'fail-me' }],
                    maxTokens: 10
                },
                { socketPath }
            );
        } catch (err) {
            caught = err;
        }

        expect(caught).toBeDefined();
        expect(caught.message).toBe('provider exploded');
        expect(caught.statusCode).toBe(502);
        expect(caught.originalError).toMatchObject({
            message: 'provider exploded',
            status: 401,
            code: 'invalid_api_key',
            type: 'auth_error'
        });
        expect(caught.request).toEqual({ model: 'gpt-4o-mini', redacted: true });

        // wrapProviderError restores the engine's E_PROVIDER contract
        const wrapped = wrapProviderError(caught);
        expect(wrapped.message).toBe('E_PROVIDER: provider exploded');
        expect(wrapped.originalError.status).toBe(401);
    });

    it('rejects unknown providers with 400', async () => {
        await expect(
            call({ provider: 'nope', model: 'm', thread: [], maxTokens: 1 }, { socketPath })
        ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('propagates abort from client signal to the provider call', async () => {
        const ac = new AbortController();
        const pending = call(
            {
                provider: 'openai',
                model: 'gpt-4o-mini',
                thread: [{ role: 'user', content: 'hang-me' }],
                maxTokens: 10
            },
            { socketPath, signal: ac.signal }
        );

        await new Promise((r) => setTimeout(r, 50));
        ac.abort();

        await expect(pending).rejects.toThrow('Request aborted');

        // Daemon side saw the abort and cancelled the provider call
        await new Promise((r) => setTimeout(r, 50));
        expect(fake.seen.aborted).toBe(true);
    });

    it('throws the actionable down hint when the service is absent', async () => {
        let caught;
        try {
            await health({ socketPath: join(dir, 'nope.sock') });
        } catch (err) {
            caught = err;
        }
        expect(caught.message).toBe(GENAI_DOWN_HINT);
        expect(isGenaiDownError(caught)).toBe(true);

        // wrapProviderError leaves operational errors unwrapped
        expect(wrapProviderError(caught)).toBe(caught);
    });
});
