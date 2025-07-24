import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Provider Abstraction', () => {
    describe('OpenAI Provider', () => {
        let mockClient;
        let mockMachineContext;

        beforeEach(async () => {
            // We'll import after mocking
            vi.resetModules();
            vi.clearAllMocks();

            // Create mock machine context with logger
            mockMachineContext = {
                config: {
                    apiKey: 'test-key',
                    provider: 'openai'
                },
                execLogger: {
                    debug: vi.fn(),
                    info: vi.fn(),
                    warn: vi.fn(),
                    error: vi.fn()
                }
            };
        });

        describe('callLLM interface', () => {
            it('should transform standard request correctly for gpt-4', async () => {
                // Mock OpenAI client with Responses API
                mockClient = {
                    responses: {
                        create: vi.fn().mockResolvedValue({
                            object: 'response',
                            status: 'completed',
                            output: [
                                { type: 'reasoning', summary: [] },
                                {
                                    type: 'message',
                                    content: [
                                        { type: 'output_text', text: 'Test response' }
                                    ]
                                }
                            ],
                            output_text: 'Test response',
                            usage: {
                                input_tokens: 100,
                                output_tokens: 50
                            },
                            model: 'gpt-4-0613'
                        })
                    }
                };

                // Mock OpenAI constructor
                vi.doMock('openai', () => ({
                    default: class OpenAI {
                        constructor(config) {
                            expect(config.apiKey).toBe('test-key');
                            return mockClient;
                        }
                    }
                }));

                const { createOpenAIProvider } = await import(
                    '../../../engine/providers/openai.js'
                );
                const provider = createOpenAIProvider({ apiKey: 'test-key' });

                const result = await provider.callLLM(mockMachineContext, {
                    model: 'gpt-4',
                    thread: [
                        { role: 'system', content: 'You are a helpful assistant' },
                        { role: 'user', content: 'Hello world' }
                    ],
                    maxTokens: 1000,
                    temperature: 0.7,
                    stop: ['\n\n']
                });

                // Check the API was called with correct transform
                expect(mockClient.responses.create).toHaveBeenCalledWith(
                    {
                        model: 'gpt-4',
                        input: [
                            { role: 'system', content: 'You are a helpful assistant' },
                            { role: 'user', content: 'Hello world' }
                        ],
                        max_output_tokens: 1000,
                        temperature: 0.7,
                        stop: ['\n\n'],
                        text: {
                            format: { type: 'text' },
                            verbosity: 'medium'
                        }
                    },
                    {} // Options object (for abort signal, etc.)
                );

                // Check response was transformed correctly
                expect(result.output).toBe('Test response');
                expect(result.usage).toEqual({
                    prompt: 100,
                    completion: 50
                });
                expect(result.model).toBe('gpt-4-0613');
                expect(result.finishReason).toBe('complete');
                expect(result.outputItems).toBeDefined();
                expect(result.raw).toBeDefined();
            });

            it('should use max_output_tokens for all models (Responses API)', async () => {
                mockClient = {
                    responses: {
                        create: vi.fn().mockResolvedValue({
                            object: 'response',
                            status: 'completed',
                            output: [
                                { type: 'reasoning', summary: [] },
                                {
                                    type: 'message',
                                    content: [
                                        { type: 'output_text', text: 'GPT-5 response' }
                                    ]
                                }
                            ],
                            output_text: 'GPT-5 response',
                            usage: {
                                input_tokens: 150,
                                output_tokens: 75
                            },
                            model: 'gpt-5'
                        })
                    }
                };

                vi.doMock('openai', () => ({
                    default: class OpenAI {
                        constructor() {
                            return mockClient;
                        }
                    }
                }));

                const { createOpenAIProvider } = await import(
                    '../../../engine/providers/openai.js'
                );
                const provider = createOpenAIProvider({ apiKey: 'test-key' });

                await provider.callLLM(mockMachineContext, {
                    model: 'gpt-5',
                    thread: [
                        { role: 'system', content: 'System prompt' },
                        { role: 'user', content: 'User message' }
                    ],
                    maxTokens: 2000
                });

                const callArgs = mockClient.responses.create.mock.calls[0][0];

                // Responses API always uses max_output_tokens
                expect(callArgs.max_output_tokens).toBe(2000);
                expect(callArgs.max_tokens).toBeUndefined();
            });

            it('should handle responses without system prompt', async () => {
                mockClient = {
                    responses: {
                        create: vi.fn().mockResolvedValue({
                            object: 'response',
                            status: 'completed',
                            output: [
                                { type: 'reasoning', summary: [] },
                                {
                                    type: 'message',
                                    content: [
                                        { type: 'output_text', text: 'Response' }
                                    ]
                                }
                            ],
                            output_text: 'Response',
                            usage: { input_tokens: 50, output_tokens: 25 },
                            model: 'gpt-4'
                        })
                    }
                };

                vi.doMock('openai', () => ({
                    default: class OpenAI {
                        constructor() {
                            return mockClient;
                        }
                    }
                }));

                const { createOpenAIProvider } = await import(
                    '../../../engine/providers/openai.js'
                );
                const provider = createOpenAIProvider({ apiKey: 'test-key' });

                await provider.callLLM(mockMachineContext, {
                    model: 'gpt-4',
                    thread: [{ role: 'user', content: 'Just a user message' }],
                    maxTokens: 500
                });

                const callArgs = mockClient.responses.create.mock.calls[0][0];

                // Should only have user message, no system
                expect(callArgs.input).toEqual([
                    { role: 'user', content: 'Just a user message' }
                ]);
            });

            it('should handle tool calls when provided', async () => {
                mockClient = {
                    responses: {
                        create: vi.fn().mockResolvedValue({
                            object: 'response',
                            status: 'completed',
                            output: [
                                { type: 'reasoning', summary: [] },
                                {
                                    type: 'message',
                                    content: [
                                        { type: 'output_text', text: '' }
                                    ]
                                }
                            ],
                            output_text: '',
                            tools: [
                                { function: { name: 'test', arguments: '{}' } }
                            ],
                            usage: { input_tokens: 200, output_tokens: 100 },
                            model: 'gpt-4'
                        })
                    }
                };

                vi.doMock('openai', () => ({
                    default: class OpenAI {
                        constructor() {
                            return mockClient;
                        }
                    }
                }));

                const { createOpenAIProvider } = await import(
                    '../../../engine/providers/openai.js'
                );
                const provider = createOpenAIProvider({ apiKey: 'test-key' });

                const tools = ['test']; // ThinkSuit format - just tool names

                const result = await provider.callLLM(mockMachineContext, {
                    model: 'gpt-4',
                    thread: [
                        { role: 'system', content: 'System' },
                        { role: 'user', content: 'User' }
                    ],
                    tools,
                    maxTokens: 1000
                });

                // Should transform tools to OpenAI format
                expect(mockClient.responses.create).toHaveBeenCalledWith(
                    expect.objectContaining({
                        tools: [
                            {
                                type: 'function',
                                name: 'test',
                                description: 'Execute test',
                                parameters: {
                                    type: 'object',
                                    properties: {
                                        args: { type: 'string', description: 'Arguments for the tool' }
                                    }
                                }
                            }
                        ]
                    }),
                    {} // Options object (for abort signal, etc.)
                );

                // Should handle null content gracefully
                expect(result.output).toBe('');
                // With the current mock, no function_call items in output, so toolCalls will be undefined
                // The mock has 'tools' at top level but the transformer looks for function_call in output array
                expect(result.finishReason).toBe('complete');
            });
        });

        describe('getCapabilities', () => {
            it('should return correct capabilities for known models', async () => {
                vi.doMock('openai', () => ({
                    default: class OpenAI {}
                }));

                const { createOpenAIProvider } = await import(
                    '../../../engine/providers/openai.js'
                );
                const provider = createOpenAIProvider({ apiKey: 'test-key' });

                expect(provider.getCapabilities('gpt-4')).toEqual({
                    maxContext: 128000,
                    maxOutput: 4096,
                    supports: { toolCalls: true, temperature: true }
                });

                expect(provider.getCapabilities('gpt-4o')).toEqual({
                    maxContext: 128000,
                    maxOutput: 16384,
                    supports: { toolCalls: true, temperature: true }
                });

                expect(provider.getCapabilities('o1-preview')).toEqual({
                    maxContext: 128000,
                    maxOutput: 32768,
                    supports: { toolCalls: false, temperature: false }
                });

                expect(provider.getCapabilities('gpt-5')).toEqual({
                    maxContext: 128000,
                    maxOutput: 16384,
                    supports: { toolCalls: true, temperature: false }
                });
            });

            it('should return default capabilities for unknown models', async () => {
                vi.doMock('openai', () => ({
                    default: class OpenAI {}
                }));

                const { createOpenAIProvider } = await import(
                    '../../../engine/providers/openai.js'
                );
                const provider = createOpenAIProvider({ apiKey: 'test-key' });

                expect(provider.getCapabilities('unknown-model')).toEqual({
                    maxContext: 4096,
                    maxOutput: 2048,
                    supports: { toolCalls: false, temperature: true }
                });
            });
        });
    });

    describe('Provider Factory', () => {
        it('should create OpenAI provider', async () => {
            vi.doMock('openai', () => ({
                default: class OpenAI {}
            }));

            const { createProvider } = await import('../../../engine/providers/index.js');

            const provider = createProvider({
                provider: 'openai',
                providerConfig: {
                    openai: {
                        apiKey: 'test-key'
                    }
                }
            });

            expect(provider).toHaveProperty('callLLM');
            expect(provider).toHaveProperty('getCapabilities');
        });

        it('should throw for unknown provider', async () => {
            const { createProvider } = await import('../../../engine/providers/index.js');

            expect(() => {
                createProvider({
                    provider: 'unknown',
                    apiKey: 'test-key'
                });
            }).toThrow('E_PROVIDER: Unknown provider unknown');
        });
    });

    describe('Integration with callLLM function', () => {
        beforeEach(() => {
            vi.resetModules();
            vi.clearAllMocks();
        });

        it('should clamp maxTokens to provider limits', async () => {
            const mockProvider = {
                callLLM: vi.fn().mockResolvedValue({
                    output: 'Response',
                    usage: { prompt: 100, completion: 50 },
                    model: 'gpt-4',
                    finishReason: 'complete'
                }),
                getCapabilities: vi.fn().mockReturnValue({
                    maxContext: 8192,
                    maxOutput: 1000, // Low limit for testing
                    supports: { toolCalls: true }
                })
            };

            vi.doMock('../../../engine/providers/index.js', () => ({
                createProvider: vi.fn().mockReturnValue(mockProvider)
            }));

            const { callLLM } = await import('../../../engine/providers/io.js');

            const mockContext = {
                config: { provider: 'openai', apiKey: 'test' },
                execLogger: {
                    debug: vi.fn(),
                    info: vi.fn(),
                    warn: vi.fn(),
                    error: vi.fn()
                }
            };

            await callLLM(mockContext, {
                model: 'gpt-4',
                thread: [
                    { role: 'system', content: 'System' },
                    { role: 'user', content: 'User' }
                ],
                maxTokens: 5000 // Exceeds provider limit
            });

            // Should have clamped to provider's maxOutput
            expect(mockProvider.callLLM).toHaveBeenCalledWith(
                mockContext,
                expect.objectContaining({
                    maxTokens: 1000 // Clamped to limit
                })
            );
        });

        it('should pass through errors with E_PROVIDER code', async () => {
            const mockProvider = {
                callLLM: vi.fn().mockRejectedValue(new Error('API Error')),
                getCapabilities: vi.fn().mockReturnValue({
                    maxContext: 8192,
                    maxOutput: 1000,
                    supports: { toolCalls: true }
                })
            };

            vi.doMock('../../../engine/providers/index.js', () => ({
                createProvider: vi.fn().mockReturnValue(mockProvider)
            }));

            const { callLLM } = await import('../../../engine/providers/io.js');
            const mockContext = {
                config: { provider: 'openai', apiKey: 'test' },
                execLogger: {
                    debug: vi.fn(),
                    info: vi.fn(),
                    warn: vi.fn(),
                    error: vi.fn()
                }
            };

            await expect(
                callLLM(mockContext, {
                    model: 'gpt-4',
                    thread: [{ role: 'user', content: 'Test' }],
                    maxTokens: 100
                })
            ).rejects.toThrow('E_PROVIDER');
        });
    });
});
