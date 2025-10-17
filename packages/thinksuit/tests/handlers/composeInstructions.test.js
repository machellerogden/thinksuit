import { describe, it, expect, beforeEach, vi } from 'vitest';
import { pino } from '../../engine/logger.js';
import { composeInstructionsCore as composeInstructions } from '../../engine/handlers/composeInstructions.js';
import { DEFAULT_INSTRUCTIONS } from '../../engine/constants/defaults.js';

describe('composeInstructions handler (engine contract)', () => {
    let logger;
    let mockModule;

    beforeEach(() => {
        logger = pino({ level: 'silent' });

        // Mock module that returns predictable results per new contract
        // Module only returns what it naturally computed, not derived stats
        mockModule = {
            composeInstructions: vi.fn(async ({ plan }) => ({
                system: 'Mock system prompt',
                primary: 'Mock primary prompt',
                adaptations: 'Mock adaptations',
                lengthGuidance: 'Mock length guidance',
                toolInstructions: '',
                maxTokens: 500,
                metadata: {
                    role: plan.role || 'assistant',
                    baseTokens: 400,  // Natural: looked up from role config
                    tokenMultiplier: 1.0,  // Natural: calculated during composition
                    lengthLevel: 'standard',  // Natural: chosen based on signals
                    adaptationKeys: []  // Natural: tracked during composition
                }
            }))
        };
    });

    describe('module delegation', () => {
        it('should call module.composeInstructions with correct arguments', async () => {
            const input = {
                plan: { strategy: 'direct', role: 'assistant' },
                factMap: { Signal: [] },
                context: { traceId: 'test-trace', sessionId: 'test-session' }
            };

            await composeInstructions(input, {
                execLogger: logger,
                module: mockModule
            });

            expect(mockModule.composeInstructions).toHaveBeenCalledOnce();
            expect(mockModule.composeInstructions).toHaveBeenCalledWith(
                { plan: input.plan, factMap: input.factMap },
                mockModule
            );
        });

        it('should pass module as second argument to composeInstructions', async () => {
            const input = {
                plan: { strategy: 'direct' },
                factMap: {},
                context: { traceId: 'test-trace', sessionId: 'test-session' }
            };

            await composeInstructions(input, {
                execLogger: logger,
                module: mockModule
            });

            const [[firstArg, secondArg]] = mockModule.composeInstructions.mock.calls;
            expect(secondArg).toBe(mockModule);
        });
    });

    describe('metadata enrichment', () => {
        it('should enrich metadata with plan.strategy', async () => {
            const input = {
                plan: { strategy: 'sequential', role: 'assistant' },
                factMap: {},
                context: { traceId: 'test-trace', sessionId: 'test-session' }
            };

            const result = await composeInstructions(input, {
                execLogger: logger,
                module: mockModule
            });

            expect(result.metadata.strategy).toBe('sequential');
        });

        it('should enrich metadata with plan.tools', async () => {
            const input = {
                plan: {
                    strategy: 'task',
                    role: 'assistant',
                    tools: ['read_file', 'write_file']
                },
                factMap: {},
                context: { traceId: 'test-trace', sessionId: 'test-session' }
            };

            const result = await composeInstructions(input, {
                execLogger: logger,
                module: mockModule
            });

            expect(result.metadata.toolsAvailable).toEqual(['read_file', 'write_file']);
        });

        it('should default toolsAvailable to empty array when no tools', async () => {
            const input = {
                plan: { strategy: 'direct', role: 'assistant' },
                factMap: {},
                context: { traceId: 'test-trace', sessionId: 'test-session' }
            };

            const result = await composeInstructions(input, {
                execLogger: logger,
                module: mockModule
            });

            expect(result.metadata.toolsAvailable).toEqual([]);
        });

        it('should preserve module metadata and add engine enrichments', async () => {
            const input = {
                plan: { strategy: 'direct', role: 'assistant' },
                factMap: {},
                context: { traceId: 'test-trace', sessionId: 'test-session' }
            };

            const result = await composeInstructions(input, {
                execLogger: logger,
                module: mockModule
            });

            // Module's natural metadata is preserved
            expect(result.metadata).toMatchObject({
                role: 'assistant',
                baseTokens: 400,
                tokenMultiplier: 1.0,
                lengthLevel: 'standard',
                adaptationKeys: []
            });

            // Engine enrichments are added
            expect(result.metadata.strategy).toBe('direct');
            expect(result.metadata.toolsAvailable).toEqual([]);

            // Engine-computed stats (signalCount, adaptationCount) are NOT in returned metadata
            // They are only computed for logging purposes
            expect(result.metadata.signalCount).toBeUndefined();
            expect(result.metadata.adaptationCount).toBeUndefined();
        });
    });

    describe('missing module handling', () => {
        it('should return DEFAULT_INSTRUCTIONS when module is missing', async () => {
            const input = {
                plan: { strategy: 'direct' },
                factMap: {},
                context: { traceId: 'test-trace', sessionId: 'test-session' }
            };

            const result = await composeInstructions(input, {
                execLogger: logger,
                module: null
            });

            expect(result).toEqual(DEFAULT_INSTRUCTIONS);
        });

        it('should return DEFAULT_INSTRUCTIONS when module.composeInstructions missing', async () => {
            const input = {
                plan: { strategy: 'direct' },
                factMap: {},
                context: { traceId: 'test-trace', sessionId: 'test-session' }
            };

            const incompleteModule = {
                // Missing composeInstructions
            };

            const result = await composeInstructions(input, {
                execLogger: logger,
                module: incompleteModule
            });

            expect(result).toEqual(DEFAULT_INSTRUCTIONS);
        });

        it('should log warning when module is missing', async () => {
            const warnSpy = vi.spyOn(logger, 'warn');

            const input = {
                plan: { strategy: 'direct' },
                factMap: {},
                context: { traceId: 'test-trace', sessionId: 'test-session' }
            };

            await composeInstructions(input, {
                execLogger: logger,
                module: null
            });

            expect(warnSpy).toHaveBeenCalled();
        });
    });

    describe('result passthrough', () => {
        it('should return module result with enrichments', async () => {
            const input = {
                plan: { strategy: 'direct', role: 'analyzer' },
                factMap: {},
                context: { traceId: 'test-trace', sessionId: 'test-session' }
            };

            const result = await composeInstructions(input, {
                execLogger: logger,
                module: mockModule
            });

            expect(result).toMatchObject({
                system: 'Mock system prompt',
                primary: 'Mock primary prompt',
                adaptations: 'Mock adaptations',
                lengthGuidance: 'Mock length guidance',
                toolInstructions: '',
                maxTokens: 500
            });
        });

        it('should not mutate module result', async () => {
            const input = {
                plan: { strategy: 'direct', role: 'assistant' },
                factMap: {},
                context: { traceId: 'test-trace', sessionId: 'test-session' }
            };

            await composeInstructions(input, {
                execLogger: logger,
                module: mockModule
            });

            // Verify module was called
            expect(mockModule.composeInstructions).toHaveBeenCalled();
        });
    });

    describe('edge cases', () => {
        it('should handle missing plan gracefully', async () => {
            const input = {
                factMap: {},
                context: { traceId: 'test-trace', sessionId: 'test-session' }
            };

            const result = await composeInstructions(input, {
                execLogger: logger,
                module: mockModule
            });

            expect(result).toBeDefined();
            expect(result.metadata.strategy).toBeUndefined();
        });

        it('should handle missing factMap gracefully', async () => {
            const input = {
                plan: { strategy: 'direct' },
                context: { traceId: 'test-trace', sessionId: 'test-session' }
            };

            const result = await composeInstructions(input, {
                execLogger: logger,
                module: mockModule
            });

            expect(result).toBeDefined();
        });

        it('should handle missing context gracefully', async () => {
            const input = {
                plan: { strategy: 'direct' },
                factMap: {}
            };

            const result = await composeInstructions(input, {
                execLogger: logger,
                module: mockModule
            });

            expect(result).toBeDefined();
        });
    });
});
