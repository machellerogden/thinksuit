/**
 * Logging Middleware
 * Provides structured logging for handler execution
 */

import { PIPELINE_EVENTS } from '../constants/events.js';

/**
 * Middleware that logs handler execution
 * @param {Object} options - Logging options
 * @param {string} options.name - Handler name for logging
 * @param {string} options.level - Log level (debug, info, etc.)
 * @returns {Function} - Middleware function
 */
export function loggingMiddleware(options = {}) {
    const { name = 'handler', level = 'debug' } = options;

    return async function logging(ctx, next) {
        const logger = ctx.machineContext?.execLogger;

        logger?.[level](
            {
                event: PIPELINE_EVENTS.HANDLER_START,
                handler: name,
                inputKeys: Object.keys(ctx.input || {})
            },
            `Starting ${name}`
        );

        try {
            // Execute the handler chain
            await next();

            logger?.[level](
                {
                    event: PIPELINE_EVENTS.HANDLER_COMPLETE,
                    handler: name,
                    hasResult: !!ctx.result,
                    resultKeys: Object.keys(ctx.result || {})
                },
                `Completed ${name}`
            );
        } catch (error) {
            logger.error(
                {
                    event: PIPELINE_EVENTS.HANDLER_FAILED,

                    data: {
                        handler: name,
                        error: error.message,
                        stack: error.stack
                    }
                },
                `Failed ${name}`
            );

            // Re-throw to let other middleware or the system handle it
            throw error;
        }
    };
}

export default loggingMiddleware;
