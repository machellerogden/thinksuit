import OpenAI from 'openai';
import { PROCESSING_EVENTS } from '../constants/events.js';

/**
 * Generic OpenAI-compatible provider factory
 * Works with any service that implements the OpenAI chat completions API
 */

// Transforms request for OpenAI-compatible chat completions API
const transformRequest = (params) => {
    // Start with system instructions as first message (if provided)
    const messages = [];

    if (params.systemInstructions) {
        messages.push({
            role: 'system',
            content: params.systemInstructions
        });
    }

    // Transform thread to messages format
    const threadMessages = params.thread
        .filter(msg => {
            // Skip assistant messages that only contain tool calls (no content field)
            if (msg.role === 'assistant' && msg.tool_calls && !msg.content) {
                return false;
            }
            return true;
        })
        .map(msg => {
            // Handle tool response messages
            if (msg.role === 'tool') {
                return {
                    role: 'tool',
                    tool_call_id: msg.tool_call_id,
                    content: msg.content
                };
            }

            // Remove tool_calls from assistant messages that have content
            if (msg.role === 'assistant' && msg.tool_calls) {
                const { tool_calls, ...cleanMsg } = msg;
                return cleanMsg;
            }

            // Regular messages pass through as-is
            return msg;
        });

    messages.push(...threadMessages);

    const request = {
        model: params.model,
        messages,
        max_tokens: params.maxTokens
    };

    // Get model capabilities
    const modelInfo = params.modelMetadata || { supports: { temperature: true, toolCalls: true } };

    // Add optional parameters based on model support
    if (params.temperature !== undefined && modelInfo.supports.temperature !== false) {
        request.temperature = params.temperature;
    }
    if (params.stop !== undefined) {
        request.stop = params.stop;
    }

    // Add response format for structured output
    if (params.responseFormat?.schema) {
        request.response_format = {
            type: 'json_schema',
            json_schema: {
                name: params.responseFormat.name || 'response',
                schema: params.responseFormat.schema,
                strict: params.responseFormat.strict !== false
            }
        };
    }

    // Transform tools to OpenAI format if provided and supported
    if (params.tools !== undefined && modelInfo.supports.toolCalls !== false) {
        request.tools = params.tools.map(toolName => {
            const schema = params.toolSchemas?.[toolName];

            if (schema) {
                // Use MCP-provided schema
                return {
                    type: 'function',
                    function: {
                        name: toolName,
                        description: schema.description || `Execute ${toolName}`,
                        parameters: schema.inputSchema || {
                            type: 'object',
                            properties: {}
                        }
                    }
                };
            } else {
                // Fallback to generic format
                return {
                    type: 'function',
                    function: {
                        name: toolName,
                        description: `Execute ${toolName}`,
                        parameters: {
                            type: 'object',
                            properties: {
                                args: { type: 'string', description: 'Arguments for the tool' }
                            }
                        }
                    }
                };
            }
        });
    }

    return request;
};

// Uniform response transform for chat completions API
const transformResponse = (apiResponse) => {
    if (!apiResponse.choices || apiResponse.choices.length === 0) {
        console.error('Invalid chat completions response:', apiResponse);
        return {
            output: '',
            usage: { prompt: 0, completion: 0 },
            model: apiResponse.model || 'unknown',
            finishReason: 'unknown',
            toolCalls: undefined
        };
    }

    const choice = apiResponse.choices[0];
    const message = choice.message;

    // Extract text content
    const textContent = message.content || '';

    // Extract tool calls if present
    const toolCalls = message.tool_calls?.map(call => ({
        id: call.id,
        type: 'function',
        function: {
            name: call.function.name,
            arguments: call.function.arguments
        }
    }));

    // Map finish reason to standard format
    const finishReasonMap = {
        'stop': 'complete',
        'length': 'max_tokens',
        'tool_calls': 'tool_use',
        'content_filter': 'safety',
        'function_call': 'tool_use'
    };
    const finishReason = finishReasonMap[choice.finish_reason] || choice.finish_reason || 'unknown';

    return {
        output: textContent,
        usage: {
            prompt: apiResponse.usage?.prompt_tokens || 0,
            completion: apiResponse.usage?.completion_tokens || 0
        },
        model: apiResponse.model,
        finishReason,
        toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined
    };
};

/**
 * Create a provider that uses the OpenAI Chat Completions API format
 * @param {Object} config - Provider configuration
 * @param {string} config.apiKey - API key (optional for local providers)
 * @param {string} config.baseURL - Base URL for the API endpoint
 * @param {Object} config.modelMetadata - Model capabilities metadata
 * @param {string} config.providerName - Name for logging
 */
export const createOpenAIChatCompletionsProvider = (config) => {
    const { apiKey, baseURL, modelMetadata = {}, providerName = 'OpenAI Chat Completions' } = config || {};

    const client = new OpenAI({
        baseURL: baseURL || 'http://localhost:8000/v1',
        apiKey: apiKey || 'not-needed' // Some local providers don't require API keys
    });

    return {
        async callLLM(machineContext, params) {
            const { execLogger, abortSignal } = machineContext;

            // Pass model metadata through to transformRequest
            const paramsWithMetadata = {
                ...params,
                modelMetadata: modelMetadata[params.model]
            };

            // Transform params to API request format
            const apiRequest = transformRequest(paramsWithMetadata);

            // Log raw request
            execLogger.debug({
                event: PROCESSING_EVENTS.PROVIDER_API_RAW_REQUEST,
                msg: `${providerName} API raw request`,
                data: apiRequest
            });

            // Call API with abort signal support
            const options = {};
            if (abortSignal) {
                options.signal = abortSignal;
            }
            const apiResponse = await client.chat.completions.create(apiRequest, options);

            // Log raw response
            execLogger.debug({
                event: PROCESSING_EVENTS.PROVIDER_API_RAW_RESPONSE,
                msg: `${providerName} API raw response`,
                data: apiResponse
            });

            // Transform response to uniform format
            const transformed = transformResponse(apiResponse);
            return {
                ...transformed,
                raw: apiResponse
            };
        },

        getCapabilities(model) {
            // Return known capabilities or defaults for unknown models
            return (
                modelMetadata[model] || {
                    maxContext: 4096,
                    maxOutput: 2048,
                    supports: { toolCalls: false, temperature: true }
                }
            );
        }
    };
};
