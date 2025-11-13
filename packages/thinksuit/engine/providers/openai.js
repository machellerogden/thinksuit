import OpenAI from 'openai';
import { PROCESSING_EVENTS } from '../constants/events.js';


// Model metadata for capabilities
const MODEL_METADATA = {
    'gpt-4': { maxContext: 128000, maxOutput: 4096, supports: { toolCalls: true, temperature: true } },
    'gpt-4-turbo': { maxContext: 128000, maxOutput: 4096, supports: { toolCalls: true, temperature: true } },
    'gpt-4o': { maxContext: 128000, maxOutput: 16384, supports: { toolCalls: true, temperature: true } },
    'gpt-4o-mini': { maxContext: 128000, maxOutput: 16384, supports: { toolCalls: true, temperature: true } },
    'o1-preview': { maxContext: 128000, maxOutput: 32768, supports: { toolCalls: false, temperature: false } },
    'o1-mini': { maxContext: 128000, maxOutput: 65536, supports: { toolCalls: false, temperature: false } },
    'gpt-5': { maxContext: 128000, maxOutput: 16384, supports: { toolCalls: true, temperature: false } },
    'gpt-5-codex': { maxContext: 200000, maxOutput: 100000, supports: { toolCalls: true, temperature: false } }
};

// Transforms request for Responses API
const transformRequest = (params) => {
    // Start with system instructions as first message (OpenAI Responses API expects system as first message)
    const transformedInput = [];

    if (params.systemInstructions) {
        transformedInput.push({
            role: 'system',
            content: params.systemInstructions
        });
    }

    // Transform thread to handle mixed formats
    const threadMessages = params.thread
        .filter(msg => {
            // Skip assistant messages that only contain tool calls (no content field)
            // These are part of the response, not the next input
            if (msg.role === 'assistant' && msg.tool_calls && !msg.content) {
                return false;
            }
            return true;
        })
        .map(msg => {
            // Pass through Responses API items directly (function_call, function_call_output, etc.)
            if (msg.type) {
                return msg;
            }
            // Convert internal tool messages to Responses API format
            if (msg.role === 'tool') {
                return {
                    type: 'function_call_output',
                    call_id: msg.tool_call_id,
                    output: msg.content
                };
            }
            // Remove tool_calls from assistant messages that have content
            if (msg.role === 'assistant' && msg.tool_calls) {
                // eslint-disable-next-line no-unused-vars
                const { tool_calls, ...cleanMsg } = msg;
                return cleanMsg;
            }
            // Regular messages pass through as-is
            return msg;
        });

    transformedInput.push(...threadMessages);

    const request = {
        model: params.model,
        input: transformedInput, // Use transformed input
        max_output_tokens: params.maxTokens // Responses API uses max_output_tokens
    };

    // Get model capabilities
    const modelInfo = MODEL_METADATA[params.model] || { supports: { temperature: true, toolCalls: true } };

    // Add optional parameters based on model support
    if (params.temperature !== undefined && modelInfo.supports.temperature !== false) {
        request.temperature = params.temperature;
    }
    if (params.stop !== undefined) {
        request.stop = params.stop;
    }

    // Add text generation parameters for Responses API
    // Controls output format and verbosity
    if (params.responseFormat) {
        // Use structured output if schema provided
        request.text = {
            format: {
                type: 'json_schema',
                name: params.responseFormat.name || 'response',
                schema: params.responseFormat.schema,
                strict: true
            },
            verbosity: 'medium'
        };
    } else {
        request.text = {
            format: { type: 'text' },
            verbosity: 'medium'  // Can be 'low', 'medium', or 'high'
        };
    }

    // Add reasoning effort for GPT-5 models
    // Minimal reasoning allows text generation with fewer reasoning tokens
    if (params.model && params.model === 'gpt-5') {
        request.reasoning = {
            effort: 'minimal'
        };
    }

    // if (params.model && params.model === 'gpt-5-codex') {
    //     request.reasoning = {
    //         effort: 'medium' // low, medium, high
    //     };
    // }

    // Transform tools to OpenAI format if provided
    if (params.tools !== undefined && modelInfo.supports.toolCalls !== false) {
        // Tools come as an array of tool names
        // Use rich schemas if available, otherwise fall back to generic format
        request.tools = params.tools.map(toolName => {
            const schema = params.toolSchemas?.[toolName];

            if (schema) {
                // Use MCP-provided schema
                return {
                    type: 'function',
                    name: toolName,
                    description: schema.description || `Execute ${toolName}`,
                    parameters: schema.inputSchema || {
                        type: 'object',
                        properties: {}
                    }
                };
            } else {
                // Fallback to generic format
                return {
                    type: 'function',
                    name: toolName,
                    description: `Execute ${toolName}`,
                    parameters: {
                        type: 'object',
                        properties: {
                            args: { type: 'string', description: 'Arguments for the tool' }
                        }
                    }
                };
            }
        });
    }

    return request;
};

