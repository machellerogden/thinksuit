import { describe, it, expect } from 'vitest';
import { validateTurnRequest, validateTurnResult } from '../../schemas/validate.js';
import { formatFinalResult } from '../../engine/run/internals.js';

const noopLogger = { info: () => {}, warn: () => {}, error: () => {} };

describe('turnRequest contract', () => {
    it('accepts a minimal valid request', () => {
        expect(validateTurnRequest({ input: 'hi' }).valid).toBe(true);
    });

    it('accepts the full surface (workdir, cwd, plan, frame, modality, …) by name', () => {
        const req = {
            input: 'hi',
            sessionId: 's1',
            module: 'thinksuit/mu',
            provider: 'openai',
            model: 'gpt-4o-mini',
            policy: { maxDepth: 5, maxFanout: 3, maxChildren: 5 },
            plan: 'chat',
            frame: 'code-review',
            modality: 'voice',
            tools: ['read_text_file'],
            workdir: '/home/base',
            cwd: '/home/base/sub',
            allowedDirectories: ['/home/base'],
            mcpServers: {},
            autoApproveTools: true,
            trace: false,
            output: 'text'
        };
        expect(validateTurnRequest(req).valid).toBe(true);
    });

    it('rejects a request missing the required input', () => {
        expect(validateTurnRequest({ module: 'thinksuit/mu' }).valid).toBe(false);
    });

    it('rejects an unknown key (additionalProperties: false)', () => {
        expect(validateTurnRequest({ input: 'hi', bogus: 1 }).valid).toBe(false);
    });

    it('rejects an invalid provider enum value', () => {
        expect(validateTurnRequest({ input: 'hi', provider: 'nope' }).valid).toBe(false);
    });
});

describe('turnResult contract', () => {
    it('accepts a minimal valid result', () => {
        expect(validateTurnResult({ success: true, response: 'hi', sessionId: 's1' }).valid).toBe(true);
    });

    it('accepts the optional cwd output field', () => {
        const res = { success: true, response: 'hi', sessionId: 's1', cwd: '/home/base' };
        expect(validateTurnResult(res).valid).toBe(true);
    });

    it('rejects a result missing required fields', () => {
        expect(validateTurnResult({ success: true }).valid).toBe(false);
    });

    it('rejects an unknown key', () => {
        expect(
            validateTurnResult({ success: true, response: 'hi', sessionId: 's1', bogus: 1 }).valid
        ).toBe(false);
    });
});

describe('formatFinalResult conforms to the turnResult contract', () => {
    // Validate the serialized result (what a caller actually receives).
    const conforms = (status, result) => {
        const out = formatFinalResult(status, result, 's1', noopLogger, 'turn-1', 'session-1');
        return validateTurnResult(JSON.parse(JSON.stringify(out)));
    };

    it('success branch conforms', () => {
        const v = conforms('SUCCEEDED', {
            handlerResult: { response: { output: 'the answer', usage: { input_tokens: 1 } } }
        });
        expect(v.valid).toBe(true);
    });

    it('failed branch conforms', () => {
        expect(conforms('FAILED', { name: 'SomeError' }).valid).toBe(true);
    });

    it('interrupted branch conforms', () => {
        expect(conforms('interrupted', { message: 'stopped', partialData: null }).valid).toBe(true);
    });
});
