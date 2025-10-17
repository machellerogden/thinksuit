/**
 * Run Helpers - Decomposed functions from run.js for better testability and clarity
 * Each helper has a single, well-defined responsibility
 */

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from '../logger.js';
import { generateId } from '../utils/id.js';
import { initializeHandlers } from '../handlers/index.js';
import { runCycle } from '../runCycle.js';
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

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Normalize configuration with defaults and validation
 * @param {Object} config - Raw configuration
 * @returns {Object} Normalized configuration with all defaults applied
 * @throws {Error} If required fields are missing
 */
export function normalizeConfig(config) {
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
    } else if (config.cwd) {
        // Default to cwd if not specified
        allowedDirectories = [config.cwd];
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
            maxChildren: config.policy?.maxChildren ?? DEFAULT_POLICY.maxChildren,
            perception: {
                profile: config.policy?.perception?.profile || DEFAULT_POLICY.perception.profile,
                budgetMs: config.policy?.perception?.budgetMs ?? DEFAULT_POLICY.perception.budgetMs,
                dimensions: config.policy?.perception?.dimensions || DEFAULT_POLICY.perception.dimensions
            },
            selection: {
                preferLowCost: config.policy?.selection?.preferLowCost ?? DEFAULT_POLICY.selection.preferLowCost,
                riskTolerance: config.policy?.selection?.riskTolerance || DEFAULT_POLICY.selection.riskTolerance
            }
        },
        logging: {
            level: config.logging?.level || DEFAULT_LOGGING.level,
            silent: config.logging?.silent || DEFAULT_LOGGING.silent
        },
        verbose: config.verbose || false,
        trace: config.trace || false,
        sessionId: config.sessionId,
        cwd: config.cwd,
        allowedDirectories,
        mcpServers: config.mcpServers,
        tools: config.tools,
        autoApproveTools: config.autoApproveTools,
        debug: config.debug || false
    };

    // Validate required fields
    if (!finalConfig.input) {
        throw new Error('Input is required');
    }

    // Validate provider-specific authentication
    if (finalConfig.provider === 'vertex-ai') {
        if (!finalConfig.providerConfig?.vertexAi?.projectId) {
            throw new Error('Google Cloud project ID is required for Vertex AI provider (set GOOGLE_CLOUD_PROJECT)');
        }
    } else if (finalConfig.provider === 'openai') {
        if (!finalConfig.providerConfig?.openai?.apiKey) {
            throw new Error('OpenAI API key is required (set OPENAI_API_KEY)');
        }
    } else if (finalConfig.provider === 'anthropic') {
        if (!finalConfig.providerConfig?.anthropic?.apiKey) {
            throw new Error('Anthropic API key is required (set ANTHROPIC_API_KEY)');
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

/**
 * Load state machine definition
 * @returns {Promise<Object>} Parsed machine definition
 */
export async function loadMachineDefinition() {
    const machineJson = await readFile(join(__dirname, '..', 'machine.json'), 'utf8');
    return JSON.parse(machineJson);
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

        // System creates MCP servers from user config (not module)
        // Filesystem server is baked in and uses allowedDirectories
        const mcpServersConfig = createMcpServersFromConfig(config);
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
 * Execute a single ThinkSuit cycle
 * @param {Object} params - Execution parameters
 * @returns {Promise<Array>} [status, result] tuple
 */
export async function executeOnce({ finalConfig, logger, module, machineDefinition, discoveredTools, thread, abortSignal, turnBoundaryId }) {
    const handlers = initializeHandlers();

    try {
        return await runCycle({
            logger,
            thread,
            module,
            sessionId: finalConfig.sessionId,
            traceId: logger.bindings().traceId,
            parentBoundaryId: turnBoundaryId, // Turn boundary as parent
            machineDefinition,
            handlers,
            config: finalConfig,
            discoveredTools,
            abortSignal
        });
    } catch (error) {
        logger.error(
            {
                data: {
                    error: error.message,
                    stack: error.stack
                }
            },
            'State machine execution error'
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
        const output = result?.responseResult?.response?.output || result?.fallback?.output;
        finalResult = {
            success: !!output,
            response: output || 'No response generated',
            sessionId,
            usage: result?.responseResult?.response?.usage,
            error: result?.error
        };
    }

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
