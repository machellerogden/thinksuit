import { describe, it, expect, beforeEach, vi } from 'vitest';
import { pino } from '../../engine/logger.js';

import { execDirectCore as execDirect } from '../../engine/handlers/execDirect.js';

// Mock the callLLM function
vi.mock('../../engine/providers/io.js', () => ({
    callLLM: vi.fn()
}));

import { callLLM } from '../../engine/providers/io.js';

describe('execDirect handler', () => {
    let mockContext;
    let mockConfig;
    let mockModule;
    let logger;

    beforeEach(() => {
        logger = pino({ level: 'silent' });
        vi.clearAllMocks();

        mockContext = {
            traceId: 'test-trace-1',
            sessionId: 'test-session-1',
            depth: 0
        };

        // Mock IO config
        mockConfig = {
            provider: 'openai',
            model: 'gpt-4o-mini',
            providerConfig: {
                openai: {
                    apiKey: 'test-key'
                }
            }
        };

        // Mock module with role settings
        mockModule = {
            roles: [
                {
                    name: 'assistant',
                    isDefault: true,
                    temperature: 0.7,
                    baseTokens: 400,
                    prompts: {
                        system: 'You are a helpful assistant.',
                        primary: 'Help the user with their request.'
                    }
                },
                {
                    name: 'analyzer',
                    temperature: 0.3,
                    baseTokens: 800,
                    prompts: {
                        system: 'You are an analyzer.',
                        primary: 'Analyze the input.'
                    }
                }
            ]
        };

        // Setup callLLM mock to return test response
        callLLM.mockResolvedValue({
            output: 'Test response from LLM',
            usage: { prompt: 100, completion: 50 },
            model: 'gpt-4o-mini',
            finishReason: 'stop'
        });
    });

    describe('basic LLM execution', () => {
        it('should execute direct LLM call with composed instructions', async () => {
            const input = {
                plan: {
                    strategy: 'direct',
                    role: 'assistant'
                },
                instructions: {
                    system: 'You are a helpful assistant.',
                    primary: 'Help the user with their request.',
                    adaptations: '',
                    maxTokens: 400
                },
                thread: [{ role: 'user', content: 'What is 2+2?' }],
                context: mockContext,
                policy: {}
            };

            const result = await execDirect(input, {
                config: mockConfig,
                module: mockModule,
                execLogger: logger
            });

            expect(result).toBeDefined();
            expect(result.response).toBeDefined();
            expect(result.response.output).toBe('Test response from LLM');
            expect(result.response.usage).toEqual({ prompt: 100, completion: 50 });
        });

        it('should call LLM with correct parameters', async () => {
            const input = {
                plan: {
                    strategy: 'direct',
                    role: 'analyzer'
                },
                instructions: {
                    system: 'You are an analyzer.',
                    primary: 'Analyze the input.',
                    adaptations: 'Be thorough.',
                    maxTokens: 800
                },
                thread: [{ role: 'user', content: 'Analyze this text' }],
                context: mockContext,
                policy: {}
            };

            await execDirect(input, { config: mockConfig, module: mockModule, execLogger: logger });

            expect(callLLM).toHaveBeenCalledWith(
                { config: mockConfig, module: mockModule, execLogger: logger },
                expect.objectContaining({
                    model: expect.any(String),
                    thread: expect.arrayContaining([
                        expect.objectContaining({ role: 'system' }),
                        expect.objectContaining({ role: 'user' })
                    ]),
                    maxTokens: 800,
                    temperature: 0.3 // analyzer temperature
                }),
                {} // toolSchemas parameter
            );
        });

        it('should include adaptations in system prompt', async () => {
            const input = {
                plan: {
                    strategy: 'direct',
                    role: 'assistant'
                },
                instructions: {
                    system: 'You are a helpful assistant.',
                    primary: 'Help the user.',
                    adaptations: 'Be concise and clear.',
                    maxTokens: 400
                },
                thread: [{ role: 'user', content: 'Hello' }],
                context: mockContext,
                policy: {}
            };

            await execDirect(input, { config: mockConfig, module: mockModule, execLogger: logger });

            expect(callLLM).toHaveBeenCalledWith(
                { config: mockConfig, module: mockModule, execLogger: logger },
                expect.objectContaining({
                    thread: expect.arrayContaining([
                        expect.objectContaining({
                            role: 'system',
                            content: expect.stringContaining('Be concise and clear.')
                        })
                    ])
                }),
                {} // toolSchemas parameter
            );
        });

        it('should combine primary prompt with user message', async () => {
            const input = {
                plan: {
                    strategy: 'direct',
                    role: 'assistant'
                },
                instructions: {
                    system: 'You are a helpful assistant.',
                    primary: 'Consider the following request carefully.',
                    adaptations: '',
                    maxTokens: 400
                },
                thread: [{ role: 'user', content: 'What is the capital of France?' }],
                context: mockContext,
                policy: {}
            };

            await execDirect(input, { config: mockConfig, module: mockModule, execLogger: logger });

            expect(callLLM).toHaveBeenCalledWith(
                { config: mockConfig, module: mockModule, execLogger: logger },
                expect.objectContaining({
                    thread: expect.arrayContaining([
                        expect.objectContaining({
                            role: 'user',
                            content: expect.stringContaining(
                                'Consider the following request carefully.'
                            )
                        })
                    ])
                }),
                {} // toolSchemas parameter
            );
        });
    });

    describe('error handling', () => {
        it('should handle missing IO config gracefully', async () => {
            const input = {
                plan: { strategy: 'direct', role: 'assistant' },
                instructions: {
                    system: 'You are a helpful assistant.',
                    primary: '',
                    maxTokens: 400
                },
                thread: [{ role: 'user', content: 'Hello' }],
                context: mockContext,
                policy: {}
            };

            // Call without IO config
            const result = await execDirect(input, { execLogger: logger });

            expect(result.response.output).toContain('IO config not available');
            expect(result.response.error).toBe('IO config not available');
        });

        it('should handle LLM errors gracefully', async () => {
            const input = {
                plan: { strategy: 'direct', role: 'assistant' },
                instructions: {
                    system: 'You are a helpful assistant.',
                    primary: '',
                    maxTokens: 400
                },
                thread: [{ role: 'user', content: 'Hello' }],
                context: mockContext,
                policy: {}
            };

            // Mock callLLM to throw an error
            callLLM.mockRejectedValueOnce(new Error('E_PROVIDER: API error'));

            const result = await execDirect(input, {
                config: mockConfig,
                module: mockModule,
                execLogger: logger
            });

            expect(result.response.output).toContain('encountered an issue');
            expect(result.response.error).toContain('E_PROVIDER');
        });
    });

    describe('temperature selection', () => {
        it('should use role-specific temperature from module', async () => {
            // Create a fresh module with additional roles for this test
            const extendedModule = {
                roles: [
                    ...mockModule.roles,
                    {
                        name: 'explorer',
                        temperature: 0.9,
                        baseTokens: 1000,
                        prompts: { system: 'You are an explorer.', primary: 'Explore.' }
                    },
                    {
                        name: 'planner',
                        temperature: 0.4,
                        baseTokens: 800,
                        prompts: { system: 'You are a planner.', primary: 'Plan.' }
                    }
                ]
            };

            const roles = [
                { role: 'assistant', temp: 0.7 },
                { role: 'analyzer', temp: 0.3 },
                { role: 'explorer', temp: 0.9 },
                { role: 'planner', temp: 0.4 }
            ];

            for (const { role, temp } of roles) {
                vi.clearAllMocks();

                const input = {
                    plan: { strategy: 'direct', role },
                    instructions: {
                        system: `You are a ${role}.`,
                        primary: '',
                        maxTokens: 400
                    },
                    thread: [{ role: 'user', content: 'Test' }],
                    context: mockContext,
                    policy: {}
                };

                await execDirect(input, {
                    config: mockConfig,
                    module: extendedModule,
                    execLogger: logger
                });

                expect(callLLM).toHaveBeenCalledWith(
                    { config: mockConfig, module: extendedModule, execLogger: logger },
                    expect.objectContaining({
                        temperature: temp
                    }),
                    {} // toolSchemas parameter
                );
            }
        });
    });
});
