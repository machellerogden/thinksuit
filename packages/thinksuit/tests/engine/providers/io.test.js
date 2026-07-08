import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock only the RPC; keep the real error helpers so the E_PROVIDER/down-hint
// contract under test is the real one.
vi.mock('thinksuit-genai/client', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, call: vi.fn() };
});

import { call as genaiCall, GENAI_DOWN_HINT } from 'thinksuit-genai/client';
import { callLLM } from '../../../engine/providers/io.js';
import { PROCESSING_EVENTS } from '../../../engine/constants/events.js';

function makeContext() {
    return {
        config: {
            provider: 'openai',
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

describe('callLLM adapter (engine → genai service)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('sends provider + params over the client and passes the result through', async () => {
        const response = {
            output: 'hi',
            usage: { prompt: 1, completion: 2 },
            model: 'gpt-4o-mini',
            finishReason: 'end_turn',
            original: { request: { model: 'gpt-4o-mini' }, response: { id: 'r1' } }
        };
        genaiCall.mockResolvedValue(response);

        const ctx = makeContext();
        const params = { model: 'gpt-4o-mini', thread: [], maxTokens: 100 };
        const result = await callLLM(ctx, params);

        expect(result).toBe(response);
        expect(genaiCall).toHaveBeenCalledWith(
            { provider: 'openai', model: 'gpt-4o-mini', thread: [], maxTokens: 100 },
            { signal: ctx.abortSignal }
        );
    });

    it('merges toolSchemas into the call params', async () => {
        genaiCall.mockResolvedValue({ output: '', original: {} });

        const ctx = makeContext();
        const toolSchemas = { my_tool: { description: 'd', inputSchema: {} } };
        await callLLM(ctx, { model: 'm', thread: [], maxTokens: 10 }, toolSchemas);

        expect(genaiCall.mock.calls[0][0]).toMatchObject({ toolSchemas });
    });

    it('re-emits provider.api.request/response trace events from the normalized original', async () => {
        const original = { request: { input: 'x' }, response: { output: 'y' } };
        genaiCall.mockResolvedValue({ output: 'ok', original });

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

    it('wraps provider errors with E_PROVIDER and preserves rehydrated facts', async () => {
        const boom = new Error('rate limited');
        boom.statusCode = 502;
        boom.originalError = { message: 'rate limited', status: 429, code: 'rate_limit_exceeded' };
        genaiCall.mockRejectedValue(boom);

        const ctx = makeContext();
        let caught;
        try {
            await callLLM(ctx, { model: 'm', thread: [], maxTokens: 10 });
        } catch (err) {
            caught = err;
        }

        expect(caught.message).toBe('E_PROVIDER: rate limited');
        expect(caught.originalError.status).toBe(429);
        expect(caught.originalError.code).toBe('rate_limit_exceeded');
    });

    it('traces the wire request of a failed call when the daemon returned it', async () => {
        const boom = new Error('bad request');
        boom.request = { model: 'm', input: 'the wire request' };
        genaiCall.mockRejectedValue(boom);

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

    it('passes the service-down hint through unwrapped', async () => {
        const down = Object.assign(new Error(GENAI_DOWN_HINT), { code: 'E_GENAI_DOWN' });
        genaiCall.mockRejectedValue(down);

        const ctx = makeContext();
        let caught;
        try {
            await callLLM(ctx, { model: 'm', thread: [], maxTokens: 10 });
        } catch (err) {
            caught = err;
        }

        expect(caught).toBe(down);
        expect(caught.message).not.toContain('E_PROVIDER');
    });
});
