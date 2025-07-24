/**
 * System Enforcement Rules
 * High-priority rules that enforce PolicyConstraint facts by modifying ExecutionPlans
 * These run after policy rules to enforce the constraints they emit
 */


/**
 * System enforcement rules that react to PolicyConstraint and PolicyPreference facts
 */
export const systemEnforcementRules = [
    // Block recursion when depth limit exceeded
    {
        name: 'system:enforce-depth-constraint',
        salience: 100, // Highest priority - enforces hard limits
        conditions: {
            all: [
                {
                    type: 'PolicyConstraint',
                    test: (c) => c.constraint === 'block_recursion',
                    var: 'constraint'
                },
                {
                    type: 'ExecutionPlan',
                    test: (p) => !p.policyBlocked && // Prevent re-matching
                               (p.strategy !== 'direct' || p.role !== 'assistant'), // Allow minimal fallback
                    var: 'plan'
                }
            ]
        },
        action: (facts, engine, { constraint, plan }) => {
            // Add new fact with zero confidence (don't remove original)
            engine.addFact({
                type: 'ExecutionPlan',
                ...plan.data,
                confidence: 0,
                policyBlocked: true,  // Prevents re-matching this rule
                originalConfidence: plan.data.confidence,
                blockReason: constraint.data.reason
            });
        }
    },

    // Block plans that exceed fanout limits
    {
        name: 'system:enforce-fanout-constraint',
        salience: 100,
        conditions: {
            all: [
                {
                    type: 'PolicyConstraint',
                    test: (c) => c.constraint === 'block_fanout',
                    var: 'constraint'
                },
                {
                    type: 'ExecutionPlan',
                    test: (p) => p.strategy === 'parallel' &&
                               !p.policyBlocked,
                    var: 'plan'
                }
            ]
        },
        action: (facts, engine, { constraint, plan }) => {
            // Check if this plan violates the constraint
            if (plan.data.roles?.length > constraint.data.data?.maxFanout) {
                engine.addFact({
                    type: 'ExecutionPlan',
                    ...plan.data,
                    confidence: 0,
                    policyBlocked: true,
                    originalConfidence: plan.data.confidence,
                    blockReason: constraint.data.reason
                });
            }
        }
    },

    // Block sequential plans that exceed step limits
    {
        name: 'system:enforce-sequential-steps-constraint',
        salience: 100,
        conditions: {
            all: [
                {
                    type: 'PolicyConstraint',
                    test: (c) => c.constraint === 'block_sequential',
                    var: 'constraint'
                },
                {
                    type: 'ExecutionPlan',
                    test: (p) => p.strategy === 'sequential' &&
                               !p.policyBlocked,
                    var: 'plan'
                }
            ]
        },
        action: (facts, engine, { constraint, plan }) => {
            // Check if this plan violates the constraint
            if (plan.data.sequence?.length > constraint.data.data?.maxSequentialSteps) {
                engine.addFact({
                    type: 'ExecutionPlan',
                    ...plan.data,
                    confidence: 0,
                    policyBlocked: true,
                    originalConfidence: plan.data.confidence,
                    blockReason: constraint.data.reason
                });
            }
        }
    },

    // Cap task cycles to policy limit (modify rather than block)
    {
        name: 'system:enforce-task-cycles-constraint',
        salience: 100,
        conditions: {
            all: [
                {
                    type: 'PolicyConstraint',
                    test: (c) => c.constraint === 'limit_task_cycles',
                    var: 'constraint'
                },
                {
                    type: 'ExecutionPlan',
                    test: (p) => p.strategy === 'task' &&
                               !p.policyAdjusted,
                    var: 'plan'
                }
            ]
        },
        action: (facts, engine, { constraint, plan }) => {
            // Check if this plan needs capping
            if (plan.data.resolution?.maxCycles > constraint.data.data?.maxTaskCycles) {
                // For task cycles, we cap rather than block
                engine.addFact({
                    type: 'ExecutionPlan',
                    ...plan.data,
                    resolution: {
                        ...plan.data.resolution,
                        maxCycles: constraint.data.data.cappedCycles,
                        originalMaxCycles: plan.data.resolution.maxCycles
                    },
                    policyAdjusted: true,
                    adjustmentReason: `Capped cycles from ${plan.data.resolution.maxCycles} to ${constraint.data.data.cappedCycles}`,
                    // Maintain original confidence - this is just a parameter adjustment
                    confidence: plan.data.confidence
                });
            }
        }
    },

    // This rule is problematic - we can't check for absence of facts in rules engine
    // The fallback should be handled in selectPlan handler instead
    // Removing this rule as it cannot work with the rules engine constraints
];

/**
 * Export both the rules array and individual rule names for testing
 */
export const ruleNames = systemEnforcementRules.map(r => r.name);