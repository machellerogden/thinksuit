import { describe, it, expect, beforeAll } from 'vitest';

import { createOpenAIProvider } from '../../engine/providers/openai.js';
import { createVertexAIProvider } from '../../engine/providers/vertex-ai.js';
import { callLLM } from '../../engine/providers/io.js';

// Integration tests that call real APIs
// Only run when explicitly enabled via TEST_INTEGRATION=true
// This prevents accidental API calls and costs during normal test runs
const shouldRunIntegration = process.env.TEST_INTEGRATION === 'true';

describe.skipIf(!shouldRunIntegration)('OpenAI Provider Integration', () => {
    let provider;
    let config;

    beforeAll(() => {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY must be set to run integration tests');
        }

        provider = createOpenAIProvider({ apiKey: process.env.OPENAI_API_KEY });
        config = {
            provider: 'openai',
            openai: { apiKey: process.env.OPENAI_API_KEY }
        };
    });

    describe('Real API calls', () => {
        it('should successfully call OpenAI API with gpt-4o-mini', async () => {
            const result = await provider.callLLM({
                model: 'gpt-4o-mini',
                system: 'You are a helpful assistant. Respond with exactly: "Test successful"',
                user: 'Please respond with the exact message I told you.',
                maxTokens: 10,
                temperature: 0
            });

            expect(result).toHaveProperty('output');
            expect(result).toHaveProperty('usage');
            expect(result.usage).toHaveProperty('prompt');
            expect(result.usage).toHaveProperty('completion');
            expect(result).toHaveProperty('model');
            expect(result.model).toContain('gpt-4o-mini');
            expect(result).toHaveProperty('finishReason');

            // Output should be our test message (or close to it)
            expect(result.output.toLowerCase()).toContain('test successful');
        }, 10000); // 10 second timeout for API call

        it('should handle system-less messages', async () => {
            const result = await provider.callLLM({
                model: 'gpt-4o-mini',
                user: 'Say "Hello" and nothing else',
                maxTokens: 10,
                temperature: 0
            });

            expect(result.output).toBeTruthy();
            expect(result.usage.prompt).toBeGreaterThan(0);
            expect(result.usage.completion).toBeGreaterThan(0);
        }, 10000);

        it('should respect maxTokens limit', async () => {
            const result = await provider.callLLM({
                model: 'gpt-4o-mini',
                system: 'You must write a very long story',
                user: 'Write a 500 word story about a robot',
                maxTokens: 20, // Very low limit
                temperature: 0.7
            });

            // With only 20 tokens, the response should be cut off
            expect(result.usage.completion).toBeLessThanOrEqual(20);
            // Finish reason might be 'length' instead of 'stop'
            expect(['stop', 'length']).toContain(result.finishReason);
        }, 10000);

        it('should work through callLLM function with token clamping', async () => {
            const result = await callLLM(config, {
                model: 'gpt-4o-mini',
                system: 'Respond with: "IO test works"',
                user: 'Please respond',
                maxTokens: 50000 // Way over the limit
            });

            expect(result.output).toBeTruthy();
            // Should have been clamped to model's max
            const capabilities = provider.getCapabilities('gpt-4o-mini');
            expect(result.usage.completion).toBeLessThanOrEqual(capabilities.maxOutput);
        }, 10000);

        it('should handle API errors gracefully', async () => {
            // Use an invalid model to trigger an error
            await expect(
                provider.callLLM({
                    model: 'invalid-model-that-does-not-exist',
                    user: 'Test',
                    maxTokens: 10
                })
            ).rejects.toThrow();
        }, 10000);
    });

    describe('Model capabilities', () => {
        it('should return accurate capabilities for real models', () => {
            // Test a few models we know about
            const gpt4 = provider.getCapabilities('gpt-4');
            expect(gpt4.maxContext).toBe(128000);
            expect(gpt4.maxOutput).toBe(4096);
            expect(gpt4.supports.toolCalls).toBe(true);

            const gpt4o = provider.getCapabilities('gpt-4o');
            expect(gpt4o.maxOutput).toBe(16384);

            const o1Preview = provider.getCapabilities('o1-preview');
            expect(o1Preview.supports.toolCalls).toBe(false);
            expect(o1Preview.maxOutput).toBe(32768);
        });
    });
});

// Optional: Test with actual function calling if needed
describe.skipIf(!shouldRunIntegration)('Function calling', () => {
    let provider;

    beforeAll(() => {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY must be set to run integration tests');
        }
        provider = createOpenAIProvider({ apiKey: process.env.OPENAI_API_KEY });
    });

    it.skip('should handle function calls', async () => {
        // This test is skipped by default since function calling
        // requires more complex setup and our current implementation
        // doesn't fully handle tool responses yet

        const tools = [
            {
                type: 'function',
                function: {
                    name: 'get_weather',
                    description: 'Get the weather for a location',
                    parameters: {
                        type: 'object',
                        properties: {
                            location: { type: 'string' }
                        },
                        required: ['location']
                    }
                }
            }
        ];

        const result = await provider.callLLM({
            model: 'gpt-4o-mini',
            system: 'You can check weather',
            user: 'What is the weather in San Francisco?',
            tools,
            maxTokens: 100
        });

        // If the model decides to call a function, finishReason will be 'tool_calls'
        // Otherwise it might just respond directly
        expect(['stop', 'tool_calls']).toContain(result.finishReason);
    }, 10000);
});

