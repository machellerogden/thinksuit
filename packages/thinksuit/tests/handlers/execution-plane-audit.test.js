/**
 * Execution-plane audit — proving tests.
 *
 * Each test demonstrates a confirmed bug in the execution plane by failing
 * against the current code. When the corresponding fix lands, the test passes.
 * Config uses the PRODUCTION shape (secrets under providerConfig), not the
 * top-level `apiKey` shape some older tests use.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pino } from '../../engine/logger.js';

vi.mock('../../engine/runCycle.js', () => ({ runCycle: vi.fn() }));

vi.mock('../../engine/logger.js', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, createSpanLogger: vi.fn((logger) => logger) };
});

vi.mock('../../engine/mcp/execution.js', () => ({ callMCPTool: vi.fn() }));

vi.mock('../../engine/approval/async.js', () => ({
    requestToolApproval: vi.fn().mockResolvedValue({ approved: true, approvalId: null })
}));

vi.mock('../../engine/providers/io.js', () => ({ callLLM: vi.fn() }));

import { execTaskCore } from '../../engine/handlers/execTask.js';
import { execParallelCore } from '../../engine/handlers/execParallel.js';
import { execSequentialCore } from '../../engine/handlers/execSequential.js';
import { execFallbackCore } from '../../engine/handlers/execFallback.js';
import { execDirectCore } from '../../engine/handlers/execDirect.js';
import { formatFinalResult } from '../../engine/run/internals.js';
import { runCycle } from '../../engine/runCycle.js';
import { callMCPTool } from '../../engine/mcp/execution.js';
import { callLLM } from '../../engine/providers/io.js';
import { InterruptError } from '../../engine/errors/InterruptError.js';

function makeLogger() {
    const logger = pino({ level: 'silent' });
    logger.bindings = () => ({ spanId: 'span', sessionId: 'sess' });
    return logger;
}

const succeeded = (output) => [
    'SUCCEEDED',
    { handlerResult: { response: { output, usage: { prompt: 1, completion: 1 } } } }
];

describe('execution-plane audit (proving tests)', () => {
    let logger;
    beforeEach(() => {
        logger = makeLogger();
        vi.clearAllMocks();
    });

    it('execParallel: an interrupt in a branch propagates (not swallowed into a branch error)', async () => {
        runCycle.mockImplementation(async ({ selectedPlan }) => {
            if (selectedPlan.role === 'boom') {
                throw new InterruptError('interrupted in branch', {});
            }
            return succeeded('ok');
        });

        const ctx = { execLogger: logger, config: { model: 'm' }, module: {}, handlers: {}, machineDefinition: {} };
        const input = {
            plan: { roles: ['calm', 'boom'] },
            thread: [{ role: 'user', content: 'x' }],
            context: { traceId: 't' },
            policy: {}
        };

        await expect(execParallelCore(input, ctx)).rejects.toBeInstanceOf(InterruptError);
    });

    it('execSequential: an interrupt raised during a step propagates (catch must re-throw it)', async () => {
        runCycle.mockImplementation(async () => {
            throw new InterruptError('interrupted in step', {});
        });

        const ctx = { execLogger: logger, config: { model: 'm' }, module: {}, handlers: {}, machineDefinition: {} };
        const input = {
            plan: { sequence: ['only'] },
            thread: [{ role: 'user', content: 'x' }],
            context: { traceId: 't' },
            policy: {}
        };

        await expect(execSequentialCore(input, ctx)).rejects.toBeInstanceOf(InterruptError);
    });

    it('execSequential: a failed final step does not report as a successful turn', async () => {
        runCycle.mockResolvedValue(['FAILED', { error: 'boom' }]);

        const ctx = { execLogger: logger, config: { model: 'm' }, module: {}, handlers: {}, machineDefinition: {} };
        const input = {
            plan: { sequence: ['only'], resultStrategy: 'last' },
            thread: [{ role: 'user', content: 'x' }],
            context: { traceId: 't' },
            policy: {}
        };

        const seq = await execSequentialCore(input, ctx);
        const final = formatFinalResult(
            'SUCCEEDED',
            { handlerResult: { response: seq.response } },
            'sess',
            logger,
            'turn',
            'session'
        );

        expect(final.success).toBe(false);
    });

    it('execFallback: intelligent recovery runs when the configured provider has a credential (production config shape)', async () => {
        callLLM.mockResolvedValue({ output: 'recovered', usage: { prompt: 1, completion: 1 }, model: 'm' });

        const ctx = {
            execLogger: logger,
            module: {},
            config: {
                provider: 'openai',
                model: 'gpt-4o-mini',
                providerConfig: { openai: { apiKey: 'k' } }
            }
        };
        const input = {
            lastError: { code: 'E_DEPTH', message: 'too complex' },
            context: { traceId: 't' },
            thread: [{ role: 'user', content: 'q' }]
        };

        await execFallbackCore(input, ctx);

        expect(callLLM).toHaveBeenCalled();
    });

    it('execDirect: an interrupt before the call propagates as an InterruptError (not masked)', async () => {
        const ctx = {
            execLogger: logger,
            module: {},
            config: {
                provider: 'openai',
                model: 'gpt-4o-mini',
                providerConfig: { openai: { apiKey: 'k' } }
            },
            abortSignal: { aborted: true }
        };
        const input = {
            plan: { role: 'assistant' },
            instructions: { thread: [], systemInstructions: 's' },
            thread: [{ role: 'user', content: 'x' }],
            context: { traceId: 't', sessionId: 's' }
        };

        await expect(execDirectCore(input, ctx)).rejects.toBeInstanceOf(InterruptError);
    });

    it('execTask: tool results are paired to their own tool calls, even when one call is not in the plan', async () => {
        // Cycle 1: model calls three tools; toolB is NOT in the plan's tool list.
        const cycle1 = [
            'SUCCEEDED',
            {
                handlerResult: {
                    response: {
                        finishReason: 'tool_use',
                        usage: { prompt: 1, completion: 1 },
                        outputItems: [
                            { type: 'function_call', call_id: 'c1', name: 'toolA' },
                            { type: 'function_call', call_id: 'c2', name: 'toolB' },
                            { type: 'function_call', call_id: 'c3', name: 'toolC' }
                        ],
                        toolCalls: [
                            { id: 'c1', function: { name: 'toolA', arguments: '{}' } },
                            { id: 'c2', function: { name: 'toolB', arguments: '{}' } },
                            { id: 'c3', function: { name: 'toolC', arguments: '{}' } }
                        ]
                    }
                }
            }
        ];
        const cycle2 = [
            'SUCCEEDED',
            { handlerResult: { response: { finishReason: 'end_turn', output: 'done', usage: { prompt: 1, completion: 1 } } } }
        ];
        runCycle.mockResolvedValueOnce(cycle1).mockResolvedValueOnce(cycle2);
        callMCPTool.mockImplementation(async (request) => ({ success: true, result: `result-for-${request.tool}` }));

        const ctx = {
            execLogger: logger,
            module: {},
            config: { model: 'm', autoApproveTools: true },
            handlers: {},
            machineDefinition: {},
            discoveredTools: { toolA: {}, toolC: {} }
        };
        const input = {
            plan: { role: 'assistant', tools: ['toolA', 'toolC'], resolution: { maxCycles: 2, maxTokens: 8000, maxToolCalls: 5, timeoutMs: 60000 } },
            instructions: { thread: [] },
            thread: [{ role: 'user', content: 'do it' }],
            userInput: 'do it',
            context: { traceId: 't', sessionId: 's' }
        };

        await execTaskCore(input, ctx);

        // The thread handed to cycle 2 carries the tool outputs from cycle 1.
        const cycle2Thread = runCycle.mock.calls[1][0].thread;
        const outputs = cycle2Thread.filter((m) => m.type === 'function_call_output');
        const byId = Object.fromEntries(outputs.map((o) => [o.call_id, o.output]));

        // toolC's result must be attached to toolC's call, not lost or shifted onto c2.
        expect(byId.c3).toBe('result-for-toolC');
        // c2 (not in plan) must not be carrying toolC's result.
        expect(byId.c2).not.toBe('result-for-toolC');
    });
});
