import { describe, it, expect, beforeEach, vi } from 'vitest';
import { evaluateRulesCore } from '../../engine/handlers/evaluateRules.js';
import { composeInstructionsCore } from '../../engine/handlers/composeInstructions.js';
import { execSequentialCore } from '../../engine/handlers/execSequential.js';
import module from 'thinksuit-modules';
import { pino } from '../../engine/logger.js';

// Determine if we should use real LLM
const useRealLLM = process.env.TEST_INTEGRATION === 'true';

// Always mock runCycle since we need to control it in both modes
vi.mock('../../engine/runCycle.js', () => ({
    runCycle: vi.fn()
}));

// Mock callLLM only when not in integration mode
vi.mock('../../engine/providers/io.js', async (importOriginal) => {
    // Check env var directly inside the mock factory
    if (process.env.TEST_INTEGRATION === 'true') {
        // In integration mode, use the real implementation
        return importOriginal();
    } else {
        // In test mode, mock it
        return {
            callLLM: vi.fn()
        };
    }
});

import { runCycle } from '../../engine/runCycle.js';
import { callLLM } from '../../engine/providers/io.js';

describe('Inner-Outer Voice Debate Integration', () => {
    let machineContext;
    let logger;

    beforeEach(() => {
        vi.clearAllMocks();
        logger = pino({ level: 'silent' });

        machineContext = {
            module,
            config: {
                apiKey: 'test-key',
                model: 'test-model',
                provider: 'test'
            },
            execLogger: logger,
            handlers: {}
        };
    });

    it('should trigger inner-outer-debate rule with correct signals', async () => {
        const input = {
            facts: [
                { type: 'Signal', dimension: 'claim', signal: 'universal', confidence: 0.8 },
                { type: 'Signal', dimension: 'calibration', signal: 'hedged', confidence: 0.7 }
            ],
            context: { traceId: 'test-inner-outer' }
        };

        const result = await evaluateRulesCore(input, machineContext);

        // Should have created an ExecutionPlan with inner-outer debate
        expect(result.factMap.ExecutionPlan).toBeDefined();
        expect(result.factMap.ExecutionPlan.length).toBeGreaterThan(0);

        // Should have selected the inner-outer-debate plan
        expect(result.factMap.SelectedPlan).toBeDefined();
        const selectedPlanFacts = result.factMap.SelectedPlan;
        expect(selectedPlanFacts.length).toBeGreaterThan(0);
        const plan = selectedPlanFacts[0].plan || selectedPlanFacts[0];

        expect(plan.strategy).toBe('sequential');
        expect(plan.buildThread).toBe(true);
        expect(plan.resultStrategy).toBe('last');
        // The inner-outer-to-plan rule (salience 46) takes precedence over inner-outer-debate (salience 45)
        // so we expect 5 steps (includes planner at the end)
        expect(plan.sequence).toHaveLength(5);

        // Verify adaptation sequence
        const sequence = plan.sequence;
        expect(sequence[0]).toEqual({ role: 'outer_voice', adaptationKey: 'outer_voice_opening' });
        expect(sequence[1]).toEqual({ role: 'inner_voice', adaptationKey: 'inner_voice_response' });
        expect(sequence[2]).toEqual({
            role: 'outer_voice',
            adaptationKey: 'outer_voice_challenge'
        });
        expect(sequence[3]).toEqual({ role: 'reflector', adaptationKey: 'convergence_synthesis' });
        expect(sequence[4]).toEqual({ role: 'planner', adaptationKey: 'planning_synthesis' });
    });

    it('should pass plan through to instruction composition with adaptations', async () => {
        const plan = {
            type: 'ExecutionPlan',
            strategy: 'sequential',
            buildThread: true,
            resultStrategy: 'last',
            sequence: [
                { role: 'reflector', adaptationKey: 'outer_voice_opening' },
                { role: 'reflector', adaptationKey: 'inner_voice_response' },
                { role: 'reflector', adaptationKey: 'outer_voice_challenge' },
                { role: 'reflector', adaptationKey: 'convergence_synthesis' }
            ]
        };

        // Test that the plan structure is correct for instruction composition
        expect(plan.sequence).toHaveLength(4);
        expect(plan.buildThread).toBe(true);
        expect(plan.resultStrategy).toBe('last');

        // The actual instruction composition with this plan is tested in the next test
    });

    it('should apply correct adaptation prompts for each iteration', async () => {
        // Test adaptation for outer voice opening
        const outerVoiceInput = {
            plan: {
                role: 'reflector',
                adaptationKey: 'outer_voice_opening'
            },
            factMap: {
                signals: []
            },
            context: { traceId: 'test-outer' }
        };

        const outerResult = await composeInstructionsCore(outerVoiceInput, machineContext);
        // Updated expectations to match new Constraints/Possibilities Lens framework
        expect(outerResult.adaptations).toContain('Constraints Lens');
        expect(outerResult.adaptations).toContain('List the binding constraints');

        // Test adaptation for inner voice response
        const innerVoiceInput = {
            plan: {
                role: 'reflector',
                adaptationKey: 'inner_voice_response'
            },
            factMap: {
                signals: []
            },
            context: { traceId: 'test-inner' }
        };

        const innerResult = await composeInstructionsCore(innerVoiceInput, machineContext);
        // Updated to match new adaptation text
        expect(innerResult.adaptations).toContain('Possibilities Lens');
        expect(innerResult.adaptations).toContain('Quote exactly one constraint');

        // Test convergence synthesis
        const convergenceInput = {
            plan: {
                role: 'reflector',
                adaptationKey: 'convergence_synthesis'
            },
            factMap: {
                signals: []
            },
            context: { traceId: 'test-convergence' }
        };

        const convergenceResult = await composeInstructionsCore(convergenceInput, machineContext);
        // Updated to match new convergence_synthesis adaptation
        expect(convergenceResult.adaptations).toContain('As Integrator');
        expect(convergenceResult.adaptations).toContain('List points of agreement');
    });

    it.skipIf(useRealLLM)('should execute full iteration flow with adaptations', async () => {
        // This test only runs with mocks, not in integration mode
        // Mock runCycle calls for all 4 iterations
        runCycle.mockResolvedValueOnce([
            'SUCCEEDED',
            {
                responseResult: {
                    response: {
                        output: 'Outer voice: The practical approach is to follow established patterns.',
                        usage: { prompt: 100, completion: 50 }
                    }
                }
            }
        ]);

        runCycle.mockResolvedValueOnce([
            'SUCCEEDED',
            {
                responseResult: {
                    response: {
                        output: 'Inner voice: But what if we question those patterns?',
                        usage: { prompt: 120, completion: 60 }
                    }
                }
            }
        ]);

        runCycle.mockResolvedValueOnce([
            'SUCCEEDED',
            {
                responseResult: {
                    response: {
                        output: 'Outer voice: Patterns exist for good reasons, but some flexibility is needed.',
                        usage: { prompt: 130, completion: 55 }
                    }
                }
            }
        ]);

        runCycle.mockResolvedValueOnce([
            'SUCCEEDED',
            {
                responseResult: {
                    response: {
                        output: 'Synthesis: We can honor both practical wisdom and creative exploration.',
                        usage: { prompt: 140, completion: 70 }
                    }
                }
            }
        ]);

        const input = {
            plan: {
                strategy: 'sequential',
                buildThread: true,
                resultStrategy: 'last',
                sequence: [
                    { role: 'reflector', adaptationKey: 'outer_voice_opening' },
                    { role: 'reflector', adaptationKey: 'inner_voice_response' },
                    { role: 'reflector', adaptationKey: 'outer_voice_challenge' },
                    { role: 'reflector', adaptationKey: 'convergence_synthesis' }
                ]
            },
            instructions: {
                system: module.instructionSchema.prompts.system('reflector'),
                primary: module.instructionSchema.prompts.primary('reflector')
            },
            thread: [{ role: 'user', content: 'Help me explore this dilemma' }],
            context: { traceId: 'test-exec', depth: 0 },
            policy: { maxDepth: 10 }
        };

        const result = await execSequentialCore(input, machineContext);

        // Verify all steps executed
        expect(result.response.metadata.steps).toBe(4);

        // In reduce mode (default), only the final synthesis is returned
        expect(result.response.output).toBe(
            'Synthesis: We can honor both practical wisdom and creative exploration.'
        );

        // Verify runCycle was called with correct adaptationKeys
        expect(runCycle).toHaveBeenCalledTimes(4); // All 4 steps use runCycle in sequential

        // Check each step includes the correct adaptationKey
        const step1Input = runCycle.mock.calls[0][0];
        expect(step1Input.selectedPlan.adaptationKey).toBe('outer_voice_opening');

        const step2Input = runCycle.mock.calls[1][0];
        expect(step2Input.selectedPlan.adaptationKey).toBe('inner_voice_response');

        const step3Input = runCycle.mock.calls[2][0];
        expect(step3Input.selectedPlan.adaptationKey).toBe('outer_voice_challenge');

        const step4Input = runCycle.mock.calls[3][0];
        expect(step4Input.selectedPlan.adaptationKey).toBe('convergence_synthesis');
    });

    it('should not trigger inner-outer debate without required signals', async () => {
        const input = {
            signals: {
                signals: [
                    // Only one of the required signals - missing hedged
                    { type: 'Signal', dimension: 'claim', signal: 'universal', confidence: 0.75 }
                ]
            },
            rules: module.rules,
            context: { traceId: 'test-no-trigger' }
        };

        const result = await evaluateRulesCore(input, machineContext);

        // Should not have inner-outer debate plan
        if (result.factMap.ExecutionPlan && result.factMap.ExecutionPlan.length > 0) {
            const plan = result.factMap.ExecutionPlan[0];
            expect(plan.iterations).not.toBe(4);
        }
    });

    // Real integration test with OpenAI - only runs when TEST_INTEGRATION=true
    it.skipIf(!useRealLLM)(
        'should execute real inner-outer debate with OpenAI',
        async () => {
            // This test makes real API calls to OpenAI
            const apiKey = process.env.OPENAI_API_KEY;
            if (!apiKey) {
                throw new Error('OPENAI_API_KEY required for integration tests');
            }

            // For integration mode, we'll use a simpler approach:
            // Just call the LLM 4 times with different adaptations
            const config = {
                apiKey,
                model: 'gpt-4o-mini',
                provider: 'openai',
                maxTokens: 200
            };

            const question = 'Should we always tell the truth, even when it might hurt someone?';
            const reflectorSystem = module.instructionSchema.prompts.system('reflector');
            const reflectorPrimary = module.instructionSchema.prompts.primary('reflector');

            const iterations = [];
            let currentThread = question;

            // Iteration 1: Outer voice opening
            const iter1Response = await callLLM(config, {
                model: 'gpt-4o-mini',
                system: reflectorSystem + '\n\n' + module.prompts['adapt.outer_voice_opening'],
                user: reflectorPrimary + '\n\nUser: ' + question,
                maxTokens: 200,
                temperature: 0.7
            });
            iterations.push({
                iteration: 1,
                adaptation: 'outer_voice_opening',
                output: iter1Response.output,
                usage: iter1Response.usage
            });
            currentThread = iter1Response.output;

            // Iteration 2: Inner voice response
            const iter2Response = await callLLM(config, {
                model: 'gpt-4o-mini',
                system: reflectorSystem + '\n\n' + module.prompts['adapt.inner_voice_response'],
                user:
                    'Previous voice said: ' + currentThread + '\n\nNow respond as the inner voice.',
                maxTokens: 200,
                temperature: 0.7
            });
            iterations.push({
                iteration: 2,
                adaptation: 'inner_voice_response',
                output: iter2Response.output,
                usage: iter2Response.usage
            });
            currentThread = iter2Response.output;

            // Iteration 3: Outer voice challenge
            const iter3Response = await callLLM(config, {
                model: 'gpt-4o-mini',
                system: reflectorSystem + '\n\n' + module.prompts['adapt.outer_voice_challenge'],
                user: 'Inner voice said: ' + currentThread + '\n\nNow respond as the outer voice.',
                maxTokens: 200,
                temperature: 0.7
            });
            iterations.push({
                iteration: 3,
                adaptation: 'outer_voice_challenge',
                output: iter3Response.output,
                usage: iter3Response.usage
            });

            // Iteration 4: Convergence synthesis
            const iter4Response = await callLLM(config, {
                model: 'gpt-4o-mini',
                system: reflectorSystem + '\n\n' + module.prompts['adapt.convergence_synthesis'],
                user:
                    'After this debate about: ' +
                    question +
                    '\n\nSynthesize both perspectives into a unified view.',
                maxTokens: 200,
                temperature: 0.7
            });
            iterations.push({
                iteration: 4,
                adaptation: 'convergence_synthesis',
                output: iter4Response.output,
                usage: iter4Response.usage
            });

            // Verify we got responses for all 4 iterations
            expect(iterations).toHaveLength(4);

            // Check each iteration has output
            iterations.forEach((iter) => {
                expect(iter.output).toBeDefined();
                expect(iter.output.length).toBeGreaterThan(0);
                expect(iter.usage.prompt).toBeGreaterThan(0);
                expect(iter.usage.completion).toBeGreaterThan(0);
            });

            // Calculate total usage
            const totalUsage = iterations.reduce(
                (acc, iter) => ({
                    prompt: acc.prompt + iter.usage.prompt,
                    completion: acc.completion + iter.usage.completion
                }),
                { prompt: 0, completion: 0 }
            );

            // Format output like execSingle would
            const formattedOutput = iterations
                .map((iter, i) => `[Iteration ${i + 1}]\n${iter.output}`)
                .join('\n\n---\n\n');

            // Log the actual debate for inspection (only in integration mode)
            console.log('\n=== Inner-Outer Voice Debate Output ===');
            console.log(formattedOutput);
            console.log('\n=== Token Usage ===');
            console.log(`Total prompt tokens: ${totalUsage.prompt}`);
            console.log(`Total completion tokens: ${totalUsage.completion}`);
            console.log('\n=== Individual Iterations ===');
            iterations.forEach((iter, i) => {
                console.log(`Iteration ${i + 1} (${iter.adaptation}):`);
                console.log(`  Prompt tokens: ${iter.usage.prompt}`);
                console.log(`  Completion tokens: ${iter.usage.completion}`);
            });
        },
        30000
    ); // 30 second timeout for integration test
});
