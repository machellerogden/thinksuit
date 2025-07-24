/**
 * enforcePolicy handler - core logic only
 * Pure decision plane - validates execution against policy limits
 */

import { PIPELINE_EVENTS } from '../constants/events.js';

/**
 * Core policy enforcement logic
 * @param {Object} input - { depth, policy, plan }
 * @param {Object} ctx - Enhanced context from middleware
 * @returns {Object} - { approved: boolean, reason?: string, code?: string }
 */
export async function enforcePolicyCore(input, machineContext) {
    // Handle null/undefined input
    if (!input) {
        return {
            approved: true,
            reason: 'No policy constraints to check'
        };
    }

    const { depth = 0, plan = {}, context = {} } = input;

    const traceId = context?.traceId;
    const logger = machineContext.execLogger;

    // Extract policy from context.config or use input.policy for backwards compatibility
    const policy = context?.config?.policy || input.policy || {};
    const maxDepth = policy.maxDepth ?? 5;
    const maxFanout = policy.maxFanout ?? 3;
    const maxChildren = policy.maxChildren ?? 5;

    logger.info(
        {
            event: PIPELINE_EVENTS.POLICY_CHECK_START,
            traceId,

            data: {
                depth,
                maxDepth,
                strategy: plan.strategy,
                policy
            }
        },
        'Enforcing policy'
    );

    // Check depth limit
    if (depth >= maxDepth) {
        logger.warn(
            {
                traceId,

                data: {
                    depth,
                    maxDepth
                }
            },
            'Max depth exceeded'
        );

        return {
            approved: false,
            reason: `Maximum recursion depth (${maxDepth}) exceeded`,
            code: 'E_DEPTH'
        };
    }

    // Check fanout for parallel execution
    if (plan.strategy === 'parallel' && plan.roles) {
        const fanout = plan.roles.length;
        if (fanout > maxFanout) {
            logger.warn(
                {
                    traceId,

                    data: {
                        fanout,
                        maxFanout
                    }
                },
                'Max fanout exceeded'
            );

            return {
                approved: false,
                reason: `Maximum parallel branches (${maxFanout}) exceeded`,
                code: 'E_FANOUT'
            };
        }
    }

    // Check children count for sequential execution
    if (plan.strategy === 'sequential' && plan.sequence) {
        const children = plan.sequence.length;
        if (children > maxChildren) {
            logger.warn(
                {
                    traceId,

                    data: {
                        children,
                        maxChildren
                    }
                },
                'Max children exceeded'
            );

            return {
                approved: false,
                reason: `Maximum child operations (${maxChildren}) exceeded`,
                code: 'E_CHILDREN'
            };
        }
    }

    // Check for abort signals (future: could check context for abort flag)
    // if (context?.abort) {
    //     return {
    //         approved: false,
    //         reason: 'Execution aborted by user',
    //         code: 'E_ABORT'
    //     };
    // }

    logger.info(
        {
            event: PIPELINE_EVENTS.POLICY_CHECK_COMPLETE,
            traceId,

            data: {
                depth,
                strategy: plan.strategy,
                approved: true
            }
        },
        'Policy check passed'
    );

    return {
        approved: true,
        depth,
        limits: {
            maxDepth,
            maxFanout,
            maxChildren
        }
    };
}
