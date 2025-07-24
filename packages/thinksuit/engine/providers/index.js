import { createOpenAIProvider } from './openai.js';
import { createVertexAIProvider } from './vertex-ai.js';

// Provider factory
export const createProvider = (config) => {
    const { provider, providerConfig } = config;

    switch (provider) {
        case 'openai':
            return createOpenAIProvider(providerConfig.openai);

        case 'vertex-ai':
            return createVertexAIProvider(providerConfig.vertexAi);

        default:
            throw new Error(`E_PROVIDER: Unknown provider ${provider}`);
    }
};
