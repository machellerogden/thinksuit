/**
 * executeTask - the agent loop.
 *
 * Standalone task-node executor: drives a standard agent loop by calling the
 * execution-plane primitives directly (callLLM, callMCPTool, requestToolApproval).
 * Invoked by the executePlan composer.
 *
 * A `task` node is one round-bounded loop: submit thread -> callLLM -> if the model
 * requested tools, approve + execute them and feed results back -> repeat until the
 * model stops requesting tools, or a bound (maxRounds / timeoutMs) is hit.
 */

import { callLLM } from '../providers/io.js';
import { callMCPTool } from '../mcp/execution.js';
import { requestToolApproval } from '../approval/async.js';
import { InterruptError, isInterruptError } from '../errors/InterruptError.js';
import { getRoleConfig, getDefaultRole, getRoleTemperature } from '../utils/module.js';
import { DEFAULT_MAX_TOKENS } from '../constants/defaults.js';
import {
    EXECUTION_EVENTS,
    PROCESSING_EVENTS,
    EVENT_ROLES,
    BOUNDARY_TYPES
} from '../constants/events.js';

// Loop bounds — kept local for now. Provisional: these migrate to defaults.js / the
// plan.v1 node schema once the loop config is locked.
const DEFAULT_MAX_ROUNDS = 3;
const DEFAULT_TASK_TIMEOUT_MS = 60000;

/**
 * Run the agent loop for a single task node.
 *
 * @param {Object} input - { node, thread, userInput, context }
 *   node    - plan.v1 task node: { type:'task', role, tools?, maxRounds?, timeoutMs?, params? }
 *   thread  - already-composed starting history (system prompt embedded as a
 *             role:'system' message; callLLM's cleanThreadForProvider extracts it)
 *   userInput - optional user input string for this node
 *   context - { sessionId, traceId, depth, branch, parentBoundaryId }
 * @param {Object} machineContext - { config, module, execLogger, abortSignal, discoveredTools }
 * @returns {Promise<{response: Object}>}
 */
