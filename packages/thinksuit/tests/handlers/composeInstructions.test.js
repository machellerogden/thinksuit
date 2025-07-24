import { describe, it, expect, beforeEach } from 'vitest';
import { pino } from '../../engine/logger.js';
import { composeInstructionsCore as composeInstructions } from '../../engine/handlers/composeInstructions.js';
import { DEFAULT_INSTRUCTIONS } from '../../engine/constants/defaults.js';

describe('composeInstructions handler', () => {
    let mockModule;
    let mockContext;
    let logger;

    beforeEach(() => {
        // Create a real silent logger for testing
        logger = pino({ level: 'silent' });

        mockModule = {
            instructionSchema: {
                prompts: {
                    system: (role) => `System prompt for ${role}`,
                    primary: (role) => `Primary prompt for ${role}`,
                    adaptation: (signal) => (signal ? `Adaptation for ${signal}` : ''),
                    length: (level) => `Length guidance: ${level}`
                },
                tokens: {
                    roleDefaults: {
                        assistant: 400,
                        analyzer: 800,
                        synthesizer: 1000,
                        critic: 600
                    },
                    signalMultipliers: {
                        'contract.ack-only': 0.5,
                        'contract.explore': 1.2,
                        'support.none': 0.85
                    }
                }
            }
        };

        mockContext = {
            traceId: 'test-trace-1'
        };
    });

    describe('basic functionality', () => {
        it('should compose instructions for a simple direct plan', async () => {
            const input = {
                plan: {
                    strategy: 'direct',
                    role: 'assistant'
                },
                factMap: {
                    ExecutionPlan: [],
                    RoleSelection: [],
                    Signal: [],
                    Derived: [],
                    Adaptation: [],
                    TokenMultiplier: [],
                    Capability: [],
                    SelectedPlan: []
                },
                context: mockContext
            };

            const result = await composeInstructions(input, {
                execLogger: logger,
                module: mockModule
            });

            expect(result).toBeDefined();
            expect(result.system).toBe('System prompt for assistant');
            expect(result.primary).toBe('Primary prompt for assistant');
            expect(result.adaptations).toBe('');
            expect(result.lengthGuidance).toBe('Length guidance: standard');
            expect(result.maxTokens).toBe(400); // Default for assistant
        });

        it('should handle analyzer role with higher token budget', async () => {
            const input = {
                plan: {
                    strategy: 'direct',
                    role: 'analyzer'
                },
                factMap: {
                    ExecutionPlan: [],
                    RoleSelection: [],
                    Signal: [],
                    Derived: [],
                    Adaptation: [],
                    TokenMultiplier: [],
                    Capability: [],
                    SelectedPlan: []
                },
                context: mockContext
            };

            const result = await composeInstructions(input, {
                execLogger: logger,
                module: mockModule
            });

            expect(result.system).toBe('System prompt for analyzer');
            expect(result.primary).toBe('Primary prompt for analyzer');
            expect(result.maxTokens).toBe(800);
        });

        it('should apply signal adaptations', async () => {
            const input = {
                plan: {
                    strategy: 'direct',
                    role: 'assistant'
                },
                factMap: {
                    executionPlan: null,
                    RoleSelection: [],
                    Signal: [
                        { type: 'Signal', dimension: 'contract', signal: 'explore' },
                        { type: 'Signal', dimension: 'support', signal: 'none' }
                    ],
                    Derived: [],
                    Adaptation: [],
                    TokenMultiplier: []
                },
                context: mockContext
            };

            const result = await composeInstructions(input, {
                execLogger: logger,
                module: mockModule
            });

            expect(result.adaptations).toContain('Adaptation for explore');
            expect(result.adaptations).toContain('Adaptation for none');
            expect(result.lengthGuidance).toBe('Length guidance: comprehensive'); // explore triggers comprehensive
        });

        it('should apply token multipliers from signals', async () => {
            const input = {
                plan: {
                    strategy: 'direct',
                    role: 'assistant'
                },
                factMap: {
                    executionPlan: null,
                    RoleSelection: [],
                    Signal: [{ type: 'Signal', dimension: 'contract', signal: 'ack-only' }],
                    Derived: [],
                    Adaptation: [],
                    TokenMultiplier: []
                },
                context: mockContext
            };

            const result = await composeInstructions(input, {
                execLogger: logger,
                module: mockModule
            });

            // 400 (base) * 0.5 (ack-only multiplier) = 200
            expect(result.maxTokens).toBe(200);
            expect(result.lengthGuidance).toBe('Length guidance: brief');
        });

        it('should combine multiple token multipliers', async () => {
            const input = {
                plan: {
                    strategy: 'direct',
                    role: 'assistant'
                },
                factMap: {
                    executionPlan: null,
                    RoleSelection: [],
                    Signal: [
                        { type: 'Signal', dimension: 'contract', signal: 'explore' },
                        { type: 'Signal', dimension: 'support', signal: 'none' }
                    ],
                    Derived: [],
                    Adaptation: [],
                    TokenMultiplier: []
                },
                context: mockContext
            };

            const result = await composeInstructions(input, {
                execLogger: logger,
                module: mockModule
            });

            // 400 * 1.2 * 0.85 = 408
            expect(result.maxTokens).toBe(408);
        });

        it('should handle token multiplier facts', async () => {
            const input = {
                plan: {
                    strategy: 'direct',
                    role: 'assistant',
                    maxTokens: 600 // Plan can override
                },
                factMap: {
                    executionPlan: null,
                    RoleSelection: [],
                    Signal: [],
                    Derived: [],
                    Adaptation: [],
                    TokenMultiplier: [{ type: 'TokenMultiplier', value: 0.75 }]
                },
                context: mockContext
            };

            const result = await composeInstructions(input, {
                execLogger: logger,
                module: mockModule
            });

            // 600 * 0.75 = 450
            expect(result.maxTokens).toBe(450);
        });

        it('should apply length guidance based on contract signals', async () => {
            const input = {
                plan: {
                    strategy: 'direct',
                    role: 'assistant'
                },
                factMap: {
                    executionPlan: null,
                    RoleSelection: [],
                    Signal: [{ type: 'Signal', dimension: 'contract', signal: 'ack-only' }],
                    Derived: [],
                    Adaptation: [],
                    TokenMultiplier: []
                },
                context: mockContext
            };

            const result = await composeInstructions(input, {
                execLogger: logger,
                module: mockModule
            });

            expect(result.lengthGuidance).toBe('Length guidance: brief');
        });

        it('should handle comprehensive length for explore contract', async () => {
            const input = {
                plan: {
                    strategy: 'direct',
                    role: 'explorer'
                },
                factMap: {
                    executionPlan: null,
                    RoleSelection: [],
                    Signal: [{ type: 'Signal', dimension: 'contract', signal: 'explore' }],
                    Derived: [],
                    Adaptation: [],
                    TokenMultiplier: []
                },
                context: mockContext
            };

            const result = await composeInstructions(input, {
                execLogger: logger,
                module: mockModule
            });

            expect(result.lengthGuidance).toBe('Length guidance: comprehensive');
        });
    });

    describe('edge cases and error handling', () => {
        it('should handle missing plan gracefully', async () => {
            const input = {
                factMap: {
                    ExecutionPlan: [],
                    RoleSelection: [],
                    Signal: [],
                    Derived: [],
                    Adaptation: [],
                    TokenMultiplier: [],
                    Capability: [],
                    SelectedPlan: []
                },
                context: mockContext
            };

            const result = await composeInstructions(input, {
                execLogger: logger,
                module: mockModule
            });

            expect(result.system).toBe('System prompt for assistant');
            expect(result.primary).toBe('Primary prompt for assistant');
            expect(result.maxTokens).toBe(400);
        });

        it('should handle missing module with defaults', async () => {
            const input = {
                plan: {
                    strategy: 'direct',
                    role: 'assistant'
                },
                factMap: {
                    ExecutionPlan: [],
                    RoleSelection: [],
                    Signal: [],
                    Derived: [],
                    Adaptation: [],
                    TokenMultiplier: [],
                    Capability: [],
                    SelectedPlan: []
                },
                context: mockContext
            };

            const result = await composeInstructions(input, { execLogger: logger });

            expect(result.system).toBe(DEFAULT_INSTRUCTIONS.system);
            expect(result.primary).toBeDefined();
            expect(result.maxTokens).toBeGreaterThan(0);
        });

        it('should handle unknown role gracefully', async () => {
            const input = {
                plan: {
                    strategy: 'direct',
                    role: 'unknown-role'
                },
                factMap: {
                    ExecutionPlan: [],
                    RoleSelection: [],
                    Signal: [],
                    Derived: [],
                    Adaptation: [],
                    TokenMultiplier: [],
                    Capability: [],
                    SelectedPlan: []
                },
                context: mockContext
            };

            const result = await composeInstructions(input, {
                execLogger: logger,
                module: mockModule
            });

            // Should fall back to assistant
            expect(result.system).toBe('System prompt for unknown-role');
            expect(result.maxTokens).toBe(500); // Default fallback
        });

        it('should clamp token budget to safe bounds', async () => {
            const input = {
                plan: {
                    strategy: 'direct',
                    role: 'assistant'
                },
                factMap: {
                    executionPlan: null,
                    RoleSelection: [],
                    Signal: [],
                    Derived: [],
                    Adaptation: [],
                    TokenMultiplier: [
                        { type: 'TokenMultiplier', value: 0.01 } // Very small multiplier
                    ]
                },
                context: mockContext
            };

            const result = await composeInstructions(input, {
                execLogger: logger,
                module: mockModule
            });

            expect(result.maxTokens).toBeGreaterThanOrEqual(50); // Minimum bound
            expect(result.maxTokens).toBeLessThanOrEqual(4000); // Maximum bound
        });

        it('should handle large token multipliers safely', async () => {
            const input = {
                plan: {
                    strategy: 'direct',
                    role: 'assistant',
                    maxTokens: 3000
                },
                factMap: {
                    executionPlan: null,
                    RoleSelection: [],
                    Signal: [],
                    Derived: [],
                    Adaptation: [],
                    TokenMultiplier: [
                        { type: 'TokenMultiplier', value: 10 } // Very large multiplier
                    ]
                },
                context: mockContext
            };

            const result = await composeInstructions(input, {
                execLogger: logger,
                module: mockModule
            });

            expect(result.maxTokens).toBeLessThanOrEqual(4000); // Should be clamped
        });

        it('should handle empty facts array', async () => {
            const input = {
                plan: {
                    strategy: 'direct',
                    role: 'assistant'
                },
                factMap: {
                    ExecutionPlan: [],
                    RoleSelection: [],
                    Signal: [],
                    Derived: [],
                    Adaptation: [],
                    TokenMultiplier: [],
                    Capability: [],
                    SelectedPlan: []
                },
                context: mockContext
            };

            const result = await composeInstructions(input, {
                execLogger: logger,
                module: mockModule
            });

            expect(result).toBeDefined();
            expect(result.adaptations).toBe('');
            expect(result.maxTokens).toBe(400);
        });

        it('should filter out non-signal facts for adaptations', async () => {
            const input = {
                plan: {
                    strategy: 'direct',
                    role: 'assistant'
                },
                factMap: {
                    executionPlan: { type: 'ExecutionPlan', strategy: 'direct' },
                    RoleSelection: [{ type: 'RoleSelection', role: 'analyzer' }],
                    Signal: [{ type: 'Signal', dimension: 'contract', signal: 'explore' }],
                    Derived: [],
                    Adaptation: [],
                    TokenMultiplier: []
                },
                context: mockContext
            };

            const result = await composeInstructions(input, {
                execLogger: logger,
                module: mockModule
            });

            expect(result.adaptations).toBe('Adaptation for explore');
        });

        it('should handle null context', async () => {
            const input = {
                plan: {
                    strategy: 'direct',
                    role: 'assistant'
                },
                factMap: {
                    ExecutionPlan: [],
                    RoleSelection: [],
                    Signal: [],
                    Derived: [],
                    Adaptation: [],
                    TokenMultiplier: [],
                    Capability: [],
                    SelectedPlan: []
                },
                context: null
            };

            const result = await composeInstructions(input, {
                execLogger: logger,
                module: mockModule
            });

            expect(result).toBeDefined();
            expect(result.system).toBeDefined();
            expect(result.primary).toBeDefined();
        });

        it('should deduplicate adaptation signals', async () => {
            const input = {
                plan: {
                    strategy: 'direct',
                    role: 'assistant'
                },
                factMap: {
                    executionPlan: null,
                    RoleSelection: [],
                    Signal: [
                        { type: 'Signal', dimension: 'contract', signal: 'explore' },
                        { type: 'Signal', dimension: 'contract', signal: 'explore' } // Duplicate
                    ],
                    Derived: [],
                    Adaptation: [
                        { type: 'Adaptation', signal: 'explore' } // Adaptation fact
                    ],
                    TokenMultiplier: []
                },
                context: mockContext
            };

            const result = await composeInstructions(input, {
                execLogger: logger,
                module: mockModule
            });

            // Should only include the adaptation once
            const adaptationCount = (result.adaptations.match(/Adaptation for explore/g) || [])
                .length;
            expect(adaptationCount).toBe(1);
        });
    });

    describe('prompt assembly', () => {
        it('should combine all prompt components correctly', async () => {
            const input = {
                plan: {
                    strategy: 'direct',
                    role: 'analyzer'
                },
                factMap: {
                    executionPlan: null,
                    RoleSelection: [],
                    Signal: [
                        { type: 'Signal', dimension: 'claim', signal: 'universal' },
                        { type: 'Signal', dimension: 'support', signal: 'none' }
                    ],
                    Derived: [],
                    Adaptation: [],
                    TokenMultiplier: []
                },
                context: mockContext
            };

            const result = await composeInstructions(input, {
                execLogger: logger,
                module: mockModule
            });

            expect(result.system).toBe('System prompt for analyzer');
            expect(result.primary).toBe('Primary prompt for analyzer');
            expect(result.adaptations).toContain('universal');
            expect(result.adaptations).toContain('none');
            expect(result.lengthGuidance).toBe('Length guidance: standard');
        });

        it('should return flat instruction structure', async () => {
            const input = {
                plan: {
                    strategy: 'direct',
                    role: 'assistant'
                },
                factMap: {
                    ExecutionPlan: [],
                    RoleSelection: [],
                    Signal: [],
                    Derived: [],
                    Adaptation: [],
                    TokenMultiplier: [],
                    Capability: [],
                    SelectedPlan: []
                },
                context: mockContext
            };

            const result = await composeInstructions(input, {
                execLogger: logger,
                module: mockModule
            });

            // Should not have nested instructions.instructions
            expect(result.instructions).toBeUndefined();
            expect(result.system).toBeDefined();
            expect(result.primary).toBeDefined();
            expect(result.adaptations).toBeDefined();
            expect(result.maxTokens).toBeDefined();
        });
    });
});
