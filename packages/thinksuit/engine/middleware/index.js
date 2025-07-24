/**
 * Middleware abstraction for task handlers
 * Allows composing handlers with cross-cutting concerns like IO injection, logging, metrics, etc.
 */

/**
 * Compose multiple middleware functions into a single handler
 * @param {...Function} middlewares - Middleware functions
 * @returns {Function} - Composed handler function
 */
export function compose(...middlewares) {
    return async function composedHandler(input, machineContext) {
        // Create a context object that middlewares can modify
        const ctx = {
            input,
            machineContext
            // Middleware can add properties here (e.g., io, metrics, etc.)
        };

        // Create the middleware chain
        let index = -1;

        async function dispatch(i) {
            if (i <= index) {
                throw new Error('Middleware called next() multiple times');
            }
            index = i;

            const middleware = middlewares[i];

            if (!middleware) {
                // End of middleware chain - return accumulated result
                return ctx.result;
            }

            // Call middleware with context and next function
            await middleware(ctx, () => dispatch(i + 1));
        }

        // Start the middleware chain
        await dispatch(0);

        // Return the result set by the handler
        return ctx.result || {};
    };
}

/**
 * Create a handler middleware (the actual business logic)
 * This should typically be the last middleware in the chain
 * @param {Function} handler - The actual handler function
 * @returns {Function} - Middleware function
 */
export function createHandler(handler) {
    return async function handlerMiddleware(ctx, next) {
        // Call the handler with the correct signature (input, machineContext)
        ctx.result = await handler(ctx.input, ctx.machineContext);

        // Call next in case there are post-processing middleware
        await next();
    };
}

/**
 * Utility to wrap a traditional handler with middleware
 * @param {Function} handler - Traditional (input, machineContext) => result handler
 * @param {...Function} middlewares - Middleware to apply
 * @returns {Function} - Enhanced handler
 */
export function withMiddleware(handler, ...middlewares) {
    return compose(...middlewares, createHandler(handler));
}

export default { compose, createHandler, withMiddleware };
