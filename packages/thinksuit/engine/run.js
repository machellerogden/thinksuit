#!/usr/bin/env node

/**
 * Programmatic entry point for ThinkSuit
 *
 * This is the clean interface for running ThinkSuit programmatically.
 * All configuration is passed as an explicit object - no environment
 * variables or config files are read here.
 *
 * @example
 * import { run } from './engine/run.js';
 *
 * const result = await run({
 *     input: 'Help me understand quantum computing',
 *     module: 'thinksuit/mu',
 *     modulesPackage: 'thinksuit-modules',  // optional
 *     modules: { 'my/module': moduleObject }, // optional (bypasses modulesPackage)
 *     provider: 'openai',
 *     model: 'gpt-4o-mini',
 *     apiKey: 'sk-...',
 *     policy: { maxDepth: 5 },
 *     logging: { level: 'info' },
 *     trace: false
 * });
 */

import { SESSION_EVENTS, EVENT_ROLES, BOUNDARY_TYPES } from './constants/events.js';
import {
    normalizeConfig,
    buildLogger,
    selectModule,
    loadMachineDefinition,
    withMcpLifecycle,
    executeOnce,
    formatFinalResult
} from './run/internals.js';

/**
 * Run ThinkSuit with explicit configuration
 *
 * @param {Object} config - Configuration object
 * @param {string} config.input - User input text
 * @param {string} [config.module='thinksuit/mu'] - Module to load
 * @param {Object} config.modules - Modules object (required - loaded at entry point)
 * @param {string} [config.modulesPackage] - Not used by run() - loaded at entry points
 * @param {string} [config.provider='openai'] - LLM provider
 * @param {string} [config.model='gpt-4o-mini'] - Model name
 * @param {string} config.apiKey - API key for the provider
 * @param {Object} [config.policy] - Execution policy
 * @param {number} [config.policy.maxDepth=5] - Maximum recursion depth
 * @param {Object} [config.logging] - Logging configuration
 * @param {string} [config.logging.level='info'] - Log level
 * @param {boolean} [config.trace=false] - Enable tracing
 * @param {string} [config.sessionId] - Session ID to use or resume
 * @param {Object} [config.logger] - Optional pre-configured logger instance
 * @returns {Promise<Object>} Execution result
 */
export async function run(config) {
    // Normalize and validate configuration
    const finalConfig = normalizeConfig(config);

    // Build logger with session and trace context
    const logger = buildLogger(finalConfig, config.logger);

    // Extract abort signal if provided
    const abortSignal = config._abortSignal || null;

    // Use provided thread or load it
    let thread;
    if (config._thread) {
        // Thread was already loaded by schedule()
        thread = config._thread;
    } else {
        // Load thread (for direct calls, though this shouldn't happen)
        const { loadSessionThread } = await import('./transports/session-router.js');
        thread = await loadSessionThread(finalConfig.sessionId);
    }

    // Build full thread with user input
    const fullThread = [
        ...thread, // Include conversation history
        { role: 'user', content: finalConfig.input }
    ];

    // Generate boundary IDs
    const sessionBoundaryId = `session-${finalConfig.sessionId}`;
    const turnBoundaryId = `turn-${finalConfig.sessionId}-${Date.now()}`;

    // Log turn start boundary
    logger.info(
        {
            event: SESSION_EVENTS.TURN_START,
            eventRole: EVENT_ROLES.BOUNDARY_START,
            boundaryType: BOUNDARY_TYPES.TURN,
            boundaryId: turnBoundaryId,
            parentBoundaryId: sessionBoundaryId
        },
        'Turn started'
    );

    // Log the user input (now a regular event, not a boundary)
    logger.info(
        {
            event: SESSION_EVENTS.INPUT,
            parentBoundaryId: turnBoundaryId,
            data: {
                input: finalConfig.input
            }
        },
        'User input received'
    );

    // Select module and load machine definition
    const module = selectModule(finalConfig.modules, finalConfig.module);
    const machineDefinition = await loadMachineDefinition();

    // Initialize MCP servers and discover tools
    const { discoveredTools, cleanup } = await withMcpLifecycle(module, finalConfig, logger);

    try {
        // Execute the ThinkSuit cycle with abort signal
        const [status, result] = await executeOnce({
            finalConfig,
            logger,
            module,
            machineDefinition,
            discoveredTools,
            thread: fullThread,
            abortSignal,
            turnBoundaryId
        });

        // Format and return the final result
        return formatFinalResult(status, result, finalConfig.sessionId, logger, turnBoundaryId, sessionBoundaryId);
    } finally {
        // Ensure MCP servers are cleaned up
        if (cleanup) {
            await cleanup();
        }
    }
}

/**
 * Load module from modules object
 * @param {string} modulePath - Module identifier (e.g., 'thinksuit/mu')
 * @param {Object} [modules] - Modules object (defaults to thinksuit-modules)
 */
export async function loadModule(modulePath, modules) {
    const { modules: defaultModules } = await import('thinksuit-modules');
    const moduleSource = modules || defaultModules;

    try {
        // Look for the requested module
        if (!moduleSource[modulePath]) {
            throw new Error(`Module '${modulePath}' not found in modules object`);
        }

        const module = moduleSource[modulePath];
        const source = modules ? 'provided modules' : 'thinksuit-modules';
        console.log(`[MODULE] Resolved from ${source}: ${modulePath}`);

        // Validate module structure
        if (!module || !module.namespace || !module.name || !module.version) {
            throw new Error(`Module '${modulePath}' has invalid structure`);
        }

        return module;
    } catch (error) {
        console.error(`[MODULE] ${error.message}`);
        throw error;
    }
}
