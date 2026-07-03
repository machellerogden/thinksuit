/**
 * Run Helpers - Decomposed functions from run.js for better testability and clarity
 * Each helper has a single, well-defined responsibility
 */

import { createLogger } from '../logger.js';
import { generateId } from '../utils/id.js';
import { executePlan } from '../handlers/executePlan.js';
import { isInterruptError } from '../errors/InterruptError.js';
import { getPlan } from '../../plans.js';
import { startMCPServers, stopAllMCPServers } from '../mcp/client.js';
import { discoverTools } from '../mcp/discovery.js';
import { applyToolPolicy, getFilteredToolNames } from '../mcp/policy.js';
import { createMcpServersFromConfig } from '../mcp/factory.js';
import { validateToolDependencies } from '../mcp/validation.js';
import { SESSION_EVENTS, SYSTEM_EVENTS, EVENT_ROLES, BOUNDARY_TYPES } from '../constants/events.js';
import {
    DEFAULT_MODULE,
    DEFAULT_PROVIDER,
    DEFAULT_MODEL,
    DEFAULT_POLICY,
    DEFAULT_LOGGING
} from '../constants/defaults.js';

/**
 * Normalize configuration with defaults and validation
 * @param {Object} config - Raw configuration
 * @returns {Object} Normalized configuration with all defaults applied
 * @throws {Error} If required fields are missing
 */
export function normalizeConfig(config) {
    // workdir is the session's owned home base; cwd is this turn's working
    // directory, defaulting to workdir. allowedDirectories (the fence) defaults to
    // [workdir].
    const workdir = config.workdir;
    const cwd = config.cwd || workdir;

    // Normalize allowedDirectories
    let allowedDirectories = config.allowedDirectories;
    if (allowedDirectories) {
        // Validate all paths are absolute
        if (!Array.isArray(allowedDirectories)) {
            allowedDirectories = [allowedDirectories];
        }
        for (const dir of allowedDirectories) {
            if (!dir.startsWith('/')) {
                throw new Error(`allowedDirectories must contain absolute paths: ${dir}`);
            }
        }
    } else if (workdir) {
        // Default the fence to the owned home base
        allowedDirectories = [workdir];
    } else if (cwd) {
        allowedDirectories = [cwd];
    }

    const finalConfig = {
        input: config.input || '',
        module: config.module || DEFAULT_MODULE,
        modules: config.modules, // Required: modules object (loaded at entry point)
        provider: config.provider || DEFAULT_PROVIDER,
        model: config.model || DEFAULT_MODEL,
        providerConfig: config.providerConfig,
        policy: {
            maxDepth: config.policy?.maxDepth ?? DEFAULT_POLICY.maxDepth,
            maxFanout: config.policy?.maxFanout ?? DEFAULT_POLICY.maxFanout,
            maxChildren: config.policy?.maxChildren ?? DEFAULT_POLICY.maxChildren
        },
        logging: {
            level: config.logging?.level || DEFAULT_LOGGING.level,
            silent: config.logging?.silent || DEFAULT_LOGGING.silent
        },
        verbose: config.verbose || false,
        trace: config.trace || false,
        sessionId: config.sessionId,
        selectedPlan: config.selectedPlan, // Manual plan override
        frame: config.frame || null, // Frame context { text: string } | null
        modality: config.modality || null, // Modality name (e.g. 'voice'); module renders it
        workdir, // session owned home base (resolved workspace)
        cwd, // this turn's working dir (caller cwd, else workdir)
        allowedDirectories,
        mcpServers: config.mcpServers,
        tools: config.tools,
        allowedTools: config.allowedTools, // the allowlist applyToolPolicy enforces at MCP discovery
        autoApproveTools: config.autoApproveTools,
        debug: config.debug || false
    };

    // Validate required fields
    if (!finalConfig.input) {
        throw new Error('Input is required');
    }

    // Validate provider-specific authentication
    if (finalConfig.provider === 'google') {
        if (!finalConfig.providerConfig?.google?.projectId) {
            throw new Error('Google Cloud project ID is required for Google provider (set GOOGLE_CLOUD_PROJECT)');
        }
    } else if (finalConfig.provider === 'openai') {
        if (!finalConfig.providerConfig?.openai?.apiKey) {
            throw new Error('OpenAI API key is required (set OPENAI_API_KEY in the environment or ~/.thinksuit/secrets.env)');
        }
    } else if (finalConfig.provider === 'anthropic') {
        if (!finalConfig.providerConfig?.anthropic?.apiKey) {
            throw new Error('Anthropic API key is required (set ANTHROPIC_API_KEY in the environment or ~/.thinksuit/secrets.env)');
        }
    }

    if (!finalConfig.sessionId) {
        throw new Error('sessionId is required - use schedule() to initiate execution');
    }

    return finalConfig;
}

/**
 * Build or decorate logger with session and trace context
 * @param {Object} finalConfig - Normalized configuration
 * @param {Object} providedLogger - Optional pre-configured logger
 * @returns {Object} Logger instance with session/trace context
 */
