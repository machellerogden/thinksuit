/**
 * Metrics Middleware
 * Collects metrics about handler execution
 */

import { SYSTEM_EVENTS } from '../constants/events.js';

/**
 * Middleware that collects execution metrics
 * @param {Object} options - Metrics options
 * @param {number} options.budgetMs - Expected execution time budget in milliseconds
 * @param {string} options.name - Handler name for logging
 * @returns {Function} - Middleware function
 */
export function metricsMiddleware(options = {}) {
    const { budgetMs = null, name = 'handler' } = options;

    return async function metrics(ctx, next) {
        const startTime = Date.now();
        const startMemory = process.memoryUsage();
        const logger = ctx.machineContext?.execLogger;

        // Initialize metrics object on machineContext
        ctx.machineContext.metrics = {
            startTime,
            ...ctx.machineContext.metrics // Preserve any existing metrics
        };

        try {
            // Execute the handler chain
            await next();

            // Collect final metrics
            const endTime = Date.now();
            const endMemory = process.memoryUsage();
            const duration = endTime - startTime;

            ctx.machineContext.metrics = {
                ...ctx.machineContext.metrics,
                duration,
                memoryDelta: {
                    heapUsed: endMemory.heapUsed - startMemory.heapUsed,
                    external: endMemory.external - startMemory.external
                },
                withinBudget: budgetMs ? duration <= budgetMs : null
            };

            // Log timing as single source of truth
            logger?.debug(
                {
                    event: SYSTEM_EVENTS.METRIC,

                    data: {
                        handler: name,
                        duration,
                        memoryDelta: ctx.machineContext.metrics.memoryDelta,
                        withinBudget: ctx.machineContext.metrics.withinBudget
                    }
                },
                'Handler metrics'
            );

            // Warn if over budget
            if (budgetMs && duration > budgetMs) {
                logger?.warn(
                    {
                        event: SYSTEM_EVENTS.BUDGET_EXCEEDED,

                        data: {
                            handler: name,
                            duration,
                            budget: budgetMs
                        }
                    },
                    'Handler exceeded budget'
                );
            }

            // Add metrics to result if it exists
            if (ctx.result && typeof ctx.result === 'object') {
                ctx.result.metrics = {
                    ...ctx.result.metrics,
                    ...ctx.machineContext.metrics
                };
            }
        } catch (error) {
            // Still collect metrics on error
            const endTime = Date.now();
            const duration = endTime - startTime;

            ctx.machineContext.metrics = {
                ...ctx.machineContext.metrics,
                duration,
                error: error.message,
                withinBudget: budgetMs ? duration <= budgetMs : null
            };

            // Log timing even on error
            logger?.debug(
                {
                    data: {
                        handler: name,
                        duration,
                        error: true,
                        withinBudget: ctx.machineContext.metrics.withinBudget
                    }
                },
                'Handler metrics (failed)'
            );

            throw error;
        }
    };
}

/**
 * Convenience middleware for handlers with specific time budgets
 */
export const withBudget = (ms, name) => metricsMiddleware({ budgetMs: ms, name });

export default metricsMiddleware;
