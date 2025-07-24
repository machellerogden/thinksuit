import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pino } from '../../engine/logger.js';

// Mock runCycle to prevent actual recursion
vi.mock('../../engine/runCycle.js', () => ({
    runCycle: vi.fn()
}));

import { execSequentialCore } from '../../engine/handlers/execSequential.js';
import { runCycle } from '../../engine/runCycle.js';

describe('execSequential handler', () => {
    let logger;

    beforeEach(() => {
        logger = pino({ level: 'silent' });
        vi.clearAllMocks();
    });

    it('should handle empty sequence gracefully', async () => {
        const input = {
            plan: { sequence: [] },
            instructions: {},
            thread: [],
            context: { traceId: 'test' },
            policy: {},
            module: {}
        };

        const result = await execSequentialCore(input, { execLogger: logger });

        expect(result.response.output).toContain('No sequence provided');
        expect(result.response.error).toBe('No sequence provided');
        // Events are now logged directly, not returned
    });

    it('should execute roles in sequence order', async () => {
        // Mock successful executions for each role
        runCycle
            .mockResolvedValueOnce([
                'SUCCEEDED',
                {
                    responseResult: {
                        response: {
                            output: 'Explorer output',
                            usage: { prompt: 100, completion: 50 }
                        }
                    }
                }
            ])
            .mockResolvedValueOnce([
                'SUCCEEDED',
                {
                    responseResult: {
                        response: {
                            output: 'Analyzer output',
                            usage: { prompt: 120, completion: 60 }
                        }
                    }
                }
            ]);

        const input = {
            plan: {
                sequence: ['explorer', 'analyzer']
            },
            instructions: { system: 'Test system', primary: 'Test primary' },
            thread: [{ role: 'user', content: 'Test message' }],
            context: {
                traceId: 'test-trace',
                depth: 1
            },
            policy: { maxDepth: 5 }
        };

        const mockHandlers = { testHandler: vi.fn() };
        const mockConfig = { provider: 'test' };

        const result = await execSequentialCore(input, {
            handlers: mockHandlers,
            config: mockConfig,
            execLogger: logger,
            module: {
                orchestration: {
                    formatResponse: (results) =>
                        results.map((r) => `[${r.role}] ${r.content}`).join(' | ')
                }
            }
        });

        // Verify runCycle was called twice (once per role)
        expect(runCycle).toHaveBeenCalledTimes(2);

        // Check first call (explorer)
        expect(runCycle.mock.calls[0][0]).toMatchObject({
            depth: 2, // Incremented from 1
            branch: 'root.step-1',
            previousOutput: null,
            selectedPlan: {
                strategy: 'task',  // Changed default from 'direct' to 'task'
                role: 'explorer'
            }
        });

        // Check second call (analyzer)
        expect(runCycle.mock.calls[1][0]).toMatchObject({
            depth: 2,
            branch: 'root.step-2',
            previousOutput: 'Explorer output', // Previous output passed
            selectedPlan: {
                strategy: 'task',  // Changed default from 'direct' to 'task'
                role: 'analyzer'
            }
        });

        // Check final output (default 'last' strategy returns last output)
        expect(result.response.output).toBe('Analyzer output');
        expect(result.response.usage).toEqual({ prompt: 220, completion: 110 });
        // Events are now logged directly, not returned
    });

    it('should continue sequence even if a step fails', async () => {
        runCycle
            .mockResolvedValueOnce(['FAILED', { error: 'Step 1 failed' }])
            .mockResolvedValueOnce([
                'SUCCEEDED',
                {
                    responseResult: {
                        response: {
                            output: 'Step 2 output',
                            usage: { prompt: 100, completion: 50 }
                        }
                    }
                }
            ]);

        const input = {
            plan: {
                sequence: ['role1', 'role2'],
                resultStrategy: 'label'
            },
            instructions: {},
            thread: [],
            context: { traceId: 'test' },
            policy: {},
            module: {}
        };

        const result = await execSequentialCore(input, {
            handlers: {},
            config: {},
            execLogger: logger
        });

        expect(result.response.output).toContain('[Error in role1 step]');
        expect(result.response.output).toContain('Step 2 output');
        // Events are now logged directly, not returned
    });

    it('should handle exceptions in child executions', async () => {
        runCycle.mockRejectedValueOnce(new Error('Network error')).mockResolvedValueOnce([
            'SUCCEEDED',
            {
                responseResult: {
                    response: {
                        output: 'Recovery output',
                        usage: { prompt: 100, completion: 50 }
                    }
                }
            }
        ]);

        const input = {
            plan: {
                sequence: ['role1', 'role2'],
                resultStrategy: 'label'
            },
            instructions: {},
            thread: [],
            context: { traceId: 'test' },
            policy: {},
            module: {}
        };

        const result = await execSequentialCore(input, {
            handlers: {},
            config: {},
            execLogger: logger
        });

        expect(result.response.output).toContain('[Error: Network error]');
        expect(result.response.output).toContain('Recovery output');
        // Events are now logged directly, not returned
    });

    it('should track depth correctly through sequence', async () => {
        runCycle.mockResolvedValue([
            'SUCCEEDED',
            {
                responseResult: {
                    response: { output: 'Test', usage: { prompt: 10, completion: 5 } }
                }
            }
        ]);

        const input = {
            plan: {
                sequence: ['role1', 'role2', 'role3'],
                resultStrategy: 'label'
            },
            instructions: {},
            thread: [],
            context: {
                traceId: 'test',
                depth: 2,
                branch: 'parent'
            },
            policy: {},
            module: {}
        };

        await execSequentialCore(input, {
            handlers: {},
            config: {},
            execLogger: logger
        });

        // All child calls should have depth 3 (parent was 2)
        expect(runCycle.mock.calls[0][0].depth).toBe(3);
        expect(runCycle.mock.calls[1][0].depth).toBe(3);
        expect(runCycle.mock.calls[2][0].depth).toBe(3);

        // Branches should be unique
        expect(runCycle.mock.calls[0][0].branch).toBe('parent.step-1');
        expect(runCycle.mock.calls[1][0].branch).toBe('parent.step-2');
        expect(runCycle.mock.calls[2][0].branch).toBe('parent.step-3');
    });
});