export async function executeTask(input, machineContext) {
    const { node = {}, thread = [], userInput = '', context = {} } = input;
    const { config, module, execLogger: logger, abortSignal, discoveredTools } = machineContext;

    const traceId = context.traceId;
    const executionBoundaryId = `exec-task-${context.sessionId}-${Date.now()}`;
    const parentBoundaryId = context.parentBoundaryId || null;

    const roleConfig = getRoleConfig(module, node.role) || getDefaultRole(module);
    const temperature = getRoleTemperature(module, node.role);
    const maxTokens = node.params?.maxTokens ?? roleConfig?.baseTokens ?? DEFAULT_MAX_TOKENS;
    const maxRounds = node.maxRounds ?? DEFAULT_MAX_ROUNDS;
    const timeoutMs = node.timeoutMs ?? DEFAULT_TASK_TIMEOUT_MS;
    const tools = node.tools ?? [];

    // Build tool schemas for the node's allowlist from discovered tools.
    const toolSchemas = {};
    if (tools.length && discoveredTools) {
        for (const toolName of tools) {
            const tool = discoveredTools[toolName];
            if (tool) {
                toolSchemas[toolName] = {
                    description: tool.description,
                    inputSchema: tool.inputSchema
                };
            }
        }
    }

    // Working thread the loop grows with assistant turns + tool results.
    const workingThread = [...thread];
    if (userInput) {
        const tail = workingThread[workingThread.length - 1];
        const alreadyTail = tail && tail.role === 'user' && tail.content === userInput;
        if (!alreadyTail) {
            workingThread.push({ role: 'user', content: userInput });
        }
    }

    logger.info(
        {
            event: EXECUTION_EVENTS.TASK_START,
            eventRole: EVENT_ROLES.BOUNDARY_START,
            boundaryType: BOUNDARY_TYPES.EXECUTION,
            boundaryId: executionBoundaryId,
            parentBoundaryId,
            traceId,
            data: {
                role: node.role,
                tools: tools.length,
                maxRounds,
                timeoutMs,
                depth: context.depth || 0
            }
        },
        'Starting task execution'
    );

    const usage = { prompt: 0, completion: 0 };
    let round = 0;
    let totalToolCalls = 0;
    let lastResponse = null;
    let finishReason = 'complete';
    const startTime = Date.now();

    while (round < maxRounds) {
        round++;

        if (abortSignal?.aborted) {
            throw new InterruptError('Task interrupted by user', {
                stage: 'task-round',
                roundCount: round,
                tokensUsed: usage.prompt + usage.completion,
                toolCallsExecuted: totalToolCalls,
                thread: workingThread,
                gatheredData: lastResponse
            });
        }

        if (Date.now() - startTime >= timeoutMs) {
            finishReason = 'timeout';
            break;
        }

        const llmParams = {
            model: config?.model,
            systemInstructions: '',
            thread: workingThread,
            maxTokens,
            temperature
        };
        if (tools.length) {
            llmParams.tools = tools;
        }

        const llmBoundaryId = `llm-${context.sessionId}-${Date.now()}`;
        logger.info(
            {
                event: PROCESSING_EVENTS.LLM_REQUEST,
                eventRole: EVENT_ROLES.BOUNDARY_START,
                boundaryType: BOUNDARY_TYPES.LLM_EXCHANGE,
                boundaryId: llmBoundaryId,
                parentBoundaryId: executionBoundaryId,
                traceId,
                data: {
                    role: node.role,
                    thread: workingThread,
                    maxTokens,
                    temperature,
                    tools: llmParams.tools,
                    model: llmParams.model
                }
            },
            'LLM request'
        );

        let resp;
        try {
            resp = await callLLM(machineContext, llmParams, toolSchemas);
        } catch (error) {
            // Interrupts are a first-class outcome — propagate, don't mask.
            if (isInterruptError(error)) {
                throw error;
            }
            // Model error becomes an error-result. No benign-text masking: a parent
            // composite must be able to see that this node failed.
            logger.error(
                {
                    traceId,
                    boundaryType: BOUNDARY_TYPES.EXECUTION,
                    boundaryId: executionBoundaryId,
                    parentBoundaryId,
                    data: { error: error.message, code: error.code || 'E_UNKNOWN', round }
                },
                'Task LLM call failed'
            );
            return {
                response: {
                    output: '',
                    error: error.message,
                    finishReason: 'error',
                    usage,
                    model: 'error',
                    metadata: { role: node.role, rounds: round, totalToolCalls }
                }
            };
        }

        lastResponse = resp;
        usage.prompt += resp.usage?.prompt || 0;
        usage.completion += resp.usage?.completion || 0;
        finishReason = resp.finishReason;

        logger.info(
            {
                event: PROCESSING_EVENTS.LLM_RESPONSE,
                eventRole: EVENT_ROLES.BOUNDARY_END,
                boundaryType: BOUNDARY_TYPES.LLM_EXCHANGE,
                boundaryId: llmBoundaryId,
                parentBoundaryId: executionBoundaryId,
                traceId,
                data: {
                    role: node.role,
                    output: resp.output,
                    usage: resp.usage,
                    model: resp.model,
                    toolCalls: resp.toolCalls,
                    finishReason: resp.finishReason
                }
            },
            'LLM response'
        );

        // Append the assistant turn. Prefer raw output items (Responses API) so
        // function_call items are present to pair with function_call_output below;
        // otherwise carry tool_calls on a synthetic assistant message.
        if (resp.outputItems) {
            workingThread.push(...resp.outputItems);
        } else {
            const assistantMessage = { role: 'assistant' };
            if (resp.output) {
                assistantMessage.content = resp.output;
            }
            if (resp.toolCalls?.length) {
                assistantMessage.tool_calls = resp.toolCalls;
            }
            workingThread.push(assistantMessage);
        }

        // Continue only to feed tool results back, or when the provider signals a
        // pause/continue (e.g. Anthropic pause_turn). Otherwise the text is final.
        const wantsContinue = resp.toolCalls?.length > 0 || resp.finishReason === 'continue';
        if (!wantsContinue) {
            break;
        }

        if (resp.toolCalls?.length) {
            const toolResults = [];

            for (const toolCall of resp.toolCalls) {
                const request = {
                    tool: toolCall.function?.name || toolCall.name,
                    args: toolCall.function?.arguments || toolCall.arguments
                };

                // Enforce the node's tool allowlist. Record a result even when we
                // don't run it — the provider requires an output paired to every
                // tool call it emitted, matched by position below.
                if (!tools.includes(request.tool)) {
                    logger.warn(
                        { traceId, boundaryType: BOUNDARY_TYPES.EXECUTION, boundaryId: executionBoundaryId },
                        `Tool ${request.tool} not available in this task`
                    );
                    toolResults.push({
                        tool: request.tool,
                        result: `Error: tool ${request.tool} not available in this plan`,
                        success: false
                    });
                    continue;
                }

                const toolBoundaryId = `tool-${request.tool}-${context.sessionId}-${Date.now()}`;

                logger.info(
                    {
                        event: EXECUTION_EVENTS.TOOL_START,
                        eventRole: EVENT_ROLES.BOUNDARY_START,
                        boundaryType: BOUNDARY_TYPES.TOOL,
                        boundaryId: toolBoundaryId,
                        parentBoundaryId: executionBoundaryId,
                        traceId,
                        data: request
                    },
                    `Tool execution start: ${request.tool}`
                );

                logger.info(
                    {
                        event: EXECUTION_EVENTS.TOOL_REQUESTED,
                        parentBoundaryId: toolBoundaryId,
                        traceId,
                        data: request
                    },
                    `Tool requested: ${request.tool}`
                );

                const { approved, approvalId } = config?.autoApproveTools
                    ? { approved: true, approvalId: null }
                    : await requestToolApproval(
                        request,
                        context.sessionId || config?.sessionId,
                        logger,
                        config?.approvalTimeout,
                        toolBoundaryId
                    );

                if (!approved) {
                    logger.info(
                        { event: EXECUTION_EVENTS.TOOL_DENIED, approvalId, parentBoundaryId: toolBoundaryId, traceId, data: request },
                        `Tool denied: ${request.tool}`
                    );
                    logger.info(
                        {
                            event: EXECUTION_EVENTS.TOOL_COMPLETE,
                            eventRole: EVENT_ROLES.BOUNDARY_END,
                            boundaryType: BOUNDARY_TYPES.TOOL,
                            boundaryId: toolBoundaryId,
                            parentBoundaryId: executionBoundaryId,
                            traceId,
                            data: { request, denied: true }
                        },
                        `Tool execution complete: ${request.tool} (denied)`
                    );
                    toolResults.push({ tool: request.tool, result: '[Tool Request Denied]', success: false });
                    continue;
                }

                logger.info(
                    { event: EXECUTION_EVENTS.TOOL_APPROVED, approvalId, parentBoundaryId: toolBoundaryId, traceId, data: request },
                    `Tool approved: ${request.tool}`
                );

                if (abortSignal?.aborted) {
                    throw new InterruptError('Interrupted during tool execution', {
                        stage: 'tool-execution',
                        roundCount: round,
                        tokensUsed: usage.prompt + usage.completion,
                        toolCallsExecuted: totalToolCalls,
                        pendingTool: request.tool,
                        thread: workingThread
                    });
                }

                if (!discoveredTools) {
                    throw new Error('No MCP tools discovered. Cannot execute tool requests.');
                }

                // Tool errors become tool-result content — the model reacts to them;
                // they are never thrown out of the loop.
                const toolResult = await callMCPTool(request, discoveredTools);
                totalToolCalls++;

                if (toolResult.success) {
                    logger.info(
                        { event: EXECUTION_EVENTS.TOOL_EXECUTED, parentBoundaryId: toolBoundaryId, traceId, data: { request, result: toolResult } },
                        `Tool executed: ${request.tool}`
                    );
                    logger.info(
                        {
                            event: EXECUTION_EVENTS.TOOL_COMPLETE,
                            eventRole: EVENT_ROLES.BOUNDARY_END,
                            boundaryType: BOUNDARY_TYPES.TOOL,
                            boundaryId: toolBoundaryId,
                            parentBoundaryId: executionBoundaryId,
                            traceId,
                            data: { request, success: true }
                        },
                        `Tool execution complete: ${request.tool}`
                    );
                    toolResults.push({ tool: request.tool, result: toolResult.result, success: true });
                } else {
                    logger.error(
                        { event: EXECUTION_EVENTS.TOOL_ERROR, parentBoundaryId: toolBoundaryId, traceId, data: { request, error: toolResult.error } },
                        `Tool failed: ${request.tool}`
                    );
                    logger.info(
                        {
                            event: EXECUTION_EVENTS.TOOL_COMPLETE,
                            eventRole: EVENT_ROLES.BOUNDARY_END,
                            boundaryType: BOUNDARY_TYPES.TOOL,
                            boundaryId: toolBoundaryId,
                            parentBoundaryId: executionBoundaryId,
                            traceId,
                            data: { request, error: toolResult.error }
                        },
                        `Tool execution complete: ${request.tool} (failed)`
                    );
                    toolResults.push({ tool: request.tool, result: `Error: ${toolResult.error}`, success: false });
                }
            }

            // Append tool results, paired to the calls by position.
            let idx = 0;
            for (const toolCall of resp.toolCalls) {
                const toolResult = toolResults[idx];
                if (toolResult) {
                    if (resp.outputItems) {
                        workingThread.push({
                            type: 'function_call_output',
                            call_id: toolCall.id || toolCall.call_id,
                            output: toolResult.result
                        });
                    } else {
                        workingThread.push({
                            role: 'tool',
                            tool_call_id: toolCall.id || toolCall.call_id,
                            content: toolResult.result
                        });
                    }
                }
                idx++;
            }
        }
    }

    // Exited the loop still wanting more rounds -> bounded by the round cap.
    const wantedMore = lastResponse
        && (lastResponse.toolCalls?.length > 0 || lastResponse.finishReason === 'continue');
    if (finishReason !== 'timeout' && wantedMore && round >= maxRounds) {
        finishReason = 'max_rounds';
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
                role: node.role,
                rounds: round,
                totalToolCalls,
                usage,
                finishReason,
                duration: Date.now() - startTime,
                model: lastResponse?.model || config?.model
            }
        },
        'Task execution completed'
    );

    return {
        response: {
            output: lastResponse?.output || '',
            usage,
            model: lastResponse?.model || config?.model,
            finishReason,
            metadata: { role: node.role, rounds: round, totalToolCalls }
        }
    };
}
