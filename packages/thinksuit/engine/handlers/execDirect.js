/**
 * execDirect handler - core logic only
 * Effectful execution plane - makes actual LLM calls
 */

import { callLLM } from '../providers/io.js';
import { DEFAULT_ROLE } from '../constants/defaults.js';
import { PROCESSING_EVENTS, EXECUTION_EVENTS, EVENT_ROLES, BOUNDARY_TYPES } from '../constants/events.js';
import { InterruptError } from '../errors/InterruptError.js';

/**
 * Core direct execution logic
 * @param {Object} input - { plan, instructions, thread, context, policy }
 * @param {Object} machineContext - Machine context with config
 * @returns {Object} - { response: Response }
 */
export async function execDirectCore(input, machineContext) {
    const { plan = {}, instructions = {}, thread = [], context = {} } = input;
    const config = machineContext?.config;
    const traceId = context.traceId;
    const logger = machineContext.execLogger;
    const module = machineContext?.module;
    const abortSignal = machineContext?.abortSignal;
    const defaultRole = module?.defaultRole || DEFAULT_ROLE;

    // Check if IO config is available (provider-specific)
    const hasValidConfig =
        (config?.provider === 'vertex-ai' && config?.providerConfig?.vertexAi?.projectId) ||
        (config?.provider === 'openai' && config?.providerConfig?.openai?.apiKey) ||
        (config?.provider === 'anthropic' && config?.providerConfig?.anthropic?.apiKey);

    if (!hasValidConfig) {
        logger.error({ traceId }, 'IO config not available for LLM execution');
        return {
            response: {
                output: 'IO config not available for execution. Please ensure the system is properly configured.',
                usage: { prompt: 0, completion: 0 },
                model: 'error',
                error: 'IO config not available'
            }
        };
    }

    const executionBoundaryId = `exec-direct-${context.sessionId}-${Date.now()}`;

    logger.info(
        {
            event: EXECUTION_EVENTS.DIRECT_START,
            eventRole: EVENT_ROLES.BOUNDARY_START,
            boundaryType: BOUNDARY_TYPES.EXECUTION,
            boundaryId: executionBoundaryId,
            parentBoundaryId: context.parentBoundaryId || null,
            traceId,
            data: {
                strategy: 'direct',
                role: plan.role || defaultRole,
                maxTokens: instructions?.maxTokens,
                hasAdaptations: !!instructions?.adaptations
            }
        },
        'Starting direct execution'
    );

    // Use fallback instructions if none provided
    if (!instructions || (!instructions.system && !instructions.primary)) {
        logger.warn(
            {
                traceId,
                boundaryType: BOUNDARY_TYPES.EXECUTION,
                boundaryId: executionBoundaryId,
                parentBoundaryId: context.parentBoundaryId || null
            },
            'No instructions provided, using fallback'
        );
    }

    try {
        // Check for interruption before LLM call
        if (abortSignal?.aborted) {
            throw new InterruptError('Direct execution interrupted before LLM call', {
                stage: 'direct-execution',
                role: plan.role || defaultRole,
                thread
            });
        }

        // Combine system prompt with adaptations
        let systemPrompt = instructions?.system || 'You are a helpful assistant.';
        if (instructions?.adaptations) {
            systemPrompt += '\n\n' + instructions.adaptations;
        }
        // Add length guidance if present
        if (instructions?.lengthGuidance) {
            systemPrompt += '\n\n' + instructions.lengthGuidance;
        }
        // Add tool instructions if present
        if (instructions?.toolInstructions) {
            systemPrompt += instructions.toolInstructions;
        }

        // Build full thread with system message
        const fullThread = [{ role: 'system', content: systemPrompt }];

        // Add the conversation thread
        if (thread && thread.length > 0) {
            fullThread.push(...thread);
        } else {
            // Default if no thread provided
            fullThread.push({ role: 'user', content: 'Please help me think through this.' });
        }

        // Add primary prompt only if this isn't a built conversation thread
        // A built thread has alternating user/assistant messages beyond the initial input
        const hasBuiltConversation =
            thread && thread.length > 1 && thread.some((msg) => msg.role === 'assistant');

        if (instructions?.primary && !hasBuiltConversation) {
            // If we have user messages, prepend primary to the first one
            // Otherwise add as a new user message
            const firstUserIdx = fullThread.findIndex((msg) => msg.role === 'user');
            if (firstUserIdx > 0) {
                fullThread[firstUserIdx].content =
                    `${instructions.primary}\n\n${fullThread[firstUserIdx].content}`;
            } else {
                // Insert after system message
                fullThread.splice(1, 0, { role: 'user', content: instructions.primary });
            }
        }

        // Get temperature from module configuration
        const roleTemperature = module?.instructionSchema?.temperature?.[plan.role];
        const defaultTemperature = module?.instructionSchema?.temperature?.default || 0.7;
        const temperature = roleTemperature !== undefined ? roleTemperature : defaultTemperature;

        // Call the LLM with config
        const startTime = Date.now();
        const llmParams = {
            model: config?.model || 'gpt-4o-mini',
            thread: fullThread, // Pass the full thread instead of system/user
            maxTokens: instructions?.maxTokens || 400,
            temperature
        };
        
        // Pass tools to LLM if provided
        if (plan.tools) {
            llmParams.tools = plan.tools;
        }

        // Log the LLM request at info level so it appears in sessions
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
                    role: plan.role,
                    thread: llmParams.thread,
                    maxTokens: llmParams.maxTokens,
                    temperature: llmParams.temperature,
                    tools: llmParams.tools,
                    model: llmParams.model
                }
            },
            'LLM request'
        );
        
        // Get tool schemas if tools are being used
        const toolSchemas = {};
        if (llmParams.tools && machineContext.discoveredTools) {
            for (const toolName of llmParams.tools) {
                const tool = machineContext.discoveredTools[toolName];
                if (tool) {
                    toolSchemas[toolName] = {
                        description: tool.description,
                        inputSchema: tool.inputSchema
                    };
                }
            }
        }

        const llmResponse = await callLLM(machineContext, llmParams, toolSchemas);
        const duration = Date.now() - startTime;
        
        // Log raw API response if available
        if (llmResponse.raw) {
            logger.debug({
                event: PROCESSING_EVENTS.PROVIDER_API_RAW_RESPONSE,
                traceId,
                boundaryType: BOUNDARY_TYPES.LLM_EXCHANGE,
                boundaryId: llmBoundaryId,
                parentBoundaryId: executionBoundaryId,
                data: llmResponse.raw
            }, 'Raw API response structure');
        }

        // Log the LLM response at info level so it appears in sessions
        logger.info(
            {
                event: PROCESSING_EVENTS.LLM_RESPONSE,
                eventRole: EVENT_ROLES.BOUNDARY_END,
                boundaryType: BOUNDARY_TYPES.LLM_EXCHANGE,
                boundaryId: llmBoundaryId,
                parentBoundaryId: executionBoundaryId,
                traceId,

                data: {
                    role: plan.role,
                    output: llmResponse.output,
                    usage: llmResponse.usage,
                    duration,
                    model: llmResponse.model,
                    toolCalls: llmResponse.toolCalls,
                    finishReason: llmResponse.finishReason
                }
            },
            'LLM response'
        );

        logger.info(
            {
                event: EXECUTION_EVENTS.DIRECT_COMPLETE,
                eventRole: EVENT_ROLES.BOUNDARY_END,
                boundaryType: BOUNDARY_TYPES.EXECUTION,
                boundaryId: executionBoundaryId,
                parentBoundaryId: context.parentBoundaryId || null,
                traceId,
                data: {
                    strategy: 'direct',
                    model: llmResponse.model,
                    promptTokens: llmResponse.usage.prompt,
                    completionTokens: llmResponse.usage.completion,
                    duration,
                    finishReason: llmResponse.finishReason
                }
            },
            'Direct execution completed'
        );

        // Format the response
        const response = {
            output: llmResponse.output,
            usage: llmResponse.usage,
            model: llmResponse.model,
            finishReason: llmResponse.finishReason,
            role: plan.role || defaultRole,
            metadata: {
                strategy: 'direct',
                role: plan.role || defaultRole,
                signals: plan.signals || [],
                duration
            },
            toolCalls: llmResponse.toolCalls, // Pass through native tool calls
            outputItems: llmResponse.outputItems // Pass through the raw output array for Responses API
        };

        return { response };
    } catch (error) {
        logger.error(
            {
                traceId,
                boundaryType: BOUNDARY_TYPES.EXECUTION,
                boundaryId: executionBoundaryId,
                parentBoundaryId: context.parentBoundaryId || null,
                data: {
                    error: error.message,
                    code: error.code || 'E_UNKNOWN'
                }
            },
            'Direct execution failed'
        );

        // Return error response
        return {
            response: {
                output: `I encountered an issue while processing your request: ${error.message}. Please try again.`,
                usage: { prompt: 0, completion: 0 },
                model: 'error',
                error: error.message
            }
        };
    }
}
