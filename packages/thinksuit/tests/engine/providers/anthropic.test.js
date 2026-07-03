import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Provider Abstraction', () => {
    describe('Anthropic Provider', () => {
        let mockCreate;
        let mockMachineContext;

        beforeEach(() => {
            vi.resetModules();
            vi.clearAllMocks();

            mockMachineContext = {
                config: {
                    provider: 'anthropic',
                    anthropic: { apiKey: 'test-key' }
                },
                execLogger: {
                    debug: vi.fn(),
                    info: vi.fn(),
                    warn: vi.fn(),
                    error: vi.fn()
                }
            };

            mockCreate = vi.fn();
        });

        const mockSdk = () =>
            vi.doMock('@anthropic-ai/sdk', () => ({
                default: class Anthropic {
                    constructor() {}
                    messages = { create: mockCreate };
                }
            }));

        describe('callLLM interface', () => {
            it('should transform a standard request to the Messages API', async () => {
                mockCreate.mockResolvedValue({
                    id: 'msg_1',
                    type: 'message',
                    role: 'assistant',
                    model: 'claude-opus-4-8',
                    content: [{ type: 'text', text: 'Test response' }],
                    stop_reason: 'end_turn',
                    usage: { input_tokens: 100, output_tokens: 50 }
                });
                mockSdk();

                const { createAnthropicProvider } = await import(
                    '../../../engine/providers/anthropic.js'
                );
                const provider = createAnthropicProvider({ apiKey: 'test-key' });

                const result = await provider.callLLM(mockMachineContext, {
                    model: 'claude-opus-4-8',
                    systemInstructions: 'You are a helpful assistant',
                    thread: [{ role: 'user', content: 'Hello world' }],
                    maxTokens: 1000,
                    temperature: 0.7,
                    stop: ['\n\n']
                });

                expect(mockCreate).toHaveBeenCalledWith(
                    expect.objectContaining({
                        model: 'claude-opus-4-8',
                        max_tokens: 1000,
                        system: 'You are a helpful assistant',
                        messages: [{ role: 'user', content: 'Hello world' }],
                        temperature: 0.7,
                        stop_sequences: ['\n\n']
                    }),
                    expect.any(Object)
                );

                expect(result.output).toBe('Test response');
                expect(result.usage).toEqual({ prompt: 100, completion: 50 });
                expect(result.model).toBe('claude-opus-4-8');
                expect(result.finishReason).toBe('end_turn');
                expect(result.original).toBeDefined();
            });

            it('should omit system when no system instructions are given', async () => {
                mockCreate.mockResolvedValue({
                    content: [{ type: 'text', text: 'Response' }],
                    stop_reason: 'end_turn',
                    usage: { input_tokens: 10, output_tokens: 5 },
                    model: 'claude-sonnet-4-6'
                });
                mockSdk();

                const { createAnthropicProvider } = await import(
                    '../../../engine/providers/anthropic.js'
                );
                const provider = createAnthropicProvider({ apiKey: 'test-key' });

                await provider.callLLM(mockMachineContext, {
                    model: 'claude-sonnet-4-6',
                    thread: [{ role: 'user', content: 'Just a user message' }],
                    maxTokens: 500
                });

                const callArgs = mockCreate.mock.calls[0][0];
                expect(callArgs.system).toBeUndefined();
                expect(callArgs.messages).toEqual([
                    { role: 'user', content: 'Just a user message' }
                ]);
            });

            it('should force a tool for structured output (responseFormat)', async () => {
                mockCreate.mockResolvedValue({
                    content: [
                        { type: 'tool_use', id: 'toolu_1', name: 'intent', input: { confirmed: true } }
                    ],
                    stop_reason: 'tool_use',
                    usage: { input_tokens: 20, output_tokens: 10 },
                    model: 'claude-sonnet-4-6'
                });
                mockSdk();

                const { createAnthropicProvider } = await import(
                    '../../../engine/providers/anthropic.js'
                );
                const provider = createAnthropicProvider({ apiKey: 'test-key' });

                const schema = {
                    type: 'object',
                    properties: { confirmed: { type: 'boolean' } },
                    required: ['confirmed'],
                    additionalProperties: false
                };

                const result = await provider.callLLM(mockMachineContext, {
                    model: 'claude-sonnet-4-6',
                    thread: [{ role: 'user', content: 'classify this' }],
                    maxTokens: 20,
                    responseFormat: { name: 'intent', schema }
                });

                const callArgs = mockCreate.mock.calls[0][0];
                expect(callArgs.tools).toEqual([
                    expect.objectContaining({ name: 'intent', input_schema: schema })
                ]);
                expect(callArgs.tool_choice).toEqual({ type: 'tool', name: 'intent' });

                expect(result.output).toBe(JSON.stringify({ confirmed: true }));
                expect(result.finishReason).toBe('end_turn');
                expect(result.toolCalls).toBeUndefined();
            });

            it('should transform tools and tool_use responses', async () => {
                mockCreate.mockResolvedValue({
                    content: [
                        { type: 'tool_use', id: 'toolu_2', name: 'test_tool', input: { param: 'value' } }
                    ],
                    stop_reason: 'tool_use',
                    usage: { input_tokens: 200, output_tokens: 100 },
                    model: 'claude-opus-4-8'
                });
                mockSdk();

                const { createAnthropicProvider } = await import(
                    '../../../engine/providers/anthropic.js'
                );
                const provider = createAnthropicProvider({ apiKey: 'test-key' });

                const result = await provider.callLLM(mockMachineContext, {
                    model: 'claude-opus-4-8',
                    thread: [{ role: 'user', content: 'use a tool' }],
                    tools: ['test_tool'],
                    toolSchemas: {
                        test_tool: {
                            description: 'A test tool',
                            inputSchema: {
                                type: 'object',
                                properties: { param: { type: 'string' } }
                            }
                        }
                    },
                    maxTokens: 1000
                });

                const callArgs = mockCreate.mock.calls[0][0];
                expect(callArgs.tools).toEqual([
                    {
                        name: 'test_tool',
                        description: 'A test tool',
                        input_schema: {
                            type: 'object',
                            properties: { param: { type: 'string' } }
                        }
                    }
                ]);

                expect(result.toolCalls).toHaveLength(1);
                expect(result.toolCalls[0]).toMatchObject({
                    id: 'toolu_2',
                    type: 'function',
                    function: {
                        name: 'test_tool',
                        arguments: JSON.stringify({ param: 'value' })
                    }
                });
                expect(result.finishReason).toBe('tool_use');
            });

            it('should transform assistant tool_calls and tool results in the thread', async () => {
                mockCreate.mockResolvedValue({
                    content: [{ type: 'text', text: 'Done' }],
                    stop_reason: 'end_turn',
                    usage: { input_tokens: 150, output_tokens: 20 },
                    model: 'claude-opus-4-8'
                });
                mockSdk();

                const { createAnthropicProvider } = await import(
                    '../../../engine/providers/anthropic.js'
                );
                const provider = createAnthropicProvider({ apiKey: 'test-key' });

                await provider.callLLM(mockMachineContext, {
                    model: 'claude-opus-4-8',
                    thread: [
                        { role: 'user', content: 'Call a tool' },
                        {
                            role: 'assistant',
                            content: '',
                            tool_calls: [
                                {
                                    id: 'toolu_3',
                                    function: {
                                        name: 'test_tool',
                                        arguments: JSON.stringify({ arg: 'value' })
                                    }
                                }
                            ]
                        },
                        { role: 'tool', tool_call_id: 'toolu_3', content: 'Tool result' }
                    ],
                    maxTokens: 500
                });

                const callArgs = mockCreate.mock.calls[0][0];
                expect(callArgs.messages).toHaveLength(3);
                expect(callArgs.messages[0]).toEqual({ role: 'user', content: 'Call a tool' });
                expect(callArgs.messages[1]).toEqual({
                    role: 'assistant',
                    content: [
                        { type: 'tool_use', id: 'toolu_3', name: 'test_tool', input: { arg: 'value' } }
                    ]
                });
                expect(callArgs.messages[2]).toEqual({
                    role: 'user',
                    content: [
                        { type: 'tool_result', tool_use_id: 'toolu_3', content: 'Tool result' }
                    ]
                });
            });

            it('groups parallel tool results into one user message (all ids paired)', async () => {
                mockCreate.mockResolvedValue({
                    content: [{ type: 'text', text: 'Done' }],
                    stop_reason: 'end_turn',
                    usage: { input_tokens: 10, output_tokens: 5 },
                    model: 'claude-opus-4-8'
                });
                mockSdk();

                const { createAnthropicProvider } = await import(
                    '../../../engine/providers/anthropic.js'
                );
                const provider = createAnthropicProvider({ apiKey: 'test-key' });

                await provider.callLLM(mockMachineContext, {
                    model: 'claude-opus-4-8',
                    thread: [
                        { role: 'user', content: 'ls two dirs' },
                        {
                            role: 'assistant',
                            content: '',
                            tool_calls: [
                                { id: 'toolu_a', function: { name: 'list_directory', arguments: '{"path":"a"}' } },
                                { id: 'toolu_b', function: { name: 'list_directory', arguments: '{"path":"b"}' } }
                            ]
                        },
                        { role: 'tool', tool_call_id: 'toolu_a', content: 'contents of a' },
                        { role: 'tool', tool_call_id: 'toolu_b', content: 'contents of b' }
                    ],
                    maxTokens: 500
                });

                const callArgs = mockCreate.mock.calls[0][0];
                // The assistant's two tool_use blocks must be answered by a single next
                // user message carrying both tool_result blocks — Anthropic rejects split
                // or missing results.
                expect(callArgs.messages).toHaveLength(3);
                expect(callArgs.messages[1].content.filter((b) => b.type === 'tool_use')).toHaveLength(2);
                expect(callArgs.messages[2]).toEqual({
                    role: 'user',
                    content: [
                        { type: 'tool_result', tool_use_id: 'toolu_a', content: 'contents of a' },
                        { type: 'tool_result', tool_use_id: 'toolu_b', content: 'contents of b' }
                    ]
                });
            });
        });

        describe('getCapabilities', () => {
            it('should return capabilities for known models', async () => {
                mockSdk();
                const { createAnthropicProvider } = await import(
                    '../../../engine/providers/anthropic.js'
                );
                const provider = createAnthropicProvider({ apiKey: 'test-key' });

                expect(provider.getCapabilities('claude-opus-4-8')).toEqual({
                    maxContext: 1000000,
                    maxOutput: 128000,
                    supports: { toolCalls: true, temperature: true }
                });
                expect(provider.getCapabilities('claude-sonnet-4-6')).toEqual({
                    maxContext: 1000000,
                    maxOutput: 64000,
                    supports: { toolCalls: true, temperature: true }
                });
            });

            it('should return default capabilities for unknown models', async () => {
                mockSdk();
                const { createAnthropicProvider } = await import(
                    '../../../engine/providers/anthropic.js'
                );
                const provider = createAnthropicProvider({ apiKey: 'test-key' });

                expect(provider.getCapabilities('claude-future-99')).toEqual({
                    maxContext: 200000,
                    maxOutput: 8192,
                    supports: { toolCalls: true, temperature: true }
                });
            });
        });
    });

    describe('Provider Factory', () => {
        it('should create the Anthropic provider', async () => {
            vi.doMock('@anthropic-ai/sdk', () => ({
                default: class Anthropic {
                    messages = { create: vi.fn() };
                }
            }));

            const { createProvider } = await import('../../../engine/providers/index.js');

            const provider = createProvider({
                provider: 'anthropic',
                providerConfig: { anthropic: { apiKey: 'test-key' } }
            });

            expect(provider).toHaveProperty('callLLM');
            expect(provider).toHaveProperty('getCapabilities');
        });
    });
});
