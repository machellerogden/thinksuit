/**
 * Mu Module Integration Tests
 *
 * Verifies the mu module works as a complete cognitive system.
 * Tests real module components working together, optionally with real LLM.
 */

import { describe, it, expect } from 'vitest';
import module from '../index.js';
import { RulesEngine } from 'the-rules-engine';
import { createLogger } from '../../../thinksuit/engine/logger.js';

// Create logger for tests that need it
const testLogger = createLogger({ level: 'silent' });

// Determine if we should use real LLM
const useRealLLM = process.env.TEST_INTEGRATION === 'true';

describe('Mu Module', () => {
    describe('module structure', () => {
        it('exports required module interface', () => {
            expect(module).toHaveProperty('namespace', 'thinksuit');
            expect(module).toHaveProperty('name', 'mu');
            expect(module.version).toMatch(/^\d+\.\d+\.\d+$/);
            expect(module).toHaveProperty('roles');
            expect(module).toHaveProperty('classifiers');
            expect(module).toHaveProperty('rules');
            expect(module).toHaveProperty('signals');
            expect(module).toHaveProperty('adaptations');
            expect(module).toHaveProperty('lengthGuidance');
        });

        it('defines all 11 cognitive roles', () => {
            expect(Array.isArray(module.roles)).toBe(true);
            expect(module.roles.length).toBe(11);

            const roleNames = module.roles.map(r => r.name);
            const expectedRoles = [
                'assistant',
                'analyzer',
                'synthesizer',
                'critic',
                'planner',
                'reflector',
                'explorer',
                'optimizer',
                'integrator',
                'outer_voice',
                'inner_voice'
            ];
            expect(roleNames).toEqual(expectedRoles);
        });

        it('has prompts for every role', () => {
            module.roles.forEach((role) => {
                // Check prompts exist in role configuration
                expect(role.prompts).toBeDefined();
                expect(role.prompts.system).toBeDefined();
                expect(role.prompts.primary).toBeDefined();
                expect(typeof role.prompts.system).toBe('string');
                expect(typeof role.prompts.primary).toBe('string');
            });
        });

        it('has temperature settings for every role', () => {
            module.roles.forEach((role) => {
                expect(role.temperature).toBeDefined();
                expect(role.temperature).toBeGreaterThanOrEqual(0);
                expect(role.temperature).toBeLessThanOrEqual(1);
            });
        });
    });

    describe('signal detection', () => {
        const testCases = [
            {
                input: 'Every single person needs to understand this',
                expected: { dimension: 'claim', signal: 'universal' },
                description: 'detects universal claims'
            },
            {
                input: 'According to the research paper by Smith et al',
                expected: { dimension: 'support', signal: 'source-cited' },
                description: 'detects cited sources'
            },
            {
                input: 'I am absolutely certain about this',
                expected: { dimension: 'calibration', signal: 'high-certainty' },
                description: 'detects high certainty'
            },
            {
                input: 'This needs to be done by December 31st, 2024',
                expected: { dimension: 'temporal', signal: 'time-specified' },
                description: 'detects specific times'
            },
            {
                input: 'Analyze the performance metrics',
                expected: { dimension: 'contract', signal: 'analyze' },
                description: 'detects analyze contract'
            }
        ];

        testCases.forEach(({ input, expected, description }) => {
            it(description, async () => {
                const thread = [{ role: 'user', content: input }];
                const config = useRealLLM
                    ? {
                        provider: 'openai',
                        apiKey: process.env.OPENAI_API_KEY,
                        model: 'gpt-4o-mini'
                    }
                    : null;

                const classifier = module.classifiers[expected.dimension];
                const signals = await classifier(thread, config, testLogger);

                const foundSignal = signals.find((s) => s.signal === expected.signal);
                expect(foundSignal).toBeDefined();
                expect(foundSignal.confidence).toBeGreaterThan(0.6);
            });
        });

        it('detects multiple signals from complex input', async () => {
            const thread = [
                {
                    role: 'user',
                    content: 'Everyone must analyze this data from the Smith 2023 paper by Friday'
                }
            ];

            const config = useRealLLM
                ? {
                    provider: 'openai',
                    apiKey: process.env.OPENAI_API_KEY,
                    model: 'gpt-4o-mini'
                }
                : null;

            const allSignals = [];
            for (const [dimension, classifier] of Object.entries(module.classifiers)) {
                const signals = await classifier(thread, config, testLogger);
                allSignals.push(...signals.map((s) => ({ ...s, dimension })));
            }

            // Should detect signals across multiple dimensions
            const dimensions = [...new Set(allSignals.map((s) => s.dimension))];
            expect(dimensions.length).toBeGreaterThan(2);
        });
    });

    describe('rule evaluation', () => {
        // Helper function to run engine with facts
        function runEngine(facts) {
            const engine = new RulesEngine();
            module.rules.forEach((rule) => engine.addRule(rule));
            facts.forEach((fact) => engine.addFact(fact));
            engine.run();
            return engine.query().execute();
        }

        // Helper to find fact by type
        function findFactByType(facts, type) {
            const fact = facts.find((f) => f.data.type === type);
            return fact ? fact.data : undefined;
        }

        it('selects analyzer role for analyze contract', () => {
            const facts = [
                { type: 'Signal', dimension: 'contract', signal: 'analyze', confidence: 0.8 }
            ];

            const results = runEngine(facts);
            const roleSelection = findFactByType(results, 'RoleSelection');

            expect(roleSelection).toBeDefined();
            expect(roleSelection.role).toBe('analyzer');
        });

        it('selects reflector role for normative claims', () => {
            const facts = [
                { type: 'Signal', dimension: 'claim', signal: 'normative', confidence: 0.8 }
            ];

            const results = runEngine(facts);
            const roleSelection = findFactByType(results, 'RoleSelection');

            // Normative claims trigger reflector role (checking assumptions)
            expect(roleSelection?.role).toBe('reflector');
        });

        it('applies composite rules for multiple signals', () => {
            const facts = [
                { type: 'Signal', dimension: 'claim', signal: 'forecast', confidence: 0.8 },
                { type: 'Signal', dimension: 'temporal', signal: 'time-specified', confidence: 0.9 }
            ];

            const results = runEngine(facts);
            const roleSelection = findFactByType(results, 'RoleSelection');

            // Forecast + time should trigger planner
            expect(roleSelection?.role).toBe('planner');
        });

        it('generates execution plan for signals', () => {
            const facts = [
                { type: 'Signal', dimension: 'support', signal: 'source-cited', confidence: 0.9 }
            ];

            const results = runEngine(facts);
            const executionPlan = findFactByType(results, 'ExecutionPlan');

            // Source-cited signals should generate an execution plan
            expect(executionPlan).toBeDefined();
            expect(executionPlan.strategy).toBeDefined();
        });
    });

    describe('instruction composition', () => {
        it('assembles correct prompts for each role', () => {
            module.roles.forEach((role) => {
                expect(role.prompts.system).toBeDefined();
                expect(role.prompts.primary).toBeDefined();
                expect(typeof role.prompts.system).toBe('string');
                expect(typeof role.prompts.primary).toBe('string');
            });
        });

        it('calculates tokens based on role and signals', () => {
            // Role defaults (from role config)
            const assistant = module.roles.find(r => r.name === 'assistant');
            const analyzer = module.roles.find(r => r.name === 'analyzer');
            expect(assistant.baseTokens).toBe(400);
            expect(analyzer.baseTokens).toBe(800);

            // Signal multipliers
            expect(module.signals['none'].tokenMultiplier).toBe(0.85);
            expect(module.signals['analyze'].tokenMultiplier).toBe(1.1);

            // Calculate example: analyzer with analyze signal
            const baseTokens = analyzer.baseTokens;
            const multiplier = module.signals['analyze'].tokenMultiplier;
            const calculated = Math.floor(baseTokens * multiplier);

            expect(calculated).toBe(880);
        });

        it('includes adaptations for detected signals', () => {
            // Check adaptation prompts exist
            const adaptSignals = ['source-cited', 'high-quantifier', 'normative', 'forecast'];

            adaptSignals.forEach((signal) => {
                expect(module.signals[signal]).toBeDefined();
                expect(module.signals[signal].adaptation).toBeDefined();
                expect(typeof module.signals[signal].adaptation).toBe('string');
                expect(module.signals[signal].adaptation.length).toBeGreaterThan(0);
            });
        });
    });

    describe('module coherence', () => {
        it('has consistent role references across components', () => {
            // Every role should have:
            // - prompts (system + primary)
            // - temperature
            // - base tokens

            module.roles.forEach((role) => {
                expect(role.prompts).toBeDefined();
                expect(role.prompts.system).toBeDefined();
                expect(role.prompts.primary).toBeDefined();
                expect(role.temperature).toBeDefined();
                expect(role.baseTokens).toBeDefined();
            });
        });

        it('all signals with multipliers have valid structure', () => {
            // Check signals with multipliers
            const signalsWithMultipliers = Object.entries(module.signals)
                .filter(([_, config]) => config.tokenMultiplier !== undefined);

            expect(signalsWithMultipliers.length).toBeGreaterThan(0);

            signalsWithMultipliers.forEach(([signalName, config]) => {
                expect(typeof config.tokenMultiplier).toBe('number');
                expect(config.tokenMultiplier).toBeGreaterThan(0);
            });
        });
    });

    //  TODO
    //  if (useRealLLM) {
    //      describe('end-to-end with LLM', () => {
    //          it('produces coherent response for analytical request', async () => {
    //              // This would test the full pipeline with real LLM
    //              // Only runs when TEST_INTEGRATION=true
    //
    //              // const input = 'Analyze the implications of quantum computing on cryptography';
    //
    //              // Would need to wire up full pipeline here
    //              // For now, marking as TODO
    //              expect(true).toBe(true);
    //          }, 30000); // 30s timeout for LLM call
    //      });
    //  }
});
