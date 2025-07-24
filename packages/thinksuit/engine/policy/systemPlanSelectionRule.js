/**
 * System rule for selecting execution plans based on precedence
 * Uses accumulator to collect ALL ExecutionPlans before selection
 */

import { collectAll } from 'the-rules-engine/lib/aggregators.js';

export const systemPlanSelectionRule = {
    name: 'system:select-execution-plan',
    conditions: {
        all: [
            {
                type: 'PlanPrecedence',
                accumulate: collectAll(),
                var: 'precedenceFacts'
            },
            {
                type: 'ExecutionPlan',
                accumulate: collectAll(),
                var: 'allPlans'
            }
        ]
    },
    action: (facts, engine, { allPlans, precedenceFacts }) => {
        const [ precedenceFact ] = precedenceFacts;
        const precedence = precedenceFact?.data?.precedence || [];

        // Filter out policy-blocked plans
        const availablePlans = allPlans
            .filter(f => !f.data?.policyBlocked)
            .map(f => f.data);

        if (availablePlans.length === 0) {
            // No plans available - emit a minimal fallback
            engine.addFact({
                type: 'SelectedPlan',
                plan: {
                    strategy: 'direct',
                    role: 'assistant',
                    rationale: 'Fallback: No plans available after policy enforcement'
                }
            });
            return;
        }

        // Use precedence to select the highest priority plan
        if (precedence.length > 0) {
            for (const planName of precedence) {
                // Find all plans matching this name
                const matchingPlans = availablePlans.filter(p =>
                    p.name === planName ||
                    p.id === planName
                );

                if (matchingPlans.length > 0) {
                    // Prefer version with tools if multiple plans with same name
                    const selectedPlan = matchingPlans.find(p => p.hasTools) || matchingPlans[0];
                    engine.addFact({
                        type: 'SelectedPlan',
                        plan: selectedPlan
                    });
                    return;
                }
            }
        }

        // No precedence matched - prefer plans with tools, then pick the first available
        const selectedPlan = availablePlans.find(p => p.hasTools) || availablePlans[0];
        engine.addFact({
            type: 'SelectedPlan',
            plan: selectedPlan
        });
    }
};
