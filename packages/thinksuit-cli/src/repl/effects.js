import { tryWithEffects } from 'with-effects';

/**
 * Create an effect handler from an effects object
 *
 * @param {Object} effects - Map of effect names to handler functions
 * @param {Object} session - Session context to pass to all effects
 * @returns {Function} - Effect handler function
 */
export function createEffectHandler(effects, session) {
    return async function handleEffect(effect, ...args) {
        if (effect in effects) {
            return await effects[effect](session, ...args);
        }
        throw new Error(`Unhandled effect: ${effect}`);
    };
}

/**
 * Run a REPL with effect handlers
 *
 * @param {AsyncGenerator} repl - REPL generator
 * @param {Object} effects - Effects object
 * @param {Object} session - Session context
 * @param {Function} [onError] - Optional error handler
 * @returns {Promise<void>}
 */
export async function runWithEffects(repl, effects, session, onError) {
    const handleEffect = createEffectHandler(effects, session);
    const errorHandler = onError || ((error) => {
        console.error('REPL Error:', error.message);
        console.error(error.stack);
    });

    await tryWithEffects(repl, handleEffect, errorHandler);
}

/**
 * Basic effect handlers template
 *
 * Override these in your implementation
 */
export const basicEffects = {
    /**
     * Get initial input (startup command/args)
     */
    'get-initial-input': async (session) => {
        // Return empty string if no initial input needed
        return '';
    },

    /**
     * Get user input at prompt
     */
    'get-input': async (session) => {
        // Implement your input mechanism (readline, network, etc.)
        throw new Error('get-input effect not implemented');
    },

    /**
     * Display help
     */
    'help': async (session) => {
        // Display available commands
        console.log('Available commands:', Object.keys(session.commands).join(', '));
    },

    /**
     * Handle errors
     */
    'error': async (session, message) => {
        console.error('Error:', message);
    },

    /**
     * Send output to user
     */
    'output': async (session, message) => {
        console.log(message);
    }
};
