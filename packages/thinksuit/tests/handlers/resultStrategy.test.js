import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pino } from '../../engine/logger.js';

// Mock runCycle to prevent actual recursion
vi.mock('../../engine/runCycle.js', () => ({
    runCycle: vi.fn()
}));

import { execSequentialCore } from '../../engine/handlers/execSequential.js';
import { execParallelCore } from '../../engine/handlers/execParallel.js';
import { runCycle } from '../../engine/runCycle.js';

describe('resultStrategy behaviors', () => {
    let logger, machineContext;

    beforeEach(() => {
        logger = pino({ level: 'silent' });
        machineContext = {
            execLogger: logger,
            config: { provider: 'test', apiKey: 'test-key', model: 'test-model' },
            handlers: {},
            module: {}
        };
        vi.clearAllMocks();
        // Reset the mock implementation to avoid contamination between tests
        runCycle.mockReset();
    });

    describe('execSequential with resultStrategy', () => {
        it('should use "last" strategy by default', async () => {
            runCycle
                .mockResolvedValueOnce([
                    'SUCCEEDED',
                    {
                        handlerResult: {
                            response: { output: 'First', usage: { prompt: 10, completion: 5 } }
                        }
                    }
                ])
                .mockResolvedValueOnce([
                    'SUCCEEDED',
                    {
                        handlerResult: {
                            response: { output: 'Second', usage: { prompt: 10, completion: 5 } }
                        }
                    }
                ]);

            const input = {
                plan: { sequence: ['role1', 'role2'] },
                thread: [],
                context: { traceId: 'test' },
                policy: {}
            };

            const result = await execSequentialCore(input, machineContext);

            // Default 'last' strategy returns only the final output
            expect(result.response.output).toBe('Second');
        });

        it('should concatenate outputs with "concat" strategy', async () => {
            runCycle
                .mockResolvedValueOnce([
                    'SUCCEEDED',
                    {
                        handlerResult: {
                            response: {
                                output: 'First output',
                                usage: { prompt: 10, completion: 5 }
                            }
                        }
                    }
                ])
                .mockResolvedValueOnce([
                    'SUCCEEDED',
                    {
                        handlerResult: {
                            response: {
                                output: 'Second output',
                                usage: { prompt: 10, completion: 5 }
                            }
                        }
                    }
                ]);

            const input = {
                plan: {
                    sequence: ['role1', 'role2'],
                    resultStrategy: 'concat'
                },
                thread: [],
                context: { traceId: 'test' },
                policy: {}
            };

            const result = await execSequentialCore(input, machineContext);

            // Concat strategy merges without labels
            expect(result.response.output).toBe('First output\n\nSecond output');
        });

        it('should label outputs with "label" strategy', async () => {
            runCycle
                .mockResolvedValueOnce([
                    'SUCCEEDED',
                    {
                        handlerResult: {
                            response: {
                                output: 'Explorer output',
                                usage: { prompt: 10, completion: 5 }
                            }
                        }
                    }
                ])
                .mockResolvedValueOnce([
                    'SUCCEEDED',
                    {
                        handlerResult: {
                            response: {
                                output: 'Analyzer output',
                                usage: { prompt: 10, completion: 5 }
                            }
                        }
                    }
                ]);

            const input = {
                plan: {
                    sequence: ['explorer', 'analyzer'],
                    resultStrategy: 'label'
                },
                thread: [],
                context: { traceId: 'test' },
                policy: {}
            };

            const result = await execSequentialCore(input, machineContext);

            // Label strategy adds role labels
            expect(result.response.output).toContain('[explorer]\nExplorer output');
            expect(result.response.output).toContain('[analyzer]\nAnalyzer output');
            expect(result.response.output).toContain('---');
        });

        it('should use module formatter with "formatted" strategy', async () => {
            machineContext.module = {
                orchestration: {
                    formatResponse: (results) =>
                        results.map((r) => `${r.role}: ${r.content}`).join(' | ')
                }
            };

            runCycle
                .mockResolvedValueOnce([
                    'SUCCEEDED',
                    {
                        handlerResult: {
                            response: { output: 'Output 1', usage: { prompt: 10, completion: 5 } }
                        }
                    }
                ])
                .mockResolvedValueOnce([
                    'SUCCEEDED',
                    {
                        handlerResult: {
                            response: { output: 'Output 2', usage: { prompt: 10, completion: 5 } }
                        }
                    }
                ]);

            const input = {
                plan: {
                    sequence: ['role1', 'role2'],
                    resultStrategy: 'formatted'
                },
                thread: [],
                context: { traceId: 'test' },
                policy: {}
            };

            const result = await execSequentialCore(input, machineContext);

            // Should use module's custom formatter
            expect(result.response.output).toBe('role1: Output 1 | role2: Output 2');
        });

        it('should always pass previousOutput regardless of strategy', async () => {
            runCycle
                .mockResolvedValueOnce([
                    'SUCCEEDED',
                    {
                        handlerResult: {
                            response: { output: 'First', usage: { prompt: 10, completion: 5 } }
                        }
                    }
                ])
                .mockResolvedValueOnce([
                    'SUCCEEDED',
                    {
                        handlerResult: {
                            response: { output: 'Second', usage: { prompt: 10, completion: 5 } }
                        }
                    }
                ]);

            const input = {
                plan: {
                    sequence: ['role1', 'role2'],
                    resultStrategy: 'label' // Even with label strategy
                },
                thread: [],
                context: { traceId: 'test' },
                policy: {}
            };

            await execSequentialCore(input, machineContext);

            // First call has no previous output
            expect(runCycle.mock.calls[0][0].previousOutput).toBe(null);
            // Second call gets first output as previous (always passed)
            expect(runCycle.mock.calls[1][0].previousOutput).toBe('First');
        });
    });

    describe('execParallel with resultStrategy', () => {
        it('should use "label" strategy by default when no module formatter', async () => {
            runCycle.mockImplementation(async () => [
                'SUCCEEDED',
                {
                    handlerResult: {
                        response: { output: 'Output', usage: { prompt: 10, completion: 5 } }
                    }
                }
            ]);

            const input = {
                plan: { roles: ['role1', 'role2'] },
                thread: [],
                context: { traceId: 'test' },
                policy: {}
            };

            const result = await execParallelCore(input, machineContext);

            expect(result.response.output).toContain('[role1]\nOutput');
            expect(result.response.output).toContain('[role2]\nOutput');
        });

        it('should use "formatted" by default when module has formatter', async () => {
            machineContext.module = {
                orchestration: {
                    formatResponse: (results) =>
                        results.map((r) => `${r.role}: ${r.content}`).join(' & ')
                }
            };

            runCycle.mockImplementation(async () => [
                'SUCCEEDED',
                {
                    handlerResult: {
                        response: { output: 'Output', usage: { prompt: 10, completion: 5 } }
                    }
                }
            ]);

            const input = {
                plan: { roles: ['role1', 'role2'] },
                thread: [],
                context: { traceId: 'test' },
                policy: {}
            };

            const result = await execParallelCore(input, machineContext);

            expect(result.response.output).toBe('role1: Output & role2: Output');
        });

        it('should concatenate outputs with "concat" strategy', async () => {
            runCycle
                .mockResolvedValueOnce([
                    'SUCCEEDED',
                    {
                        handlerResult: {
                            response: {
                                output: 'Perspective 1',
                                usage: { prompt: 10, completion: 5 }
                            }
                        }
                    }
                ])
                .mockResolvedValueOnce([
                    'SUCCEEDED',
                    {
                        handlerResult: {
                            response: {
                                output: 'Perspective 2',
                                usage: { prompt: 10, completion: 5 }
                            }
                        }
                    }
                ]);

            const input = {
                plan: {
                    roles: ['role1', 'role2'],
                    resultStrategy: 'concat'
                },
                thread: [],
                context: { traceId: 'test' },
                policy: {}
            };

            const result = await execParallelCore(input, machineContext);

            expect(result.response.output).toBe('Perspective 1\n\nPerspective 2');
        });

        it('should return last successful output with "last" strategy', async () => {
            runCycle
                .mockResolvedValueOnce([
                    'SUCCEEDED',
                    {
                        handlerResult: {
                            response: {
                                output: 'First output',
                                usage: { prompt: 10, completion: 5 }
                            }
                        }
                    }
                ])
                .mockResolvedValueOnce(['FAILED', { error: 'Failed' }])
                .mockResolvedValueOnce([
                    'SUCCEEDED',
                    {
                        handlerResult: {
                            response: {
                                output: 'Last output',
                                usage: { prompt: 10, completion: 5 }
                            }
                        }
                    }
                ]);

            const input = {
                plan: {
                    roles: ['role1', 'role2', 'role3'],
                    resultStrategy: 'last'
                },
                thread: [],
                context: { traceId: 'test' },
                policy: {}
            };

            const result = await execParallelCore(input, machineContext);

            // Should return the last successful output (role3's output)
            expect(result.response.output).toBe('Last output');
        });
    });
});
