import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Provider Abstraction', () => {
    describe('Hugging Face Provider', () => {
        let mockClient;
        let mockMachineContext;

        beforeEach(async () => {
            vi.resetModules();
            vi.clearAllMocks();

            // Create mock machine context with logger
            mockMachineContext = {
                config: {
                    apiKey: 'hf_test_token',
                    provider: 'hugging-face'
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
            it('should transform standard request correctly for Kimi-K2-Thinking', async () => {
                // Mock OpenAI client with chat completions API
                mockClient = {
                    chat: {
                        completions: {
                            create: vi.fn().mockResolvedValue({
                                id: 'chatcmpl-123',
                                object: 'chat.completion',
                                created: 1677652288,
                                model: 'moonshotai/Kimi-K2-Thinking:novita',
                                choices: [
                                    {
                                        index: 0,
                                        message: {
                                            role: 'assistant',
                                            content: 'Test response from Kimi'
                                        },
                                        finish_reason: 'stop'
                                    }
                                ],
                                usage: {
                                    prompt_tokens: 100,
                                    completion_tokens: 50,
                                    total_tokens: 150
                                }
                            })
                        }
                    }
                };

                // Mock OpenAI constructor
                vi.doMock('openai', () => ({
                    default: class OpenAI {
                        constructor(config) {
                            expect(config.baseURL).toBe('https://router.huggingface.co/v1');
                            expect(config.apiKey).toBe('hf_test_token');
                            return mockClient;
                        }
                    }
                }));

                const { createHuggingFaceProvider } = await import(
                    '../../../engine/providers/hugging-face.js'
                );
                const provider = createHuggingFaceProvider({ apiKey: 'hf_test_token' });

                const result = await provider.callLLM(mockMachineContext, {
                    model: 'moonshotai/Kimi-K2-Thinking:novita',
                    thread: [
                        { role: 'system', content: 'You are a helpful assistant' },
                        { role: 'user', content: 'Hello world' }
                    ],
                    maxTokens: 1000,
                    temperature: 0.7,
                    stop: ['\n\n']
                });

                // Check the API was called with correct transform
                expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
                    {
                        model: 'moonshotai/Kimi-K2-Thinking:novita',
                        messages: [
                            { role: 'system', content: 'You are a helpful assistant' },
                            { role: 'user', content: 'Hello world' }
                        ],
                        max_tokens: 1000,
                        temperature: 0.7,
                        stop: ['\n\n']
                    },
                    {}
                );

                // Check response was transformed correctly
                expect(result).toEqual({
                    output: 'Test response from Kimi',
                    usage: {
                        prompt: 100,
                        completion: 50
                    },
                    model: 'moonshotai/Kimi-K2-Thinking:novita',
                    finishReason: 'end_turn',
                    toolCalls: undefined,
                    original: expect.any(Object)
                });
            });

            it('should handle tool calls correctly', async () => {
                // Mock response with tool calls
                mockClient = {
                    chat: {
                        completions: {
                            create: vi.fn().mockResolvedValue({
                                id: 'chatcmpl-456',
                                object: 'chat.completion',
                                created: 1677652288,
                                model: 'moonshotai/Kimi-K2-Thinking:novita',
                                choices: [
                                    {
                                        index: 0,
                                        message: {
                                            role: 'assistant',
                                            content: null,
                                            tool_calls: [
                                                {
                                                    id: 'call_abc123',
                                                    type: 'function',
                                                    function: {
                                                        name: 'read_text_file',
                                                        arguments: '{"path": "/tmp/test.txt"}'
                                                    }
                                                }
                                            ]
                                        },
                                        finish_reason: 'tool_calls'
                                    }
                                ],
                                usage: {
                                    prompt_tokens: 150,
                                    completion_tokens: 30,
                                    total_tokens: 180
                                }
                            })
                        }
                    }
                };

                vi.doMock('openai', () => ({
                    default: class OpenAI {
                        constructor() {
                            return mockClient;
                        }
                    }
                }));

                const { createHuggingFaceProvider } = await import(
                    '../../../engine/providers/hugging-face.js'
                );
                const provider = createHuggingFaceProvider({ apiKey: 'hf_test_token' });

                const result = await provider.callLLM(mockMachineContext, {
                    model: 'moonshotai/Kimi-K2-Thinking:novita',
                    thread: [
                        { role: 'user', content: 'Read the file /tmp/test.txt' }
                    ],
                    maxTokens: 1000,
                    tools: ['read_text_file'],
                    toolSchemas: {
                        read_text_file: {
                            description: 'Read a file',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    path: { type: 'string' }
                                },
                                required: ['path']
                            }
                        }
                    }
                });

                // Check tools were transformed correctly
                expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
                    expect.objectContaining({
                        tools: [
                            {
                                type: 'function',
                                function: {
                                    name: 'read_text_file',
                                    description: 'Read a file',
                                    parameters: {
                                        type: 'object',
                                        properties: {
                                            path: { type: 'string' }
                                        },
                                        required: ['path']
                                    }
                                }
                            }
                        ]
                    }),
                    {}
                );

                // Check tool calls in response
                expect(result.toolCalls).toEqual([
                    {
                        id: 'call_abc123',
                        type: 'function',
                        function: {
                            name: 'read_text_file',
                            arguments: '{"path": "/tmp/test.txt"}'
                        }
                    }
                ]);
                expect(result.finishReason).toBe('tool_use');
            });

            it('should handle tool response messages correctly', async () => {
                mockClient = {
                    chat: {
                        completions: {
                            create: vi.fn().mockResolvedValue({
                                id: 'chatcmpl-789',
                                object: 'chat.completion',
                                created: 1677652288,
                                model: 'moonshotai/Kimi-K2-Thinking:novita',
                                choices: [
                                    {
                                        index: 0,
                                        message: {
                                            role: 'assistant',
                                            content: 'The file contains test data'
                                        },
                                        finish_reason: 'stop'
                                    }
                                ],
                                usage: {
                                    prompt_tokens: 200,
                                    completion_tokens: 40,
                                    total_tokens: 240
                                }
                            })
                        }
                    }
                };

                vi.doMock('openai', () => ({
                    default: class OpenAI {
                        constructor() {
                            return mockClient;
                        }
                    }
                }));

                const { createHuggingFaceProvider } = await import(
                    '../../../engine/providers/hugging-face.js'
                );
                const provider = createHuggingFaceProvider({ apiKey: 'hf_test_token' });

                await provider.callLLM(mockMachineContext, {
                    model: 'moonshotai/Kimi-K2-Thinking:novita',
                    thread: [
                        { role: 'user', content: 'Read the file' },
                        {
                            role: 'assistant',
                            content: null,
                            tool_calls: [
                                {
                                    id: 'call_abc123',
                                    type: 'function',
                                    function: {
                                        name: 'read_text_file',
                                        arguments: '{"path": "/tmp/test.txt"}'
                                    }
                                }
                            ]
                        },
                        {
                            role: 'tool',
                            tool_call_id: 'call_abc123',
                            content: 'File content here'
                        }
                    ],
                    maxTokens: 1000
                });

                // Check tool message was transformed correctly
                const callArgs = mockClient.chat.completions.create.mock.calls[0][0];
                expect(callArgs.messages).toContainEqual({
                    role: 'tool',
                    tool_call_id: 'call_abc123',
                    content: 'File content here'
                });
            });

            it('should filter out assistant messages with only tool calls', async () => {
                mockClient = {
                    chat: {
                        completions: {
                            create: vi.fn().mockResolvedValue({
                                id: 'chatcmpl-999',
                                object: 'chat.completion',
                                created: 1677652288,
                                model: 'moonshotai/Kimi-K2-Thinking:novita',
                                choices: [
                                    {
                                        index: 0,
                                        message: {
                                            role: 'assistant',
                                            content: 'Response'
                                        },
                                        finish_reason: 'stop'
                                    }
                                ],
                                usage: {
                                    prompt_tokens: 50,
                                    completion_tokens: 10,
                                    total_tokens: 60
                                }
                            })
                        }
                    }
                };

                vi.doMock('openai', () => ({
                    default: class OpenAI {
                        constructor() {
                            return mockClient;
                        }
                    }
                }));

                const { createHuggingFaceProvider } = await import(
                    '../../../engine/providers/hugging-face.js'
                );
                const provider = createHuggingFaceProvider({ apiKey: 'hf_test_token' });

                await provider.callLLM(mockMachineContext, {
                    model: 'moonshotai/Kimi-K2-Thinking:novita',
                    thread: [
                        { role: 'user', content: 'Hello' },
                        {
                            role: 'assistant',
                            tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'test' } }]
                            // No content field - should be filtered out
                        },
                        { role: 'user', content: 'Continue' }
                    ],
                    maxTokens: 1000
                });

                const callArgs = mockClient.chat.completions.create.mock.calls[0][0];
                expect(callArgs.messages).toHaveLength(2);
                expect(callArgs.messages[0]).toEqual({ role: 'user', content: 'Hello' });
                expect(callArgs.messages[1]).toEqual({ role: 'user', content: 'Continue' });
            });

            it('should support abort signal', async () => {
                const abortController = new AbortController();
                mockClient = {
                    chat: {
                        completions: {
                            create: vi.fn().mockResolvedValue({
                                id: 'chatcmpl-111',
                                object: 'chat.completion',
                                created: 1677652288,
                                model: 'moonshotai/Kimi-K2-Thinking:novita',
                                choices: [
                                    {
                                        index: 0,
                                        message: {
                                            role: 'assistant',
                                            content: 'Response'
                                        },
                                        finish_reason: 'stop'
                                    }
                                ],
                                usage: {
                                    prompt_tokens: 10,
                                    completion_tokens: 5,
                                    total_tokens: 15
                                }
                            })
                        }
                    }
                };

                vi.doMock('openai', () => ({
                    default: class OpenAI {
                        constructor() {
                            return mockClient;
                        }
                    }
                }));

                const { createHuggingFaceProvider } = await import(
                    '../../../engine/providers/hugging-face.js'
                );
                const provider = createHuggingFaceProvider({ apiKey: 'hf_test_token' });

                await provider.callLLM(
                    {
                        ...mockMachineContext,
                        abortSignal: abortController.signal
                    },
                    {
                        model: 'moonshotai/Kimi-K2-Thinking:novita',
                        thread: [{ role: 'user', content: 'Test' }],
                        maxTokens: 100
                    }
                );

                // Check abort signal was passed
                const callArgs = mockClient.chat.completions.create.mock.calls[0];
                expect(callArgs[1]).toEqual({ signal: abortController.signal });
            });
        });

        describe('getCapabilities', () => {
            it('should return correct capabilities for Kimi-K2-Thinking', async () => {
                vi.doMock('openai', () => ({
                    default: class OpenAI {
                        constructor() {
                            return {};
                        }
                    }
                }));

                const { createHuggingFaceProvider } = await import(
                    '../../../engine/providers/hugging-face.js'
                );
                const provider = createHuggingFaceProvider({ apiKey: 'hf_test_token' });

                const caps = provider.getCapabilities('moonshotai/Kimi-K2-Thinking:novita');

                expect(caps).toEqual({
                    maxContext: 128000,
                    maxOutput: 4096,
                    supports: {
                        toolCalls: true,
                        temperature: true
                    }
                });
            });

            it('should return default capabilities for unknown models', async () => {
                vi.doMock('openai', () => ({
                    default: class OpenAI {
                        constructor() {
                            return {};
                        }
                    }
                }));

                const { createHuggingFaceProvider } = await import(
                    '../../../engine/providers/hugging-face.js'
                );
                const provider = createHuggingFaceProvider({ apiKey: 'hf_test_token' });

                const caps = provider.getCapabilities('unknown/model');

                expect(caps).toEqual({
                    maxContext: 4096,
                    maxOutput: 2048,
                    supports: {
                        toolCalls: false,
                        temperature: true
                    }
                });
            });
        });
    });
});
