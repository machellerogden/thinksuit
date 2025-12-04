import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Provider Abstraction', () => {
    describe('Google Provider', () => {
        let mockGenerateContent;
        let mockMachineContext;

        beforeEach(async () => {
            vi.resetModules();
            vi.clearAllMocks();

            // Create mock machine context with logger
            mockMachineContext = {
                config: {
                    provider: 'google',
                    google: {
                        projectId: 'test-project',
                        location: 'us-central1'
                    }
                },
                execLogger: {
                    debug: vi.fn(),
                    info: vi.fn(),
                    warn: vi.fn(),
                    error: vi.fn()
                }
            };

            // Mock generateContent function
            mockGenerateContent = vi.fn();
        });

        describe('callLLM interface', () => {
            it('should transform standard request correctly for gemini-2.5-pro', async () => {
                // Mock Google GenAI response
                mockGenerateContent.mockResolvedValue({
                    candidates: [
                        {
                            content: {
                                parts: [{ text: 'Test response' }]
                            },
                            finishReason: 'STOP'
                        }
                    ],
                    usageMetadata: {
                        promptTokenCount: 100,
                        candidatesTokenCount: 50
                    },
                    modelVersion: 'gemini-2.5-pro-001'
                });

                // Mock GoogleGenAI constructor
                vi.doMock('@google/genai', () => ({
                    GoogleGenAI: class GoogleGenAI {
                        constructor(config) {
                            expect(config.vertexai).toBe(true);
                            expect(config.project).toBe('test-project');
                            expect(config.location).toBe('us-central1');
                        }
                        models = {
                            generateContent: mockGenerateContent
                        };
                    }
                }));

                const { createGoogleProvider } = await import(
                    '../../../engine/providers/google.js'
                );
                const provider = createGoogleProvider({
                    projectId: 'test-project',
                    location: 'us-central1'
                });

                const result = await provider.callLLM(mockMachineContext, {
                    model: 'gemini-2.5-pro',
                    systemInstructions: 'You are a helpful assistant',
                    thread: [
                        { role: 'user', content: 'Hello world' }
                    ],
                    maxTokens: 1000,
                    temperature: 0.7,
                    stop: ['\n\n']
                });

                // Check the API was called with correct transform
                expect(mockGenerateContent).toHaveBeenCalledWith(
                    expect.objectContaining({
                        model: 'gemini-2.5-pro',
                        contents: [{ role: 'user', parts: [{ text: 'Hello world' }] }],
                        config: expect.objectContaining({
                            systemInstruction: {
                                role: 'user',
                                parts: [{ text: 'You are a helpful assistant' }]
                            },
                            maxOutputTokens: 1000,
                            temperature: 0.7,
                            stopSequences: ['\n\n']
                        })
                    })
                );

                // Check response was transformed correctly
                expect(result.output).toBe('Test response');
                expect(result.usage).toEqual({
                    prompt: 100,
                    completion: 50
                });
                expect(result.model).toBe('gemini-2.5-pro-001');
                expect(result.finishReason).toBe('end_turn');
                expect(result.raw).toBeDefined();
            });

            it('should handle responses without system prompt', async () => {
                mockGenerateContent.mockResolvedValue({
                    candidates: [
                        {
                            content: {
                                parts: [{ text: 'Response' }]
                            },
                            finishReason: 'STOP'
                        }
                    ],
                    usageMetadata: {
                        promptTokenCount: 50,
                        candidatesTokenCount: 25
                    },
                    modelVersion: 'gemini-2.5-pro'
                });

                vi.doMock('@google/genai', () => ({
                    GoogleGenAI: class GoogleGenAI {
                        constructor() {}
                        models = {
                            generateContent: mockGenerateContent
                        };
                    }
                }));

                const { createGoogleProvider } = await import(
                    '../../../engine/providers/google.js'
                );
                const provider = createGoogleProvider({
                    projectId: 'test-project',
                    location: 'us-central1'
                });

                await provider.callLLM(mockMachineContext, {
                    model: 'gemini-2.5-pro',
                    thread: [{ role: 'user', content: 'Just a user message' }],
                    maxTokens: 500
                });

                const callArgs = mockGenerateContent.mock.calls[0][0];

                // Should only have user message, no systemInstruction in config
                expect(callArgs.config.systemInstruction).toBeUndefined();
                expect(callArgs.contents).toEqual([
                    { role: 'user', parts: [{ text: 'Just a user message' }] }
                ]);
            });

            it('should handle tool calls when provided', async () => {
                mockGenerateContent.mockResolvedValue({
                    candidates: [
                        {
                            content: {
                                parts: [
                                    {
                                        functionCall: {
                                            name: 'test_tool',
                                            args: { param: 'value' }
                                        }
                                    }
                                ]
                            },
                            finishReason: 'STOP'
                        }
                    ],
                    usageMetadata: {
                        promptTokenCount: 200,
                        candidatesTokenCount: 100
                    },
                    modelVersion: 'gemini-2.5-pro'
                });

                vi.doMock('@google/genai', () => ({
                    GoogleGenAI: class GoogleGenAI {
                        constructor() {}
                        models = {
                            generateContent: mockGenerateContent
                        };
                    }
                }));

                const { createGoogleProvider } = await import(
                    '../../../engine/providers/google.js'
                );
                const provider = createGoogleProvider({
                    projectId: 'test-project',
                    location: 'us-central1'
                });

                const tools = ['test_tool'];
                const toolSchemas = {
                    test_tool: {
                        description: 'A test tool',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                param: { type: 'string' }
                            }
                        }
                    }
                };

                const result = await provider.callLLM(mockMachineContext, {
                    model: 'gemini-2.5-pro',
                    thread: [
                        { role: 'system', content: 'System' },
                        { role: 'user', content: 'User' }
                    ],
                    tools,
                    toolSchemas,
                    maxTokens: 1000
                });

                // Should transform tools to Google GenAI format with parametersJsonSchema
                expect(mockGenerateContent).toHaveBeenCalledWith(
                    expect.objectContaining({
                        config: expect.objectContaining({
                            tools: [
                                {
                                    functionDeclarations: [
                                        {
                                            name: 'test_tool',
                                            description: 'A test tool',
                                            parametersJsonSchema: {
                                                type: 'object',
                                                properties: {
                                                    param: { type: 'string' }
                                                }
                                            }
                                        }
                                    ]
                                }
                            ]
                        })
                    })
                );

                // Should transform function calls to ThinkSuit format
                expect(result.toolCalls).toHaveLength(1);
                expect(result.toolCalls[0]).toMatchObject({
                    type: 'function',
                    function: {
                        name: 'test_tool',
                        arguments: JSON.stringify({ param: 'value' })
                    }
                });
                expect(result.finishReason).toBe('tool_use');
            });

            it('should handle assistant messages with tool calls in thread', async () => {
                mockGenerateContent.mockResolvedValue({
                    candidates: [
                        {
                            content: {
                                parts: [{ text: 'Continuing conversation' }]
                            },
                            finishReason: 'STOP'
                        }
                    ],
                    usageMetadata: {
                        promptTokenCount: 150,
                        candidatesTokenCount: 50
                    },
                    modelVersion: 'gemini-2.5-pro'
                });

                vi.doMock('@google/genai', () => ({
                    GoogleGenAI: class GoogleGenAI {
                        constructor() {}
                        models = {
                            generateContent: mockGenerateContent
                        };
                    }
                }));

                const { createGoogleProvider } = await import(
                    '../../../engine/providers/google.js'
                );
                const provider = createGoogleProvider({
                    projectId: 'test-project',
                    location: 'us-central1'
                });

                await provider.callLLM(mockMachineContext, {
                    model: 'gemini-2.5-pro',
                    thread: [
                        { role: 'user', content: 'Call a tool' },
                        {
                            role: 'assistant',
                            content: '',
                            tool_calls: [
                                {
                                    function: {
                                        name: 'test_tool',
                                        arguments: JSON.stringify({ arg: 'value' })
                                    }
                                }
                            ]
                        },
                        { role: 'tool', name: 'test_tool', content: 'Tool result' }
                    ],
                    maxTokens: 500
                });

                const callArgs = mockGenerateContent.mock.calls[0][0];

                // Check thread transformation
                expect(callArgs.contents).toHaveLength(3);
                expect(callArgs.contents[0]).toEqual({
                    role: 'user',
                    parts: [{ text: 'Call a tool' }]
                });
                expect(callArgs.contents[1]).toEqual({
                    role: 'model',
                    parts: [
                        {
                            functionCall: {
                                name: 'test_tool',
                                args: { arg: 'value' }
                            }
                        }
                    ]
                });
                expect(callArgs.contents[2]).toEqual({
                    role: 'function',
                    parts: [
                        {
                            functionResponse: {
                                name: 'test_tool',
                                response: {
                                    content: 'Tool result'
                                }
                            }
                        }
                    ]
                });
            });
        });

        describe('getCapabilities', () => {
            it('should return correct capabilities for known models', async () => {
                vi.doMock('@google/genai', () => ({
                    GoogleGenAI: class GoogleGenAI {}
                }));

                const { createGoogleProvider } = await import(
                    '../../../engine/providers/google.js'
                );
                const provider = createGoogleProvider({
                    projectId: 'test-project',
                    location: 'us-central1'
                });

                expect(provider.getCapabilities('gemini-2.5-pro')).toEqual({
                    maxContext: 1048576,
                    maxOutput: 65536,
                    supports: { toolCalls: true, temperature: true }
                });

                expect(provider.getCapabilities('gemini-2.0-flash')).toEqual({
                    maxContext: 1048576,
                    maxOutput: 8192,
                    supports: { toolCalls: true, temperature: true }
                });

                expect(provider.getCapabilities('gemini-1.5-pro')).toEqual({
                    maxContext: 2097152,
                    maxOutput: 8192,
                    supports: { toolCalls: true, temperature: true }
                });
            });

            it('should return default capabilities for unknown models', async () => {
                vi.doMock('@google/genai', () => ({
                    GoogleGenAI: class GoogleGenAI {}
                }));

                const { createGoogleProvider } = await import(
                    '../../../engine/providers/google.js'
                );
                const provider = createGoogleProvider({
                    projectId: 'test-project',
                    location: 'us-central1'
                });

                expect(provider.getCapabilities('unknown-model')).toEqual({
                    maxContext: 32000,
                    maxOutput: 8192,
                    supports: { toolCalls: true, temperature: true }
                });
            });
        });

        describe('Error handling', () => {
            it('should throw error if projectId is missing', async () => {
                vi.doMock('@google/genai', () => ({
                    GoogleGenAI: class GoogleGenAI {}
                }));

                const { createGoogleProvider } = await import(
                    '../../../engine/providers/google.js'
                );

                expect(() => {
                    createGoogleProvider({});
                }).toThrow('E_PROVIDER: Google provider requires projectId configuration');
            });
        });
    });

    describe('Provider Factory', () => {
        it('should create Google provider', async () => {
            vi.doMock('@google/genai', () => ({
                GoogleGenAI: class GoogleGenAI {}
            }));

            const { createProvider } = await import('../../../engine/providers/index.js');

            const provider = createProvider({
                provider: 'google',
                providerConfig: {
                    google: {
                        projectId: 'test-project',
                        location: 'us-central1'
                    }
                }
            });

            expect(provider).toHaveProperty('callLLM');
            expect(provider).toHaveProperty('getCapabilities');
        });

        it('should still create OpenAI provider', async () => {
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
    });
});
