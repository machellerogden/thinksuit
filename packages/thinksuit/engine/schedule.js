import { generateId } from './utils/id.js';
import { acquireSession, loadSessionThread } from './transports/session-router.js';
import { forkSession } from './sessions/index.js';
import { createInterruptController } from './errors/InterruptError.js';

/**
 * Schedule a ThinkSuit execution
 * Combines session preparation and execution scheduling
 *
 * @param {Object} config - Configuration object (same as run() config)
 * @param {string} config.input - User input text
 * @param {string} [config.sessionId] - Optional session ID to resume
 * @param {string} [config.sourceSessionId] - Optional session ID to fork from
 * @param {number} [config.forkFromIndex] - Event index to fork from (requires sourceSessionId)
 * @param {string} [config.module='thinksuit/mu'] - Module to load
 * @param {Object} config.modules - Modules object (required - loaded at entry point)
 * @param {string} [config.modulesPackage] - Not used by schedule() - loaded at entry points
 * @param {string} [config.provider='openai'] - LLM provider
 * @param {string} [config.model='gpt-4o-mini'] - Model name
 * @param {string} config.apiKey - API key for the provider
 * @param {Object} [config.policy] - Execution policy
 * @param {Object} [config.logging] - Logging configuration
 * @param {boolean} [config.trace=false] - Enable tracing
 * @param {Object} [config.logger] - Optional pre-configured logger instance
 * @returns {Promise<{sessionId: string, scheduled: boolean, isNew: boolean, isForked: boolean, execution: Promise, interrupt: Function, reason?: string}>}
 */
export async function schedule(config) {
    let sessionId = config.sessionId;
    let isForked = false;

    // Create interrupt controller for this execution
    const interruptController = createInterruptController();

    // Handle forking if requested
    if (config.sourceSessionId && config.forkFromIndex !== undefined) {
        const forkResult = await forkSession(config.sourceSessionId, config.forkFromIndex);
        if (!forkResult.success) {
            return {
                sessionId: null,
                scheduled: false,
                isNew: false,
                isForked: false,
                reason: `Fork failed: ${forkResult.error}`,
                execution: Promise.reject(new Error(forkResult.error))
            };
        }
        sessionId = forkResult.sessionId;
        isForked = true;
    } else if (!sessionId) {
        // Generate session ID if not provided and not forking
        sessionId = generateId();
    }

    // Try to acquire the session (handles atomic status check)
    const { success, reason } = await acquireSession(sessionId);

    if (!success) {
        // Can't proceed with this session
        return {
            sessionId,
            scheduled: false,
            isNew: false,
            isForked,
            reason,
            execution: Promise.reject(new Error(reason)),
            interrupt: () => {} // No-op interrupt function for failed schedule
        };
    }

    // Load thread (will be empty array if new session)
    const thread = await loadSessionThread(sessionId);

    // Determine if new or resuming based on thread content
    const isNew = !isForked && thread.length === 0;

    // Dynamically import run to avoid circular dependency
    const { run } = await import('./run.js');

    // Create execution promise with abort signal
    const execution = run({
        ...config,
        sessionId,
        _thread: thread, // Internal flag to avoid re-loading thread
        _abortSignal: interruptController.signal // Pass abort signal to run
    });

    // Create interrupt function that triggers abort
    const interrupt = async (reason = 'User interrupted') => {
        try {
            // Trigger the abort - let the execution handle the rest
            interruptController.interrupt(reason);

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    };

    return {
        sessionId,
        scheduled: true,
        isNew,
        isForked,
        execution,
        interrupt
    };
}
