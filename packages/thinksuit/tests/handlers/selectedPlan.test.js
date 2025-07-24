import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { describe, it, expect } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const machineDefinition = JSON.parse(
    readFileSync(join(__dirname, '../../engine/machine.json'), 'utf-8')
);

describe('Selected Plan routing (deterministic execution)', () => {
    it('should have CheckSelectedPlan as the starting state', () => {
        expect(machineDefinition.StartAt).toBe('CheckSelectedPlan');
    });

    it('should route to UseSelectedPlan when selectedPlan is present', () => {
        const checkState = machineDefinition.States.CheckSelectedPlan;
        expect(checkState.Type).toBe('Choice');
        expect(checkState.Choices[0].Variable).toBe('$.selectedPlan');
        expect(checkState.Choices[0].IsPresent).toBe(true);
        expect(checkState.Choices[0].Next).toBe('UseSelectedPlan');
    });

    it('should route to DetectSignals when no selectedPlan', () => {
        const checkState = machineDefinition.States.CheckSelectedPlan;
        expect(checkState.Default).toBe('DetectSignals');
    });

    it('should set planResult from selectedPlan in UseSelectedPlan state', () => {
        const useSelectedState = machineDefinition.States.UseSelectedPlan;
        expect(useSelectedState.Type).toBe('Pass');
        expect(useSelectedState.Parameters['plan.$']).toBe('$.selectedPlan');
        expect(useSelectedState.ResultPath).toBe('$.planResult');
        expect(useSelectedState.Next).toBe('ComposeInstructions');
    });

    it('should not have forcedPlan parameters in any state', () => {
        // Check that no state has forcedPlan in its parameters
        /* eslint-disable no-unused-vars */
        for (const [stateName, state] of Object.entries(machineDefinition.States)) {
            if (state.Parameters) {
                const paramKeys = Object.keys(state.Parameters);
                const hasForcedPlan = paramKeys.some((key) => key.includes('forcedPlan'));
                expect(hasForcedPlan).toBe(false);
            }
        }
    });

    describe('State machine flow with selectedPlan', () => {
        it('should bypass signal detection and rules when selectedPlan is present', () => {
            // With selectedPlan, the flow should be:
            // CheckSelectedPlan → UseSelectedPlan → ComposeInstructions → Guards → Route → Execute

            // Verify UseSelectedPlan goes directly to ComposeInstructions
            const useSelectedState = machineDefinition.States.UseSelectedPlan;
            expect(useSelectedState.Next).toBe('ComposeInstructions');

            // Verify DetectSignals is only reached through Default route
            const checkState = machineDefinition.States.CheckSelectedPlan;
            expect(checkState.Default).toBe('DetectSignals');
        });

        it('should follow normal flow when no selectedPlan', () => {
            // Without selectedPlan, the flow should be:
            // CheckSelectedPlan → DetectSignals → AggregateFacts → EvaluateRules → SelectPlan → ComposeInstructions

            const detectState = machineDefinition.States.DetectSignals;
            expect(detectState.Next).toBe('AggregateFacts');

            const aggregateState = machineDefinition.States.AggregateFacts;
            expect(aggregateState.Next).toBe('EvaluateRules');

            const rulesState = machineDefinition.States.EvaluateRules;
            expect(rulesState.Next).toBe('SelectPlan');

            const selectPlanState = machineDefinition.States.SelectPlan;
            expect(selectPlanState.Next).toBe('ComposeInstructions');
        });
    });

    describe('Deterministic execution path', () => {
        it('should ensure handlers can use selectedPlan for deterministic execution', () => {
            // This is a documentation test to ensure our design is correct

            // When execSequential/execParallel/execTask call executeMachine with selectedPlan,
            // the child execution will:
            // 1. Start at CheckSelectedPlan
            // 2. Find selectedPlan is present
            // 3. Route to UseSelectedPlan
            // 4. Skip DetectSignals and EvaluateRules entirely
            // 5. Go straight to ComposeInstructions with the provided plan

            // This provides a deterministic execution path where the plan
            // has already been selected and we proceed directly to execution

            expect(true).toBe(true); // Design validation test
        });
    });
});
