/**
 * execSequential handler - core logic only
 * Effectful execution plane - orchestrates sequential role execution
 */

import { createSpanLogger } from '../logger.js';
import { runCycle } from '../runCycle.js';
import { EXECUTION_EVENTS, EVENT_ROLES, BOUNDARY_TYPES } from '../constants/events.js';
import { InterruptError } from '../errors/InterruptError.js';

/**
 * Core sequential execution logic
 * @param {Object} input - { plan, instructions, thread, context, policy }
 * @param {Object} machineContext - Machine context with handlers and config
 * @returns {Object} - { response: Response }
 */
export async function execSequentialCore(input, machineContext) {
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

    // Validate we have a sequence to execute
    const sequence = plan.sequence || [];
    if (sequence.length === 0) {
        logger.error({ traceId }, 'No sequence provided for sequential execution');
        return {
            response: {
                output: 'No sequence provided for sequential execution',
                usage: { prompt: 0, completion: 0 },
                model: 'error',
                error: 'No sequence provided'
            }
        };
    }

    // Get result strategy from plan (default to 'last' for backward compatibility)
    const resultStrategy = plan.resultStrategy || 'last';

    // Get buildThread flag
    const buildThread = plan.buildThread || false;

    const executionBoundaryId = `exec-sequential-${context.sessionId}-${Date.now()}`;

    logger.info(
        {
            event: EXECUTION_EVENTS.SEQUENTIAL_START,
            eventRole: EVENT_ROLES.BOUNDARY_START,
            boundaryType: BOUNDARY_TYPES.EXECUTION,
            boundaryId: executionBoundaryId,
            parentBoundaryId: context.parentBoundaryId || null,
            traceId,
            data: {
                strategy: 'sequential',
                sequence,
                depth: context.depth || 0,
                resultStrategy,
                buildThread
            }
        },
        'Starting sequential execution'
    );

    const results = [];
    let aggregateUsage = { prompt: 0, completion: 0 };
    let previousOutput = null;

    // Build labeled conversation history for buildThread mode
    const conversationHistory = [];

    // Execute each role in sequence
    for (let i = 0; i < sequence.length; i++) {
        // Check for interruption before each step
        if (abortSignal?.aborted) {
            throw new InterruptError('Sequential execution interrupted', {
                stage: 'sequential-step',
                stepIndex: i,
                stepsCompleted: i,
                totalSteps: sequence.length,
                gatheredData: results,
                thread
            });
        }

        // Support both string and object format
        const step = sequence[i];
        const role = typeof step === 'string' ? step : step.role;
        const adaptationKey = typeof step === 'object' ? step.adaptationKey : null;
        const stepStrategy = typeof step === 'object' ? step.strategy : null;
        const stepResolution = typeof step === 'object' ? step.resolution : null;
        const stepTools = typeof step === 'object' ? step.tools : null;
        const stepNumber = i + 1;
        const branch = `${context.branch || 'root'}.step-${stepNumber}`;

        // Define step boundary ID for this iteration
        const stepBoundaryId = `step-${executionBoundaryId}-${i}`;

        // Create child logger with span for this sequential step
        const childLogger = createSpanLogger(logger, `exec-${role}`, {
            role,
            step: stepNumber,
            totalSteps: sequence.length,
            branch,
            adaptationKey,
            parentBoundaryId: executionBoundaryId
        });

        childLogger.info(
            {
                event: EXECUTION_EVENTS.SEQUENTIAL_STEP_START,
                eventRole: EVENT_ROLES.BOUNDARY_START,
                boundaryType: BOUNDARY_TYPES.STEP,
                boundaryId: stepBoundaryId
            },
            'Executing sequential step'
        );

        try {
            // Create child context for this role
            const childContext = {
                ...context,
                depth: (context.depth || 0) + 1,
                branch,
                traceId, // Keep same traceId
                previousOutput // Always pass previous output
            };

            // Build the thread for this step
            let stepThread = [...thread]; // Start with original thread

            if (buildThread && conversationHistory.length > 0) {
                // Build labeled conversation as a single user message
                let conversationText = '';

                // Add original user input if this is not the first step
                if (thread.length > 0 && thread.at(-1).role === 'user') {
                    conversationText = `[user]: ${thread.at(-1).content}\n\n`;
                }

                // Add all previous conversation history with labels
                conversationHistory.forEach((entry) => {
                    const label = entry.adaptationKey || entry.role || 'speaker';
                    conversationText += `[${label}]: ${entry.output}\n\n`;
                });

                // Replace the thread with a single user message containing the labeled conversation
                stepThread = [
                    {
                        role: 'user',
                        content: conversationText.trim()
                    }
                ];
            }

            // Build child input for state machine
            const childInput = {
                thread: stepThread,
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
                    rationale: `Sequential step ${stepNumber}: ${role}`
                }
            };

            // Determine tools for this step
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

            // Re-invoke state machine for this role using runCycle
            const startTime = Date.now();
            const [status, childResult] = await runCycle({
                logger: childLogger,
                thread: stepThread, // Use the step-specific thread
                module,
                depth: childContext.depth,
                branch: childContext.branch,
                traceId: childContext.traceId,
                spanId: null, // Let runCycle generate it
                parentSpanId: childLogger.bindings().spanId,
                sessionId: childLogger.bindings().sessionId,
                parentBoundaryId: stepBoundaryId, // Pass step boundary as parent for nested executions
                selectedPlan: childInput.selectedPlan,
                previousOutput: childContext.previousOutput,
                machineDefinition: machineContext.machineDefinition,
                handlers: machineContext.handlers,
                config: childConfig,
                discoveredTools: machineContext.discoveredTools, // Pass discovered tools to child
                abortSignal // Propagate abort signal
            });
            const duration = Date.now() - startTime;

            if (status === 'SUCCEEDED' && childResult?.responseResult?.response) {
                const roleResponse = childResult.responseResult.response;

                // Store result
                results.push({
                    role,
                    step: stepNumber,
                    adaptationKey,
                    output: roleResponse.output,
                    usage: roleResponse.usage,
                    duration
                });

                // Aggregate usage
                aggregateUsage.prompt += roleResponse.usage?.prompt || 0;
                aggregateUsage.completion += roleResponse.usage?.completion || 0;

                // Always pass output forward for next step
                previousOutput = roleResponse.output;

                // Build conversation history if requested
                if (buildThread) {
                    conversationHistory.push({
                        role,
                        adaptationKey,
                        output: roleResponse.output
                    });
                }

                // Log step completion
                childLogger.info(
                    {
                        event: EXECUTION_EVENTS.SEQUENTIAL_STEP_COMPLETE,
                        eventRole: EVENT_ROLES.BOUNDARY_END,
                        boundaryType: BOUNDARY_TYPES.STEP,
                        boundaryId: stepBoundaryId,
                        data: {
                            output: roleResponse.output,
                            usage: roleResponse.usage,
                            duration
                        }
                    },
                    `Step ${stepNumber} of ${sequence.length} completed`
                );
            } else {
                // Handle failure but continue sequence
                logger.warn(
                    {
                        event: EXECUTION_EVENTS.SEQUENTIAL_STEP_ERROR,
                        traceId,

                        data: {
                            role,
                            step: stepNumber,
                            totalSteps: sequence.length,
                            status,
                            error: 'Step execution failed'
                        }
                    },
                    'Sequential step failed, continuing'
                );

                results.push({
                    role,
                    step: stepNumber,
                    output: `[Error in ${role} step]`,
                    error: true
                });
            }
        } catch (error) {
            logger.error(
                {
                    event: EXECUTION_EVENTS.SEQUENTIAL_STEP_ERROR,
                    traceId,

                    data: {
                        role,
                        step: stepNumber,
                        totalSteps: sequence.length,
                        error: error.message
                    }
                },
                'Sequential step error'
            );

            // Record error but continue sequence
            results.push({
                role,
                step: stepNumber,
                output: `[Error: ${error.message}]`,
                error: true
            });
        }
    }

    // Format output based on result strategy
    let combinedOutput;

    if (resultStrategy === 'last') {
        // Return only the final output
        combinedOutput = results.at(-1)?.output || '';
    } else if (resultStrategy === 'concat') {
        // Concatenate all outputs without labels
        combinedOutput = results
            .filter((r) => !r.error)
            .map((r) => r.output)
            .join('\n\n');
    } else if (resultStrategy === 'formatted' && module?.orchestration?.formatResponse) {
        // Use module's format function
        combinedOutput = module.orchestration.formatResponse(
            results.map((r) => ({
                role: r.role,
                content: r.output
            }))
        );
    } else {
        // Default 'label' strategy
        combinedOutput = results.map((r) => `[${r.role}]\n${r.output}`).join('\n\n---\n\n');
    }

    logger.info(
        {
            event: EXECUTION_EVENTS.SEQUENTIAL_COMPLETE,
            eventRole: EVENT_ROLES.BOUNDARY_END,
            boundaryType: BOUNDARY_TYPES.EXECUTION,
            boundaryId: executionBoundaryId,
            parentBoundaryId: context.parentBoundaryId || null,
            traceId,
            data: {
                strategy: 'sequential',
                totalSteps: sequence.length,
                successfulSteps: results.filter((r) => !r.error).length,
                aggregateUsage
            }
        },
        'Sequential execution completed'
    );

    return {
        response: {
            output: combinedOutput,
            usage: aggregateUsage,
            model: config?.model || 'gpt-4o-mini',
            metadata: {
                strategy: 'sequential',
                sequence,
                steps: results.length,
                depth: context.depth || 0
            }
        }
    };
}
