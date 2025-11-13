import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execTaskCore } from '../../engine/handlers/execTask.js';
import { EXECUTION_EVENTS } from '../../engine/constants/events.js';

// Mock runCycle
vi.mock('../../engine/runCycle.js', () => ({
    runCycle: vi.fn()
}));

// Mock approval and tool execution
vi.mock('../../engine/approval/async.js', () => ({
    requestToolApproval: vi.fn().mockResolvedValue({ approved: true, approvalId: 'test-approval-id' })
}));

vi.mock('../../engine/providers/io.js', () => ({
    callTool: vi.fn()
}));

// Mock MCP tool execution
vi.mock('../../engine/mcp/execution.js', () => ({
    callMCPTool: vi.fn().mockResolvedValue({
        success: true,
        result: 'file contents'
    })
}));

import { runCycle } from '../../engine/runCycle.js';

describe('execTask handler', () => {
    let mockMachineContext;
    let mockLogger;

    beforeEach(() => {
        vi.clearAllMocks();
        
        mockLogger = {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            child: vi.fn(() => mockLogger),
            bindings: vi.fn(() => ({ spanId: 'test-span' }))
        };

        mockMachineContext = {
            module: {
                defaultRole: 'assistant',
                instructionSchema: {}
            },
            config: {
                model: 'gpt-4o-mini',
                apiKey: 'test-key'
            },
            execLogger: mockLogger,
            handlers: {},
            machineDefinition: {},
            discoveredTools: {
                'read_file': {
                    name: 'read_file',
                    description: 'Read file contents',
                    server: 'test-server'
                }
            }
        };
    });

    describe('single cycle completion', () => {
        it('should complete task in single cycle when finishReason is complete', async () => {
            const input = {
                plan: {
                    role: 'explorer',
                    tools: ['read_file'],
                    resolution: {
                        maxCycles: 3,
                        maxTokens: 5000,
                        maxToolCalls: 5,
                        timeoutMs: 30000
                    }
                },
                thread: [{ role: 'user', content: 'Explore this codebase' }],
                context: { depth: 0, traceId: 'test-trace' },
                policy: {}
            };

            // Mock successful single cycle
            runCycle.mockResolvedValueOnce([
                'SUCCEEDED',
                {
                    handlerResult: {
                        response: {
                            output: 'Task completed successfully',
                            usage: { prompt: 100, completion: 50 },
                            model: 'gpt-4o-mini',
                            finishReason: 'complete'
                        }
                    }
                }
            ]);

            const result = await execTaskCore(input, mockMachineContext);

            expect(result.response).toEqual({
                output: 'Task completed successfully',
                usage: { prompt: 150, completion: 0 },
                model: 'gpt-4o-mini',
                finishReason: 'complete',
                metadata: {
                    strategy: 'task',
                    cyclesUsed: 1,
                    totalTokens: 150,
                    totalToolCalls: 0,
                    resolution: input.plan.resolution
                }
            });

            expect(runCycle).toHaveBeenCalledTimes(1);
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.objectContaining({
                    event: EXECUTION_EVENTS.TASK_START
                }),
                'Starting task execution'
            );
        });
    });

    describe('multi-cycle with tools', () => {
        it('should continue cycles when finishReason is tool_use', async () => {
            const input = {
                plan: {
                    role: 'analyzer',
                    tools: ['read_file', 'list_directory'],
                    resolution: {
                        maxCycles: 4,
                        maxTokens: 8000,
                        maxToolCalls: 10,
                        timeoutMs: 60000
                    }
                },
                thread: [{ role: 'user', content: 'Analyze the architecture' }],
                context: { depth: 0, traceId: 'test-trace' },
                policy: {}
            };

            // Mock first cycle - requests tool
            runCycle.mockResolvedValueOnce([
                'SUCCEEDED',
                {
                    handlerResult: {
                        response: {
                            output: 'Let me read the main file',
                            usage: { prompt: 100, completion: 50 },
                            model: 'gpt-4o-mini',
                            finishReason: 'tool_use',
                            toolCalls: [{ name: 'read_file', args: { path: 'index.js' } }]
                        }
                    }
                }
            ]);

            // Mock second cycle - completes
            runCycle.mockResolvedValueOnce([
                'SUCCEEDED',
                {
                    handlerResult: {
                        response: {
                            output: 'The architecture follows a modular pattern...',
                            usage: { prompt: 200, completion: 100 },
                            model: 'gpt-4o-mini',
                            finishReason: 'complete'
                        }
                    }
                }
            ]);

            const result = await execTaskCore(input, mockMachineContext);

            expect(result.response.output).toBe('The architecture follows a modular pattern...');
            expect(result.response.metadata.cyclesUsed).toBe(2);
            expect(result.response.metadata.totalTokens).toBe(450);
            expect(result.response.metadata.totalToolCalls).toBe(1);
            expect(result.response.finishReason).toBe('complete');

            expect(runCycle).toHaveBeenCalledTimes(2);
        });

        it('should build thread correctly between cycles', async () => {
            const input = {
                plan: {
                    role: 'explorer',
                    tools: ['read_file']
                },
                thread: [{ role: 'user', content: 'Explore this' }],
                context: { depth: 0 },
                policy: {}
            };

            // Mock callTool to return results
            const { callTool } = await import('../../engine/providers/io.js');
            vi.mocked(callTool).mockResolvedValueOnce({
                success: true,
                result: 'file contents'
            });

            // Mock cycle that returns tool calls
            runCycle.mockResolvedValueOnce([
                'SUCCEEDED',
                {
                    handlerResult: {
                        response: {
                            output: 'Reading file...',
                            finishReason: 'tool_use',
                            toolCalls: [{ function: { name: 'read_file', arguments: 'test.txt' } }]
                        }
                    }
                }
            ]);

            runCycle.mockResolvedValueOnce([
                'SUCCEEDED',
                {
                    handlerResult: {
                        response: {
                            output: 'Analysis complete',
                            finishReason: 'complete'
                        }
                    }
                }
            ]);

            // Enable auto-approve for test
            const testContext = {
                ...mockMachineContext,
                config: { ...mockMachineContext.config, autoApproveTools: true }
            };

            await execTaskCore(input, testContext);

            // Check that second cycle was called with updated thread
            const secondCallArgs = runCycle.mock.calls[1][0];
            expect(secondCallArgs.thread).toHaveLength(4); // user, assistant, tool result, progress
            expect(secondCallArgs.thread[1]).toEqual({
                role: 'assistant',
                content: 'Reading file...'
            });
            // Tool result is added as third item
            expect(secondCallArgs.thread[2]).toEqual({
                role: 'tool',
                tool_call_id: undefined,
                content: 'file contents'
            });
            // Check that the progress context was added
            expect(secondCallArgs.thread[3].role).toBe('user');
            expect(secondCallArgs.thread[3].content).toContain('[Task Progress Report]');
            expect(secondCallArgs.thread[3].content).toContain('Budget status:');
            expect(secondCallArgs.thread[3].content).toContain('tokens available');
        });
    });

    describe('budget enforcement', () => {
        it('should stop when max cycles reached', async () => {
            const input = {
                plan: {
                    role: 'explorer',
                    resolution: {
                        maxCycles: 2,
                        maxTokens: 10000,
                        maxToolCalls: 10,
                        timeoutMs: 60000
                    }
                },
                thread: [],
                context: {},
                policy: {}
            };

            // Mock cycles that always want to continue
            const continuingResponse = {
                handlerResult: {
                    response: {
                        output: 'Still working...',
                        usage: { prompt: 100, completion: 50 },
                        finishReason: 'tool_use'
                    }
                }
            };

            runCycle.mockResolvedValue(['SUCCEEDED', continuingResponse]);

            const result = await execTaskCore(input, mockMachineContext);

            expect(runCycle).toHaveBeenCalledTimes(2);
            expect(result.response.finishReason).toBe('max_cycles');
            expect(result.response.metadata.cyclesUsed).toBe(2);
        });

        it('should stop when token budget exceeded', async () => {
            const input = {
                plan: {
                    role: 'analyzer',
                    resolution: {
                        maxCycles: 5,
                        maxTokens: 300,
                        maxToolCalls: 10,
                        timeoutMs: 60000
                    }
                },
                thread: [],
                context: {},
                policy: {}
            };

            // First cycle uses 200 tokens
            runCycle.mockResolvedValueOnce([
                'SUCCEEDED',
                {
                    handlerResult: {
                        response: {
                            output: 'First analysis',
                            usage: { prompt: 150, completion: 50 },
                            finishReason: 'tool_use'
                        }
                    }
                }
            ]);

            // Second cycle would exceed budget
            runCycle.mockResolvedValueOnce([
                'SUCCEEDED',
                {
                    handlerResult: {
                        response: {
                            output: 'Second analysis',
                            usage: { prompt: 100, completion: 50 },
                            finishReason: 'complete'
                        }
                    }
                }
            ]);

            const result = await execTaskCore(input, mockMachineContext);

            expect(runCycle).toHaveBeenCalledTimes(2);
            expect(result.response.metadata.totalTokens).toBe(350);
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.objectContaining({ 
                    event: 'execution.task.synthesis_budget_triggered',
                    totalTokens: 200,
                    tokensReserved: 500
                }),
                'Stopping to preserve tokens for synthesis'
            );
        });

        it('should stop when tool call budget exceeded', async () => {
            const input = {
                plan: {
                    role: 'explorer',
                    tools: ['read_file'],
                    resolution: {
                        maxCycles: 10,
                        maxTokens: 10000,
                        maxToolCalls: 2,
                        timeoutMs: 60000
                    }
                },
                thread: [],
                context: {},
                policy: {}
            };

            // First cycle uses 2 tool calls
            runCycle.mockResolvedValueOnce([
                'SUCCEEDED',
                {
                    handlerResult: {
                        response: {
                            output: 'Using tools',
                            finishReason: 'tool_use',
                            toolCalls: [{ name: 'read_file' }, { name: 'read_file' }]
                        }
                    }
                }
            ]);

            const result = await execTaskCore(input, mockMachineContext);

            expect(runCycle).toHaveBeenCalledTimes(1);
            expect(result.response.metadata.totalToolCalls).toBe(2);
            expect(result.response.finishReason).toBe('max_tool_calls');
        });
    });

    describe('error handling', () => {
        it('should handle cycle failures gracefully', async () => {
            const input = {
                plan: { role: 'analyzer' },
                thread: [],
                context: {},
                policy: {}
            };

            // First cycle succeeds
            runCycle.mockResolvedValueOnce([
                'SUCCEEDED',
                {
                    handlerResult: {
                        response: {
                            output: 'Starting analysis',
                            finishReason: 'tool_use'
                        }
                    }
                }
            ]);

            // Second cycle fails
            runCycle.mockResolvedValueOnce([
                'FAILED',
                { error: 'Network error' }
            ]);

            const result = await execTaskCore(input, mockMachineContext);

            expect(result.response.output).toBe('Starting analysis');
            expect(result.response.metadata.cyclesUsed).toBe(2);
            expect(mockLogger.error).toHaveBeenCalled();
        });

        it('should throw error if first cycle fails', async () => {
            const input = {
                plan: { role: 'explorer' },
                thread: [],
                context: {},
                policy: {}
            };

            runCycle.mockRejectedValueOnce(new Error('API error'));

            await expect(execTaskCore(input, mockMachineContext)).rejects.toThrow('API error');
        });

        it('should return partial result with error if cycle throws after success', async () => {
            const input = {
                plan: { role: 'analyzer' },
                thread: [],
                context: {},
                policy: {}
            };

            // First cycle succeeds
            runCycle.mockResolvedValueOnce([
                'SUCCEEDED',
                {
                    handlerResult: {
                        response: {
                            output: 'Partial analysis',
                            finishReason: 'tool_use'
                        }
                    }
                }
            ]);

            // Second cycle throws
            runCycle.mockRejectedValueOnce(new Error('Unexpected error'));

            const result = await execTaskCore(input, mockMachineContext);

            expect(result.response.output).toBe('Partial analysis');
            expect(result.response.error).toBe('Unexpected error');
        });
    });

    describe('task context in static plan', () => {
        it('should pass task context to child cycles', async () => {
            const input = {
                plan: {
                    role: 'explorer',
                    tools: ['read_file'],
                    resolution: { maxCycles: 3 }
                },
                thread: [],
                context: { depth: 1 },
                policy: {}
            };

            runCycle.mockResolvedValue([
                'SUCCEEDED',
                {
                    handlerResult: {
                        response: {
                            output: 'Done',
                            finishReason: 'complete'
                        }
                    }
                }
            ]);

            await execTaskCore(input, mockMachineContext);

            const callArgs = runCycle.mock.calls[0][0];
            expect(callArgs.selectedPlan.taskContext).toEqual({
                cycle: 1,
                maxCycles: 3,
                isTask: true
            });
            expect(callArgs.selectedPlan.strategy).toBe('direct');
            expect(callArgs.selectedPlan.role).toBe('explorer');
            expect(callArgs.selectedPlan.tools).toEqual(['read_file']);
        });
    });
});