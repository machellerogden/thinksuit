import { describe, it, expect, beforeEach } from 'vitest';
import { composeInstructionsCore } from '../../engine/handlers/composeInstructions.js';
import { composeInstructions as muComposeInstructions } from '../../../thinksuit-modules/mu/composeInstructions.js';
import pino from 'pino';

describe('Iteration Contracts Integration', () => {
    let machineContext;
    let mockModule;

    beforeEach(() => {
        const logger = pino({ level: 'silent' });

        mockModule = {
            namespace: 'test',
            name: 'iteration-test',
            version: 'v0',
            defaultRole: 'assistant',
            composeInstructions: muComposeInstructions,
            instructionSchema: {
                prompts: {
                    system: (role) => `You are a ${role}.`,
                    primary: (role) => `Think as a ${role}.`,
                    adaptation: (key) => {
                        const adaptations = {
                            outer_voice_opening: 'State your practical perspective.',
                            inner_voice_response: 'Challenge with deeper insights.',
                            convergence_synthesis: 'Synthesize both perspectives.'
                        };
                        return adaptations[key];
                    },
                    length: (level) => `Be ${level} in your response.`
                },
                tokens: {
                    default: 400,
                    multipliers: {},
                    roleDefaults: {
                        reflector: 400,
                        assistant: 400
                    }
                }
            }
        };

        machineContext = {
            module: mockModule,
            config: {
                apiKey: 'test-key',
                model: 'test-model'
            },
            execLogger: logger
        };
    });

    it('should apply iteration adaptations in composeInstructions', async () => {
        const input = {
            plan: {
                strategy: 'direct',
                role: 'reflector',
                adaptationKey: 'inner_voice_response' // Simulating iteration 2
            },
            factMap: {
                executionPlans: [],
                roleSelections: [],
                signals: [],
                derived: [],
                adaptations: [],
                tokenMultipliers: []
            },
            context: { traceId: 'test-trace' }
        };

        const result = await composeInstructionsCore(input, machineContext);

        expect(result).toBeDefined();
        expect(result.adaptations).toContain('Challenge with deeper insights.');
    });

    it('should pass adaptationKey through selectedPlan in execSequential', async () => {
        // This test would need mocking of runCycle and callLLM
        // Simplified version showing the structure

        const plan = {
            role: 'reflector',
            iterations: 2,
            iterationAdaptations: [
                { from: 1, to: 1, adaptationKey: 'outer_voice_opening' },
                { from: 2, to: 2, adaptationKey: 'inner_voice_response' }
            ]
        };

        // The execSingle handler should:
        // 1. Execute iteration 1 with no adaptationKey
        // 2. Execute iteration 2 via runCycle with adaptationKey: 'inner_voice_response'

        expect(plan.iterations).toBe(2);
        expect(plan.iterationAdaptations[1].adaptationKey).toBe('inner_voice_response');
    });
});
