/**
 * executePlan - the plan composer.
 *
 * Recursive executor for a plan.v1 tree: `task` (the agent loop), `sequence`, and
 * `parallel`. Composition is structural — the loop is the one execution primitive, and
 * sequence/parallel are a composition layer over it. Nodes exchange results (final text),
 * not transcripts: each task owns its own history; a shared context bag threads results
 * between siblings.
 */

import { executeTask } from './executeTask.js';
import { enforcePolicyCore } from './enforcePolicy.js';
import { expandTemplate } from '../plan/template.js';
import { InterruptError, isInterruptError } from '../errors/InterruptError.js';
import { EXECUTION_EVENTS, EVENT_ROLES, BOUNDARY_TYPES } from '../constants/events.js';

/**
 * Shape a policy block as a normal node result: an error response the parent
 * composite (and formatFinalResult) reads as a failed turn, not a crash.
 */
function blockedResponse(guard, config) {
    return {
        response: {
            output: guard.reason,
            error: guard.code || 'E_POLICY',
            policyBlocked: true,
            usage: { prompt: 0, completion: 0 },
            model: config?.model || 'policy'
        }
    };
}

/**
 * Combine child results into a single output string.
 * @param {string} strategy - 'last' | 'concat' | 'formatted' | 'label'
 * @param {Array} results - [{ label, output, success }]
 * @param {Object} module
 */
function applyResultStrategy(strategy, results, module) {
    const successes = results.filter((r) => r.success);

    if (strategy === 'last') {
        return successes.at(-1)?.output || '';
    }
    if (strategy === 'concat') {
        return successes.map((r) => r.output).join('\n\n');
    }
    if (strategy === 'formatted' && module?.orchestration?.formatResponse) {
        return module.orchestration.formatResponse(
            successes.map((r) => ({ role: r.label, content: r.output }))
        );
    }
    // Default 'label'
    return successes.map((r) => `[${r.label}]\n${r.output}`).join('\n\n---\n\n');
}

const labelOf = (node, index) => node.role || node.type || `node-${index + 1}`;
const childContext = (ctx, branch) => ({
    ...ctx.context,
    depth: (ctx.context?.depth || 0) + 1,
    branch
});

/**
 * Execute a plan node.
 * @param {Object} node - plan.v1 node (task | sequence | parallel)
 * @param {Object} ctx - { machineContext, bag, thread, context, frame?, modality? }
 * @returns {Promise<{response: Object}>}
 */
export async function executePlan(node, ctx) {
    const { config, execLogger } = ctx.machineContext;

    // Bound recursion at every node descent. childContext increments depth per
    // level, so this is the one point that sees live depth grow.
    const depthGuard = await enforcePolicyCore(
        { depth: ctx.context?.depth || 0, policy: config?.policy, context: ctx.context },
        { execLogger }
    );
    if (!depthGuard.approved) {
        return blockedResponse(depthGuard, config);
    }

    switch (node.type) {
        case 'sequence':
            return executeSequence(node, ctx);
        case 'parallel':
            return executeParallel(node, ctx);
        case 'task':
        default:
            return executeTaskNode(node, ctx);
    }
}

async function executeTaskNode(node, ctx) {
    const { machineContext, bag } = ctx;
    const { config, module } = machineContext;

    // Input chaining: an authored template is expanded against the bag; otherwise the
    // default is the prior result, else the turn input.
    const nodeInput =
        node.input != null
            ? expandTemplate(node.input, bag)
            : (bag.last_response ?? bag.input ?? '');

    const composed = await module.composeInstructions(
        {
            plan: node,
            thread: ctx.thread || [],
            input: nodeInput,
            frame: ctx.frame || null,
            modality: ctx.modality || null,
            cwd: config?.cwd || null,
            workdir: config?.workdir || null
        },
        module
    );

    // The composed thread already carries the input as its tail user message.
    const result = await executeTask(
        {
            node,
            thread: composed.thread,
            userInput: '',
            context: ctx.context
        },
        machineContext
    );

    const output = result.response.output;
    bag.last_response = output;
    if (node.id) {
        bag[`${node.id}_response`] = output;
    }

    return result;
}

