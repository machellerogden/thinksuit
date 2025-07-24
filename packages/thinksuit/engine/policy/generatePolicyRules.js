/**
 * Policy Rule Generation
 * Transforms user policy configuration into rules that emit PolicyConstraint and PolicyPreference facts
 */

/**
 * Generate policy rules from configuration
 * @param {Object} policy - User policy configuration
 * @returns {Array} Array of rules
 */
export function generatePolicyRules(policy) {
    const rules = [];

    // Max depth constraint
    if (policy?.maxDepth !== undefined) {
        rules.push({
            name: 'policy:max-depth-constraint',
            salience: 90, // High priority but below system enforcement
            conditions: {
                all: [
                    {
                        type: 'Config',
                        test: (c) => c.name === 'context.depth',
                        var: 'depth'
                    }
                ]
            },
            action: (facts, engine, { depth }) => {
                if (depth.data.value >= policy.maxDepth) {
                    engine.addFact({
                        type: 'PolicyConstraint',
                        constraint: 'block_recursion',
                        reason: `Depth ${depth.data.value} >= max ${policy.maxDepth}`,
                        confidence: 1.0,
                        data: {
                            currentDepth: depth.data.value,
                            maxDepth: policy.maxDepth
                        }
                    });
                }
            }
        });
    }

    // Max fanout constraint for parallel execution
    if (policy?.maxFanout !== undefined) {
        rules.push({
            name: 'policy:max-fanout-constraint',
            salience: 90,
            conditions: {
                all: [
                    {
                        type: 'ExecutionPlan',
                        test: (p) => p.strategy === 'parallel' &&
                                   p.roles &&
                                   p.roles.length > policy.maxFanout &&
                                   !p.policyChecked,
                        var: 'plan'
                    }
                ]
            },
            action: (facts, engine, { plan }) => {
                engine.addFact({
                    type: 'PolicyConstraint',
                    constraint: 'block_fanout',
                    reason: `Fanout ${plan.data.roles.length} > max ${policy.maxFanout}`,
                    targetPlan: plan.data,
                    confidence: 1.0,
                    data: {
                        fanout: plan.data.roles.length,
                        maxFanout: policy.maxFanout
                    }
                });
            }
        });
    }

    // Max sequential steps constraint
    if (policy?.maxSequentialSteps !== undefined) {
        rules.push({
            name: 'policy:max-sequential-steps-constraint',
            salience: 90,
            conditions: {
                all: [
                    {
                        type: 'ExecutionPlan',
                        test: (p) => p.strategy === 'sequential' &&
                                   p.sequence &&
                                   p.sequence.length > policy.maxSequentialSteps &&
                                   !p.policyChecked,
                        var: 'plan'
                    }
                ]
            },
            action: (facts, engine, { plan }) => {
                engine.addFact({
                    type: 'PolicyConstraint',
                    constraint: 'block_sequential',
                    reason: `Sequential steps ${plan.data.sequence.length} > max ${policy.maxSequentialSteps}`,
                    targetPlan: plan.data,
                    confidence: 1.0,
                    data: {
                        steps: plan.data.sequence.length,
                        maxSequentialSteps: policy.maxSequentialSteps
                    }
                });
            }
        });
    }

    // Max task cycles constraint
    if (policy?.maxTaskCycles !== undefined) {
        rules.push({
            name: 'policy:max-task-cycles-constraint',
            salience: 90,
            conditions: {
                all: [
                    {
                        type: 'ExecutionPlan',
                        test: (p) => p.strategy === 'task' &&
                                   p.resolution?.maxCycles &&
                                   p.resolution.maxCycles > policy.maxTaskCycles &&
                                   !p.policyChecked,
                        var: 'plan'
                    }
                ]
            },
            action: (facts, engine, { plan }) => {
                engine.addFact({
                    type: 'PolicyConstraint',
                    constraint: 'limit_task_cycles',
                    reason: `Task cycles ${plan.data.resolution.maxCycles} > max ${policy.maxTaskCycles}`,
                    targetPlan: plan.data,
                    confidence: 1.0,
                    data: {
                        requestedCycles: plan.data.resolution.maxCycles,
                        maxTaskCycles: policy.maxTaskCycles,
                        cappedCycles: policy.maxTaskCycles
                    }
                });
            }
        });
    }

    // Tool policy statement - derives ToolPolicyStatement from config.allowedTools
    rules.push({
        name: 'policy:derive-tool-allowlist',
        salience: 95, // High priority to establish policy early
        conditions: {
            all: [
                {
                    type: 'Config',
                    test: (c) => c.name === 'allowedTools' && Array.isArray(c.data?.value) && c.data.value.length > 0,
                    var: 'allowedTools'
                }
            ]
        },
        action: (facts, engine, { allowedTools }) => {
            engine.addFact({
                type: 'ToolPolicyStatement',
                name: 'allowlist',
                data: {
                    tools: allowedTools.data.value
                },
                confidence: 1.0
            });
        }
    });

    return rules;
}