export function buildLogger(finalConfig, providedLogger) {
    const logger = providedLogger || createLogger({
        level: finalConfig.logging.level,
        trace: finalConfig.trace,
        session: true // Always enable session logging
    });

    // Create session-bound logger with traceId and trace status
    const traceId = generateId();
    return logger.child({
        sessionId: finalConfig.sessionId,
        traceId,
        hasTrace: finalConfig.trace
    });
}

/**
 * Select and validate a module from modules object
 * @param {Object} modules - Modules object
 * @param {string} modulePath - Module identifier (e.g., 'thinksuit/mu')
 * @returns {Object} Selected module
 */
export function selectModule(modules, modulePath) {
    if (!modules) {
        throw new Error('modules is required');
    }

    try {
        if (!modules[modulePath]) {
            throw new Error(`Module '${modulePath}' not found in modules object`);
        }

        const module = modules[modulePath];

        // Validate required module properties
        if (!module) {
            throw new Error(`Module '${modulePath}' is null or undefined`);
        }

        if (!module.namespace || typeof module.namespace !== 'string') {
            throw new Error(`Module '${modulePath}' missing required property: namespace`);
        }

        if (!module.name || typeof module.name !== 'string') {
            throw new Error(`Module '${modulePath}' missing required property: name`);
        }

        if (!module.version || typeof module.version !== 'string') {
            throw new Error(`Module '${modulePath}' missing required property: version`);
        }

        // Validate expected module components
        if (module.prompts && typeof module.prompts !== 'object') {
            throw new Error(`Module '${modulePath}' has invalid prompts (must be object)`);
        }

        if (module.composeInstructions && typeof module.composeInstructions !== 'function') {
            throw new Error(`Module '${modulePath}' has invalid composeInstructions (must be function)`);
        }

        // Validate prompt naming conventions if prompts exist
        if (module.prompts) {
            const promptKeys = Object.keys(module.prompts);
            const validPrefixes = ['system.', 'primary.', 'adapt.', 'length.'];
            const invalidKeys = promptKeys.filter(key =>
                !validPrefixes.some(prefix => key.startsWith(prefix))
            );

            if (invalidKeys.length > 0) {
                console.warn(
                    `[MODULE] Warning: Module '${modulePath}' has prompts with non-standard naming: ${invalidKeys.join(', ')}\n` +
                    `Expected prefixes: ${validPrefixes.join(', ')}`
                );
            }
        }

        return module;
    } catch (error) {
        console.error(`[MODULE] ${error.message}`);
        throw error;
    }
}

/**
 * Manage MCP server lifecycle with automatic cleanup
 * @param {Object} module - Module with toolDependencies
 * @param {Object} config - User configuration with allowedDirectories and optional mcpServers
 * @param {Object} logger - Logger instance
 * @returns {Promise<Object>} Object with mcpClients and discoveredTools
 */
export async function withMcpLifecycle(module, config, logger) {
    let mcpClients = new Map();
    let discoveredTools = {};

    // System requires allowedDirectories for filesystem server (baked-in)
    if (!config.allowedDirectories && !config.cwd) {
        return { mcpClients, discoveredTools };
    }

    try {
        logger.info(
            { event: SYSTEM_EVENTS.MCP_SERVERS_START },
            'Starting MCP servers...'
        );

        // Detect if we're online to determine npx flag
        const isOnline = await (await import('is-online')).default();

        // System creates MCP servers from user config (not module)
        // Filesystem server is baked in and uses allowedDirectories
        const mcpServersConfig = createMcpServersFromConfig(config, !isOnline);
        mcpClients = await startMCPServers(mcpServersConfig, config.cwd, config.allowedDirectories, config.verbose);
        const allDiscoveredTools = await discoverTools(mcpClients);

        // Apply tool policy filtering
        discoveredTools = applyToolPolicy(allDiscoveredTools, config);

        const filteredOut = getFilteredToolNames(allDiscoveredTools, discoveredTools);

        logger.info(
            {
                event: SYSTEM_EVENTS.MCP_TOOLS_DISCOVERED,
                data: {
                    totalTools: Object.keys(allDiscoveredTools).length,
                    allowedTools: Object.keys(discoveredTools).length
                }
            },
            `Discovered ${Object.keys(allDiscoveredTools).length} tools, allowed ${Object.keys(discoveredTools).length} after policy`
        );

        if (filteredOut.length > 0) {
            logger.info(
                {
                    event: SYSTEM_EVENTS.MCP_TOOLS_FILTERED,
                    data: { filteredTools: filteredOut }
                },
                `Filtered out tools: ${filteredOut.join(', ')}`
            );
        }

        // Validate module toolDependencies are satisfied
        try {
            validateToolDependencies(module, discoveredTools);
        } catch (validationError) {
            logger.error(
                {
                    event: SYSTEM_EVENTS.MCP_VALIDATION_ERROR,
                    data: { error: validationError.message }
                },
                `Tool validation failed: ${validationError.message}`
            );
            throw validationError;
        }
    } catch (error) {
        logger.error(
            {
                event: SYSTEM_EVENTS.MCP_SERVERS_ERROR,
                data: { error: error.message }
            },
            `Failed to initialize MCP servers: ${error.message}`
        );
        // Re-throw to propagate validation errors
        throw error;
    }

    return { mcpClients, discoveredTools, cleanup: async () => {
        if (mcpClients.size > 0) {
            try {
                await stopAllMCPServers();
            } catch (error) {
                logger.error(
                    {
                        event: SYSTEM_EVENTS.MCP_SERVERS_ERROR,
                        data: { error: error.message }
                    },
                    `Failed to stop MCP servers: ${error.message}`
                );
            }
        }
    }};
}

