import { call as genaiCall, wrapProviderError, isGenaiDownError } from 'thinksuit-genai/client';
import { PROCESSING_EVENTS } from '../constants/events.js';

/**
 * Thin adapter over the thinksuit-genai service. The engine's execution plane
 * calls generative models only through this boundary; the genai daemon owns
 * credentials, request/response transforms, thread normalization, token
 * clamping, and model residency. This file keeps its path and signature
 * because engine callers (and their tests) target `callLLM` here.
 *
 * Requires the genai service: when it is down, the client's actionable hint
 * (`thinkctl start genai`) passes through unwrapped — that is an operational
 * error, not a provider failure.
 *
 * @param {Object} machineContext - Machine context containing config and execLogger
 * @param {Object} params - LLM call parameters (model, thread, maxTokens, etc.)
 * @param {Object} toolSchemas - Optional tool schemas for function calling
 * @returns {Promise<Object>} - LLM response
 */
export async function callLLM(machineContext, params, toolSchemas) {
    const { config, execLogger, abortSignal } = machineContext;
    const callParams = toolSchemas ? { ...params, toolSchemas } : params;

    try {
        const response = await genaiCall(
            { provider: config.provider, ...callParams },
            { signal: abortSignal }
        );

        // Re-emit the provider exchange into the session trace from the
        // normalized original — the genai service is trace-agnostic. Both
        // events land post-call; the data is the actual wire request/response.
        execLogger.info({
            event: PROCESSING_EVENTS.PROVIDER_API_REQUEST,
            msg: `${config.provider} API request`,
            data: response.original?.request
        });
        execLogger.info({
            event: PROCESSING_EVENTS.PROVIDER_API_RESPONSE,
            msg: `${config.provider} API response`,
            data: response.original?.response
        });

        return response;
    } catch (error) {
        if (isGenaiDownError(error)) throw error;

        // A failed call still traces its request when the provider got as far
        // as building one (rehydrated across the socket).
        if (error.request !== undefined) {
            execLogger.info({
                event: PROCESSING_EVENTS.PROVIDER_API_REQUEST,
                msg: `${config.provider} API request (failed call)`,
                data: error.request
            });
        }

        throw wrapProviderError(error);
    }
}
