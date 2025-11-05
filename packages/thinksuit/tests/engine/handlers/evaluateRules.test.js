import { describe, it, expect, beforeEach } from 'vitest';
import { pino } from '../../../engine/logger.js';

import { evaluateRulesCore as evaluateRules } from '../../../engine/handlers/evaluateRules.js';

describe('evaluateRules Handler', () => {
    let logger;
    let defaultMachineContext;

    beforeEach(() => {
        logger = pino({ level: 'silent' });
        defaultMachineContext = {
            module: { rules: [] },
            execLogger: logger
        };
    });

    describe('Basic Functionality', () => {
        it('should return facts array with input signals preserved', async () => {
            const input = {
                facts: [
                    { type: 'Signal', dimension: 'contract', signal: 'explore', confidence: 0.8 }
                ],
                rules: [], // No rules, should just pass through signals
                context: { traceId: 'test-trace-1' }
            };

            const result = await evaluateRules(input, defaultMachineContext);

            expect(result).toHaveProperty('factMap');
            expect(typeof result.factMap).toBe('object');

            // Should contain the original signal
            expect(result.factMap.Signal).toHaveLength(1);
            expect(result.factMap.Signal[0]).toEqual(input.facts[0]);
        });

        it('should handle empty signals gracefully', async () => {
            const input = {
                facts: [],
                rules: [],
                context: { traceId: 'test-trace-2' }
            };

            const result = await evaluateRules(input, defaultMachineContext);

            expect(result).toHaveProperty('factMap');
            expect(result.factMap.Signal).toEqual([]);
            expect(result.factMap.RoleSelection).toEqual([]);
        });

        it('should handle missing signals property gracefully', async () => {
            const input = {
                facts: [],
                rules: [],
                context: { traceId: 'test-trace-3' }
            };

            const result = await evaluateRules(input, defaultMachineContext);

            expect(result).toHaveProperty('factMap');
            expect(result.factMap.Signal).toEqual([]);
            expect(result.factMap.RoleSelection).toEqual([]);
        });
    });

    describe('Rule Application', () => {
        it('should apply a simple role selection rule', async () => {
            const rules = [
                {
                    name: 'test-explorer-rule',
                    salience: 50,
                    conditions: {
                        all: [
                            {
                                type: 'Signal',
                                test: (s) =>
                                    s.dimension === 'contract' &&
                                    s.signal === 'explore' &&
                                    s.confidence >= 0.7
                            }
                        ]
                    },
                    action: (facts, engine) => {
                        engine.addFact({
                            type: 'RoleSelection',
                            role: 'explorer',
                            confidence: 0.9
                        });
                    }
                }
            ];

            const input = {
                facts: [
                    { type: 'Signal', dimension: 'contract', signal: 'explore', confidence: 0.8 }
                ],
                context: { traceId: 'test-trace-4' }
            };

            const machineContext = {
                ...defaultMachineContext,
                module: { rules }
            };

            const result = await evaluateRules(input, machineContext);

            // Should have both the signal and the derived RoleSelection
            expect(result.factMap.Signal).toHaveLength(1);
            expect(result.factMap.RoleSelection).toHaveLength(1);

            const roleSelection = result.factMap.RoleSelection[0];
            expect(roleSelection).toBeDefined();
            expect(roleSelection.role).toBe('explorer');
            expect(roleSelection.confidence).toBe(0.9);
        });

        it('should apply multiple rules in salience order', async () => {
            const rules = [
                {
                    name: 'high-priority-rule',
                    salience: 100,
                    conditions: {
                        all: [
                            {
                                type: 'Signal',
                                test: (s) =>
                                    s.dimension === 'contract' &&
                                    s.signal === 'ack-only' &&
                                    s.confidence >= 0.7
                            }
                        ]
                    },
                    action: (facts, engine) => {
                        engine.addFact({
                            type: 'RoleSelection',
                            role: 'assistant',
                            confidence: 0.95
                        });
                        engine.addFact({ type: 'ExecutionPlan', strategy: 'direct' });
                    }
                },
                {
                    name: 'low-priority-rule',
                    salience: 10,
                    conditions: {
                        all: [
                            {
                                type: 'Signal',
                                test: (s) => s.dimension === 'contract' && s.signal === 'ack-only'
                            }
                        ]
                    },
                    action: (facts, engine) => {
                        // This should not override the high-priority rule's facts
                        engine.addFact({
                            type: 'RoleSelection',
                            role: 'analyzer',
                            confidence: 0.5
                        });
                    }
                }
            ];

            const input = {
                facts: [
                    { type: 'Signal', dimension: 'contract', signal: 'ack-only', confidence: 0.8 }
                ],
                context: { traceId: 'test-trace-5' }
            };

            const machineContext = {
                ...defaultMachineContext,
                module: { rules }
            };

            const result = await evaluateRules(input, machineContext);

            // Should have signal + RoleSelection + ExecutionPlan
            const roleSelections = result.factMap.RoleSelection;
            const executionPlan = result.factMap.ExecutionPlan[0];

            // High salience rule should fire first
            expect(roleSelections[0].role).toBe('assistant');
            expect(roleSelections[0].confidence).toBe(0.95);

            expect(executionPlan).toBeDefined();
            expect(executionPlan.strategy).toBe('direct');
        });

        it('should handle complex orchestration rules', async () => {
            const rules = [
                {
                    name: 'explore-then-analyze',
                    salience: 50,
                    conditions: {
                        all: [
                            {
                                type: 'Signal',
                                test: (s) =>
                                    s.dimension === 'contract' &&
                                    s.signal === 'explore' &&
                                    s.confidence >= 0.7
                            },
                            {
                                type: 'Signal',
                                test: (s) =>
                                    s.dimension === 'claim' &&
                                    s.signal === 'high-quantifier' &&
                                    s.confidence >= 0.6
                            }
                        ]
                    },
                    action: (facts, engine) => {
                        engine.addFact({
                            type: 'ExecutionPlan',
                            strategy: 'sequential',
                            sequence: ['explorer', 'analyzer'],
                            confidence: 0.85
                        });
                    }
                }
            ];

            const input = {
                facts: [
                    { type: 'Signal', dimension: 'contract', signal: 'explore', confidence: 0.75 },
                    {
                        type: 'Signal',
                        dimension: 'claim',
                        signal: 'high-quantifier',
                        confidence: 0.65
                    }
                ],
                context: { traceId: 'test-trace-6' }
            };

            const machineContext = {
                ...defaultMachineContext,
                module: { rules }
            };

            const result = await evaluateRules(input, machineContext);

            const executionPlan = result.factMap.ExecutionPlan[0];
            expect(executionPlan).toBeDefined();
            expect(executionPlan.strategy).toBe('sequential');
            expect(executionPlan.sequence).toEqual(['explorer', 'analyzer']);
            expect(executionPlan.confidence).toBe(0.85);
        });

        it('should apply default fallback rule when no other rules match', async () => {
            const rules = [
                {
                    name: 'specific-rule',
                    salience: 50,
                    conditions: {
                        all: [
                            {
                                type: 'Signal',
                                test: (s) =>
                                    s.dimension === 'contract' &&
                                    s.signal === 'analyze' &&
                                    s.confidence >= 0.7
                            }
                        ]
                    },
                    action: (facts, engine) => {
                        engine.addFact({
                            type: 'RoleSelection',
                            role: 'analyzer',
                            confidence: 0.9
                        });
                    }
                },
                {
                    name: 'default-assistant',
                    salience: 0, // Lowest priority
                    conditions: {
                        test: (facts) => {
                            const hasRoleSelection = facts.some((f) => f.type === 'RoleSelection');
                            return !hasRoleSelection;
                        }
                    },
                    action: (facts, engine) => {
                        engine.addFact({
                            type: 'RoleSelection',
                            role: 'assistant',
                            confidence: 0.7
                        });
                        engine.addFact({ type: 'ExecutionPlan', strategy: 'direct' });
                    }
                }
            ];

            const input = {
                facts: [
                    // Signal that won't match the specific rule (confidence too low)
                    { type: 'Signal', dimension: 'contract', signal: 'analyze', confidence: 0.5 }
                ],
                context: { traceId: 'test-trace-7' }
            };

            const machineContext = {
                ...defaultMachineContext,
                module: { rules }
            };

            const result = await evaluateRules(input, machineContext);

            const roleSelection = result.factMap.RoleSelection[0];
            expect(roleSelection).toBeDefined();
            expect(roleSelection.role).toBe('assistant');
            expect(roleSelection.confidence).toBe(0.7);

            const executionPlan = result.factMap.ExecutionPlan[0];
            expect(executionPlan).toBeDefined();
            expect(executionPlan.strategy).toBe('direct');
        });

        it('should generate composite adaptations', async () => {
            const rules = [
                {
                    name: 'high-certainty-no-date-composite',
                    salience: 20,
                    conditions: {
                        all: [
                            {
                                type: 'Signal',
                                test: (s) =>
                                    s.dimension === 'calibration' &&
                                    s.signal === 'high-certainty' &&
                                    s.confidence >= 0.7
                            },
                            {
                                type: 'Signal',
                                test: (s) =>
                                    s.dimension === 'temporal' &&
                                    s.signal === 'no-date' &&
                                    s.confidence >= 0.7
                            }
                        ]
                    },
                    action: (facts, engine) => {
                        engine.addFact({
                            type: 'Derived',
                            name: 'temporal-certainty-mismatch',
                            instruction:
                                'Qualify confidence with dated evidence or reduce certainty',
                            confidence: 0.9
                        });
                    }
                }
            ];

            const input = {
                facts: [
                    {
                        type: 'Signal',
                        dimension: 'calibration',
                        signal: 'high-certainty',
                        confidence: 0.75
                    },
                    { type: 'Signal', dimension: 'temporal', signal: 'no-date', confidence: 0.8 }
                ],
                context: { traceId: 'test-trace-8' }
            };

            const machineContext = {
                ...defaultMachineContext,
                module: { rules }
            };

            const result = await evaluateRules(input, machineContext);

            const derived = result.factMap.Derived[0];
            expect(derived).toBeDefined();
            expect(derived.name).toBe('temporal-certainty-mismatch');
            expect(derived.instruction).toContain('dated evidence');
            expect(derived.confidence).toBe(0.9);
        });

        it('should handle token multiplier rules', async () => {
            const rules = [
                {
                    name: 'reduce-tokens-brief',
                    salience: 15,
                    conditions: {
                        all: [
                            {
                                type: 'Signal',
                                test: (s) =>
                                    s.dimension === 'contract' &&
                                    s.signal === 'ack-only' &&
                                    s.confidence >= 0.8
                            }
                        ]
                    },
                    action: (facts, engine) => {
                        engine.addFact({ type: 'TokenMultiplier', value: 0.4 });
                    }
                }
            ];

            const input = {
                facts: [
                    { type: 'Signal', dimension: 'contract', signal: 'ack-only', confidence: 0.85 }
                ],
                context: { traceId: 'test-trace-9' }
            };

            const machineContext = {
                ...defaultMachineContext,
                module: { rules }
            };

            const result = await evaluateRules(input, machineContext);

            const tokenMultiplier = result.factMap.TokenMultiplier[0];
            expect(tokenMultiplier).toBeDefined();
            expect(tokenMultiplier.value).toBe(0.4);
        });
    });

    describe('Loop Detection', () => {
        it('should detect and prevent infinite rule loops', async () => {
            // Create rules that would cause an infinite loop
            const rules = [
                {
                    name: 'loop-rule-1',
                    salience: 50,
                    conditions: {
                        all: [
                            {
                                type: 'Signal',
                                test: (s) => s.dimension === 'test' && s.signal === 'trigger'
                            }
                        ]
                    },
                    action: (facts, engine) => {
                        engine.addFact({ type: 'Intermediate', value: 'A' });
                    }
                },
                {
                    name: 'loop-rule-2',
                    salience: 40,
                    conditions: {
                        all: [
                            {
                                type: 'Intermediate',
                                test: (i) => i.value === 'A'
                            }
                        ]
                    },
                    action: (facts, engine) => {
                        // This would create a loop by adding a new fact that triggers rule 1 again
                        engine.addFact({
                            type: 'Signal',
                            dimension: 'test',
                            signal: 'trigger',
                            confidence: 1.0
                        });
                    }
                }
            ];

            const input = {
                facts: [{ type: 'Signal', dimension: 'test', signal: 'trigger', confidence: 0.8 }],
                context: { traceId: 'test-trace-loop' }
            };

            const machineContext = {
                ...defaultMachineContext,
                module: { rules }
            };

            const result = await evaluateRules(input, machineContext);

            // Should return facts but with loop detected
            expect(result).toHaveProperty('factMap');
            expect(result).toHaveProperty('metrics');
            expect(result.metrics.loopDetected).toBe(true);
            expect(result.metrics.iterations).toBeLessThanOrEqual(32); // Blueprint specifies 32 max
        });

        it('should respect maximum iteration limit', async () => {
            // This test verifies that the engine respects our 32-cycle limit from the blueprint

            // Create a rule that forms a chain reaction by creating new facts that match its condition
            const rules = [
                {
                    name: 'chain-reaction',
                    salience: 50,
                    conditions: {
                        type: 'ChainLink',
                        test: (link) => link.id < 100 // Would create 100 facts if not stopped
                    },
                    action: (facts, engine) => {
                        const links = facts.filter((f) => f.data.type === 'ChainLink');
                        const maxId = Math.max(...links.map((l) => l.data.id));
                        // Each cycle creates a new fact that will trigger the rule again
                        engine.addFact({ type: 'ChainLink', id: maxId + 1 });
                    }
                }
            ];

            const input = {
                // Start with one fact to trigger the chain reaction
                facts: [{ type: 'ChainLink', id: 0 }],
                context: { traceId: 'test-trace-iterations' }
            };

            const machineContext = {
                ...defaultMachineContext,
                module: { rules }
            };

            const result = await evaluateRules(input, machineContext);

            // With maxCycles set to 32, the engine should hit that limit
            expect(result.metrics.iterations).toBeLessThanOrEqual(32);
            expect(result.metrics.loopDetected).toBe(true);
        });
    });

    describe('Performance', () => {
        it('should complete within 100ms for typical rule sets', async () => {
            // Load the actual core module rules for a realistic test
            const { default: coreModule } = await import(
                'thinksuit-modules'
            );

            const input = {
                facts: [
                    { type: 'Signal', dimension: 'contract', signal: 'explore', confidence: 0.8 },
                    { type: 'Signal', dimension: 'claim', signal: 'universal', confidence: 0.7 },
                    {
                        type: 'Signal',
                        dimension: 'support',
                        signal: 'source-cited',
                        confidence: 0.75
                    },
                    {
                        type: 'Signal',
                        dimension: 'calibration',
                        signal: 'high-certainty',
                        confidence: 0.8
                    },
                    {
                        type: 'Signal',
                        dimension: 'temporal',
                        signal: 'time-specified',
                        confidence: 0.9
                    }
                ],
                context: { traceId: 'test-trace-perf' }
            };

            const machineContext = {
                ...defaultMachineContext,
                module: { rules: coreModule.rules }
            };

            const startTime = Date.now();
            const result = await evaluateRules(input, machineContext);
            const duration = Date.now() - startTime;

            expect(duration).toBeLessThan(100); // Blueprint specifies <100ms
            expect(result.factMap).toBeDefined();
            // Should have derived facts
            const totalFacts =
                (result.factMap.executionPlan ? 1 : 0) +
                result.factMap.RoleSelection.length +
                result.factMap.Signal.length +
                result.factMap.Derived.length +
                result.factMap.Adaptation.length +
                result.factMap.TokenMultiplier.length;
            expect(totalFacts).toBeGreaterThanOrEqual(5);
        });
    });

    describe('Error Handling', () => {
        it('should handle rule execution errors gracefully', async () => {
            const rules = [
                {
                    name: 'error-rule',
                    salience: 50,
                    conditions: {
                        all: [
                            {
                                type: 'Signal',
                                test: (s) => s.dimension === 'test'
                            }
                        ]
                    },
                    action: () => {
                        throw new Error('Rule execution failed');
                    }
                }
            ];

            const input = {
                facts: [{ type: 'Signal', dimension: 'test', signal: 'trigger', confidence: 0.8 }],
                context: { traceId: 'test-trace-error' }
            };

            const machineContext = {
                ...defaultMachineContext,
                module: { rules }
            };

            const result = await evaluateRules(input, machineContext);

            // Should handle error gracefully and return original signals at minimum
            expect(result).toHaveProperty('factMap');
            expect(result.factMap.Signal.length).toBeGreaterThanOrEqual(1);

            // Should indicate error in metrics
            expect(result).toHaveProperty('metrics');
            expect(result.metrics.error).toBeDefined();
        });

        it('should handle malformed rules gracefully', async () => {
            const rules = [
                {
                    name: 'malformed-rule',
                    // Missing salience
                    conditions: null, // Invalid conditions
                    action: 'not-a-function' // Invalid action
                }
            ];

            const input = {
                facts: [{ type: 'Signal', dimension: 'test', signal: 'trigger', confidence: 0.8 }],
                context: { traceId: 'test-trace-malformed' }
            };

            const machineContext = {
                ...defaultMachineContext,
                module: { rules }
            };

            const result = await evaluateRules(input, machineContext);

            // Should handle malformed rules and return original signals
            expect(result).toHaveProperty('factMap');
            expect(result.factMap.Signal).toHaveLength(1);
            expect(result.factMap.Signal[0]).toEqual(input.facts[0]);
        });

        it('should handle null or undefined inputs', async () => {
            const result1 = await evaluateRules(null, defaultMachineContext);
            expect(result1).toHaveProperty('factMap');
            expect(result1.factMap.Signal).toEqual([]);

            const result2 = await evaluateRules(undefined, defaultMachineContext);
            expect(result2).toHaveProperty('factMap');
            expect(result2.factMap.Signal).toEqual([]);

            const result3 = await evaluateRules({}, defaultMachineContext);
            expect(result3).toHaveProperty('factMap');
            expect(result3.factMap.Signal).toEqual([]);
        });
    });

    describe('Metrics and Observability', () => {
        it('should provide metrics about rule evaluation', async () => {
            const rules = [
                {
                    name: 'metric-rule',
                    salience: 50,
                    conditions: {
                        all: [
                            {
                                type: 'Signal',
                                test: (s) => s.dimension === 'contract' && s.signal === 'explore'
                            }
                        ]
                    },
                    action: (facts, engine) => {
                        engine.addFact({
                            type: 'RoleSelection',
                            role: 'explorer',
                            confidence: 0.9
                        });
                    }
                }
            ];

            const input = {
                facts: [
                    { type: 'Signal', dimension: 'contract', signal: 'explore', confidence: 0.8 }
                ],
                context: { traceId: 'test-trace-metrics' }
            };

            const machineContext = {
                ...defaultMachineContext,
                module: { rules }
            };

            const result = await evaluateRules(input, machineContext);

            expect(result).toHaveProperty('metrics');
            expect(result.metrics).toHaveProperty('duration');
            expect(result.metrics.duration).toBeGreaterThanOrEqual(0);
        });

        it('should merge custom provenance fields with auto-injected ones', async () => {
            const rules = [
                {
                    name: 'custom-provenance-rule',
                    salience: 100,
                    conditions: {
                        all: [
                            {
                                type: 'Signal',
                                test: (s) => s.dimension === 'contract'
                            }
                        ]
                    },
                    action: (facts, engine) => {
                        // Add fact with custom provenance fields
                        engine.addFact({
                            type: 'RoleSelection',
                            role: 'analyzer',
                            provenance: {
                                tier: 2,
                                confidence: 0.95,
                                customField: 'preserved'
                            }
                        });
                    }
                }
            ];

            const input = {
                facts: [
                    { type: 'Signal', dimension: 'contract', signal: 'analyze' }
                ],
                context: { traceId: 'test-provenance-merge' }
            };

            const machineContext = {
                ...defaultMachineContext,
                module: { rules }
            };

            const result = await evaluateRules(input, machineContext);

            // Check the RoleSelection fact has merged provenance
            const roleSelection = result.factMap.RoleSelection[0];
            expect(roleSelection.provenance).toBeDefined();
            expect(roleSelection.provenance.source).toBe('rule'); // Auto-injected
            expect(roleSelection.provenance.producer).toBe('custom-provenance-rule'); // Auto-injected
            expect(roleSelection.provenance.tier).toBe(2); // Custom field preserved
            expect(roleSelection.provenance.confidence).toBe(0.95); // Custom field preserved
            expect(roleSelection.provenance.customField).toBe('preserved'); // Custom field preserved
        });
    });
});
