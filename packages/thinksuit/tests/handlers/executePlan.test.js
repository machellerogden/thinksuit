import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pino } from '../../engine/logger.js';
import { InterruptError, isInterruptError } from '../../engine/errors/InterruptError.js';

// Isolate the composer: mock the loop it drives.
vi.mock('../../engine/handlers/executeTask.js', () => ({ executeTask: vi.fn() }));

import { executePlan } from '../../engine/handlers/executePlan.js';
import { executeTask } from '../../engine/handlers/executeTask.js';

const usage = { prompt: 10, completion: 5 };
const ok = (output) => ({ response: { output, usage, model: 'm', finishReason: 'end_turn' } });
const errResult = (error) => ({ response: { output: '', error, usage, model: 'error', finishReason: 'error' } });

// executeTask resolves keyed by node.role so parallel ordering can't make tests flaky.
const byRole = (map) =>
    executeTask.mockImplementation(async ({ node }) => map[node.role] ?? ok(`OUT-${node.role}`));

describe('executePlan (composer)', () => {
    let logger;
    let module;
    let machineContext;

    const makeCtx = (overrides = {}) => ({
        machineContext,
        bag: { input: 'hello' },
        thread: [{ role: 'system', content: 'PRIOR-HISTORY' }],
        context: { sessionId: 's', traceId: 't', depth: 0, branch: 'root' },
        ...overrides
    });

    const composeCallFor = (role) =>
        module.composeInstructions.mock.calls.find((c) => c[0].plan.role === role)?.[0];

    beforeEach(() => {
        vi.clearAllMocks();

        logger = pino({ level: 'silent' });
        logger.child = vi.fn(() => logger);

        module = {
            roles: [{ name: 'assistant', isDefault: true, temperature: 0.7, baseTokens: 4000, prompts: { system: 's', primary: 'p' } }],
            composeInstructions: vi.fn(async ({ input }) => ({
                thread: [{ role: 'system', content: 'sys' }, { role: 'user', content: input }],
                maxTokens: 400,
                metadata: { role: 'assistant', baseTokens: 4000, lengthLevel: 'standard', adaptations: [] }
            }))
        };

        machineContext = {
            config: { model: 'gpt-4o-mini' },
            module,
            execLogger: logger,
            abortSignal: null,
            discoveredTools: {}
        };
    });

    it('task: composes then calls the loop, updates the bag', async () => {
        byRole({ assistant: ok('DONE') });
        const ctx = makeCtx();
        const node = { type: 'task', role: 'assistant', id: 't1' };

        const result = await executePlan(node, ctx);

        const compose = composeCallFor('assistant');
        expect(compose.plan.role).toBe('assistant');
        expect(compose.thread).toBe(ctx.thread); // root inherits history
        expect(compose.input).toBe('hello'); // default = turn input

        // Loop received the composed thread.
        expect(executeTask.mock.calls[0][0].thread).toEqual([
            { role: 'system', content: 'sys' },
            { role: 'user', content: 'hello' }
        ]);

        expect(result.response.output).toBe('DONE');
        expect(ctx.bag.last_response).toBe('DONE');
        expect(ctx.bag.t1_response).toBe('DONE');
    });

    it('sequence: runs in order, chains prior result into next input', async () => {
        byRole({ a: ok('FIRST'), b: ok('SECOND') });
        const node = { type: 'sequence', children: [{ type: 'task', role: 'a' }, { type: 'task', role: 'b' }] };

        const result = await executePlan(node, makeCtx());

        expect(composeCallFor('a').input).toBe('hello'); // turn input
        expect(composeCallFor('b').input).toBe('FIRST'); // prior result
        expect(result.response.output).toBe('SECOND'); // default 'last'
    });

    it('sequence: resultStrategy variants', async () => {
        const children = [{ type: 'task', role: 'a' }, { type: 'task', role: 'b' }];
        byRole({ a: ok('A'), b: ok('B') });

        const concat = await executePlan({ type: 'sequence', children, resultStrategy: 'concat' }, makeCtx());
        expect(concat.response.output).toBe('A\n\nB');

        const label = await executePlan({ type: 'sequence', children, resultStrategy: 'label' }, makeCtx());
        expect(label.response.output).toBe('[a]\nA\n\n---\n\n[b]\nB');

        module.orchestration = { formatResponse: (rs) => rs.map((r) => `${r.role}=${r.content}`).join(' | ') };
        const formatted = await executePlan({ type: 'sequence', children, resultStrategy: 'formatted' }, makeCtx());
        expect(formatted.response.output).toBe('a=A | b=B');
    });

    it('sequence: stops on a child error, later steps not run', async () => {
        byRole({ a: errResult('boom'), b: ok('SECOND') });
        const node = { type: 'sequence', children: [{ type: 'task', role: 'a' }, { type: 'task', role: 'b' }] };

        const result = await executePlan(node, makeCtx());

        expect(executeTask).toHaveBeenCalledTimes(1); // b never reached
        expect(result.response.error).toBe('boom');
    });

    it('sequence: interrupt propagates, later steps not run', async () => {
        executeTask.mockImplementation(async ({ node }) => {
            if (node.role === 'a') throw new InterruptError('stop', { stage: 'test' });
            return ok('SECOND');
        });
        const node = { type: 'sequence', children: [{ type: 'task', role: 'a' }, { type: 'task', role: 'b' }] };

        await expect(executePlan(node, makeCtx())).rejects.toSatisfy(isInterruptError);
        expect(executeTask).toHaveBeenCalledTimes(1);
    });

    it('parallel: tolerates a failed branch, combines the successes', async () => {
        byRole({ a: ok('A'), b: errResult('branch boom'), c: ok('C') });
        const node = {
            type: 'parallel',
            children: [{ type: 'task', role: 'a' }, { type: 'task', role: 'b' }, { type: 'task', role: 'c' }],
            resultStrategy: 'label'
        };

        const result = await executePlan(node, makeCtx());

        expect(result.response.output).toBe('[a]\nA\n\n---\n\n[c]\nC');
        expect(result.response.error).toBeUndefined();
    });

    it('parallel: all branches failed -> error', async () => {
        byRole({ a: errResult('x'), b: errResult('y') });
        const node = { type: 'parallel', children: [{ type: 'task', role: 'a' }, { type: 'task', role: 'b' }] };

        const result = await executePlan(node, makeCtx());
        expect(result.response.error).toMatch(/no branch/i);
    });

    it('parallel: interrupt in any branch propagates', async () => {
        executeTask.mockImplementation(async ({ node }) => {
            if (node.role === 'b') throw new InterruptError('stop', { stage: 'test' });
            return ok('A');
        });
        const node = { type: 'parallel', children: [{ type: 'task', role: 'a' }, { type: 'task', role: 'b' }] };

        await expect(executePlan(node, makeCtx())).rejects.toSatisfy(isInterruptError);
    });

    it('parallel: default strategy is formatted when the module has a formatter', async () => {
        module.orchestration = { formatResponse: (rs) => rs.map((r) => `${r.role}:${r.content}`).join(' & ') };
        byRole({ a: ok('A'), b: ok('B') });
        const node = { type: 'parallel', children: [{ type: 'task', role: 'a' }, { type: 'task', role: 'b' }] };

        const result = await executePlan(node, makeCtx());
        expect(result.response.output).toBe('a:A & b:B');
    });

    it('parallel: branches read an isolated (cloned) bag', async () => {
        byRole({ a: ok('A'), b: ok('B') });
        const node = { type: 'parallel', children: [{ type: 'task', role: 'a' }, { type: 'task', role: 'b' }] };

        await executePlan(node, makeCtx({ bag: { input: 'SEED', last_response: 'PRIOR' } }));

        // Both branches default their input to the cloned bag's prior result — neither sees
        // the other's writes.
        expect(composeCallFor('a').input).toBe('PRIOR');
        expect(composeCallFor('b').input).toBe('PRIOR');
    });

    it('history/isolation: leftmost leaf inherits history, others isolated', async () => {
        byRole({ a: ok('A'), b: ok('B') });

        // Sequence: child[0] inherits, child[1] isolated.
        const ctx = makeCtx();
        await executePlan({ type: 'sequence', children: [{ type: 'task', role: 'a' }, { type: 'task', role: 'b' }] }, ctx);
        expect(composeCallFor('a').thread).toBe(ctx.thread);
        expect(composeCallFor('b').thread).toEqual([]);

        // Parallel: all branches isolated.
        vi.clearAllMocks();
        byRole({ a: ok('A'), b: ok('B') });
        const ctx2 = makeCtx();
        await executePlan({ type: 'parallel', children: [{ type: 'task', role: 'a' }, { type: 'task', role: 'b' }] }, ctx2);
        expect(composeCallFor('a').thread).toEqual([]);
        expect(composeCallFor('b').thread).toEqual([]);
    });

    it('usage aggregates across children', async () => {
        byRole({ a: ok('A'), b: ok('B') });
        const node = { type: 'sequence', children: [{ type: 'task', role: 'a' }, { type: 'task', role: 'b' }] };

        const result = await executePlan(node, makeCtx());
        expect(result.response.usage).toEqual({ prompt: 20, completion: 10 });
    });

    describe('policy enforcement (live path, default limits 5/3/5)', () => {
        it('depth: a node at/over maxDepth is blocked before the loop runs', async () => {
            byRole({ assistant: ok('DONE') });
            const node = { type: 'task', role: 'assistant' };

            const result = await executePlan(node, makeCtx({ context: { sessionId: 's', traceId: 't', depth: 5, branch: 'root' } }));

            expect(executeTask).not.toHaveBeenCalled();
            expect(result.response.policyBlocked).toBe(true);
            expect(result.response.error).toBe('E_DEPTH');
        });

        it('fanout: a parallel with more branches than maxFanout is blocked before spawning', async () => {
            byRole({});
            const node = {
                type: 'parallel',
                children: [
                    { type: 'task', role: 'a' },
                    { type: 'task', role: 'b' },
                    { type: 'task', role: 'c' },
                    { type: 'task', role: 'd' }
                ]
            };

            const result = await executePlan(node, makeCtx());

            expect(executeTask).not.toHaveBeenCalled();
            expect(result.response.policyBlocked).toBe(true);
            expect(result.response.error).toBe('E_FANOUT');
        });

        it('children: a sequence with more steps than maxChildren is blocked before the loop', async () => {
            byRole({});
            const node = {
                type: 'sequence',
                children: [
                    { type: 'task', role: 'a' },
                    { type: 'task', role: 'b' },
                    { type: 'task', role: 'c' },
                    { type: 'task', role: 'd' },
                    { type: 'task', role: 'e' },
                    { type: 'task', role: 'f' }
                ]
            };

            const result = await executePlan(node, makeCtx());

            expect(executeTask).not.toHaveBeenCalled();
            expect(result.response.policyBlocked).toBe(true);
            expect(result.response.error).toBe('E_CHILDREN');
        });
    });
});
