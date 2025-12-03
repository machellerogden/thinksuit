/**
 * execSequential handler - core logic only
 * Effectful execution plane - orchestrates sequential role execution
 */

import { createSpanLogger } from '../logger.js';
import { runCycle } from '../runCycle.js';
import { EXECUTION_EVENTS, EVENT_ROLES, BOUNDARY_TYPES } from '../constants/events.js';
import { InterruptError } from '../errors/InterruptError.js';

// Default sequential framing prompts (fallbacks when module doesn't provide them)
const DEFAULT_SEQUENTIAL_PROMPTS = {
    planOverview: ({ stepCount, roleNames }) =>
        `We're going to work in a sequence of ${stepCount} steps: ${roleNames.join(', ')}.`,
    stepStart: ({ stepNumber, role, hasTools, isFirstStep }) => {
        let message = `This is the start of step ${stepNumber}: ${role}.`;
        if (hasTools) {
            message += ' Tools are available for this step.';
        }
        if (!isFirstStep) {
            const stepWord = stepNumber === 2 ? 'step' : 'steps';
            message += ` Use context provided in previous ${stepWord}.`;
        }
        return message;
    },
    stepEnd: ({ stepNumber, role }) =>
        `This is the end of step ${stepNumber}: ${role}.`
};

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
        userInput = '',
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

    // Get threadAccumulation flag (defaults to true)
    const threadAccumulation = plan.threadAccumulation ?? true;

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
                threadAccumulation
            }
        },
        'Starting sequential execution'
    );

    const results = [];
    let aggregateUsage = { prompt: 0, completion: 0 };
    let previousOutput = null;

    // Accumulated thread for threadAccumulation mode
    let accumulatedThread = [...thread]; // Start with original thread

    // Add sequential plan overview before starting steps
    const roleNames = sequence.map(step => typeof step === 'string' ? step : step.role);
    const planOverviewPrompt = module?.prompts?.['adapt.sequential-plan-overview'] || DEFAULT_SEQUENTIAL_PROMPTS.planOverview;
    const planOverviewContent = typeof planOverviewPrompt === 'function'
        ? planOverviewPrompt({ stepCount: sequence.length, roleNames })
        : planOverviewPrompt;

    accumulatedThread.push({
        role: 'user',
        content: planOverviewContent
    });

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
        const adaptations = typeof step === 'object' ? (step.adaptations || []) : [];
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
            adaptations,
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
            let stepThread;

            if (threadAccumulation) {
                // Use accumulated thread from previous steps
                // Add step start marker to the thread the task will see
                const stepStartPrompt = module?.prompts?.['adapt.sequential-step-start'] || DEFAULT_SEQUENTIAL_PROMPTS.stepStart;
                const stepStartContent = typeof stepStartPrompt === 'function'
                    ? stepStartPrompt({
                        stepNumber,
                        role,
                        hasTools: stepTools && stepTools.length > 0,
                        isFirstStep: stepNumber === 1
                    })
                    : stepStartPrompt;

                const stepStartMessage = {
                    role: 'user',
                    content: stepStartContent
                };
                stepThread = [...accumulatedThread, stepStartMessage];
            } else {
                // No threadAccumulation: start with original thread
                stepThread = [...thread];
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
                    adaptations,
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
                input: i === 0 ? userInput : '', // Pass user input only to first step
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
                compositionType: i === 0 ? 'default' : 'accumulation', // First step is default, subsequent are accumulation
                machineDefinition: machineContext.machineDefinition,
                handlers: machineContext.handlers,
                config: childConfig,
                discoveredTools: machineContext.discoveredTools, // Pass discovered tools to child
                abortSignal // Propagate abort signal
            });
            const duration = Date.now() - startTime;

            if (status === 'SUCCEEDED' && childResult?.handlerResult?.response) {
                const roleResponse = childResult.handlerResult.response;

                // Store result
                results.push({
                    role,
                    step: stepNumber,
                    adaptations,
                    output: roleResponse.output,
                    usage: roleResponse.usage,
                    duration
                });

                // Aggregate usage
                aggregateUsage.prompt += roleResponse.usage?.prompt || 0;
                aggregateUsage.completion += roleResponse.usage?.completion || 0;

                // Always pass output forward for next step
                previousOutput = roleResponse.output;

                // Accumulate thread if threadAccumulation is enabled
                if (threadAccumulation) {
                    const composedThread = roleResponse?.instructions?.thread
                        || childResult?.instructions?.thread
                        || [];

                    // composedThread includes stepThread (which has step start marker) + new framing
                    // We only want the new framing messages (after stepThread)
                    const newFramingMessages = composedThread.slice(stepThread.length);

                    // stepThread already includes: accumulatedThread + stepStartMessage
                    // So composedThread includes: accumulatedThread + stepStartMessage + newFraming
                    // newFramingMessages = just the new framing
                    // We need to add: stepStartMessage + newFraming + response + stepEndMessage

                    // Build step start message with same content as passed to task
                    const stepStartPrompt = module?.prompts?.['adapt.sequential-step-start'] || DEFAULT_SEQUENTIAL_PROMPTS.stepStart;
                    const stepStartContent = typeof stepStartPrompt === 'function'
                        ? stepStartPrompt({
                            stepNumber,
                            role,
                            hasTools: stepTools && stepTools.length > 0,
                            isFirstStep: stepNumber === 1
                        })
                        : stepStartPrompt;
                    const stepStartMessage = {
                        role: 'user',
                        content: stepStartContent
                    };

                    accumulatedThread = [
                        ...accumulatedThread,
                        stepStartMessage,
                        ...newFramingMessages,
                        {
                            role: 'assistant',
                            content: roleResponse.output,
                            semantic: 'response'
                        }
                    ];
                }

                // Add step end marker
                const stepEndPrompt = module?.prompts?.['adapt.sequential-step-end'] || DEFAULT_SEQUENTIAL_PROMPTS.stepEnd;
                const stepEndContent = typeof stepEndPrompt === 'function'
                    ? stepEndPrompt({ stepNumber, role })
                    : stepEndPrompt;
                const stepEndMessage = {
                    role: 'user',
                    content: stepEndContent
                };
                accumulatedThread.push(stepEndMessage);

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
                        boundaryType: BOUNDARY_TYPES.STEP,
                        boundaryId: stepBoundaryId,
                        parentBoundaryId: executionBoundaryId,
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
                    boundaryType: BOUNDARY_TYPES.STEP,
                    boundaryId: stepBoundaryId,
                    parentBoundaryId: executionBoundaryId,
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
