import { describe, it, expect } from 'vitest';
import { composeInstructions } from '../composeInstructions.js';
import mu from '../index.js';

describe('mu composeInstructions', () => {
    describe('role selection', () => {
        it('should compose instructions for assistant role', async () => {
            const result = await composeInstructions(
                {
                    plan: { role: 'assistant' },
                    factMap: { Signal: [] }
                },
                mu
            );

            expect(result.system).toContain('thinking companion');
            expect(result.primary).toContain('Engage as a thinking companion');
            expect(result.maxTokens).toBe(400);
            expect(result.metadata.role).toBe('assistant');
        });

        it('should compose instructions for analyzer role', async () => {
            const result = await composeInstructions(
                {
                    plan: { role: 'analyzer' },
                    factMap: { Signal: [] }
                },
                mu
            );

            expect(result.system).toContain('cognitive analyzer');
            expect(result.primary).toContain('Analyze by decomposing');
            expect(result.maxTokens).toBe(800);
            expect(result.metadata.role).toBe('analyzer');
        });

        it('should fall back to default role when role not specified', async () => {
            const result = await composeInstructions(
                {
                    plan: {},
                    factMap: { Signal: [] }
                },
                mu
            );

            expect(result.metadata.role).toBe('assistant');
            expect(result.maxTokens).toBe(400);
        });

        it('should fall back to default role when role not found', async () => {
            const result = await composeInstructions(
                {
                    plan: { role: 'nonexistent' },
                    factMap: { Signal: [] }
                },
                mu
            );

            expect(result.metadata.role).toBe('assistant');
            expect(result.maxTokens).toBe(400);
        });
    });

    describe('signal adaptations', () => {
        it('should apply explore signal adaptation', async () => {
            const result = await composeInstructions(
                {
                    plan: { role: 'assistant' },
                    factMap: {
                        Signal: [
                            { signal: 'explore', dimension: 'contract', confidence: 0.9 }
                        ]
                    }
                },
                mu
            );

            expect(result.adaptations).toContain('exploration is signaled');
            expect(result.metadata.adaptationKeys).toContain('explore');
        });

        it('should apply none signal adaptation', async () => {
            const result = await composeInstructions(
                {
                    plan: { role: 'assistant' },
                    factMap: {
                        Signal: [
                            { signal: 'none', dimension: 'support', confidence: 0.8 }
                        ]
                    }
                },
                mu
            );

            expect(result.adaptations).toContain('no supporting evidence');
            expect(result.metadata.adaptationKeys).toContain('none');
        });

        it('should apply multiple signal adaptations', async () => {
            const result = await composeInstructions(
                {
                    plan: { role: 'assistant' },
                    factMap: {
                        Signal: [
                            { signal: 'explore', dimension: 'contract', confidence: 0.9 },
                            { signal: 'none', dimension: 'support', confidence: 0.8 }
                        ]
                    }
                },
                mu
            );

            expect(result.adaptations).toContain('exploration is signaled');
            expect(result.adaptations).toContain('no supporting evidence');
            expect(result.metadata.adaptationKeys).toContain('explore');
            expect(result.metadata.adaptationKeys).toContain('none');
        });

        it('should deduplicate signal adaptations', async () => {
            const result = await composeInstructions(
                {
                    plan: { role: 'assistant' },
                    factMap: {
                        Signal: [
                            { signal: 'explore', dimension: 'contract', confidence: 0.9 },
                            { signal: 'explore', dimension: 'contract', confidence: 0.8 }
                        ]
                    }
                },
                mu
            );

            const exploreCount = (result.adaptations.match(/exploration is signaled/g) || []).length;
            expect(exploreCount).toBe(1);
        });

        it('should handle signals without adaptations', async () => {
            const result = await composeInstructions(
                {
                    plan: { role: 'assistant' },
                    factMap: {
                        Signal: [
                            { signal: 'nonexistent-signal', dimension: 'test', confidence: 0.9 }
                        ]
                    }
                },
                mu
            );

            expect(result.adaptations).toBe('');
        });
    });

    describe('token calculation', () => {
        it('should use role baseTokens', async () => {
            const result = await composeInstructions(
                {
                    plan: { role: 'synthesizer' },
                    factMap: { Signal: [] }
                },
                mu
            );

            expect(result.maxTokens).toBe(1000);
        });

        it('should apply signal token multipliers', async () => {
            const result = await composeInstructions(
                {
                    plan: { role: 'assistant' },
                    factMap: {
                        Signal: [
                            { signal: 'explore', dimension: 'contract', confidence: 0.9 }
                        ]
                    }
                },
                mu
            );

            // 400 * 1.2 = 480
            expect(result.maxTokens).toBe(480);
            expect(result.metadata.tokenMultiplier).toBe(1.2);
        });

        it('should combine multiple token multipliers', async () => {
            const result = await composeInstructions(
                {
                    plan: { role: 'assistant' },
                    factMap: {
                        Signal: [
                            { signal: 'explore', dimension: 'contract', confidence: 0.9 },
                            { signal: 'none', dimension: 'support', confidence: 0.8 }
                        ]
                    }
                },
                mu
            );

            // 400 * 1.2 * 0.85 = 408
            expect(result.maxTokens).toBe(408);
        });

        it('should apply TokenMultiplier facts from rules', async () => {
            const result = await composeInstructions(
                {
                    plan: { role: 'assistant' },
                    factMap: {
                        Signal: [],
                        TokenMultiplier: [
                            { value: 0.5 }
                        ]
                    }
                },
                mu
            );

            // 400 * 0.5 = 200
            expect(result.maxTokens).toBe(200);
        });

        it('should respect plan maxTokens override', async () => {
            const result = await composeInstructions(
                {
                    plan: { role: 'assistant', maxTokens: 600 },
                    factMap: { Signal: [] }
                },
                mu
            );

            expect(result.maxTokens).toBe(600);
        });

        it('should clamp tokens to minimum bound', async () => {
            const result = await composeInstructions(
                {
                    plan: { role: 'assistant' },
                    factMap: {
                        Signal: [],
                        TokenMultiplier: [{ value: 0.01 }]
                    }
                },
                mu
            );

            expect(result.maxTokens).toBeGreaterThanOrEqual(50);
        });

        it('should clamp tokens to maximum bound', async () => {
            const result = await composeInstructions(
                {
                    plan: { role: 'assistant', maxTokens: 3000 },
                    factMap: {
                        Signal: [],
                        TokenMultiplier: [{ value: 10 }]
                    }
                },
                mu
            );

            expect(result.maxTokens).toBeLessThanOrEqual(4000);
        });
    });

    describe('length guidance', () => {
        it('should use standard length by default', async () => {
            const result = await composeInstructions(
                {
                    plan: { role: 'assistant' },
                    factMap: { Signal: [] }
                },
                mu
            );

            expect(result.lengthGuidance).toContain('Balance completeness with readability');
            expect(result.metadata.lengthLevel).toBe('standard');
        });

        it('should use brief length for ack-only signal', async () => {
            const result = await composeInstructions(
                {
                    plan: { role: 'assistant' },
                    factMap: {
                        Signal: [
                            { signal: 'ack-only', dimension: 'contract', confidence: 0.9 }
                        ]
                    }
                },
                mu
            );

            expect(result.lengthGuidance).toContain('concise');
            expect(result.metadata.lengthLevel).toBe('brief');
        });

        it('should use comprehensive length for explore signal', async () => {
            const result = await composeInstructions(
                {
                    plan: { role: 'assistant' },
                    factMap: {
                        Signal: [
                            { signal: 'explore', dimension: 'contract', confidence: 0.9 }
                        ]
                    }
                },
                mu
            );

            expect(result.lengthGuidance).toContain('thorough');
            expect(result.metadata.lengthLevel).toBe('comprehensive');
        });

        it('should use comprehensive length for analyze signal', async () => {
            const result = await composeInstructions(
                {
                    plan: { role: 'assistant' },
                    factMap: {
                        Signal: [
                            { signal: 'analyze', dimension: 'contract', confidence: 0.9 }
                        ]
                    }
                },
                mu
            );

            expect(result.lengthGuidance).toContain('thorough');
            expect(result.metadata.lengthLevel).toBe('comprehensive');
        });
    });

    describe('adaptation key handling', () => {
        it('should use plan adaptationKey for iteration-specific adaptations', async () => {
            const result = await composeInstructions(
                {
                    plan: { role: 'assistant', adaptationKey: 'outer_voice_opening' },
                    factMap: { Signal: [] }
                },
                mu
            );

            expect(result.adaptations).toContain('Constraints Lens');
            expect(result.metadata.adaptationKeys).toContain('outer_voice_opening');
        });

        it('should combine plan adaptationKey with signal adaptations', async () => {
            const result = await composeInstructions(
                {
                    plan: { role: 'assistant', adaptationKey: 'outer_voice_opening' },
                    factMap: {
                        Signal: [
                            { signal: 'explore', dimension: 'contract', confidence: 0.9 }
                        ]
                    }
                },
                mu
            );

            expect(result.adaptations).toContain('Constraints Lens');
            expect(result.adaptations).toContain('exploration is signaled');
        });
    });

    describe('derived facts', () => {
        it('should include derived directives as adaptations', async () => {
            const result = await composeInstructions(
                {
                    plan: { role: 'assistant' },
                    factMap: {
                        Signal: [],
                        Derived: [
                            { directive: 'Test derived directive' }
                        ]
                    }
                },
                mu
            );

            expect(result.adaptations).toContain('Test derived directive');
            expect(result.metadata.adaptationKeys).toContain('derived');
        });
    });

    describe('tool instructions', () => {
        it('should not include tool instructions when no tools', async () => {
            const result = await composeInstructions(
                {
                    plan: { role: 'assistant' },
                    factMap: { Signal: [] }
                },
                mu
            );

            expect(result.toolInstructions).toBe('');
        });

        it('should include tools-available adaptation when tools present', async () => {
            const result = await composeInstructions(
                {
                    plan: { role: 'assistant', tools: ['read_file'] },
                    factMap: { Signal: [] }
                },
                mu
            );

            expect(result.toolInstructions).toContain('tools available');
            expect(result.metadata.adaptationKeys).toContain('tools-available');
        });

        it('should include task adaptations for task context', async () => {
            const result = await composeInstructions(
                {
                    plan: {
                        role: 'assistant',
                        tools: ['read_file'],
                        taskContext: { isTask: true }
                    },
                    factMap: { Signal: [] }
                },
                mu
            );

            expect(result.toolInstructions).toContain('tools available');
            expect(result.toolInstructions).toContain('multi-cycle tasks');
            expect(result.metadata.adaptationKeys).toContain('task-execution');
        });
    });

    describe('metadata', () => {
        it('should return comprehensive metadata', async () => {
            const result = await composeInstructions(
                {
                    plan: { role: 'analyzer' },
                    factMap: {
                        Signal: [
                            { signal: 'explore', dimension: 'contract', confidence: 0.9 }
                        ]
                    }
                },
                mu
            );

            // Module returns only what it naturally computed
            expect(result.metadata).toMatchObject({
                role: 'analyzer',
                baseTokens: 800,  // analyzer's baseTokens from role config
                lengthLevel: 'comprehensive',  // chosen based on explore signal
                adaptationKeys: ['explore']  // tracked during composition
            });
            expect(result.metadata.tokenMultiplier).toBeCloseTo(1.2);  // explore multiplier

            // signalCount and adaptationCount are NOT returned by module
            // Those are engine-computed stats for logging only
            expect(result.metadata.signalCount).toBeUndefined();
            expect(result.metadata.adaptationCount).toBeUndefined();
        });
    });

    describe('edge cases', () => {
        it('should handle empty factMap', async () => {
            const result = await composeInstructions(
                {
                    plan: { role: 'assistant' },
                    factMap: {}
                },
                mu
            );

            expect(result.system).toBeDefined();
            expect(result.primary).toBeDefined();
            expect(result.adaptations).toBe('');
            expect(result.maxTokens).toBe(400);
        });

        it('should handle missing plan', async () => {
            const result = await composeInstructions(
                {
                    factMap: { Signal: [] }
                },
                mu
            );

            expect(result.metadata.role).toBe('assistant');
            expect(result.maxTokens).toBe(400);
        });

        it('should handle Adaptation facts', async () => {
            const result = await composeInstructions(
                {
                    plan: { role: 'assistant' },
                    factMap: {
                        Signal: [],
                        Adaptation: [
                            { signal: 'explore' }
                        ]
                    }
                },
                mu
            );

            expect(result.adaptations).toContain('exploration is signaled');
        });
    });
});
