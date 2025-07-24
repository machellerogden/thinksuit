import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pino } from '../../engine/logger.js';

// Mock runCycle to prevent actual recursion
vi.mock('../../engine/runCycle.js', () => ({
    runCycle: vi.fn()
}));

// Mock createSpanLogger
vi.mock('../../engine/logger.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        createSpanLogger: vi.fn((logger) => logger.child({ span: 'test' }))
    };
});

import { execParallelCore } from '../../engine/handlers/execParallel.js';
import { runCycle } from '../../engine/runCycle.js';

describe('execParallel handler', () => {
    let logger, machineContext;

    beforeEach(() => {
        logger = pino({ level: 'silent' });
        logger.child = vi.fn(() => logger);
        logger.bindings = () => ({ spanId: 'parent-span', sessionId: 'test-session' });

        machineContext = {
            execLogger: logger,
            config: { provider: 'test', apiKey: 'test-key', model: 'test-model' },
            handlers: {},
            machineDefinition: { StartAt: 'Test' },
            module: {
                defaultRole: 'assistant',
                orchestration: {
                    formatResponse: (results) =>
                        results.map((r) => `[${r.role}] ${r.content}`).join('\n')
                }
            }
        };
        vi.clearAllMocks();
    });

    it('should handle empty roles array', async () => {
        const input = {
            plan: { roles: [] },
            thread: [],
            context: { traceId: 'test' },
            policy: {}
        };

        const result = await execParallelCore(input, machineContext);

        expect(result.response.error).toBe('No roles provided');
        expect(result.response.output).toBe('No roles provided for parallel execution');
        // Events are now logged directly, not returned
        expect(runCycle).not.toHaveBeenCalled();
    });

    it('should handle missing roles in plan', async () => {
        const input = {
            plan: {},
            thread: [],
            context: { traceId: 'test' },
            policy: {}
        };

        const result = await execParallelCore(input, machineContext);

        expect(result.response.error).toBe('No roles provided');
        expect(runCycle).not.toHaveBeenCalled();
    });

    it('should execute multiple roles in parallel', async () => {
        // Mock different responses for each role
        runCycle.mockImplementation(async ({ selectedPlan }) => {
            const role = selectedPlan.role;
            return [
                'SUCCEEDED',
                {
                    responseResult: {
                        response: {
                            output: `${role} output`,
                            usage: { prompt: 100, completion: 50 },
                            model: 'test-model',
                            finishReason: 'stop'
                        }
                    }
                }
            ];
        });

        const input = {
            plan: {
                roles: ['analyzer', 'synthesizer', 'critic'],
                signals: ['contract.analyze', 'calibration.high-certainty']
            },
            instructions: { system: 'Test system', primary: 'Test primary' },
            thread: [{ role: 'user', content: 'Test message' }],
            context: { traceId: 'test-trace', depth: 0, branch: 'root' },
            policy: { maxDepth: 5 }
        };

        const result = await execParallelCore(input, machineContext);

        // Should call runCycle once per role
        expect(runCycle).toHaveBeenCalledTimes(3);

        // Verify parallel branches were created
        expect(runCycle.mock.calls[0][0].branch).toBe('root.branch-1');
        expect(runCycle.mock.calls[1][0].branch).toBe('root.branch-2');
        expect(runCycle.mock.calls[2][0].branch).toBe('root.branch-3');

        // Verify static plans for each role
        expect(runCycle.mock.calls[0][0].selectedPlan.role).toBe('analyzer');
        expect(runCycle.mock.calls[1][0].selectedPlan.role).toBe('synthesizer');
        expect(runCycle.mock.calls[2][0].selectedPlan.role).toBe('critic');

        // Check aggregated output using module's formatResponse
        expect(result.response.output).toContain('[analyzer] analyzer output');
        expect(result.response.output).toContain('[synthesizer] synthesizer output');
        expect(result.response.output).toContain('[critic] critic output');

        // Verify usage aggregation
        expect(result.response.usage.prompt).toBe(300); // 100 * 3
        expect(result.response.usage.completion).toBe(150); // 50 * 3

        // Check metadata
        expect(result.response.metadata.strategy).toBe('parallel');
        expect(result.response.metadata.branches).toBe(3);
        expect(result.response.metadata.successfulBranches).toBe(3);
        expect(result.response.metadata.roles).toEqual(['analyzer', 'synthesizer', 'critic']);

        // Events are now logged directly, not returned
    });

    it('should handle partial failures gracefully', async () => {
        runCycle
            .mockResolvedValueOnce([
                'SUCCEEDED',
                {
                    responseResult: {
                        response: {
                            output: 'Success 1',
                            usage: { prompt: 100, completion: 50 }
                        }
                    }
                }
            ])
            .mockResolvedValueOnce(['FAILED', { error: 'Network error' }])
            .mockResolvedValueOnce([
                'SUCCEEDED',
                {
                    responseResult: {
                        response: {
                            output: 'Success 2',
                            usage: { prompt: 80, completion: 40 }
                        }
                    }
                }
            ]);

        const input = {
            plan: { roles: ['role1', 'role2', 'role3'] },
            thread: [{ role: 'user', content: 'Test' }],
            context: { traceId: 'test' },
            policy: {}
        };

        const result = await execParallelCore(input, machineContext);

        // Should still return combined results
        expect(result.response.output).toContain('[role1] Success 1');
        expect(result.response.output).toContain('[Error in role2 branch]');
        expect(result.response.output).toContain('[role3] Success 2');

        // Usage should only count successful branches
        expect(result.response.usage.prompt).toBe(180);
        expect(result.response.usage.completion).toBe(90);

        // Events are now logged directly, not returned
    });

    it('should handle promise rejection in parallel execution', async () => {
        runCycle
            .mockResolvedValueOnce([
                'SUCCEEDED',
                {
                    responseResult: {
                        response: {
                            output: 'Success',
                            usage: { prompt: 100, completion: 50 }
                        }
                    }
                }
            ])
            .mockRejectedValueOnce(new Error('Unexpected error'));

        const input = {
            plan: { roles: ['role1', 'role2'] },
            thread: [{ role: 'user', content: 'Test' }],
            context: { traceId: 'test' },
            policy: {}
        };

        const result = await execParallelCore(input, machineContext);

        // Should handle the rejection gracefully
        expect(result.response.output).toContain('[role1] Success');
        expect(result.response.output).toContain('[Error: Unexpected error]');

        // Events are now logged directly, not returned
    });

    it('should respect depth limits and propagate context', async () => {
        const input = {
            plan: { roles: ['role1'] },
            thread: [{ role: 'user', content: 'Test' }],
            context: {
                traceId: 'test-trace',
                depth: 3,
                branch: 'root.seq1'
            },
            policy: { maxDepth: 5, maxFanout: 3 }
        };

        runCycle.mockResolvedValueOnce([
            'SUCCEEDED',
            {
                responseResult: {
                    response: {
                        output: 'Output',
                        usage: { prompt: 50, completion: 25 }
                    }
                }
            }
        ]);

        await execParallelCore(input, machineContext);

        // Verify child context has incremented depth
        const callArgs = runCycle.mock.calls[0][0];
        expect(callArgs.depth).toBe(4);
        expect(callArgs.branch).toBe('root.seq1.branch-1');
        expect(callArgs.traceId).toBe('test-trace');
        expect(callArgs.parentSpanId).toBe('parent-span');
        expect(callArgs.sessionId).toBe('test-session');
    });

    it('should handle undefined module orchestration', async () => {
        // Remove orchestration from module
        machineContext.module = { defaultRole: 'assistant' };

        runCycle.mockResolvedValueOnce([
            'SUCCEEDED',
            {
                responseResult: {
                    response: {
                        output: 'Test output',
                        usage: { prompt: 100, completion: 50 }
                    }
                }
            }
        ]);

        const input = {
            plan: { roles: ['analyzer'] },
            thread: [{ role: 'user', content: 'Test' }],
            context: { traceId: 'test' },
            policy: {}
        };

        const result = await execParallelCore(input, machineContext);

        // Should use fallback formatting
        expect(result.response.output).toContain('analyzer');
        expect(result.response.output).toContain('Test output');
    });

    it('should handle missing response data structure', async () => {
        runCycle.mockResolvedValueOnce(['SUCCEEDED', {}]); // Empty result

        const input = {
            plan: { roles: ['role1'] },
            thread: [{ role: 'user', content: 'Test' }],
            context: { traceId: 'test' },
            policy: {}
        };

        const result = await execParallelCore(input, machineContext);

        // Should handle missing data gracefully
        expect(result.response.output).toContain('[Error in role1 branch]');
        expect(result.response.usage.prompt).toBe(0);
        expect(result.response.usage.completion).toBe(0);
    });
});
