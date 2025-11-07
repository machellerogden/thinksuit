/**
 * Worker process for Granite provider
 * Runs ONNX model in isolated process to contain crashes
 */
import { AutoModelForCausalLM, AutoTokenizer, env } from '@huggingface/transformers';

env.cacheDir = './.cache/transformers';

// Listen for requests from parent
process.on('message', async (request) => {
    const { id, modelId, dtype, params } = request;

    try {
        // Load model
        const model = await AutoModelForCausalLM.from_pretrained(modelId, {
            dtype,
            device: 'cpu'
        });
        const tokenizer = await AutoTokenizer.from_pretrained(modelId);

        // Transform thread
        const messages = params.thread
            .filter(msg => msg.role !== 'assistant' || msg.content)
            .map(msg => {
                if (msg.role === 'tool') {
                    return { role: 'tool_response', content: msg.content };
                }
                return { role: msg.role, content: msg.content || '' };
            });

        // Transform tools
        const tools = params.tools?.map(toolName => {
            const schema = params.toolSchemas?.[toolName];
            return {
                type: 'function',
                function: {
                    name: toolName,
                    description: schema?.description || `Execute ${toolName}`,
                    parameters: schema?.inputSchema || { type: 'object', properties: {} }
                }
            };
        });

        // Apply chat template
        const promptText = tokenizer.apply_chat_template(messages, {
            tools,
            tokenize: false,
            add_generation_prompt: true
        });

        // Tokenize
        const inputs = tokenizer(promptText, { return_tensors: 'np' });
        const inputTokenCount = inputs.input_ids.data.length;

        // Generate
        const genParams = {
            ...inputs,
            max_new_tokens: params.maxTokens || 2048,
            do_sample: params.temperature !== undefined && params.temperature > 0,
            repetition_penalty: 1.1
        };

        if (genParams.do_sample && params.temperature !== undefined) {
            genParams.temperature = params.temperature;
        }

        const startTime = Date.now();
        const outputs = await model.generate(genParams);
        const generationTime = Date.now() - startTime;

        // Decode
        const outputIds = Array.from(outputs[0]);
        const newTokenIds = outputIds.slice(inputTokenCount);
        const generatedText = tokenizer.decode(newTokenIds, {
            skip_special_tokens: true
        });

        // Parse tool calls
        const toolCalls = parseToolCalls(generatedText);

        // Remove tool call XML
        const cleanedOutput = generatedText.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim();

        const outputTokenCount = newTokenIds.length;

        let finishReason;
        if (toolCalls) {
            finishReason = 'tool_use';
        } else if (outputTokenCount >= (params.maxTokens || 2048)) {
            finishReason = 'max_tokens';
        } else {
            finishReason = 'complete';
        }

        // Send response
        process.send({
            id,
            success: true,
            result: {
                output: cleanedOutput,
                usage: {
                    prompt: inputTokenCount,
                    completion: outputTokenCount
                },
                model: params.model,
                finishReason,
                toolCalls,
                raw: {
                    generatedText,
                    generationTime,
                    dtype
                }
            }
        });

        // Exit cleanly - let ONNX crash happen after we've sent the response
        process.exit(0);

    } catch (error) {
        process.send({
            id,
            success: false,
            error: error.message,
            stack: error.stack
        });
        process.exit(1);
    }
});

function parseToolCalls(text) {
    const regex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
    const matches = [...text.matchAll(regex)];

    const toolCalls = [];
    let callIdCounter = 1;

    for (const match of matches) {
        const json = match[1].trim();
        try {
            const parsed = JSON.parse(json);
            const calls = Array.isArray(parsed) ? parsed : [parsed];

            for (const call of calls) {
                toolCalls.push({
                    id: `call_${Date.now()}_${callIdCounter++}`,
                    type: 'function',
                    function: {
                        name: call.name,
                        arguments: JSON.stringify(call.arguments)
                    }
                });
            }
        } catch (err) {
            console.error('Failed to parse tool call:', json, err);
        }
    }

    return toolCalls.length > 0 ? toolCalls : undefined;
}

// Signal ready
process.send({ ready: true });
