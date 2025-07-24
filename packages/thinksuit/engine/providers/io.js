import { createProvider } from './index.js';

/**
 * Call an LLM with the given configuration and parameters
 * @param {Object} machineContext - Machine context containing config and execLogger
 * @param {Object} params - LLM call parameters (messages, maxTokens, etc.)
 * @param {Object} toolSchemas - Optional tool schemas for function calling
 * @returns {Promise<Object>} - LLM response
 */
export async function callLLM(machineContext, params, toolSchemas) {
    try {
        const { config } = machineContext;
        const provider = createProvider(config);

        // Get provider capabilities
        const capabilities = provider.getCapabilities(params.model);

        // Clamp maxTokens to provider's limit
        const clampedParams = {
            ...params,
            maxTokens: Math.min(params.maxTokens, capabilities.maxOutput)
        };

        // Pass tool schemas if available
        if (toolSchemas) {
            clampedParams.toolSchemas = toolSchemas;
        }

        // Call provider with machineContext
        return await provider.callLLM(machineContext, clampedParams);
    } catch (error) {
        // Wrap all provider errors with E_PROVIDER code
        const providerError = new Error(`E_PROVIDER: ${error.message}`);
        providerError.originalError = error;
        throw providerError;
    }
}

// Future IO functions as pure functions:
// export function now() { return Date.now(); }
// export function random() { return Math.random(); }
