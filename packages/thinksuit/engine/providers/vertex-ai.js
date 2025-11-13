import { VertexAI } from '@google-cloud/vertexai';
import { PROCESSING_EVENTS } from '../constants/events.js';

// Model metadata for capabilities
const MODEL_METADATA = {
    'gemini-2.5-pro': {
        maxContext: 1000000,
        maxOutput: 8192,
        supports: { toolCalls: true, temperature: true }
    },
    'gemini-2.0-flash': {
        maxContext: 1000000,
        maxOutput: 8192,
        supports: { toolCalls: true, temperature: true }
    },
    'gemini-2.0-flash-lite': {
        maxContext: 1000000,
        maxOutput: 8192,
        supports: { toolCalls: true, temperature: true }
    },
    'gemini-1.5-pro': {
        maxContext: 2000000,
        maxOutput: 8192,
        supports: { toolCalls: true, temperature: true }
    },
    'gemini-1.5-flash': {
        maxContext: 1000000,
        maxOutput: 8192,
        supports: { toolCalls: true, temperature: true }
    }
};

// Map Vertex AI finish reasons to ThinkSuit standards
const FINISH_REASON_MAP = {
    STOP: 'complete',
    MAX_TOKENS: 'max_tokens',
    SAFETY: 'safety',
    RECITATION: 'recitation',
    OTHER: 'other',
    BLOCKLIST: 'blocklist',
    PROHIBITED_CONTENT: 'prohibited_content',
    SPII: 'spii',
    MALFORMED_FUNCTION_CALL: 'malformed_function_call'
};