describe.skipIf(!shouldRunIntegration)('Vertex AI Provider Integration', () => {
    let provider;
    let machineContext;

    beforeAll(() => {
        if (!process.env.GOOGLE_CLOUD_PROJECT) {
            throw new Error('GOOGLE_CLOUD_PROJECT must be set to run Vertex AI integration tests');
        }

        const vertexAiConfig = {
            projectId: process.env.GOOGLE_CLOUD_PROJECT,
            location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1'
        };

        provider = createVertexAIProvider(vertexAiConfig);

        machineContext = {
            config: {
                provider: 'vertex-ai',
                vertexAi: vertexAiConfig
            },
            execLogger: {
                debug: () => {},
                info: () => {},
                warn: () => {},
                error: () => {}
            }
        };
    });

    describe('Real API calls', () => {
        it('should successfully call Vertex AI API with gemini-2.5-pro', async () => {
            const result = await provider.callLLM(machineContext, {
                model: 'gemini-2.5-pro',
                thread: [
                    { role: 'system', content: 'You are a helpful assistant. Respond with exactly: "Test successful"' },
                    { role: 'user', content: 'Please respond with the exact message I told you.' }
                ],
                maxTokens: 50,
                temperature: 0
            });

            expect(result).toHaveProperty('output');
            expect(result).toHaveProperty('usage');
            expect(result.usage).toHaveProperty('prompt');
            expect(result.usage).toHaveProperty('completion');
            expect(result).toHaveProperty('model');
            expect(result).toHaveProperty('finishReason');

            // Output should be our test message (or close to it)
            expect(result.output.toLowerCase()).toContain('test');
        }, 30000); // 30 second timeout for API call

        it('should handle system-less messages', async () => {
            const result = await provider.callLLM(machineContext, {
                model: 'gemini-2.5-pro',
                thread: [
                    { role: 'user', content: 'Say "Hello" and nothing else' }
                ],
                maxTokens: 10,
                temperature: 0
            });

            expect(result.output).toBeTruthy();
            expect(result.usage.prompt).toBeGreaterThan(0);
            expect(result.usage.completion).toBeGreaterThan(0);
        }, 30000);

        it('should respect maxTokens limit', async () => {
            const result = await provider.callLLM(machineContext, {
                model: 'gemini-2.5-pro',
                thread: [
                    { role: 'system', content: 'You must write a very long story' },
                    { role: 'user', content: 'Write a 500 word story about a robot' }
                ],
                maxTokens: 20, // Very low limit
                temperature: 0.7
            });

            // With only 20 tokens, the response should be cut off
            expect(result.usage.completion).toBeLessThanOrEqual(25); // Allow small margin
            // Finish reason might be 'max_tokens' instead of 'complete'
            expect(['complete', 'max_tokens']).toContain(result.finishReason);
        }, 30000);

        it('should work through callLLM function with token clamping', async () => {
            const config = {
                provider: 'vertex-ai',
                vertexAi: {
                    projectId: process.env.GOOGLE_CLOUD_PROJECT,
                    location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1'
                }
            };

            const result = await callLLM(machineContext, {
                model: 'gemini-2.5-pro',
                thread: [
                    { role: 'system', content: 'Respond with: "IO test works"' },
                    { role: 'user', content: 'Please respond' }
                ],
                maxTokens: 50000 // Way over the limit
            });

            expect(result.output).toBeTruthy();
            // Should have been clamped to model's max
            const capabilities = provider.getCapabilities('gemini-2.5-pro');
            expect(result.usage.completion).toBeLessThanOrEqual(capabilities.maxOutput);
        }, 30000);
    });

    describe('Model capabilities', () => {
        it('should return accurate capabilities for Gemini models', () => {
            const gemini25Pro = provider.getCapabilities('gemini-2.5-pro');
            expect(gemini25Pro.maxContext).toBe(1000000);
            expect(gemini25Pro.maxOutput).toBe(8192);
            expect(gemini25Pro.supports.toolCalls).toBe(true);
            expect(gemini25Pro.supports.temperature).toBe(true);

            const gemini20Flash = provider.getCapabilities('gemini-2.0-flash');
            expect(gemini20Flash.maxContext).toBe(1000000);
            expect(gemini20Flash.maxOutput).toBe(8192);

            const gemini15Pro = provider.getCapabilities('gemini-1.5-pro');
            expect(gemini15Pro.maxContext).toBe(2000000);
            expect(gemini15Pro.maxOutput).toBe(8192);
        });
    });
});
