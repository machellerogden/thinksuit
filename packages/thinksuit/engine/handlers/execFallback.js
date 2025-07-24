/**
 * execFallback handler - core logic only
 * Effectful execution plane - graceful error recovery
 */

import { callLLM } from '../providers/io.js';
import { getTemperature } from './utils/temperature.js';

/**
 * Core fallback execution logic
 * @param {Object} input - { lastError, context, thread }
 * @param {Object} machineContext - Machine context with optional config
 * @returns {Object} - { response: Response }
 */
export async function execFallbackCore(input, machineContext) {
    const { lastError = {}, context = {}, thread = [] } = input;

    const config = machineContext?.config;
    const logger = machineContext.execLogger;
    const module = machineContext?.module;
    const traceId = context.traceId;

    // Parse error details
    const errorCode = lastError.code || lastError.Error || 'E_UNKNOWN';
    const errorMessage = lastError.message || lastError.Cause || 'Unknown error occurred';

    logger.error(
        {
            traceId,

            data: {
                errorCode,
                errorMessage,
                depth: context.depth || 0
            }
        },
        'Executing fallback handler'
    );

    // Generate appropriate fallback message based on error type
    let fallbackMessage;
    let suggestions = [];

    switch (errorCode) {
        case 'E_DEPTH':
            /* eslint-disable quotes */
            fallbackMessage = `I've reached the maximum complexity limit for this request.`;
            suggestions = [
                'Try breaking down your request into smaller, more specific questions',
                'Focus on one aspect at a time',
                'Simplify the scope of your inquiry'
            ];
            break;

        case 'E_FANOUT':
            fallbackMessage = 'The request requires too many parallel operations.';
            suggestions = [
                'Try a more focused approach',
                'Request fewer perspectives or analyses',
                'Prioritize the most important aspects'
            ];
            break;

        case 'E_CHILDREN':
            fallbackMessage = 'The request involves too many sequential steps.';
            suggestions = [
                'Simplify the process',
                'Focus on key steps only',
                'Break this into multiple separate requests'
            ];
            break;

        case 'E_PROVIDER':
            fallbackMessage = 'I encountered an issue with the AI service.';
            suggestions = [
                'Try again in a moment',
                'Check your API configuration',
                'Verify service availability'
            ];
            break;

        case 'E_TIMEOUT':
            fallbackMessage = 'The operation took too long to complete.';
            suggestions = [
                'Try a simpler request',
                'Break down complex questions',
                'Check your connection'
            ];
            break;

        case 'E_ABORT':
            fallbackMessage = 'The operation was cancelled.';
            suggestions = ['You can restart with a new request', 'Modify your approach if needed'];
            break;

        case 'E_SCHEMA':
            fallbackMessage = 'There was an issue with the request format.';
            suggestions = [
                'Ensure your input is properly formatted',
                'Check for any special characters',
                'Try rephrasing your request'
            ];
            break;

        case 'E_RULE_LOOP':
            fallbackMessage = 'The system detected a circular reasoning pattern.';
            suggestions = [
                'Rephrase to avoid circular dependencies',
                'Be more specific about what you need',
                'Focus on concrete outcomes'
            ];
            break;

        default:
            fallbackMessage = 'I encountered an unexpected issue while processing your request.';
            suggestions = [
                'Try rephrasing your question',
                'Simplify your request',
                'Break it into smaller parts'
            ];
    }

    // Try to provide a helpful recovery response
    let output;

    if (config?.apiKey && errorCode !== 'E_PROVIDER') {
        // If we have IO and the error isn't provider-related, try a simple recovery
        try {
            logger.debug({ traceId }, 'Attempting intelligent fallback recovery');

            // Extract user messages for context
            const userMessage =
                thread
                    .filter((msg) => msg.role === 'user')
                    .map((msg) => msg.content)
                    .join('\n\n') || 'Help me understand what went wrong.';

            const systemPrompt = `You are a helpful assistant providing graceful error recovery.
The system encountered an error: ${errorCode} - ${errorMessage}
Your task is to acknowledge the issue and provide a helpful, simplified response.
Be concise and supportive.`;

            // Build recovery thread
            const recoveryThread = [
                { role: 'system', content: systemPrompt },
                {
                    role: 'user',
                    content: `The system encountered this issue: "${fallbackMessage}"

Original request: ${userMessage}

Please provide a brief, helpful response that:
1. Acknowledges the limitation
2. Offers a simplified answer if possible
3. Suggests one specific way forward`
                }
            ];

            const recoveryResponse = await callLLM(machineContext, {
                model: config?.model || 'gpt-4o-mini',
                thread: recoveryThread,
                maxTokens: 200,
                temperature: getTemperature(module, 'fallback', 0.3)
            });

            output = recoveryResponse.output;

            logger.info({ traceId }, 'Intelligent fallback recovery successful');

            return {
                response: {
                    output,
                    usage: recoveryResponse.usage,
                    model: recoveryResponse.model,
                    metadata: {
                        fallback: true,
                        errorCode,
                        recovered: true
                    }
                }
            };
        } catch (recoveryError) {
            logger.warn(
                {
                    traceId,
                    data: {
                        error: recoveryError.message
                    }
                },
                'Intelligent fallback recovery failed, using static response'
            );
        }
    }

    // Static fallback response if intelligent recovery isn't available or failed
    output = `${fallbackMessage}\n\n`;

    if (suggestions.length > 0) {
        output += 'Here are some suggestions:\n';
        output += suggestions.map((s) => `• ${s}`).join('\n');
    }

    output += '\n\nFeel free to try again with a modified approach.';

    return {
        response: {
            output,
            usage: { prompt: 0, completion: 0 },
            model: 'fallback',
            metadata: {
                fallback: true,
                errorCode,
                errorMessage,
                recovered: false
            }
        }
    };
}
