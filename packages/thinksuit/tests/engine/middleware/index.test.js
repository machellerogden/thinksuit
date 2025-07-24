import { describe, it, expect } from 'vitest';

import { compose, withMiddleware } from '../../../engine/middleware/index.js';
import { metricsMiddleware } from '../../../engine/middleware/metrics.js';

describe('Middleware Abstraction', () => {
    describe('compose', () => {
        it('should execute middleware in order', async () => {
            const order = [];

            const middleware1 = async (ctx, next) => {
                order.push('m1-before');
                await next();
                order.push('m1-after');
            };

            const middleware2 = async (ctx, next) => {
                order.push('m2-before');
                await next();
                order.push('m2-after');
            };

            const handler = async (ctx, next) => {
                order.push('handler');
                ctx.result = { data: 'test' };
                await next();
            };

            const composed = compose(middleware1, middleware2, handler);
            const result = await composed({ input: 'test' }, {});

            expect(order).toEqual(['m1-before', 'm2-before', 'handler', 'm2-after', 'm1-after']);
            expect(result).toEqual({ data: 'test' });
        });

        it('should handle errors in middleware', async () => {
            const middleware = async () => {
                throw new Error('Middleware error');
            };

            const handler = async (ctx, next) => {
                ctx.result = { data: 'test' };
                await next();
            };

            const composed = compose(middleware, handler);

            await expect(composed({}, {})).rejects.toThrow('Middleware error');
        });

        it('should prevent multiple next() calls', async () => {
            const middleware = async (ctx, next) => {
                await next();
                await next(); // Second call should throw
            };

            const handler = async (ctx, next) => {
                ctx.result = { data: 'test' };
                await next();
            };

            const composed = compose(middleware, handler);

            await expect(composed({}, {})).rejects.toThrow(
                'Middleware called next() multiple times'
            );
        });
    });

    describe('withMiddleware', () => {
        it('should wrap a traditional handler', async () => {
            const traditionalHandler = async (input) => {
                return { result: input.value * 2 };
            };

            const middleware = async (ctx, next) => {
                ctx.input.value = ctx.input.value + 1;
                await next();
            };

            const wrapped = withMiddleware(traditionalHandler, middleware);
            const result = await wrapped({ value: 5 }, {});

            expect(result).toEqual({ result: 12 }); // (5 + 1) * 2
        });
    });

    describe('metricsMiddleware', () => {
        it('should collect execution metrics', async () => {
            const handler = async (_input, _ctx) => {
                // Simulate some work
                await new Promise((resolve) => setTimeout(resolve, 10));
                return { data: 'test' };
            };

            const wrapped = withMiddleware(handler, metricsMiddleware());

            const result = await wrapped({}, {});

            expect(result.metrics).toBeDefined();
            expect(result.metrics.duration).toBeGreaterThanOrEqual(10);
            expect(result.metrics.memoryDelta).toBeDefined();
        });

        it('should check budget compliance', async () => {
            const handler = async (_input, _ctx) => {
                await new Promise((resolve) => setTimeout(resolve, 5));
                return { data: 'test' };
            };

            const wrapped = withMiddleware(handler, metricsMiddleware({ budgetMs: 50 }));

            const result = await wrapped({}, {});

            expect(result.metrics.withinBudget).toBe(true);
        });

        it('should detect budget violations', async () => {
            const handler = async (_input, _ctx) => {
                await new Promise((resolve) => setTimeout(resolve, 20));
                return { data: 'test' };
            };

            const wrapped = withMiddleware(handler, metricsMiddleware({ budgetMs: 10 }));

            const result = await wrapped({}, {});

            expect(result.metrics.withinBudget).toBe(false);
        });
    });

    describe('middleware composition', () => {
        it('should work with multiple middleware', async () => {
            const handler = async (input, machineContext) => {
                return {
                    value: input.value,
                    hasConfig: !!machineContext?.config
                };
            };

            const wrapped = withMiddleware(handler, metricsMiddleware({ budgetMs: 100 }));

            const result = await wrapped(
                { value: 42 },
                { config: { provider: 'openai', model: 'gpt-4', apiKey: 'test-key' } }
            );

            expect(result.value).toBe(42);
            expect(result.hasConfig).toBe(true);
            expect(result.metrics).toBeDefined();
            expect(result.metrics.withinBudget).toBe(true);
        });
    });
});
