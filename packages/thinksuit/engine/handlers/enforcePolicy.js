/**
 * enforcePolicy - the single policy guard.
 *
 * Shape-agnostic: takes explicit numeric dimensions and checks whichever are
 * provided against the configured limits. Called at the three composer points —
 * depth (executePlan entry), fanout (executeParallel), children (executeSequence).
 * One call checks one dimension.
 */

import { PIPELINE_EVENTS } from '../constants/events.js';

/**
 * Core policy enforcement logic.
 *
 * @param {Object} input - { depth?, fanout?, children?, policy?, context? }
 * @param {Object} ctx - { execLogger, ... } (machine/composer context)
 * @returns {Object} - { approved: boolean, reason?, code?, depth?, limits? }
 */
export async function enforcePolicyCore(input, ctx) {
    // Nothing to check.
    if (!input) {
        return {
            approved: true,
            reason: 'No policy constraints to check'
        };
    }

    const { depth, fanout, children, context = {} } = input;

    const traceId = context?.traceId;
    const logger = ctx.execLogger;

    const policy = input.policy || context?.config?.policy || {};
    const maxDepth = policy.maxDepth ?? 5;
    const maxFanout = policy.maxFanout ?? 3;
    const maxChildren = policy.maxChildren ?? 5;

    logger.info(
        {
            event: PIPELINE_EVENTS.POLICY_CHECK_START,
            traceId,
            data: { depth, fanout, children, policy }
        },
        'Enforcing policy'
    );

    // Depth — bounds recursion. Checked at every node descent.
    if (depth != null && depth >= maxDepth) {
        logger.warn({ traceId, data: { depth, maxDepth } }, 'Max depth exceeded');
        return {
            approved: false,
            reason: `Maximum recursion depth (${maxDepth}) exceeded`,
            code: 'E_DEPTH'
        };
    }

    // Fanout — bounds parallel branches.
    if (fanout != null && fanout > maxFanout) {
        logger.warn({ traceId, data: { fanout, maxFanout } }, 'Max fanout exceeded');
        return {
            approved: false,
            reason: `Maximum parallel branches (${maxFanout}) exceeded`,
            code: 'E_FANOUT'
        };
    }

    // Children — bounds sequential steps.
    if (children != null && children > maxChildren) {
        logger.warn({ traceId, data: { children, maxChildren } }, 'Max children exceeded');
        return {
            approved: false,
            reason: `Maximum child operations (${maxChildren}) exceeded`,
            code: 'E_CHILDREN'
        };
    }

    logger.info(
        {
            event: PIPELINE_EVENTS.POLICY_CHECK_COMPLETE,
            traceId,
            data: { depth, fanout, children, approved: true }
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
