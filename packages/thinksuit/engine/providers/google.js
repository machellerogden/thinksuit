import { GoogleGenAI } from '@google/genai';
import { PROCESSING_EVENTS } from '../constants/events.js';

// Model metadata for capabilities
// Sources: https://ai.google.dev/gemini-api/docs/models
const MODEL_METADATA = {
    'gemini-3-pro-preview': {
        maxContext: 1048576,
        maxOutput: 65536,
        supports: { toolCalls: true, temperature: true }
    },
    'gemini-2.5-pro': {
        maxContext: 1048576,
        maxOutput: 65536,
        supports: { toolCalls: true, temperature: true }
    },
    'gemini-2.5-flash': {
        maxContext: 1048576,
        maxOutput: 65536,
        supports: { toolCalls: true, temperature: true }
    },
    'gemini-2.0-flash': {
        maxContext: 1048576,
        maxOutput: 8192,
        supports: { toolCalls: true, temperature: true }
    },
    'gemini-2.0-flash-lite': {
        maxContext: 1048576,
        maxOutput: 8192,
        supports: { toolCalls: true, temperature: true }
    },
    'gemini-1.5-pro': {
        maxContext: 2097152,
        maxOutput: 8192,
        supports: { toolCalls: true, temperature: true }
    },
    'gemini-1.5-flash': {
        maxContext: 1048576,
        maxOutput: 8192,
        supports: { toolCalls: true, temperature: true }
    }
};

// Map Google GenAI finish reasons to ThinkSuit canonical values
const FINISH_REASON_MAP = {
    STOP: 'end_turn',
    MAX_TOKENS: 'max_tokens',
    SAFETY: 'safety',
    RECITATION: 'recitation',
    OTHER: 'other',
    BLOCKLIST: 'blocklist',
    PROHIBITED_CONTENT: 'prohibited_content',
    SPII: 'spii',
    MALFORMED_FUNCTION_CALL: 'malformed_function_call',
    MODEL_ARMOR: 'model_armor',
    UNEXPECTED_TOOL_CALL: 'unexpected_tool_call',
    IMAGE_SAFETY: 'image_safety',
    IMAGE_PROHIBITED_CONTENT: 'image_prohibited_content',
    IMAGE_RECITATION: 'image_recitation',
    NO_IMAGE: 'no_image'
};

// Transform ThinkSuit thread to Google GenAI contents array
const transformRequest = (params) => {
    const { systemInstructions, thread, model, maxTokens, temperature, stop, tools, toolSchemas } = params;

    // System instruction is passed in config
    let systemInstruction = null;
    if (systemInstructions) {
        systemInstruction = systemInstructions;
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
                    role: 'model', // Google GenAI uses 'model' instead of 'assistant'
                    parts
                });
            }
        } else if (msg.role === 'tool') {
            // Convert tool result to functionResponse
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

    // Build config object for the new SDK
    const config = {
        maxOutputTokens: maxTokens
    };

    // Get model capabilities
    const modelInfo = MODEL_METADATA[model] || { supports: { temperature: true, toolCalls: true } };

    // Add temperature if supported
    if (temperature !== undefined && modelInfo.supports.temperature) {
        config.temperature = temperature;
    }

    // Add stop sequences if provided
    if (stop && stop.length > 0) {
        config.stopSequences = stop;
    }

    // Add structured output schema if provided
    if (params.responseFormat) {
        config.responseSchema = params.responseFormat.schema;
        config.responseMimeType = 'application/json';
    }

    // Transform tools to Google GenAI format
    if (tools && tools.length > 0 && modelInfo.supports.toolCalls) {
        const functionDeclarations = tools.map((toolName) => {
            const schema = toolSchemas?.[toolName];

            if (schema) {
                // Use MCP-provided schema, but strip out $schema property
                const parameters = schema.inputSchema || {
                    type: 'object',
                    properties: {}
                };

                // Remove $schema property if present
                const { /* eslint-disable no-unused-vars */ $schema, ...cleanParameters } = parameters;

                return {
                    name: toolName,
                    description: schema.description || `Execute ${toolName}`,
                    parametersJsonSchema: cleanParameters
                };
            } else {
                // Fallback to generic format
                return {
                    name: toolName,
                    description: `Execute ${toolName}`,
                    parametersJsonSchema: {
                        type: 'object',
                        properties: {
                            args: { type: 'string', description: 'Arguments for the tool' }
                        }
                    }
                };
            }
        });

        config.tools = [{ functionDeclarations }];
    }

    // Add system instruction to config if present
    if (systemInstruction) {
        config.systemInstruction = systemInstruction;
    }

    return {
        model,
        contents,
        config
    };
};

// Transform Google GenAI response to uniform format
const transformResponse = (apiResponse) => {
    // Check for valid response structure
    if (!apiResponse.candidates || apiResponse.candidates.length === 0) {
        console.error('Invalid Google GenAI response structure:', apiResponse);
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

    // Handle error responses where content.parts is missing
    // This happens when the API rejects malformed function calls, safety blocks, etc.
    if (!content.parts || !Array.isArray(content.parts)) {
        const finishReason = FINISH_REASON_MAP[candidate.finishReason] || 'unknown';
        const usage = {
            prompt: apiResponse.usageMetadata?.promptTokenCount || 0,
            completion: apiResponse.usageMetadata?.candidatesTokenCount || 0
        };

        return {
            output: candidate.finishMessage || `Error: ${candidate.finishReason}`,
            usage,
            model: apiResponse.modelVersion || 'unknown',
            finishReason,
            toolCalls: undefined
        };
    }

    // Extract text parts
    const textParts = content.parts
        .filter((part) => part.text)
        .map((part) => part.text)
        .join('');

    // Extract function calls
    const toolCalls = content.parts
        .filter((part) => part.functionCall)
        .map((part, index) => ({
            id: `call_${index}`, // Generate ID since Google GenAI doesn't provide one
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
export const createGoogleProvider = (config) => {
    const { projectId, location = 'global' } = config;

    if (!projectId) {
        throw new Error('E_PROVIDER: Google provider requires projectId configuration');
    }

    // Initialize Google GenAI client with Vertex AI backend
    const ai = new GoogleGenAI({
        vertexai: true,
        project: projectId,
        location: location
    });

    return {
        async callLLM(machineContext, params) {
            const { execLogger, abortSignal } = machineContext;

            // Transform params to API request format
            const apiRequest = transformRequest(params);

            // Log request
            execLogger.info({
                event: PROCESSING_EVENTS.PROVIDER_API_REQUEST,
                msg: 'Google GenAI API request',
                data: apiRequest
            });

            try {
                // Call Google GenAI with abort signal support
                let apiResponse;

                if (abortSignal) {
                    // Wrap the call to handle interruption
                    const callPromise = ai.models.generateContent(apiRequest);

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
                    apiResponse = await ai.models.generateContent(apiRequest);
                }

                // Log response
                execLogger.info({
                    event: PROCESSING_EVENTS.PROVIDER_API_RESPONSE,
                    msg: 'Google GenAI API response',
                    data: apiResponse
                });

                // Transform response to uniform format
                const transformed = transformResponse(apiResponse);
                return {
                    ...transformed,
                    original: apiResponse
                };
            } catch (error) {
                // Enhance error message with context
                throw new Error(`Google GenAI API call failed: ${error.message}`);
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
