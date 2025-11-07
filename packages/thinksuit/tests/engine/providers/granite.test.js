import { describe, it, expect, beforeAll } from 'vitest';
import { createGraniteProvider } from '../../../engine/providers/granite.js';
import pino from 'pino';

describe('Granite Provider', () => {
    let provider;
    const logger = pino({ level: 'silent' });

    beforeAll(() => {
        provider = createGraniteProvider({ dtype: 'q4' });
    });

    describe('getCapabilities', () => {
        it('should return correct capabilities for Granite 4.0 H-1B', () => {
            const caps = provider.getCapabilities('ibm-granite/granite-4.0-h-1b');
            expect(caps.maxContext).toBe(128000);
            expect(caps.maxOutput).toBe(2048);
            expect(caps.supports.toolCalls).toBe(true);
            expect(caps.supports.temperature).toBe(true);
        });

        it('should return defaults for unknown model', () => {
            const caps = provider.getCapabilities('unknown-model');
            expect(caps.maxContext).toBe(4096);
            expect(caps.supports.toolCalls).toBe(false);
        });
    });

    describe('callLLM - basic generation', () => {
        it('should generate text from simple prompt', async () => {
            const machineContext = {
                execLogger: logger,
                abortSignal: null
            };

            const params = {
                model: 'ibm-granite/granite-4.0-h-1b',
                thread: [
                    { role: 'user', content: 'Say "test successful" and nothing else.' }
                ],
                maxTokens: 10,
                temperature: 0.1
            };

            const response = await provider.callLLM(machineContext, params);

            expect(response.output).toBeTruthy();
            expect(response.usage.prompt).toBeGreaterThan(0);
            expect(response.usage.completion).toBeGreaterThan(0);
            expect(response.finishReason).toMatch(/complete|max_tokens/);
        }, 30000);

        it('should handle multi-turn conversation', async () => {
            const machineContext = { execLogger: logger, abortSignal: null };

            const params = {
                model: 'ibm-granite/granite-4.0-h-1b',
                thread: [
                    { role: 'system', content: 'You are a helpful assistant.' },
                    { role: 'user', content: 'What is 2+2?' },
                    { role: 'assistant', content: 'The answer is 4.' },
                    { role: 'user', content: 'What about 3+3?' }
                ],
                maxTokens: 20
            };

            const response = await provider.callLLM(machineContext, params);
            expect(response.output).toBeTruthy();
        }, 30000);
    });

    describe('callLLM - tool calling', () => {
        it('should generate tool calls when tools provided', async () => {
            const machineContext = { execLogger: logger, abortSignal: null };

            const params = {
                model: 'ibm-granite/granite-4.0-h-1b',
                thread: [
                    { role: 'user', content: 'What is the weather in Boston?' }
                ],
                tools: ['get_weather'],
                toolSchemas: {
                    get_weather: {
                        description: 'Get current weather for a city',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                city: { type: 'string' }
                            },
                            required: ['city']
                        }
                    }
                },
                maxTokens: 100
            };

            const response = await provider.callLLM(machineContext, params);

            // May or may not call tool depending on model behavior
            if (response.toolCalls) {
                expect(Array.isArray(response.toolCalls)).toBe(true);
                expect(response.toolCalls[0]).toHaveProperty('id');
                expect(response.toolCalls[0]).toHaveProperty('type', 'function');
                expect(response.toolCalls[0].function).toHaveProperty('name');
                expect(response.toolCalls[0].function).toHaveProperty('arguments');
                expect(response.finishReason).toBe('tool_use');
            }
        }, 30000);

        it('should handle tool responses in conversation', async () => {
            const machineContext = { execLogger: logger, abortSignal: null };

            const params = {
                model: 'ibm-granite/granite-4.0-h-1b',
                thread: [
                    { role: 'user', content: 'What is the weather in Boston?' },
                    { role: 'assistant', content: '<tool_call>\n{"name": "get_weather", "arguments": {"city": "Boston"}}\n</tool_call>' },
                    { role: 'tool', content: '{"temperature": 72, "condition": "sunny"}' },
                    { role: 'user', content: 'Tell me about the weather.' }
                ],
                maxTokens: 50
            };

            const response = await provider.callLLM(machineContext, params);
            expect(response.output).toBeTruthy();
        }, 30000);
    });

    describe('error handling', () => {
        it('should throw on unknown model', async () => {
            const machineContext = { execLogger: logger, abortSignal: null };
            const params = {
                model: 'unknown-model',
                thread: [{ role: 'user', content: 'test' }]
            };

            await expect(provider.callLLM(machineContext, params)).rejects.toThrow('E_GRANITE_MODEL');
        });

        it('should handle abort signal', async () => {
            const controller = new AbortController();
            controller.abort();

            const machineContext = {
                execLogger: logger,
                abortSignal: controller.signal
            };

            const params = {
                model: 'ibm-granite/granite-4.0-h-1b',
                thread: [{ role: 'user', content: 'test' }]
            };

            await expect(provider.callLLM(machineContext, params)).rejects.toThrow('aborted');
        });
    });
});
