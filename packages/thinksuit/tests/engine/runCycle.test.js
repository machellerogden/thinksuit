import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pino } from '../../engine/logger.js';

// runCycle imports executeMachine from trajectory — mock it so we can assert
// whether the machine is even reached (the depth guard must short-circuit it).
vi.mock('trajectory', () => ({ executeMachine: vi.fn() }));

const { executeMachine } = await import('trajectory');
const { runCycle } = await import('../../engine/runCycle.js');

function baseArgs(overrides = {}) {
    return {
        logger: pino({ level: 'silent' }),
        thread: [{ role: 'user', content: 'hi' }],
        input: 'hi',
        module: { namespace: 'test', name: 'mod', version: '0', rules: [] },
        machineDefinition: { StartAt: 'X', States: {} },
        handlers: {},
        config: { policy: { maxDepth: 5 }, sessionId: 'S1' },
        sessionId: 'S1',
        ...overrides
    };
}

describe('runCycle depth guard', () => {
    beforeEach(() => {
        executeMachine.mockReset();
        executeMachine.mockResolvedValue(['SUCCEEDED', { handlerResult: { response: { output: 'ok' } } }]);
    });

    it('runs the machine when depth is under the limit', async () => {
        const [status, result] = await runCycle(baseArgs({ depth: 0 }));
        expect(executeMachine).toHaveBeenCalledTimes(1);
        expect(status).toBe('SUCCEEDED');
        expect(result.handlerResult.response.output).toBe('ok');
    });

    it('refuses to run the machine when depth reaches maxDepth (E_DEPTH)', async () => {
        const [status, result] = await runCycle(baseArgs({ depth: 5 }));
        // The whole point: recursion must be bounded — the machine is never entered.
        expect(executeMachine).not.toHaveBeenCalled();
        expect(status).toBe('SUCCEEDED');
        expect(result.handlerResult.response.error).toBe('E_DEPTH');
        expect(result.handlerResult.response.policyBlocked).toBe(true);
    });
});
