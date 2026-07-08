import Anthropic from '@anthropic-ai/sdk';

// Model metadata for capabilities (see https://platform.claude.com/docs/en/docs/about-claude/models/overview)
const MODEL_METADATA = {
    'claude-opus-4-8': { maxContext: 1000000, maxOutput: 128000, supports: { toolCalls: true, temperature: true } },
    'claude-sonnet-4-6': { maxContext: 1000000, maxOutput: 64000, supports: { toolCalls: true, temperature: true } },
    'claude-haiku-4-5': { maxContext: 200000, maxOutput: 64000, supports: { toolCalls: true, temperature: true } },
    'claude-haiku-4-5-20251001': { maxContext: 200000, maxOutput: 64000, supports: { toolCalls: true, temperature: true } },
    // Legacy, still callable
    'claude-opus-4-7': { maxContext: 1000000, maxOutput: 128000, supports: { toolCalls: true, temperature: true } },
    'claude-opus-4-6': { maxContext: 1000000, maxOutput: 128000, supports: { toolCalls: true, temperature: true } },
    'claude-sonnet-4-5': { maxContext: 200000, maxOutput: 64000, supports: { toolCalls: true, temperature: true } }
};

const DEFAULT_CAPABILITIES = {
    maxContext: 200000,
    maxOutput: 8192,
    supports: { toolCalls: true, temperature: true }
};

const getModelInfo = (model) => MODEL_METADATA[model] || DEFAULT_CAPABILITIES;

// Convert a cleaned ThinkSuit thread into Anthropic Messages format.
// Thread arrives without system messages (extracted upstream into systemInstructions).
const transformThread = (thread) => {
    const messages = [];

    // Anthropic requires all tool_result blocks answering one assistant turn's tool_use
    // blocks to sit in the single user message immediately after it. Buffer consecutive
    // tool results and flush them as one user message when a non-tool message arrives.
    let pendingToolResults = null;
    const flushToolResults = () => {
        if (pendingToolResults) {
            messages.push({ role: 'user', content: pendingToolResults });
            pendingToolResults = null;
        }
    };

    for (const msg of thread) {
        // Tool results accumulate into one user message carrying all their blocks
        if (msg.role === 'tool') {
            (pendingToolResults ??= []).push({
                type: 'tool_result',
                tool_use_id: msg.tool_call_id,
                content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
            });
            continue;
        }

        // Any non-tool message closes the current tool_result group
        flushToolResults();

        // Assistant messages that issued tool calls become tool_use blocks
        if (msg.role === 'assistant' && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
            const content = [];
            if (msg.content) {
                content.push({ type: 'text', text: msg.content });
            }
            for (const call of msg.tool_calls) {
                let input = {};
                try {
                    input = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
                } catch {
                    input = {};
                }
                content.push({
                    type: 'tool_use',
                    id: call.id,
                    name: call.function?.name,
                    input
                });
            }
            messages.push({ role: 'assistant', content });
            continue;
        }

        // Regular text messages
        if (typeof msg.content === 'string') {
            messages.push({ role: msg.role, content: msg.content });
        } else {
            messages.push({ role: msg.role, content: msg.content });
        }
    }

    flushToolResults();
    return messages;
};

const buildTools = (params) => {
    if (!params.tools || params.tools.length === 0) return undefined;
    return params.tools.map((toolName) => {
        const schema = params.toolSchemas?.[toolName];
        return {
            name: toolName,
            description: schema?.description || `Execute ${toolName}`,
            input_schema: schema?.inputSchema || { type: 'object', properties: {} }
        };
    });
};

const transformRequest = (params) => {
    const modelInfo = getModelInfo(params.model);

    const request = {
        model: params.model,
        max_tokens: params.maxTokens,
        messages: transformThread(params.thread || [])
    };

    if (params.systemInstructions) {
        request.system = params.systemInstructions;
    }

    if (params.temperature !== undefined && modelInfo.supports.temperature !== false) {
        request.temperature = params.temperature;
    }

    if (params.stop !== undefined) {
        request.stop_sequences = Array.isArray(params.stop) ? params.stop : [params.stop];
    }

    // Structured output: force a single tool whose input schema is the requested
    // response schema, then extract its input as the JSON response. The Messages
    // API has no json_schema response_format, so this is the canonical approach.
    if (params.responseFormat) {
        const name = params.responseFormat.name || 'structured_response';
        request.tools = [
            {
                name,
                description: 'Return the response in the required structured format.',
                input_schema: params.responseFormat.schema
            }
        ];
        request.tool_choice = { type: 'tool', name };
    } else if (modelInfo.supports.toolCalls !== false) {
        const tools = buildTools(params);
        if (tools) request.tools = tools;
    }

    return request;
};

const FINISH_REASON_MAP = {
    end_turn: 'end_turn',
    stop_sequence: 'end_turn',
    max_tokens: 'max_tokens',
    tool_use: 'tool_use'
};

const transformResponse = (apiResponse, params) => {
    const content = Array.isArray(apiResponse.content) ? apiResponse.content : [];

    const textContent = content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('');

    const toolUseBlocks = content.filter((block) => block.type === 'tool_use');

    // Structured-output path: the forced tool's input is the response payload
    if (params?.responseFormat) {
        const block = toolUseBlocks[0];
        return {
            output: block ? JSON.stringify(block.input) : '',
            usage: {
                prompt: apiResponse.usage?.input_tokens || 0,
                completion: apiResponse.usage?.output_tokens || 0
            },
            model: apiResponse.model,
            finishReason: 'end_turn',
            toolCalls: undefined
        };
    }

    const toolCalls = toolUseBlocks.map((block) => ({
        id: block.id,
        type: 'function',
        function: {
            name: block.name,
            arguments: JSON.stringify(block.input ?? {})
        }
    }));

    return {
        output: textContent,
        usage: {
            prompt: apiResponse.usage?.input_tokens || 0,
            completion: apiResponse.usage?.output_tokens || 0
        },
        model: apiResponse.model,
        finishReason: FINISH_REASON_MAP[apiResponse.stop_reason] || 'unknown',
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined
    };
};

export const createAnthropicProvider = (config) => {
    const { apiKey } = config || {};
    const client = new Anthropic({ apiKey });

    return {
        async callLLM(ctx, params) {
            const { abortSignal } = ctx || {};

            const apiRequest = transformRequest(params);

            const options = {};
            if (abortSignal) options.signal = abortSignal;

            let apiResponse;
            try {
                apiResponse = await client.messages.create(apiRequest, options);
            } catch (error) {
                // Attach the wire request so callers can trace/report the failed call
                error.request = apiRequest;
                throw error;
            }

            const transformed = transformResponse(apiResponse, params);
            return {
                ...transformed,
                original: {
                    request: apiRequest,
                    response: apiResponse
                }
            };
        },

        getCapabilities(model) {
            return MODEL_METADATA[model] || DEFAULT_CAPABILITIES;
        }
    };
};