// Uniform response transform for Responses API
const transformResponse = (apiResponse) => {
    // Handle the Responses API structure
    if (!apiResponse.object || apiResponse.object !== 'response' || !apiResponse.output) {
        console.error('Invalid Responses API structure:', apiResponse);
        return {
            output: '',
            usage: { prompt: 0, completion: 0 },
            model: apiResponse.model || 'unknown',
            finishReason: 'unknown',
            toolCalls: undefined
        };
    }

    // Extract the actual message content from the output array
    const messageOutput = apiResponse.output.find(o => o.type === 'message');
    const textContent = messageOutput?.content?.find(c => c.type === 'output_text')?.text || '';

    // Extract function calls from the output array
    const toolCalls = apiResponse.output
        .filter(o => o.type === 'function_call')
        .map(call => ({
            id: call.call_id || call.id,
            type: 'function',
            function: {
                name: call.name,
                arguments: call.arguments
            }
        }));

    // Determine finish reason
    let finishReason = 'unknown';
    if (toolCalls.length > 0) {
        finishReason = 'tool_use';
    } else if (apiResponse.status === 'completed') {
        finishReason = 'end_turn';
    }

    return {
        output: textContent || apiResponse.output_text || '', // Use output_text as fallback
        usage: {
            prompt: apiResponse.usage?.input_tokens || 0,
            completion: apiResponse.usage?.output_tokens || 0
        },
        model: apiResponse.model,
        finishReason,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        outputItems: apiResponse.output // Pass through raw output array for Responses API features
    };
};

// Main provider factory function
export const createOpenAIProvider = (config) => {
    const { apiKey } = config || {};
    const client = new OpenAI({ apiKey });

    return {
        async callLLM(machineContext, params) {
            const { execLogger, abortSignal } = machineContext;

            // Transform params to API request format
            const apiRequest = transformRequest(params);

            // Log raw request
            execLogger.debug({
                event: PROCESSING_EVENTS.PROVIDER_API_RAW_REQUEST,
                msg: 'OpenAI API raw request',
                data: apiRequest
            });

            // Call OpenAI Responses API with abort signal support
            const options = {};
            if (abortSignal) {
                // OpenAI SDK supports AbortSignal in request options
                options.signal = abortSignal;
            }
            const apiResponse = await client.responses.create(apiRequest, options);

            // Transform response to uniform format
            const transformed = transformResponse(apiResponse);
            return {
                ...transformed,
                raw: {
                    request: apiRequest,
                    response: apiResponse
                }
            };
        },

        getCapabilities(model) {
            // Return known capabilities or defaults for unknown models
            return (
                MODEL_METADATA[model] || {
                    maxContext: 4096,
                    maxOutput: 2048,
                    supports: { toolCalls: false, temperature: true }
                }
            );
        }
    };
};
