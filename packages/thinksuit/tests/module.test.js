import { describe, it, expect } from 'vitest';

import module from 'thinksuit-modules';

describe('Mu Module', () => {
    describe('Module Structure', () => {
        it('should export required manifest fields', () => {
            expect(module.namespace).toBe('thinksuit');
            expect(module.name).toBe('mu');
            expect(module.version).toMatch(/^\d+\.\d+\.\d+$/);
            expect(module.description).toBeDefined();
            expect(module.author).toBeDefined();
            expect(module.license).toBeDefined();
        });

        it('should define all 11 cognitive roles', () => {
            expect(module.roles).toEqual([
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
            ]);
        });

        it('should export prompts, classifiers, and rules', () => {
            expect(module.prompts).toBeDefined();
            expect(module.classifiers).toBeDefined();
            expect(module.rules).toBeDefined();
        });
    });

    describe('Instruction Schema', () => {
        it('should provide prompt accessor functions', () => {
            const { prompts } = module.instructionSchema;
            expect(typeof prompts.system).toBe('function');
            expect(typeof prompts.primary).toBe('function');
            expect(typeof prompts.adaptation).toBe('function');
            expect(typeof prompts.length).toBe('function');
        });

        it('should return system prompts for each role', () => {
            const { prompts } = module.instructionSchema;
            module.roles.forEach((role) => {
                const systemPrompt = prompts.system(role);
                expect(systemPrompt).toBeDefined();
                expect(typeof systemPrompt).toBe('string');
                expect(systemPrompt.length).toBeGreaterThan(50);
            });
        });

        it('should return primary prompts for each role', () => {
            const { prompts } = module.instructionSchema;
            module.roles.forEach((role) => {
                const primaryPrompt = prompts.primary(role);
                expect(primaryPrompt).toBeDefined();
                expect(typeof primaryPrompt).toBe('string');
                expect(primaryPrompt.length).toBeGreaterThan(50);
            });
        });

        it('should define token defaults for all roles', () => {
            const { roleDefaults } = module.instructionSchema.tokens;
            expect(roleDefaults.assistant).toBe(400);
            expect(roleDefaults.analyzer).toBe(800);
            expect(roleDefaults.synthesizer).toBe(1000);
            expect(roleDefaults.critic).toBe(600);
            expect(roleDefaults.planner).toBe(800);
            expect(roleDefaults.reflector).toBe(600);
            expect(roleDefaults.explorer).toBe(1000);
            expect(roleDefaults.optimizer).toBe(600);
            expect(roleDefaults.integrator).toBe(1000);
            expect(roleDefaults.outer_voice).toBe(500);
            expect(roleDefaults.inner_voice).toBe(700);
        });

        it('should define signal multipliers', () => {
            const { signalMultipliers } = module.instructionSchema.tokens;
            expect(signalMultipliers['support.none']).toBe(0.85);
            expect(signalMultipliers['calibration.high-certainty']).toBe(0.9);
            expect(signalMultipliers['temporal.no-date']).toBe(0.95);
            expect(signalMultipliers['contract.ack-only']).toBe(0.5);
            expect(signalMultipliers['contract.explore']).toBe(1.2);
        });
    });

    describe('Prompts', () => {
        it('should have adaptations for all 16 signals', () => {
            const signals = [
                'universal',
                'high-quantifier',
                'forecast',
                'normative',
                'source-cited',
                'tool-result-attached',
                'anecdote',
                'none',
                'high-certainty',
                'hedged',
                'time-specified',
                'no-date',
                'ack-only',
                'capture-only',
                'explore',
                'analyze'
            ];

            signals.forEach((signal) => {
                const adaptation = module.prompts[`adapt.${signal}`];
                expect(adaptation).toBeDefined();
                expect(typeof adaptation).toBe('string');
                expect(adaptation.length).toBeGreaterThan(20);
            });
        });

        it('should have length directives', () => {
            expect(module.prompts['length.brief']).toBeDefined();
            expect(module.prompts['length.standard']).toBeDefined();
            expect(module.prompts['length.comprehensive']).toBeDefined();
        });
    });

    describe('Classifiers', () => {
        it('should export all 5 dimension classifiers', () => {
            expect(typeof module.classifiers.claim).toBe('function');
            expect(typeof module.classifiers.support).toBe('function');
            expect(typeof module.classifiers.calibration).toBe('function');
            expect(typeof module.classifiers.temporal).toBe('function');
            expect(typeof module.classifiers.contract).toBe('function');
        });
    });

    describe('Rules', () => {
        it('should be an array of rule objects', () => {
            expect(Array.isArray(module.rules)).toBe(true);
            expect(module.rules.length).toBeGreaterThan(0);
        });

        it('should have properly structured rules', () => {
            module.rules.forEach((rule) => {
                expect(rule.name).toBeDefined();
                expect(typeof rule.name).toBe('string');
                expect(rule.salience).toBeDefined();
                expect(typeof rule.salience).toBe('number');
                expect(rule.conditions).toBeDefined();
                expect(typeof rule.action).toBe('function');
            });
        });

        it('should have high-priority contract rules', () => {
            const ackRule = module.rules.find((r) => r.name === 'respect-ack-or-capture');
            expect(ackRule).toBeDefined();
            expect(ackRule.salience).toBe(100);
        });

        it('should have default fallback rule', () => {
            const defaultRule = module.rules.find((r) => r.name === 'default-assistant');
            expect(defaultRule).toBeDefined();
            expect(defaultRule.salience).toBe(0);
        });
    });

    describe('Orchestration', () => {
        it('should provide formatResponse function', () => {
            expect(typeof module.orchestration.formatResponse).toBe('function');
        });

        it('should format responses correctly', () => {
            const results = [
                { role: 'analyzer', content: 'Analysis result' },
                { role: 'critic', content: 'Critique result' }
            ];
            const formatted = module.orchestration.formatResponse(results);
            expect(formatted).toContain('[analyzer]');
            expect(formatted).toContain('Analysis result');
            expect(formatted).toContain('[critic]');
            expect(formatted).toContain('Critique result');
        });

        it('should handle non-array results', () => {
            const singleResult = 'Direct response';
            const formatted = module.orchestration.formatResponse(singleResult);
            expect(formatted).toBe('Direct response');
        });
    });
});