async function executeSequence(node, ctx) {
    const { machineContext } = ctx;
    const { config, module, execLogger: logger, abortSignal } = machineContext;
    const traceId = ctx.context?.traceId;
    const children = node.children || [];

    if (abortSignal?.aborted) {
        throw new InterruptError('Sequence interrupted before start', {
            stage: 'sequence-start',
            totalSteps: children.length
        });
    }

    const childrenGuard = await enforcePolicyCore(
        { children: children.length, policy: config?.policy, context: ctx.context },
        { execLogger: logger }
    );
    if (!childrenGuard.approved) {
        return blockedResponse(childrenGuard, config);
    }

    const boundaryId = `exec-sequence-${ctx.context?.sessionId}-${Date.now()}`;
    logger.info(
        {
            event: EXECUTION_EVENTS.SEQUENTIAL_START,
            eventRole: EVENT_ROLES.BOUNDARY_START,
            boundaryType: BOUNDARY_TYPES.EXECUTION,
            boundaryId,
            parentBoundaryId: ctx.context?.parentBoundaryId || null,
            traceId,
            data: { steps: children.length, depth: ctx.context?.depth || 0 }
        },
        'Starting sequence'
    );

    const results = [];
    const usage = { prompt: 0, completion: 0 };

    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        // Leftmost descendant inherits history; all later steps are isolated.
        const childCtx = {
            ...ctx,
            thread: i === 0 ? ctx.thread : [],
            context: {
                ...childContext(ctx, `${ctx.context?.branch || 'root'}.step-${i + 1}`),
                parentBoundaryId: boundaryId
            }
        };

        const childResult = await executePlan(child, childCtx);
        const response = childResult.response;
        usage.prompt += response.usage?.prompt || 0;
        usage.completion += response.usage?.completion || 0;

        // Sequence stops on a non-interrupt failure — later steps depend on earlier ones.
        // (Interrupts throw and propagate; they never reach here as a result.)
        if (response.error) {
            logger.info(
                {
                    event: EXECUTION_EVENTS.SEQUENTIAL_COMPLETE,
                    eventRole: EVENT_ROLES.BOUNDARY_END,
                    boundaryType: BOUNDARY_TYPES.EXECUTION,
                    boundaryId,
                    parentBoundaryId: ctx.context?.parentBoundaryId || null,
                    traceId,
                    data: { stoppedAtStep: i + 1, error: response.error }
                },
                'Sequence stopped on step failure'
            );
            return { response };
        }

        results.push({ label: labelOf(child, i), output: response.output, success: true });
    }

    const combinedOutput = applyResultStrategy(node.resultStrategy ?? 'last', results, module);

    logger.info(
        {
            event: EXECUTION_EVENTS.SEQUENTIAL_COMPLETE,
            eventRole: EVENT_ROLES.BOUNDARY_END,
            boundaryType: BOUNDARY_TYPES.EXECUTION,
            boundaryId,
            parentBoundaryId: ctx.context?.parentBoundaryId || null,
            traceId,
            data: { steps: results.length, usage }
        },
        'Sequence completed'
    );

    return {
        response: {
            output: combinedOutput,
            usage,
            model: config?.model,
            metadata: { type: 'sequence', steps: results.length }
        }
    };
}

async function executeParallel(node, ctx) {
    const { machineContext, bag } = ctx;
    const { config, module, execLogger: logger, abortSignal } = machineContext;
    const traceId = ctx.context?.traceId;
    const children = node.children || [];

    if (abortSignal?.aborted) {
        throw new InterruptError('Parallel interrupted before start', {
            stage: 'parallel-start',
            totalBranches: children.length
        });
    }

    const fanoutGuard = await enforcePolicyCore(
        { fanout: children.length, policy: config?.policy, context: ctx.context },
        { execLogger: logger }
    );
    if (!fanoutGuard.approved) {
        return blockedResponse(fanoutGuard, config);
    }

    const boundaryId = `exec-parallel-${ctx.context?.sessionId}-${Date.now()}`;
    logger.info(
        {
            event: EXECUTION_EVENTS.PARALLEL_START,
            eventRole: EVENT_ROLES.BOUNDARY_START,
            boundaryType: BOUNDARY_TYPES.EXECUTION,
            boundaryId,
            parentBoundaryId: ctx.context?.parentBoundaryId || null,
            traceId,
            data: { branches: children.length, depth: ctx.context?.depth || 0 }
        },
        'Starting parallel'
    );

    const settled = await Promise.allSettled(
        children.map((child, i) =>
            executePlan(child, {
                ...ctx,
                // Branches are isolated and each gets its own copy of the bag.
                // eslint-disable-next-line no-undef
                bag: structuredClone(ctx.bag),
                thread: [],
                context: {
                    ...childContext(ctx, `${ctx.context?.branch || 'root'}.branch-${i + 1}`),
                    parentBoundaryId: boundaryId
                }
            })
        )
    );

    // An interrupt in any branch aborts the whole turn — allSettled never rejects, so
    // surface it explicitly instead of downgrading it to a failed branch.
    const interrupted = settled.find((s) => s.status === 'rejected' && isInterruptError(s.reason));
    if (interrupted) {
        throw interrupted.reason;
    }

    const usage = { prompt: 0, completion: 0 };
    const results = settled.map((s, i) => {
        const child = children[i];
        const label = labelOf(child, i);
        if (s.status === 'fulfilled') {
            const response = s.value.response;
            usage.prompt += response.usage?.prompt || 0;
            usage.completion += response.usage?.completion || 0;
            const success = !response.error;
            if (success && child.id) {
                bag[`${child.id}_response`] = response.output;
            }
            return { label, output: response.output, success };
        }
        return { label, output: `[Error: ${s.reason?.message || 'Unknown error'}]`, success: false };
    });

    const strategy =
        node.resultStrategy ?? (module?.orchestration?.formatResponse ? 'formatted' : 'label');
    const combinedOutput = applyResultStrategy(strategy, results, module);
    const anySuccess = results.some((r) => r.success);
    bag.last_response = combinedOutput;

    logger.info(
        {
            event: EXECUTION_EVENTS.PARALLEL_COMPLETE,
            eventRole: EVENT_ROLES.BOUNDARY_END,
            boundaryType: BOUNDARY_TYPES.EXECUTION,
            boundaryId,
            parentBoundaryId: ctx.context?.parentBoundaryId || null,
            traceId,
            data: {
                branches: children.length,
                successfulBranches: results.filter((r) => r.success).length,
                usage
            }
        },
        'Parallel completed'
    );

    const response = {
        output: combinedOutput,
        usage,
        model: config?.model,
        metadata: {
            type: 'parallel',
            branches: children.length,
            successfulBranches: results.filter((r) => r.success).length
        }
    };
    if (!anySuccess) {
        response.error = 'Parallel execution failed: no branch produced a successful result';
    }

    return { response };
}
