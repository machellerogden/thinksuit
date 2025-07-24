/**
 * System validation rules to catch module authoring errors
 * These rules detect and report clear errors rather than failing silently
 */

import { incrementalCount } from 'the-rules-engine/lib/aggregators.js';

export const systemValidationRules = [
    {
        name: 'system:validate-single-precedence',
        conditions: {
            type: 'PlanPrecedence',
            accumulate: {
                // Use incremental count for better performance
                ...incrementalCount(),
                test: (count) => count > 1
            }
        },
        action: (facts) => {
            const precedenceFacts = facts.filter(f => f.data?.type === 'PlanPrecedence');
            const sources = precedenceFacts.map(f => f.data?.provenance?.producer || 'unknown');
            throw new Error(
                `Module validation error: Multiple PlanPrecedence facts detected from: ${sources.join(', ')}. ` +
                'Modules should emit exactly one PlanPrecedence fact.'
            );
        }
    },

    {
        name: 'system:validate-execution-plan-names',
        conditions: {
            type: 'ExecutionPlan',
            test: (plan) => !plan.name
        },
        action: (facts) => {
            const plansWithoutNames = facts
                .filter(f => f.data?.type === 'ExecutionPlan' && !f.data?.name)
                .map(f => `${f.data?.strategy}/${f.data?.role || 'no-role'} from ${f.data?.provenance?.producer || 'unknown'}`);

            throw new Error(
                `Module validation error: ExecutionPlans must have names. Found ${plansWithoutNames.length} plans without names: ${plansWithoutNames.join(', ')}`
            );
        }
    }
];