// Transform ThinkSuit thread to Vertex AI contents array
const transformRequest = (params) => {
    const { systemInstructions, thread, model, maxTokens, temperature, stop, tools, toolSchemas } = params;

    // System instruction is now passed separately (not in thread)
    let systemInstruction = null;
    if (systemInstructions) {
        systemInstruction = {
            role: 'user', // Vertex AI uses 'user' role for systemInstruction
            parts: [{ text: systemInstructions }]
        };
    }

    const contents = [];

    for (const msg of thread) {
        if (msg.role === 'user') {
            contents.push({
                role: 'user',
                parts: [{ text: msg.content }]
            });
        } else if (msg.role === 'assistant') {
            // Handle assistant messages with tool calls
            const parts = [];

            if (msg.content) {
                parts.push({ text: msg.content });
            }

            // Check for tool calls in OpenAI format
            if (msg.tool_calls) {
                for (const toolCall of msg.tool_calls) {
                    parts.push({
                        functionCall: {
                            name: toolCall.function.name,
                            args: JSON.parse(toolCall.function.arguments)
                        }
                    });
                }
            }

            if (parts.length > 0) {
                contents.push({
                    role: 'model', // Vertex AI uses 'model' instead of 'assistant'
                    parts
                });
            }
        } else if (msg.role === 'tool') {
            // Convert tool result to functionResponse
            // Find the corresponding function call in the previous message
            const functionName = msg.name || 'unknown';
            contents.push({
                role: 'function',
                parts: [
                    {
                        functionResponse: {
                            name: functionName,
                            response: {
                                content: msg.content
                            }
                        }
                    }
                ]
            });
        }
    }

    // Build the request
    const request = {
        contents
    };

    // Add systemInstruction if present
    if (systemInstruction) {
        request.systemInstruction = systemInstruction;
    }

    // Build generationConfig
    const generationConfig = {
        maxOutputTokens: maxTokens
    };

    // Get model capabilities
    const modelInfo = MODEL_METADATA[model] || { supports: { temperature: true, toolCalls: true } };

    // Add temperature if supported
    if (temperature !== undefined && modelInfo.supports.temperature) {
        generationConfig.temperature = temperature;
    }

    // Add stop sequences if provided
    if (stop && stop.length > 0) {
        generationConfig.stopSequences = stop;
    }

    // Add structured output schema if provided
    if (params.responseFormat) {
        generationConfig.responseSchema = params.responseFormat.schema;
        generationConfig.responseMimeType = 'application/json';
    }

    request.generationConfig = generationConfig;

    // Transform tools to Vertex AI format
    if (tools && tools.length > 0 && modelInfo.supports.toolCalls) {
        const functionDeclarations = tools.map((toolName) => {
            const schema = toolSchemas?.[toolName];

            if (schema) {
                // Use MCP-provided schema, but strip out $schema property that Vertex AI doesn't accept
                const parameters = schema.inputSchema || {
                    type: 'object',
                    properties: {}
                };

                // Remove $schema property if present
                const { /* eslint-disable no-unused-vars */ $schema, ...cleanParameters } = parameters;

                return {
                    name: toolName,
                    description: schema.description || `Execute ${toolName}`,
                    parameters: cleanParameters
                };
            } else {
                // Fallback to generic format
                return {
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

        request.tools = [{ functionDeclarations }];
    }

    return request;
};

// Transform Vertex AI response to uniform format
const transformResponse = (apiResponse) => {
    // Vertex AI returns candidates array
    if (!apiResponse.candidates || apiResponse.candidates.length === 0) {
        console.error('Invalid Vertex AI response structure:', apiResponse);
        return {
            output: '',
            usage: { prompt: 0, completion: 0 },
            model: 'unknown',
            finishReason: 'unknown',
            toolCalls: undefined
        };
    }

    const candidate = apiResponse.candidates[0];
    const content = candidate.content;

    // Extract text parts
    const textParts = content.parts
        .filter((part) => part.text)
        .map((part) => part.text)
        .join('');

    // Extract function calls
    const toolCalls = content.parts
        .filter((part) => part.functionCall)
        .map((part, index) => ({
            id: `call_${index}`, // Generate ID since Vertex AI doesn't provide one
            type: 'function',
            function: {
                name: part.functionCall.name,
                arguments: JSON.stringify(part.functionCall.args)
            }
        }));

    // Map finish reason
    const finishReason = FINISH_REASON_MAP[candidate.finishReason] || 'unknown';

    // Extract usage metadata
    const usage = {
        prompt: apiResponse.usageMetadata?.promptTokenCount || 0,
        completion: apiResponse.usageMetadata?.candidatesTokenCount || 0
    };

    return {
        output: textParts,
        usage,
        model: apiResponse.modelVersion || 'unknown',
        finishReason: toolCalls.length > 0 ? 'tool_use' : finishReason,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined
    };
};

// Main provider factory function
export const createVertexAIProvider = (config) => {
    const { projectId, location = 'us-central1' } = config;

    if (!projectId) {
        throw new Error('E_PROVIDER: Vertex AI requires projectId configuration');
    }

    // Initialize Vertex AI client (uses ADC automatically)
    const vertexAI = new VertexAI({
        project: projectId,
        location: location
    });

    return {
        async callLLM(machineContext, params) {
            const { execLogger, abortSignal } = machineContext;

            // Get the generative model
            const model = vertexAI.getGenerativeModel({
                model: params.model
            });

            // Transform params to API request format
            const apiRequest = transformRequest(params);

            // Log raw request
            execLogger.debug({
                event: PROCESSING_EVENTS.PROVIDER_API_RAW_REQUEST,
                msg: 'Vertex AI API raw request',
                data: apiRequest
            });

            try {
                // Call Vertex AI with abort signal support
                let apiResponse;

                if (abortSignal) {
                    // Vertex AI SDK doesn't natively support AbortSignal
                    // We need to wrap the call and handle interruption
                    const callPromise = model.generateContent(apiRequest);

                    apiResponse = await Promise.race([
                        callPromise,
                        new Promise((_, reject) => {
                            if (abortSignal.aborted) {
                                reject(new Error('Request aborted'));
                            }
                            abortSignal.addEventListener('abort', () => {
                                reject(new Error('Request aborted'));
                            });
                        })
                    ]);
                } else {
                    apiResponse = await model.generateContent(apiRequest);
                }

                // Extract the response object
                const response = apiResponse.response;

                // Log raw response
                execLogger.debug({
                    event: PROCESSING_EVENTS.PROVIDER_API_RAW_RESPONSE,
                    msg: 'Vertex AI API raw response',
                    data: response
                });

                // Transform response to uniform format
                const transformed = transformResponse(response);
                return {
                    ...transformed,
                    raw: response
                };
            } catch (error) {
                // Enhance error message with context
                throw new Error(`Vertex AI API call failed: ${error.message}`);
            }
        },

        getCapabilities(model) {
            // Return known capabilities or defaults for unknown models
            return (
                MODEL_METADATA[model] || {
                    maxContext: 32000,
                    maxOutput: 8192,
                    supports: { toolCalls: true, temperature: true }
                }
            );
        }
    };
};