/**
 * Execute a single ThinkSuit turn through the plan composer.
 *
 * Resolves the plan.v1 node (explicit override, else the module's default), runs it via
 * executePlan, and translates the outcome into the [status, result] shape formatFinalResult
 * expects.
 *
 * @param {Object} params - Execution parameters
 * @returns {Promise<Array>} [status, result] tuple
 */
export async function executeOnce({ finalConfig, logger, module, discoveredTools, thread, input, abortSignal, turnBoundaryId }) {
    // Resolve the plan.v1 node: explicit override, else the module's stated default.
    const rootNode =
        finalConfig.selectedPlan ?? (await getPlan(module.defaultPlan, finalConfig.module, module));
    if (!rootNode) {
        throw new Error(
            `No plan to execute: no selectedPlan and module '${finalConfig.module}' has no resolvable defaultPlan`
        );
    }

    const machineContext = {
        config: finalConfig,
        module,
        execLogger: logger.child({ branch: 'root', depth: 0 }),
        abortSignal,
        discoveredTools
    };

    const ctx = {
        machineContext,
        bag: { input },
        thread,
        context: {
            sessionId: finalConfig.sessionId,
            traceId: logger.bindings().traceId,
            depth: 0,
            branch: 'root',
            parentBoundaryId: turnBoundaryId
        },
        frame: finalConfig.frame,
        modality: finalConfig.modality
    };

    try {
        const result = await executePlan(rootNode, ctx);
        return ['SUCCEEDED', { handlerResult: { response: result.response } }];
    } catch (error) {
        // Interrupt is a first-class outcome — surface it as the interrupted status rather
        // than a thrown error, so the turn closes cleanly with session.interrupted.
        if (isInterruptError(error)) {
            return [
                'interrupted',
                {
                    interrupted: true,
                    message: error.message,
                    partialData: error.gatheredData ?? null
                }
            ];
        }

        logger.error(
            {
                data: {
                    error: error.message,
                    stack: error.stack
                }
            },
            'Turn execution error'
        );
        throw error;
    }
}

/**
 * Format final result based on execution status
 * @param {string} status - Execution status (SUCCEEDED/FAILED)
 * @param {Object} result - Execution result
 * @param {string} sessionId - Session ID
 * @param {Object} logger - Logger instance
 * @param {string} turnBoundaryId - Turn boundary ID
 * @param {string} sessionBoundaryId - Session boundary ID
 * @returns {Object} Formatted final result
 */
export function formatFinalResult(status, result, sessionId, logger, turnBoundaryId, sessionBoundaryId) {
    let finalResult;

    if (status === 'FAILED') {
        finalResult = {
            success: false,
            response: 'Execution failed',
            sessionId,
            error: result?.name || 'Unknown error'
        };
    } else if (status === 'interrupted') {
        // Handle interrupted execution
        finalResult = {
            success: false,
            response: result?.message || 'Task interrupted by user',
            sessionId,
            interrupted: true,
            partialData: result?.partialData || null
        };
    } else {
        const response = result?.handlerResult?.response;
        const output = response?.output || result?.fallback?.output;
        const responseError = response?.error;
        finalResult = {
            // A response that carries an error is not a success, even when it also
            // carries placeholder output (e.g. a sequential run whose step failed).
            success: !!output && !responseError,
            response: output || 'No response generated',
            sessionId,
            usage: response?.usage,
            error: result?.error || responseError
        };
    }

    if (status === 'interrupted') {
        // Interrupt is a first-class outcome: emit session.interrupted instead of a
        // synthetic assistant response. loadSessionThread renders this as a
        // user-side marker; the structural turn boundary still closes below.
        logger.info(
            {
                event: SESSION_EVENTS.INTERRUPTED,
                parentBoundaryId: turnBoundaryId,
                data: {
                    reason: finalResult.response,
                    partialData: finalResult.partialData ?? null
                }
            },
            'Turn interrupted by user'
        );
    } else {
        // Log the response (now a regular event, not a boundary)
        logger.info(
            {
                event: SESSION_EVENTS.RESPONSE,
                parentBoundaryId: turnBoundaryId,
                data: {
                    response: finalResult.response,
                    usage: finalResult.usage,
                    success: finalResult.success
                }
            },
            'Assistant response generated'
        );
    }

    // Log turn complete boundary
    logger.info(
        {
            event: SESSION_EVENTS.TURN_COMPLETE,
            eventRole: EVENT_ROLES.BOUNDARY_END,
            boundaryType: BOUNDARY_TYPES.TURN,
            boundaryId: turnBoundaryId,
            parentBoundaryId: sessionBoundaryId
        },
        'Turn completed'
    );

    return finalResult;
}
