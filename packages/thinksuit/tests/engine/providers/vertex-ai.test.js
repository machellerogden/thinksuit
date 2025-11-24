import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Provider Abstraction', () => {
    describe('Vertex AI Provider', () => {
        let mockGenerativeModel;
        let mockVertexAI;
        let mockMachineContext;

        beforeEach(async () => {
            vi.resetModules();
            vi.clearAllMocks();

            // Create mock machine context with logger
            mockMachineContext = {
                config: {
                    provider: 'vertex-ai',
                    googleCloud: {
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

            // Mock generative model
            mockGenerativeModel = {
                generateContent: vi.fn()
            };

            // Mock VertexAI class
            mockVertexAI = {
                getGenerativeModel: vi.fn().mockReturnValue(mockGenerativeModel)
            };
        });

        describe('callLLM interface', () => {
            it('should transform standard request correctly for gemini-2.5-pro', async () => {
                // Mock Vertex AI response
                mockGenerativeModel.generateContent.mockResolvedValue({
                    response: {
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
                    }
                });

                // Mock VertexAI constructor
                vi.doMock('@google-cloud/vertexai', () => ({
                    VertexAI: class VertexAI {
                        constructor(config) {
                            expect(config.project).toBe('test-project');
                            expect(config.location).toBe('us-central1');
                            return mockVertexAI;
                        }
                    }
                }));

                const { createVertexAIProvider } = await import(
                    '../../../engine/providers/vertex-ai.js'
                );
                const provider = createVertexAIProvider({
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
                expect(mockGenerativeModel.generateContent).toHaveBeenCalledWith(
                    expect.objectContaining({
                        systemInstruction: {
                            role: 'user',
                            parts: [{ text: 'You are a helpful assistant' }]
                        },
                        contents: [{ role: 'user', parts: [{ text: 'Hello world' }] }],
                        generationConfig: {
                            maxOutputTokens: 1000,
                            temperature: 0.7,
                            stopSequences: ['\n\n']
                        }
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
                mockGenerativeModel.generateContent.mockResolvedValue({
                    response: {
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
                    }
                });

                vi.doMock('@google-cloud/vertexai', () => ({
                    VertexAI: class VertexAI {
                        constructor() {
                            return mockVertexAI;
                        }
                    }
                }));

                const { createVertexAIProvider } = await import(
                    '../../../engine/providers/vertex-ai.js'
                );
                const provider = createVertexAIProvider({
                    projectId: 'test-project',
                    location: 'us-central1'
                });

                await provider.callLLM(mockMachineContext, {
                    model: 'gemini-2.5-pro',
                    thread: [{ role: 'user', content: 'Just a user message' }],
                    maxTokens: 500
                });

                const callArgs = mockGenerativeModel.generateContent.mock.calls[0][0];

                // Should only have user message, no systemInstruction
                expect(callArgs.systemInstruction).toBeUndefined();
                expect(callArgs.contents).toEqual([
                    { role: 'user', parts: [{ text: 'Just a user message' }] }
                ]);
            });

            it('should handle tool calls when provided', async () => {
                mockGenerativeModel.generateContent.mockResolvedValue({
                    response: {
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
                    }
                });

                vi.doMock('@google-cloud/vertexai', () => ({
                    VertexAI: class VertexAI {
                        constructor() {
                            return mockVertexAI;
                        }
                    }
                }));

                const { createVertexAIProvider } = await import(
                    '../../../engine/providers/vertex-ai.js'
                );
                const provider = createVertexAIProvider({
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

                // Should transform tools to Vertex AI format
                expect(mockGenerativeModel.generateContent).toHaveBeenCalledWith(
                    expect.objectContaining({
                        tools: [
                            {
                                functionDeclarations: [
                                    {
                                        name: 'test_tool',
                                        description: 'A test tool',
                                        parameters: {
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
                mockGenerativeModel.generateContent.mockResolvedValue({
                    response: {
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
                    }
                });

                vi.doMock('@google-cloud/vertexai', () => ({
                    VertexAI: class VertexAI {
                        constructor() {
                            return mockVertexAI;
                        }
                    }
                }));

                const { createVertexAIProvider } = await import(
                    '../../../engine/providers/vertex-ai.js'
                );
                const provider = createVertexAIProvider({
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

                const callArgs = mockGenerativeModel.generateContent.mock.calls[0][0];

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
                vi.doMock('@google-cloud/vertexai', () => ({
                    VertexAI: class VertexAI {}
                }));

                const { createVertexAIProvider } = await import(
                    '../../../engine/providers/vertex-ai.js'
                );
                const provider = createVertexAIProvider({
                    projectId: 'test-project',
                    location: 'us-central1'
                });

                expect(provider.getCapabilities('gemini-2.5-pro')).toEqual({
                    maxContext: 1000000,
                    maxOutput: 8192,
                    supports: { toolCalls: true, temperature: true }
                });

                expect(provider.getCapabilities('gemini-2.0-flash')).toEqual({
                    maxContext: 1000000,
                    maxOutput: 8192,
                    supports: { toolCalls: true, temperature: true }
                });

                expect(provider.getCapabilities('gemini-1.5-pro')).toEqual({
                    maxContext: 2000000,
                    maxOutput: 8192,
                    supports: { toolCalls: true, temperature: true }
                });
            });

            it('should return default capabilities for unknown models', async () => {
                vi.doMock('@google-cloud/vertexai', () => ({
                    VertexAI: class VertexAI {}
                }));

                const { createVertexAIProvider } = await import(
                    '../../../engine/providers/vertex-ai.js'
                );
                const provider = createVertexAIProvider({
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
                vi.doMock('@google-cloud/vertexai', () => ({
                    VertexAI: class VertexAI {}
                }));

                const { createVertexAIProvider } = await import(
                    '../../../engine/providers/vertex-ai.js'
                );

                expect(() => {
                    createVertexAIProvider({});
                }).toThrow('E_PROVIDER: Vertex AI requires projectId configuration');
            });
        });
    });

    describe('Provider Factory', () => {
        it('should create Vertex AI provider', async () => {
            vi.doMock('@google-cloud/vertexai', () => ({
                VertexAI: class VertexAI {}
            }));

            const { createProvider } = await import('../../../engine/providers/index.js');

            const provider = createProvider({
                provider: 'vertex-ai',
                providerConfig: {
                    vertexAi: {
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
