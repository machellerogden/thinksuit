import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('thinksuit-genai', () => ({
    callProvider: vi.fn()
}));

import { callProvider } from 'thinksuit-genai';
import { callLLM } from '../../../engine/providers/io.js';
import { PROCESSING_EVENTS } from '../../../engine/constants/events.js';

function makeContext() {
    return {
        config: {
            provider: 'openai',
            providerConfig: { openai: { apiKey: 'test-key' } },
            module: 'unrelated-engine-config'
        },
        execLogger: {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn()
        },
        abortSignal: new AbortController().signal
    };
}

describe('callLLM adapter (engine → thinksuit-genai)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('narrows config, threads the abort signal, and passes the result through', async () => {
        const response = {
            output: 'hi',
            usage: { prompt: 1, completion: 2 },
            model: 'gpt-4o-mini',
            finishReason: 'end_turn',
            original: { request: { model: 'gpt-4o-mini' }, response: { id: 'r1' } }
        };
        callProvider.mockResolvedValue(response);

        const ctx = makeContext();
        const params = { model: 'gpt-4o-mini', thread: [], maxTokens: 100 };
        const result = await callLLM(ctx, params);

        expect(result).toBe(response);
        expect(callProvider).toHaveBeenCalledWith(
            { provider: 'openai', providerConfig: { openai: { apiKey: 'test-key' } } },
            params,
            { abortSignal: ctx.abortSignal }
        );
    });

    it('merges toolSchemas into the call params', async () => {
        callProvider.mockResolvedValue({ output: '', original: {} });

        const ctx = makeContext();
        const toolSchemas = { my_tool: { description: 'd', inputSchema: {} } };
        await callLLM(ctx, { model: 'm', thread: [], maxTokens: 10 }, toolSchemas);

        expect(callProvider.mock.calls[0][1]).toMatchObject({ toolSchemas });
    });

    it('re-emits provider.api.request/response trace events from the normalized original', async () => {
        const original = { request: { input: 'x' }, response: { output: 'y' } };
        callProvider.mockResolvedValue({ output: 'ok', original });

        const ctx = makeContext();
        await callLLM(ctx, { model: 'm', thread: [], maxTokens: 10 });

        const events = ctx.execLogger.info.mock.calls.map(([entry]) => entry);
        expect(events).toEqual([
            expect.objectContaining({
                event: PROCESSING_EVENTS.PROVIDER_API_REQUEST,
                data: original.request
            }),
            expect.objectContaining({
                event: PROCESSING_EVENTS.PROVIDER_API_RESPONSE,
                data: original.response
            })
        ]);
    });

    it('wraps provider errors with E_PROVIDER and preserves the original error', async () => {
        const boom = new Error('rate limited');
        boom.status = 429;
        callProvider.mockRejectedValue(boom);

        const ctx = makeContext();
        await expect(
            callLLM(ctx, { model: 'm', thread: [], maxTokens: 10 })
        ).rejects.toMatchObject({
            message: 'E_PROVIDER: rate limited',
            originalError: boom
        });
    });

    it('traces the wire request of a failed call when the provider attached it', async () => {
        const boom = new Error('bad request');
        boom.request = { model: 'm', input: 'the wire request' };
        callProvider.mockRejectedValue(boom);

        const ctx = makeContext();
        await expect(callLLM(ctx, { model: 'm', thread: [], maxTokens: 10 })).rejects.toThrow(
            'E_PROVIDER'
        );

        expect(ctx.execLogger.info).toHaveBeenCalledWith(
            expect.objectContaining({
                event: PROCESSING_EVENTS.PROVIDER_API_REQUEST,
                data: boom.request
            })
        );
    });
});
