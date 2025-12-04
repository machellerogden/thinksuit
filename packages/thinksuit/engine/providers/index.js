import { createOpenAIProvider } from './openai.js';
import { createGoogleProvider } from './google.js';
import { createHuggingFaceProvider } from './hugging-face.js';
import { createONNXProvider } from './onnx.js';

/**
 * Provider registry - maps provider names to their factory functions and metadata
 */
const PROVIDER_REGISTRY = {
    'openai': {
        factory: createOpenAIProvider,
        configKey: 'openai',
        requiresConfig: (config) => !!config?.apiKey,
        description: 'OpenAI API (GPT models)'
    },
    'google': {
        factory: createGoogleProvider,
        configKey: 'google',
        requiresConfig: (config) => !!config?.projectId,
        description: 'Google (Gemini models via Vertex AI)'
    },
    'hugging-face': {
        factory: createHuggingFaceProvider,
        configKey: 'huggingFace',
        requiresConfig: (config) => !!config?.apiKey,
        description: 'HuggingFace Router (various models)'
    },
    'onnx': {
        factory: createONNXProvider,
        configKey: 'onnx',
        requiresConfig: () => true,
        description: 'Local ONNX models via Transformers.js'
    }
};

/**
 * Create a provider instance
 */
export const createProvider = (config) => {
    const { provider, providerConfig } = config;

    const providerEntry = PROVIDER_REGISTRY[provider];
    if (!providerEntry) {
        throw new Error(`E_PROVIDER: Unknown provider ${provider}`);
    }

    return providerEntry.factory(providerConfig[providerEntry.configKey]);
};

/**
 * List all available provider names
 */
export const listAvailableProviders = () => {
    return Object.keys(PROVIDER_REGISTRY);
};

/**
 * Get provider metadata
 */
export const getProviderMetadata = (provider) => {
    const entry = PROVIDER_REGISTRY[provider];
    if (!entry) return null;

    return {
        name: provider,
        configKey: entry.configKey,
        description: entry.description
    };
};

/**
 * Check which providers are configured
 */
export const listConfiguredProviders = (config) => {
    const result = {};

    for (const [name, entry] of Object.entries(PROVIDER_REGISTRY)) {
        const providerConfig = config?.providerConfig?.[entry.configKey];
        result[name] = entry.requiresConfig(providerConfig);
    }

    return result;
};
