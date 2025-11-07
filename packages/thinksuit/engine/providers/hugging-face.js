import { createOpenAIChatCompletionsProvider } from './openai-chat-completions.js';

// Model metadata for capabilities
const MODEL_METADATA = {
    'moonshotai/Kimi-K2-Thinking:novita': {
        maxContext: 128000,
        maxOutput: 4096,
        supports: { toolCalls: true, temperature: true }
    }
};

/**
 * HuggingFace Router provider - uses HuggingFace's router to access various models
 */
export const createHuggingFaceProvider = (config) => {
    return createOpenAIChatCompletionsProvider({
        apiKey: config?.apiKey,
        baseURL: config?.baseURL || 'https://router.huggingface.co/v1',
        modelMetadata: MODEL_METADATA,
        providerName: 'HuggingFace Router'
    });
};
