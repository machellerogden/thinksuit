import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pino } from '../../engine/logger.js';

// Hoisted mocks of the surviving execution-plane primitives the loop calls directly.
vi.mock('../../engine/providers/io.js', () => ({ callLLM: vi.fn() }));
vi.mock('../../engine/mcp/execution.js', () => ({ callMCPTool: vi.fn() }));
vi.mock('../../engine/approval/async.js', () => ({ requestToolApproval: vi.fn() }));

import { executeTask } from '../../engine/handlers/executeTask.js';
import { callLLM } from '../../engine/providers/io.js';
import { callMCPTool } from '../../engine/mcp/execution.js';
import { requestToolApproval } from '../../engine/approval/async.js';
import { isInterruptError } from '../../engine/errors/InterruptError.js';

const text = (output, extra = {}) => ({
    output,
    usage: { prompt: 10, completion: 5 },
    model: 'gpt-4o-mini',
    finishReason: 'end_turn',
    ...extra
});

const toolUse = (toolName, args = {}) => ({
    output: '',
    usage: { prompt: 10, completion: 5 },
    model: 'gpt-4o-mini',
    finishReason: 'tool_use',
    toolCalls: [{ id: 'call-1', function: { name: toolName, arguments: args } }]
});

describe('executeTask (agent loop)', () => {
    let logger;
    let machineContext;

    beforeEach(() => {
        vi.clearAllMocks();

        logger = pino({ level: 'silent' });
        logger.child = vi.fn(() => logger);
        logger.bindings = () => ({ spanId: 'test-span', sessionId: 'test-session' });

        machineContext = {
            config: {
                provider: 'openai',
                model: 'gpt-4o-mini',
                providerConfig: { openai: { apiKey: 'test-key' } }
            },
            module: {
                roles: [
                    { name: 'assistant', isDefault: true, temperature: 0.7, baseTokens: 4000, prompts: { system: 'system.assistant', primary: 'primary.assistant' } }
                ]
            },
            execLogger: logger,
            abortSignal: null,
            discoveredTools: {
                my_tool: { name: 'my_tool', description: 'Does a thing', inputSchema: { type: 'object' } }
            }
        };
    });

    const baseInput = (nodeOverrides = {}) => ({
        node: { type: 'task', role: 'assistant', tools: ['my_tool'], ...nodeOverrides },
        thread: [{ role: 'system', content: 'You are a test.' }],
        userInput: 'hello',
        context: { sessionId: 'test-session', traceId: 'trace-1', depth: 0 }
    });

    it('completes in a single round with no tools', async () => {
        callLLM.mockResolvedValueOnce(text('done'));

        const result = await executeTask(baseInput({ tools: [] }), machineContext);

        expect(callLLM).toHaveBeenCalledTimes(1);
        expect(callMCPTool).not.toHaveBeenCalled();
        expect(result.response.output).toBe('done');
        expect(result.response.finishReason).toBe('end_turn');
        expect(result.response.error).toBeUndefined();
    });

    it('runs a tool round then returns the follow-up text', async () => {
        callLLM.mockResolvedValueOnce(toolUse('my_tool', { q: 1 })).mockResolvedValueOnce(text('final answer'));
        requestToolApproval.mockResolvedValue({ approved: true, approvalId: 'appr-1' });
        callMCPTool.mockResolvedValue({ success: true, result: 'TOOL_RESULT' });

        const result = await executeTask(baseInput(), machineContext);

        expect(callLLM).toHaveBeenCalledTimes(2);
        expect(callMCPTool).toHaveBeenCalledTimes(1);
        expect(requestToolApproval).toHaveBeenCalledTimes(1);
        expect(result.response.output).toBe('final answer');
        expect(result.response.metadata.totalToolCalls).toBe(1);

        // The tool result must have ridden back into the second LLM call's thread.
        const secondCallThread = callLLM.mock.calls[1][1].thread;
        const hasToolResult = secondCallThread.some(
            (m) => m.content === 'TOOL_RESULT' || m.output === 'TOOL_RESULT'
        );
        expect(hasToolResult).toBe(true);
    });

    it('skips approval when autoApproveTools is set', async () => {
        machineContext.config.autoApproveTools = true;
        callLLM.mockResolvedValueOnce(toolUse('my_tool')).mockResolvedValueOnce(text('done'));
        callMCPTool.mockResolvedValue({ success: true, result: 'R' });

        await executeTask(baseInput(), machineContext);

        expect(requestToolApproval).not.toHaveBeenCalled();
        expect(callMCPTool).toHaveBeenCalledTimes(1);
    });

    it('records a denial and continues the loop without executing the tool', async () => {
        callLLM.mockResolvedValueOnce(toolUse('my_tool')).mockResolvedValueOnce(text('acknowledged'));
        requestToolApproval.mockResolvedValue({ approved: false, approvalId: 'appr-1' });

        const result = await executeTask(baseInput(), machineContext);

        expect(callMCPTool).not.toHaveBeenCalled();
        expect(callLLM).toHaveBeenCalledTimes(2);
        const secondCallThread = callLLM.mock.calls[1][1].thread;
        const hasDenial = secondCallThread.some(
            (m) => m.content === '[Tool Request Denied]' || m.output === '[Tool Request Denied]'
        );
        expect(hasDenial).toBe(true);
        expect(result.response.output).toBe('acknowledged');
    });

    it('rejects a tool outside the node allowlist without executing it', async () => {
        callLLM.mockResolvedValueOnce(toolUse('forbidden_tool')).mockResolvedValueOnce(text('ok'));

        await executeTask(baseInput(), machineContext);

        expect(callMCPTool).not.toHaveBeenCalled();
        expect(requestToolApproval).not.toHaveBeenCalled();
        const secondCallThread = callLLM.mock.calls[1][1].thread;
        const hasNotAvailable = secondCallThread.some((m) => {
            const c = m.content || m.output || '';
            return typeof c === 'string' && c.includes('not available');
        });
        expect(hasNotAvailable).toBe(true);
    });

    it('stops at maxRounds when the model keeps requesting tools', async () => {
        callLLM.mockResolvedValue(toolUse('my_tool'));
        requestToolApproval.mockResolvedValue({ approved: true, approvalId: 'appr-1' });
        callMCPTool.mockResolvedValue({ success: true, result: 'R' });

        const result = await executeTask(baseInput({ maxRounds: 2 }), machineContext);

        expect(callLLM).toHaveBeenCalledTimes(2);
        expect(result.response.finishReason).toBe('max_rounds');
    });

    it('stops when the timeout budget is exhausted', async () => {
        callLLM.mockResolvedValue(toolUse('my_tool'));
        requestToolApproval.mockResolvedValue({ approved: true, approvalId: 'appr-1' });
        callMCPTool.mockImplementation(async () => {
            await new Promise((r) => setTimeout(r, 5));
            return { success: true, result: 'R' };
        });

        const result = await executeTask(baseInput({ maxRounds: 50, timeoutMs: 1 }), machineContext);

        // First round runs, then the timeout check trips before a second LLM call.
        expect(callLLM).toHaveBeenCalledTimes(1);
        expect(result.response.finishReason).toBe('timeout');
    });

    it('returns an error-result on model failure without masking', async () => {
        callLLM.mockRejectedValueOnce(new Error('E_PROVIDER: boom'));

        const result = await executeTask(baseInput({ tools: [] }), machineContext);

        expect(result.response.error).toBe('E_PROVIDER: boom');
        expect(result.response.finishReason).toBe('error');
        // No benign apology text standing in for a real answer.
        expect(result.response.output).toBe('');
        expect(result.response.output).not.toMatch(/encountered an issue/i);
    });

    it('propagates an interrupt instead of returning a result', async () => {
        machineContext.abortSignal = { aborted: true };

        await expect(executeTask(baseInput(), machineContext)).rejects.toSatisfy(isInterruptError);
        expect(callLLM).not.toHaveBeenCalled();
    });

    it('pairs tool results to their own calls, even when one call is off the allowlist', async () => {
        // Round 1: model calls three tools; toolB is NOT in the node's allowlist.
        // outputItems drives the function_call_output pairing path.
        callLLM
            .mockResolvedValueOnce({
                output: '',
                usage: { prompt: 1, completion: 1 },
                model: 'gpt-4o-mini',
                finishReason: 'tool_use',
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
            })
            .mockResolvedValueOnce(text('done'));
        callMCPTool.mockImplementation(async (request) => ({ success: true, result: `result-for-${request.tool}` }));

        machineContext.config.autoApproveTools = true;
        machineContext.discoveredTools = { toolA: {}, toolC: {} };

        await executeTask(baseInput({ tools: ['toolA', 'toolC'] }), machineContext);

        const secondCallThread = callLLM.mock.calls[1][1].thread;
        const outputs = secondCallThread.filter((m) => m.type === 'function_call_output');
        const byId = Object.fromEntries(outputs.map((o) => [o.call_id, o.output]));

        // toolC's result attaches to toolC's own call, not lost or shifted onto c2.
        expect(byId.c3).toBe('result-for-toolC');
        // c2 (off-allowlist) must not carry toolC's result.
        expect(byId.c2).not.toBe('result-for-toolC');
    });
});
