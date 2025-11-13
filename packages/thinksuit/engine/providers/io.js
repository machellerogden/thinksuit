import { createProvider } from './index.js';

/**
 * Call an LLM with the given configuration and parameters
 * @param {Object} machineContext - Machine context containing config and execLogger
 * @param {Object} params - LLM call parameters (messages, maxTokens, etc.)
 * @param {Object} toolSchemas - Optional tool schemas for function calling
 * @returns {Promise<Object>} - LLM response
 */
/**
 * Clean thread for provider consumption
 * - Extract system message (last/most recent system role)
 * - Remove semantic labels
 * - Merge adjacent messages of same role
 * @param {Array} thread - Thread with semantic labels
 * @returns {Object} - { systemInstructions, thread } where systemInstructions is string or null
 */
function cleanThreadForProvider(thread) {
    if (!thread || thread.length === 0) return { systemInstructions: null, thread: [] };

    // Extract the last system message (most recent)
    let systemInstructions = null;
    let lastSystemIndex = -1;

    for (let i = thread.length - 1; i >= 0; i--) {
        if (thread[i].role === 'system') {
            systemInstructions = thread[i].content;
            lastSystemIndex = i;
            break;
        }
    }

    const cleaned = [];
    let lastRole = null;
    let accumulatedContent = [];

    for (let i = 0; i < thread.length; i++) {
        const msg = thread[i];

        // Skip system messages - they're extracted separately
        if (msg.role === 'system') {
            continue;
        }

        const { semantic, ...cleanMsg } = msg; // Remove semantic property

        // If same role as previous, accumulate
        if (cleanMsg.role === lastRole && typeof cleanMsg.content === 'string') {
            accumulatedContent.push(cleanMsg.content);
        } else {
            // Flush accumulated content if any
            if (accumulatedContent.length > 0) {
                cleaned.push({
                    ...cleaned.pop(),
                    content: accumulatedContent.join('\n\n')
                });
                accumulatedContent = [];
            }

            // Start new message
            if (typeof cleanMsg.content === 'string') {
                cleaned.push(cleanMsg);
                accumulatedContent = [cleanMsg.content];
                lastRole = cleanMsg.role;
            } else {
                // Non-string content (tool messages, etc.) - don't merge
                cleaned.push(cleanMsg);
                lastRole = cleanMsg.role;
                accumulatedContent = [];
            }
        }
    }

    // Flush any remaining accumulated content
    if (accumulatedContent.length > 1 && cleaned.length > 0) {
        const last = cleaned.pop();
        cleaned.push({
            ...last,
            content: accumulatedContent.join('\n\n')
        });
    }

    return { systemInstructions, thread: cleaned };
}

export async function callLLM(machineContext, params, toolSchemas) {
    try {
        const { config } = machineContext;
        const provider = createProvider(config);

        // Get provider capabilities
        const capabilities = provider.getCapabilities(params.model);

        // Clean thread before passing to provider - extracts system instructions
        const { systemInstructions, thread: cleanedThread } = params.thread
            ? cleanThreadForProvider(params.thread)
            : { systemInstructions: null, thread: [] };

        // Clamp maxTokens to provider's limit
        const clampedParams = {
            ...params,
            systemInstructions,
            thread: cleanedThread,
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
