/**
 * execTask handler - Bounded multi-cycle execution
 * Effectful execution plane - orchestrates task completion through multiple LLM-tool cycles
 */

import { createSpanLogger } from '../logger.js';
import { runCycle } from '../runCycle.js';
import { EXECUTION_EVENTS, EVENT_ROLES, BOUNDARY_TYPES } from '../constants/events.js';
import { requestToolApproval } from '../approval/async.js';
import { callMCPTool } from '../mcp/execution.js';
import { InterruptError, isInterruptError } from '../errors/InterruptError.js';

// Default task progress prompts (fallbacks when module doesn't provide them)
const DEFAULT_TASK_PROMPTS = {
    limited: 'Token budget limited.',
    available: 'Resources available.',
    complete: 'I have completed my task.',
    synthesis: 'What did you discover?',
    continue: 'Continue.'
};

/**
 * Core task execution logic - enables multi-cycle execution with tools
 * @param {Object} input - { plan, instructions, thread, context, policy }
 * @param {Object} machineContext - Machine context with handlers and config
 * @returns {Object} - { response: Response }
 */
export async function execTaskCore(input, machineContext) {
    const { plan = {}, instructions = {}, thread = [], userInput = '', context = {}, compositionType = 'default', /*policy = {}*/ } = input;
    const { module, config, execLogger: logger, abortSignal } = machineContext;

    const traceId = context.traceId;

    // Resolution contract with defaults
    const resolution = plan.resolution || {
        maxCycles: 3,
        maxTokens: 8000,
        maxToolCalls: 5,
        timeoutMs: 60000
    };

    const executionBoundaryId = `exec-task-${context.sessionId}-${Date.now()}`;
    const parentBoundaryId = context.parentBoundaryId || null;

    logger.info(
        {
            event: EXECUTION_EVENTS.TASK_START,
            eventRole: EVENT_ROLES.BOUNDARY_START,
            boundaryType: BOUNDARY_TYPES.EXECUTION,
            boundaryId: executionBoundaryId,
            parentBoundaryId,
            traceId,
            data: {
                strategy: 'task',
                role: plan.role,
                tools: plan.tools?.length || 0,
                resolution,
                depth: context.depth || 0,
                threadReceived: thread?.length || 0,
                compositionType
            }
        },
        'Starting task execution'
    );

    let cycleCount = 0;
    let totalTokens = 0;
    let totalToolCalls = 0;
    let taskThread = [...thread]; // Internal working thread with all tool calls/cycles
    let currentThread = [...(instructions?.thread || [])]; // Framing thread from composition
    let lastResponse = null;
    let continueTask = true;
    let errorMessage = null;
    let stoppedForSynthesis = false;
    const startTime = Date.now();

    while (continueTask && cycleCount < resolution.maxCycles) {
        cycleCount++;

        // Check for interruption
        if (abortSignal?.aborted) {
            throw new InterruptError('Task interrupted by user', {
                stage: 'task-cycle',
                cycleCount,
                tokensUsed: totalTokens,
                toolCallsExecuted: totalToolCalls,
                thread: currentThread,
                gatheredData: lastResponse
            });
        }

        // Check time budget
        if (Date.now() - startTime >= resolution.timeoutMs) {
            logger.warn({
                event: 'execution.task.timeout_reached',
                traceId,
                boundaryType: BOUNDARY_TYPES.EXECUTION,
                boundaryId: executionBoundaryId,
                parentBoundaryId,
                cycleCount
            }, 'Task timeout reached');
            break;
        }

        // Check token budget (but still allow one more cycle to use remaining tokens)
        // We'll log the warning after the cycle if we exceed

        // Check tool call budget (only if tools are enabled)
        if (resolution.maxToolCalls > 0 && totalToolCalls >= resolution.maxToolCalls) {
            logger.warn({
                event: 'execution.task.tool_budget_exhausted',
                traceId,
                boundaryType: BOUNDARY_TYPES.EXECUTION,
                boundaryId: executionBoundaryId,
                parentBoundaryId,
                cycleCount,
                totalToolCalls
            }, 'Tool call budget exhausted');
            break;
        }

        const cycleLogger = createSpanLogger(logger, `task-cycle-${cycleCount}`, {
            cycle: cycleCount,
            maxCycles: resolution.maxCycles,
            remainingTokens: resolution.maxTokens - totalTokens,
            parentBoundaryId: executionBoundaryId
        });

        const cycleBoundaryId = `cycle-${executionBoundaryId}-${cycleCount}`;

        cycleLogger.info(
            {
                event: EXECUTION_EVENTS.TASK_CYCLE_START,
                eventRole: EVENT_ROLES.BOUNDARY_START,
                boundaryType: BOUNDARY_TYPES.CYCLE,
                boundaryId: cycleBoundaryId,
                data: { threadLength: taskThread.length }
            },
            'Starting task cycle'
        );

        try {
            // Execute a cycle with task context (pass abort signal)
            const [status, result] = await runCycle({
                logger: cycleLogger,
                thread: taskThread,
                input: cycleCount === 1 ? userInput : '', // Pass user input only to first cycle
                module,
                depth: (context.depth || 0) + 1,
                branch: `${context.branch || 'root'}.task-${cycleCount}`,
                traceId,
                parentSpanId: cycleLogger.bindings().spanId,
                sessionId: context.sessionId,
                parentBoundaryId: cycleBoundaryId, // Pass cycle boundary as parent for nested executions
                selectedPlan: {
                    strategy: 'direct',
                    role: plan.role,
                    tools: plan.tools,
                    taskContext: {
                        cycle: cycleCount,
                        maxCycles: resolution.maxCycles,
                        isTask: true
                    },
                    maxTokens: Math.min(
                        plan.maxTokens || 2000,
                        resolution.maxTokens - totalTokens
                    )
                },
                compositionType: cycleCount === 1 ? compositionType : 'continuation', // First cycle uses given type (default/accumulation), subsequent are continuation
                machineDefinition: machineContext.machineDefinition,
                handlers: machineContext.handlers,
                config,
                discoveredTools: machineContext.discoveredTools,
                abortSignal  // Pass abort signal to nested cycle
            });

            if (status === 'SUCCEEDED' && result?.handlerResult?.response) {
                const response = result.handlerResult.response;
                lastResponse = response;

                // Track usage
                const usage = response.usage || {};
                totalTokens += (usage.prompt || 0) + (usage.completion || 0);

                // Get finish reason for logging
                const finishReason = response.finishReason;

                // Check if we need to stop to preserve synthesis budget
                // Reserve at least 500 tokens for final synthesis
                const SYNTHESIS_TOKEN_RESERVE = 500; // I HATE THIS BEING BURIED HERE
                if (totalTokens >= resolution.maxTokens - SYNTHESIS_TOKEN_RESERVE) {
                    logger.warn({
                        event: 'execution.task.synthesis_budget_triggered',
                        traceId,
                        boundaryType: BOUNDARY_TYPES.EXECUTION,
                        boundaryId: executionBoundaryId,
                        parentBoundaryId,
                        cycleCount,
                        totalTokens,
                        tokensReserved: SYNTHESIS_TOKEN_RESERVE
                    }, 'Stopping to preserve tokens for synthesis');
                    stoppedForSynthesis = true;
                    continueTask = false;
                } else {
                    // Use provider's finishReason to determine continuation
                    // All providers normalize to canonical values: end_turn, tool_use, max_tokens, continue
                    const isToolUse = finishReason === 'tool_use';
                    const shouldStop = finishReason === 'max_tokens';
                    const isTextResponse = finishReason === 'end_turn';
                    const shouldContinue = finishReason === 'continue';

                    // Continue if:
                    // - Tool use (normal flow)
                    // - Model signaled continue (Anthropic pause_turn)
                    // - Text response with budget remaining (prompt to continue)
                    // - Max tokens reached (let synthesis happen)
                    continueTask = isToolUse || shouldContinue || shouldStop || (isTextResponse && cycleCount < resolution.maxCycles);
                }

                // Update thread for next cycle if continuing
                if (continueTask) {
                    // Add the raw output items from the Responses API
                    // These include function_call items that must be present for function_call_output matching
                    if (response.outputItems) {
                        taskThread = [
                            ...taskThread,
                            ...response.outputItems
                        ];
                    } else {
                        // Fallback for providers that don't return outputItems
                        const assistantMessage = {
                            role: 'assistant'
                        };

                        // Only add content if there's actual output
                        if (response.output) {
                            assistantMessage.content = response.output;
                        }

                        taskThread = [
                            ...taskThread,
                            assistantMessage
                        ];
                    }

                    // If we have tool calls, process them before next cycle
                    if (response.toolCalls && plan.tools) {
                        let toolResults = [];

                        for (const toolCall of response.toolCalls) {
                            // Convert from API format to our internal format
                            const request = {
                                tool: toolCall.function?.name || toolCall.name,
                                args: toolCall.function?.arguments || toolCall.arguments
                            };
                            if (!plan.tools.includes(request.tool)) {
                                cycleLogger.warn(
                                    {
                                        traceId,
                                        boundaryType: BOUNDARY_TYPES.CYCLE,
                                        boundaryId: cycleBoundaryId,
                                        parentBoundaryId: executionBoundaryId
                                    },
                                    `Tool ${request.tool} not available in plan`
                                );
                                continue;
                            }

                            // Create tool execution boundary
                            const toolBoundaryId = `tool-${request.tool}-${context.sessionId}-${Date.now()}`;

                            cycleLogger.info({
                                event: EXECUTION_EVENTS.TOOL_START,
                                eventRole: EVENT_ROLES.BOUNDARY_START,
                                boundaryType: BOUNDARY_TYPES.TOOL,
                                boundaryId: toolBoundaryId,
                                parentBoundaryId: cycleBoundaryId,
                                traceId,
                                data: request
                            }, `Tool execution start: ${request.tool}`);

                            cycleLogger.info({
                                event: EXECUTION_EVENTS.TOOL_REQUESTED,
                                parentBoundaryId: toolBoundaryId,
                                traceId,
                                data: request
                            }, `Tool requested: ${request.tool}`);

                            // Request approval (this is where the approval dialog appears)
                            const { approved, approvalId } = config?.autoApproveTools
                                ? { approved: true, approvalId: null }
                                : await requestToolApproval(request, context.sessionId || config?.sessionId, cycleLogger, config?.approvalTimeout, toolBoundaryId);

                            if (!approved) {
                                cycleLogger.info({
                                    event: EXECUTION_EVENTS.TOOL_DENIED,
                                    approvalId,
                                    parentBoundaryId: toolBoundaryId,
                                    traceId,
                                    data: request
                                }, `Tool denied: ${request.tool}`);

                                cycleLogger.info({
                                    event: EXECUTION_EVENTS.TOOL_COMPLETE,
                                    eventRole: EVENT_ROLES.BOUNDARY_END,
                                    boundaryType: BOUNDARY_TYPES.TOOL,
                                    boundaryId: toolBoundaryId,
                                    parentBoundaryId: cycleBoundaryId,
                                    traceId,
                                    data: { request, denied: true }
                                }, `Tool execution complete: ${request.tool} (denied)`);

                                toolResults.push({
                                    tool: request.tool,
                                    result: '[Tool Request Denied]',
                                    success: false
                                });
                                continue;
                            }

                            // Log approval
                            cycleLogger.info({
                                event: EXECUTION_EVENTS.TOOL_APPROVED,
                                approvalId,
                                parentBoundaryId: toolBoundaryId,
                                traceId,
                                data: request
                            }, `Tool approved: ${request.tool}`);

                            // Check for interruption before tool execution
                            if (abortSignal?.aborted) {
                                throw new InterruptError('Interrupted during tool execution', {
                                    stage: 'tool-execution',
                                    cycleCount,
                                    tokensUsed: totalTokens,
                                    toolCallsExecuted: totalToolCalls,
                                    pendingTool: request.tool
                                });
                            }

                            // Execute the tool
                            try {
                                // MCP tools are required
                                if (!machineContext.discoveredTools) {
                                    throw new Error('No MCP tools discovered. Cannot execute tool requests.');
                                }
                                const toolResult = await callMCPTool(request, machineContext.discoveredTools);

                                if (toolResult.success) {
                                    cycleLogger.info({
                                        event: EXECUTION_EVENTS.TOOL_EXECUTED,
                                        parentBoundaryId: toolBoundaryId,
                                        traceId,
                                        data: { request, result: toolResult }
                                    }, `Tool executed: ${request.tool}`);

                                    cycleLogger.info({
                                        event: EXECUTION_EVENTS.TOOL_COMPLETE,
                                        eventRole: EVENT_ROLES.BOUNDARY_END,
                                        boundaryType: BOUNDARY_TYPES.TOOL,
                                        boundaryId: toolBoundaryId,
                                        parentBoundaryId: cycleBoundaryId,
                                        traceId,
                                        data: { request, success: true }
                                    }, `Tool execution complete: ${request.tool}`);

                                    toolResults.push({
                                        tool: request.tool,
                                        result: toolResult.result,
                                        success: true
                                    });
                                } else {
                                    cycleLogger.error({
                                        event: EXECUTION_EVENTS.TOOL_ERROR,
                                        parentBoundaryId: toolBoundaryId,
                                        traceId,
                                        data: { request, error: toolResult.error }
                                    }, `Tool failed: ${request.tool}`);

                                    cycleLogger.info({
                                        event: EXECUTION_EVENTS.TOOL_COMPLETE,
                                        eventRole: EVENT_ROLES.BOUNDARY_END,
                                        boundaryType: BOUNDARY_TYPES.TOOL,
                                        boundaryId: toolBoundaryId,
                                        parentBoundaryId: cycleBoundaryId,
                                        traceId,
                                        data: { request, error: toolResult.error }
                                    }, `Tool execution complete: ${request.tool} (failed)`);

                                    toolResults.push({
                                        tool: request.tool,
                                        result: `Error: ${toolResult.error}`,
                                        success: false
                                    });
                                }

                                totalToolCalls++;
                            } catch (error) {
                                cycleLogger.error({
                                    event: EXECUTION_EVENTS.TOOL_ERROR,
                                    parentBoundaryId: toolBoundaryId,
                                    traceId,
                                    data: { request, error: error.message }
                                }, `Tool execution failed: ${error.message}`);

                                cycleLogger.info({
                                    event: EXECUTION_EVENTS.TOOL_COMPLETE,
                                    eventRole: EVENT_ROLES.BOUNDARY_END,
                                    boundaryType: BOUNDARY_TYPES.TOOL,
                                    boundaryId: toolBoundaryId,
                                    parentBoundaryId: cycleBoundaryId,
                                    traceId,
                                    data: { request, error: error.message }
                                }, `Tool execution complete: ${request.tool} (exception)`);

                                toolResults.push({
                                    tool: request.tool,
                                    result: `Error: ${error.message}`,
                                    success: false
                                });
                            }
                        }

                        // Add tool results to thread
                        if (toolResults.length > 0 && response.toolCalls) {
                            // For Responses API, add function_call_output items directly
                            let toolCallIndex = 0;
                            for (const toolCall of response.toolCalls) {
                                const toolResult = toolResults[toolCallIndex];
                                if (toolResult) {
                                    if (response.outputItems) {
                                        // Add as function_call_output item for Responses API
                                        taskThread.push({
                                            type: 'function_call_output',
                                            call_id: toolCall.id || toolCall.call_id,
                                            output: toolResult.result
                                        });
                                    } else {
                                        // Fallback to internal format for providers without outputItems
                                        taskThread.push({
                                            role: 'tool',
                                            tool_call_id: toolCall.id || toolCall.call_id,
                                            content: toolResult.result
                                        });
                                    }
                                }
                                toolCallIndex++;
                            }
                        }
                    }

                    // If text response (no tools), prompt to continue
                    const isTextResponse = finishReason === 'stop' || finishReason === 'end_turn';
                    if (continueTask && isTextResponse && !response.toolCalls) {
                        taskThread.push({
                            role: 'user',
                            content: module?.prompts?.['adapt.task-continue'] || DEFAULT_TASK_PROMPTS.continue
                        });
                    }

                }

                // Log cycle complete AFTER all tool processing
                cycleLogger.info(
                    {
                        event: EXECUTION_EVENTS.TASK_CYCLE_COMPLETE,
                        eventRole: EVENT_ROLES.BOUNDARY_END,
                        boundaryType: BOUNDARY_TYPES.CYCLE,
                        boundaryId: cycleBoundaryId,
                        data: {
                            finishReason,
                            continueTask,
                            tokensUsed: (usage.prompt || 0) + (usage.completion || 0),
                            totalTokens
                        }
                    },
                    'Task cycle completed'
                );
            } else {
                // Cycle failed
                logger.error(
                    {
                        traceId,
                        boundaryType: BOUNDARY_TYPES.EXECUTION,
                        boundaryId: executionBoundaryId,
                        parentBoundaryId,
                        cycleCount,
                        status,
                        error: result?.error
                    },
                    'Task cycle failed'
                );
                continueTask = false;
            }
        } catch (error) {
            // Handle interruption specially
            if (isInterruptError(error)) {
                // Enhance the interrupt error with task context
                error.cycleCount = cycleCount;
                error.tokensUsed = totalTokens;
                error.toolCallsExecuted = totalToolCalls;
                error.gatheredData = lastResponse;
                error.thread = currentThread;
                throw error;
            }

            logger.error(
                {
                    traceId,
                    boundaryType: BOUNDARY_TYPES.EXECUTION,
                    boundaryId: executionBoundaryId,
                    parentBoundaryId,
                    cycleCount,
                    error: error.message
                },
                'Task cycle error'
            );
            continueTask = false;
            errorMessage = error.message;

            // Return partial result if we have one
            if (lastResponse) {
                break;
            }
            throw error;
        }
    }

    // Do synthesis if:
    // - Last response was tool_use with no text output
    // - OR we stopped to preserve synthesis budget
    const needsSynthesis = (lastResponse?.finishReason === 'tool_use' && !lastResponse?.output) || stoppedForSynthesis;

    if (needsSynthesis) {
        cycleCount++; // Count as a cycle for accurate reporting
        const cycleLogger = createSpanLogger(logger, 'task-cycle-synthesis', {
            cycle: cycleCount,
            forced: true,
            parentBoundaryId: executionBoundaryId
        });

        const synthesisCycleBoundaryId = `cycle-${executionBoundaryId}-synthesis`;

        cycleLogger.info(
            {
                event: EXECUTION_EVENTS.TASK_CYCLE_START,
                eventRole: EVENT_ROLES.BOUNDARY_START,
                boundaryType: BOUNDARY_TYPES.CYCLE,
                boundaryId: synthesisCycleBoundaryId
            },
            'Forcing synthesis cycle'
        );

        try {
            // Frame the work as completed before asking for synthesis
            const taskCompleteMessage = {
                role: 'assistant',
                content: module?.prompts?.['adapt.task-complete'] || DEFAULT_TASK_PROMPTS.complete
            };
            taskThread.push(taskCompleteMessage);
            currentThread.push(taskCompleteMessage);

            // Add synthesis instruction to thread
            const taskSynthesisMessage = {
                role: 'user',
                content: module?.prompts?.['adapt.task-synthesis'] || DEFAULT_TASK_PROMPTS.synthesis
            };
            taskThread.push(taskSynthesisMessage);
            currentThread.push(taskSynthesisMessage);

            // Execute synthesis without tools
            const [status, result] = await runCycle({
                logger: cycleLogger,
                thread: taskThread,
                module,
                depth: (context.depth || 0) + 1,
                branch: `${context.branch || 'root'}.synthesis`,
                traceId,
                parentSpanId: cycleLogger.bindings().spanId,
                sessionId: context.sessionId,
                parentBoundaryId: synthesisCycleBoundaryId, // Pass synthesis cycle boundary as parent for nested executions
                selectedPlan: {
                    strategy: 'direct',
                    role: plan.role,
                    // No tools - force text synthesis
                    // Ensure minimum 1000 tokens for synthesis
                    maxTokens: Math.max(1000, Math.min(2000, resolution.maxTokens - totalTokens || 2000))
                },
                compositionType: 'continuation', // Synthesis is a continuation of the task cycles
                machineDefinition: machineContext.machineDefinition,
                handlers: machineContext.handlers,
                config,
                discoveredTools: machineContext.discoveredTools,
                abortSignal  // Pass abort signal to nested cycle
            });

            if (status === 'SUCCEEDED' && result?.handlerResult?.response) {
                lastResponse = result.handlerResult.response;
                const usage = lastResponse.usage || {};
                totalTokens += (usage.prompt || 0) + (usage.completion || 0);
            }

            cycleLogger.info(
                {
                    event: EXECUTION_EVENTS.TASK_CYCLE_COMPLETE,
                    eventRole: EVENT_ROLES.BOUNDARY_END,
                    boundaryType: BOUNDARY_TYPES.CYCLE,
                    boundaryId: synthesisCycleBoundaryId,
                    data: { synthesized: !!lastResponse?.output }
                },
                'Synthesis cycle complete'
            );
        } catch (error) {
            cycleLogger.error(
                {
                    traceId,
                    boundaryType: BOUNDARY_TYPES.EXECUTION,
                    boundaryId: executionBoundaryId,
                    parentBoundaryId,
                    error: error.message
                },
                'Synthesis cycle failed'
            );
        }
    }

    // Determine final finish reason
    let finalFinishReason = 'complete';
    if (cycleCount >= resolution.maxCycles) {
        finalFinishReason = 'max_cycles';
    } else if (totalTokens >= resolution.maxTokens) {
        finalFinishReason = 'max_tokens';
    } else if (Date.now() - startTime >= resolution.timeoutMs) {
        finalFinishReason = 'timeout';
    } else if (resolution.maxToolCalls > 0 && totalToolCalls >= resolution.maxToolCalls) {
        finalFinishReason = 'max_tool_calls';
    } else if (lastResponse?.finishReason) {
        // Use the last response's finish reason if it's not a continuation signal
        const lastReason = lastResponse.finishReason;
        if (lastReason !== 'tool_use' && lastReason !== 'tool_calls' && lastReason !== 'max_tokens') {
            finalFinishReason = lastReason;
        }
    }

    logger.info(
        {
            event: EXECUTION_EVENTS.TASK_COMPLETE,
            eventRole: EVENT_ROLES.BOUNDARY_END,
            boundaryType: BOUNDARY_TYPES.EXECUTION,
            boundaryId: executionBoundaryId,
            parentBoundaryId,
            traceId,
            data: {
                strategy: 'task',
                cyclesUsed: cycleCount,
                totalTokens,
                totalToolCalls,
                duration: Date.now() - startTime,
                finalFinishReason,
                model: config.model
            }
        },
        'Task execution completed'
    );

    logger.info({
        event: 'execution.task.debug.instructions',
        traceId,
        data: {
            hasInstructions: !!instructions,
            instructionsKeys: instructions ? Object.keys(instructions) : null,
            threadLength: instructions?.thread?.length || 0
        }
    }, 'Debug: instructions before return');

    const result = {
        response: {
            output: lastResponse?.output || '',
            usage: {
                prompt: totalTokens, // Aggregate usage
                completion: 0 // Already included in total
            },
            model: lastResponse?.model || config.model,
            finishReason: finalFinishReason,
            metadata: {
                strategy: 'task',
                cyclesUsed: cycleCount,
                totalTokens,
                totalToolCalls,
                resolution
            },
            instructions: {
                thread: currentThread
            }
        }
    };

    // Add error if one occurred
    if (errorMessage) {
        result.response.error = errorMessage;
    }

    logger.info({
        event: 'execution.task.debug.result',
        traceId,
        data: {
            hasInstructionsInResult: !!result.response.instructions,
            resultThreadLength: result.response.instructions?.thread?.length || 0
        }
    }, 'Debug: result before return');

    return result;
}
