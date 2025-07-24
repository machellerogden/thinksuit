/**
 * execParallel handler - core logic only
 * Effectful execution plane - orchestrates parallel role execution
 */

import { createSpanLogger } from '../logger.js';
import { runCycle } from '../runCycle.js';
import { EXECUTION_EVENTS, EVENT_ROLES, BOUNDARY_TYPES } from '../constants/events.js';
import { InterruptError, isInterruptError } from '../errors/InterruptError.js';

/**
 * Core parallel execution logic
 * @param {Object} input - { plan, instructions, thread, context, policy }
 * @param {Object} machineContext - Machine context with handlers and config
 * @returns {Object} - { response: Response }
 */
export async function execParallelCore(input, machineContext) {
    const {
        plan = {},
        //instructions = {},
        thread = [],
        context = {},
        policy = {}
    } = input;

    const traceId = context.traceId;
    const logger = machineContext.execLogger;
    const config = machineContext?.config;
    const abortSignal = machineContext?.abortSignal;

    // Get the full module from machineContext
    const module = machineContext?.module || {};

    // Validate we have roles to execute
    const roles = plan.roles || [];
    if (roles.length === 0) {
        logger.error({ traceId }, 'No roles provided for parallel execution');
        return {
            response: {
                output: 'No roles provided for parallel execution',
                usage: { prompt: 0, completion: 0 },
                model: 'error',
                error: 'No roles provided'
            }
        };
    }

    const executionBoundaryId = `exec-parallel-${context.sessionId}-${Date.now()}`;

    logger.info(
        {
            event: EXECUTION_EVENTS.PARALLEL_START,
            eventRole: EVENT_ROLES.BOUNDARY_START,
            boundaryType: BOUNDARY_TYPES.EXECUTION,
            boundaryId: executionBoundaryId,
            parentBoundaryId: context.parentBoundaryId || null,
            traceId,
            data: {
                strategy: 'parallel',
                roles,
                depth: context.depth || 0,
                fanout: roles.length
            }
        },
        'Starting parallel execution'
    );

    let aggregateUsage = { prompt: 0, completion: 0 };

    // Check for interruption before starting branches
    if (abortSignal?.aborted) {
        throw new InterruptError('Parallel execution interrupted before start', {
            stage: 'parallel-start',
            totalBranches: roles.length,
            thread
        });
    }

    // Create promises for parallel execution
    const rolePromises = roles.map(async (item, index) => {
        // Support both string and object format
        const role = typeof item === 'string' ? item : item.role;
        const adaptationKey = typeof item === 'object' ? item.adaptationKey : null;
        const stepStrategy = typeof item === 'object' ? item.strategy : null;
        const stepResolution = typeof item === 'object' ? item.resolution : null;
        const stepTools = typeof item === 'object' ? item.tools : null;

        const branch = `${context.branch || 'root'}.branch-${index + 1}`;

        // Create child logger with span for this parallel branch
        const childLogger = createSpanLogger(logger, `exec-${role}`, {
            role,
            branch,
            index: `${index + 1}/${roles.length}`,
            adaptationKey,
            parentBoundaryId: executionBoundaryId
        });

        const branchBoundaryId = `branch-${executionBoundaryId}-${index}`;

        childLogger.info(
            {
                event: EXECUTION_EVENTS.PARALLEL_BRANCH_START,
                eventRole: EVENT_ROLES.BOUNDARY_START,
                boundaryType: BOUNDARY_TYPES.BRANCH,
                boundaryId: branchBoundaryId,
                data: {
                    branchIndex: index + 1,
                    totalBranches: roles.length
                }
            },
            'Starting parallel branch'
        );

        try {
            // Create child context for this role
            const childContext = {
                ...context,
                depth: (context.depth || 0) + 1,
                branch,
                traceId // Keep same traceId
            };

            // Build child input for state machine
            const childInput = {
                thread,
                module,
                context: childContext,
                policy,
                // Selected plan - use step's strategy if specified, otherwise 'task'
                selectedPlan: {
                    strategy: stepStrategy || 'task',
                    role,
                    adaptationKey,
                    resolution: stepResolution, // Pass step-level resolution if provided
                    tools: stepTools, // Use step-specific tools
                    rationale: `Parallel branch: ${role}`
                }
            };

            // Determine tools for this branch
            // Only task strategy steps can use tools, and only if tools are specified
            const effectiveStrategy = stepStrategy || 'task';
            const toolsForStep = effectiveStrategy === 'task' && stepTools
                ? stepTools
                : undefined;

            // Build child config with appropriate tools
            const childConfig = {
                ...machineContext.config,
                tools: toolsForStep,
                autoApproveTools: machineContext.config.autoApproveTools
            };

            // Check for interruption before starting this branch
            if (abortSignal?.aborted) {
                throw new InterruptError(`Branch ${role} interrupted`, {
                    stage: 'parallel-branch',
                    branch: index + 1,
                    role,
                    totalBranches: roles.length
                });
            }

            // Re-invoke state machine for this role using runCycle
            const startTime = Date.now();
            const [status, childResult] = await runCycle({
                logger: childLogger,
                thread,
                module,
                depth: childContext.depth,
                branch: childContext.branch,
                traceId: childContext.traceId,
                spanId: null, // Let runCycle generate it
                parentSpanId: childLogger.bindings().spanId,
                sessionId: childLogger.bindings().sessionId,
                parentBoundaryId: branchBoundaryId, // Pass branch boundary as parent for nested executions
                selectedPlan: childInput.selectedPlan,
                previousOutput: childContext.previousOutput,
                machineDefinition: machineContext.machineDefinition,
                handlers: machineContext.handlers,
                config: childConfig,
                discoveredTools: machineContext.discoveredTools, // Pass discovered tools to child
                abortSignal // Propagate abort signal to branch
            });
            const duration = Date.now() - startTime;

            if (status === 'SUCCEEDED' && childResult?.responseResult?.response) {
                const roleResponse = childResult.responseResult.response;

                childLogger.info(
                    {
                        event: EXECUTION_EVENTS.PARALLEL_BRANCH_COMPLETE,
                        eventRole: EVENT_ROLES.BOUNDARY_END,
                        boundaryType: BOUNDARY_TYPES.BRANCH,
                        boundaryId: branchBoundaryId,
                        traceId,
                        data: {
                            branchIndex: index + 1,
                            totalBranches: roles.length,
                            output: roleResponse.output,
                            duration,
                            usage: roleResponse.usage
                        }
                    },
                    'Parallel branch completed'
                );

                return {
                    role,
                    output: roleResponse.output,
                    usage: roleResponse.usage,
                    duration,
                    success: true
                };
            } else {
                childLogger.warn(
                    {
                        event: EXECUTION_EVENTS.PARALLEL_BRANCH_ERROR,
                        eventRole: EVENT_ROLES.BOUNDARY_END,
                        boundaryType: BOUNDARY_TYPES.BRANCH,
                        boundaryId: branchBoundaryId,
                        traceId,
                        data: {
                            branchIndex: index + 1,
                            totalBranches: roles.length,
                            status,
                            error: 'Branch execution failed'
                        }
                    },
                    'Parallel branch failed'
                );

                return {
                    role,
                    output: `[Error in ${role} branch]`,
                    usage: { prompt: 0, completion: 0 },
                    duration,
                    success: false,
                    error: 'Branch execution failed'
                };
            }
        } catch (error) {
            // Re-throw interrupt errors to cancel all branches
            if (isInterruptError(error)) {
                throw error;
            }

            childLogger.error(
                {
                    event: EXECUTION_EVENTS.PARALLEL_BRANCH_ERROR,
                    eventRole: 'boundary_end',
                    boundaryType: 'branch',
                    boundaryId: branchBoundaryId,
                    traceId,
                    data: {
                        role,
                        adaptationKey,
                        branch: index + 1,
                        totalBranches: roles.length,
                        error: error.message
                    }
                },
                'Parallel branch error'
            );

            return {
                role,
                output: `[Error: ${error.message}]`,
                usage: { prompt: 0, completion: 0 },
                success: false,
                error: error.message
            };
        }
    });

    // Wait for all parallel executions to complete
    const startTime = Date.now();
    const results = await Promise.allSettled(rolePromises);
    const totalDuration = Date.now() - startTime;

    // Get result strategy from plan
    // Default to 'formatted' if module has formatResponse, otherwise 'label'
    const resultStrategy =
        plan.resultStrategy || (module?.orchestration?.formatResponse ? 'formatted' : 'label');

    // Process results
    const processedResults = results.map((result, index) => {
        if (result.status === 'fulfilled') {
            const roleResult = result.value;

            // Aggregate usage
            aggregateUsage.prompt += roleResult.usage?.prompt || 0;
            aggregateUsage.completion += roleResult.usage?.completion || 0;

            return roleResult;
        } else {
            // Promise rejected
            const item = roles[index];
            const role = typeof item === 'string' ? item : item.role;

            return {
                role,
                output: `[Error: ${result.reason?.message || 'Unknown error'}]`,
                success: false
            };
        }
    });

    // Format output based on result strategy
    let combinedOutput;

    if (resultStrategy === 'last') {
        // Return only the last successful output (unusual for parallel, but allowed)
        const lastSuccess = processedResults.filter((r) => r.success).pop();
        combinedOutput = lastSuccess?.output || '[All branches failed]';
    } else if (resultStrategy === 'concat') {
        // Concatenate all outputs without labels
        combinedOutput = processedResults
            .filter((r) => r.success)
            .map((r) => r.output)
            .join('\n\n');
    } else if (resultStrategy === 'formatted' && module?.orchestration?.formatResponse) {
        // Use module's format function
        combinedOutput = module.orchestration.formatResponse(
            processedResults.map((r) => ({
                role: r.role,
                content: r.output
            }))
        );
    } else {
        // Default 'label' strategy
        combinedOutput = processedResults
            .map((r) => `[${r.role}]\n${r.output}`)
            .join('\n\n---\n\n');
    }

    const successfulBranches = processedResults.filter((r) => r.success).length;

    logger.info(
        {
            event: EXECUTION_EVENTS.PARALLEL_COMPLETE,
            eventRole: EVENT_ROLES.BOUNDARY_END,
            boundaryType: BOUNDARY_TYPES.EXECUTION,
            boundaryId: executionBoundaryId,
            parentBoundaryId: context.parentBoundaryId || null,
            traceId,
            data: {
                strategy: 'parallel',
                totalBranches: roles.length,
                successfulBranches,
                totalDuration,
                aggregateUsage
            }
        },
        'Parallel execution completed'
    );

    return {
        response: {
            output: combinedOutput,
            usage: aggregateUsage,
            model: config?.model || 'gpt-4o-mini',
            metadata: {
                strategy: 'parallel',
                roles,
                branches: roles.length,
                successfulBranches,
                depth: context.depth || 0,
                totalDuration
            }
        }
    };
}
