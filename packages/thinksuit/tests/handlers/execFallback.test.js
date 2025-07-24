import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pino } from '../../engine/logger.js';

import { execFallbackCore } from '../../engine/handlers/execFallback.js';

// Mock the callLLM function
vi.mock('../../engine/providers/io.js', () => ({
    callLLM: vi.fn()
}));

import { callLLM } from '../../engine/providers/io.js';

describe('execFallback handler', () => {
    let logger;

    beforeEach(() => {
        logger = pino({ level: 'silent' });
        vi.clearAllMocks();
    });

    it('should handle E_DEPTH error appropriately', async () => {
        const input = {
            lastError: {
                code: 'E_DEPTH',
                message: 'Maximum recursion depth exceeded'
            },
            context: {
                traceId: 'test-trace',
                depth: 5
            },
            thread: []
        };

        const result = await execFallbackCore(input, { execLogger: logger });

        expect(result.response.output).toContain('maximum complexity limit');
        expect(result.response.output).toContain('breaking down your request');
        expect(result.response.metadata.errorCode).toBe('E_DEPTH');
        expect(result.response.metadata.fallback).toBe(true);
        expect(result.response.metadata.recovered).toBe(false);
    });

    it('should handle E_PROVIDER error appropriately', async () => {
        const input = {
            lastError: {
                code: 'E_PROVIDER',
                message: 'OpenAI API error'
            },
            context: {
                traceId: 'test-trace'
            },
            thread: []
        };

        const result = await execFallbackCore(input, { execLogger: logger });

        expect(result.response.output).toContain('issue with the AI service');
        expect(result.response.output).toContain('Try again');
        expect(result.response.metadata.errorCode).toBe('E_PROVIDER');
    });

    it('should handle E_TIMEOUT error appropriately', async () => {
        const input = {
            lastError: {
                code: 'E_TIMEOUT',
                message: 'Request timed out'
            },
            context: {
                traceId: 'test-trace'
            },
            thread: []
        };

        const result = await execFallbackCore(input, { execLogger: logger });

        expect(result.response.output).toContain('took too long');
        expect(result.response.metadata.errorCode).toBe('E_TIMEOUT');
    });

    it('should handle E_FANOUT error appropriately', async () => {
        const input = {
            lastError: {
                code: 'E_FANOUT',
                message: 'Too many parallel operations'
            },
            context: {
                traceId: 'test-trace'
            },
            thread: []
        };

        const result = await execFallbackCore(input, { execLogger: logger });

        expect(result.response.output).toContain('too many parallel operations');
        expect(result.response.metadata.errorCode).toBe('E_FANOUT');
    });

    it('should attempt intelligent recovery with IO config when available', async () => {
        const mockConfig = {
            provider: 'openai',
            model: 'gpt-4o-mini',
            apiKey: 'test-key'
        };

        // Mock callLLM to return a recovery response
        callLLM.mockResolvedValueOnce({
            output: 'Here is a helpful simplified response',
            usage: { prompt: 50, completion: 30 },
            model: 'gpt-4o-mini'
        });

        const input = {
            lastError: {
                code: 'E_DEPTH',
                message: 'Too complex'
            },
            context: {
                traceId: 'test-trace',
                config: {
                    model: 'gpt-4o-mini'
                }
            },
            thread: [{ role: 'user', content: 'Complex request' }]
        };

        const machineContext = {
            config: mockConfig,
            execLogger: logger,
            module: {
                instructionSchema: {
                    temperature: {
                        fallback: 0.3,
                        default: 0.7
                    }
                }
            }
        };

        const result = await execFallbackCore(input, machineContext);

        expect(callLLM).toHaveBeenCalledWith(
            machineContext,
            expect.objectContaining({
                thread: expect.arrayContaining([
                    expect.objectContaining({
                        role: 'system',
                        content: expect.stringContaining('graceful error recovery')
                    }),
                    expect.objectContaining({
                        role: 'user',
                        content: expect.stringContaining('Complex request')
                    })
                ]),
                maxTokens: 200,
                temperature: 0.3
            })
        );

        expect(result.response.output).toBe('Here is a helpful simplified response');
        expect(result.response.metadata.recovered).toBe(true);
    });

    it('should fall back to static response if intelligent recovery fails', async () => {
        const mockConfig = {
            provider: 'openai',
            model: 'gpt-4o-mini',
            apiKey: 'test-key'
        };

        // Mock callLLM to fail
        callLLM.mockRejectedValueOnce(new Error('LLM failed'));

        const input = {
            lastError: {
                code: 'E_DEPTH',
                message: 'Too complex'
            },
            context: {
                traceId: 'test-trace'
            },
            thread: [{ role: 'user', content: 'Complex request' }]
        };

        const machineContext = {
            config: mockConfig,
            execLogger: logger,
            module: {
                instructionSchema: {
                    temperature: {
                        fallback: 0.3,
                        default: 0.7
                    }
                }
            }
        };

        const result = await execFallbackCore(input, machineContext);

        expect(callLLM).toHaveBeenCalled();
        expect(result.response.output).toContain('maximum complexity limit');
        expect(result.response.metadata.recovered).toBe(false);
    });

    it('should not attempt LLM recovery for E_PROVIDER errors', async () => {
        const mockConfig = {
            provider: 'openai',
            model: 'gpt-4o-mini',
            apiKey: 'test-key'
        };

        const input = {
            lastError: {
                code: 'E_PROVIDER',
                message: 'Provider error'
            },
            context: {
                traceId: 'test-trace'
            },
            thread: []
        };

        const machineContext = {
            config: mockConfig,
            execLogger: logger,
            module: {
                instructionSchema: {
                    temperature: {
                        fallback: 0.3,
                        default: 0.7
                    }
                }
            }
        };

        const result = await execFallbackCore(input, machineContext);

        expect(callLLM).not.toHaveBeenCalled();
        expect(result.response.output).toContain('issue with the AI service');
        expect(result.response.metadata.recovered).toBe(false);
    });
});
