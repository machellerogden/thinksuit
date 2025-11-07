import { fx } from 'with-effects';
import chalk from 'chalk';
import { indentLines } from '../lib/utils.js';

/**
 * :session [id] - Set or clear session ID
 * - No args: Clear sessionId (start fresh)
 * - With ID: Set sessionId to continue existing session
 */
export async function* sessionCommand(args, session) {
    if (args.length > 0) {
        // Set sessionId to provided value
        const sessionId = args[0];
        session.thinkSuit.sessionId = sessionId;
        yield fx('output', chalk.green(`Session set to: ${sessionId}`));
    } else {
        // Clear sessionId - confirm if one exists
        if (session.thinkSuit.sessionId) {
            const confirmed = yield fx('confirm', chalk.yellow(`Clear current session ${session.thinkSuit.sessionId}?`));
            if (!confirmed) {
                yield fx('output', chalk.dim('Session not cleared'));
                return true;
            }
        }

        session.thinkSuit.sessionId = null;
        yield fx('output', chalk.green('Session cleared (next input will start new session)'));
    }

    return true;
}

/**
 * :status - Show current session and configuration
 */
export async function* statusCommand(args, session) {
    const { thinkSuit } = session;

    yield fx('output', chalk.bold.cyan('ThinkSuit Status:'));
    yield fx('output', '');

    if (thinkSuit.sessionId) {
        yield fx('output', `  ${chalk.bold('Session:')} ${thinkSuit.sessionId}`);
    } else {
        yield fx('output', `  ${chalk.bold('Session:')} ${chalk.dim('(none - use /session to start)')}`);
    }

    // Show selected preset
    if (session.presetCycling?.selectedPlan) {
        const presetInfo = session.presetCycling.presetList[session.presetCycling.currentIndex];
        yield fx('output', `  ${chalk.bold('Preset:')} ${presetInfo.name}${presetInfo.description ? ` - ${presetInfo.description}` : ''}`);
    } else {
        yield fx('output', `  ${chalk.bold('Preset:')} ${chalk.dim('(auto)')}`);
    }

    yield fx('output', '');
    yield fx('output', chalk.bold.cyan('Configuration:'));
    yield fx('output', `  ${chalk.bold('Module:')} ${thinkSuit.config.module}`);
    yield fx('output', `  ${chalk.bold('Provider:')} ${thinkSuit.config.provider}`);
    yield fx('output', `  ${chalk.bold('Model:')} ${thinkSuit.config.model}`);
    yield fx('output', `  ${chalk.bold('Tools:')} ${thinkSuit.config.tools.length > 0 ? thinkSuit.config.tools.join(', ') : chalk.dim('(none)')}`);
    yield fx('output', `  ${chalk.bold('Max Depth:')} ${thinkSuit.config.policy.maxDepth}`);
    yield fx('output', `  ${chalk.bold('Max Fanout:')} ${thinkSuit.config.policy.maxFanout}`);

    if (thinkSuit.lastTraceId) {
        yield fx('output', '');
        yield fx('output', `  ${chalk.bold('Last Trace:')} ${thinkSuit.lastTraceId}`);
    }

    yield fx('output', '');

    return true;
}

/**
 * :config - Get or set configuration values
 */
export async function* configCommand(args, session) {
    const { thinkSuit } = session;

    if (args.length === 0) {
        // Show all config
        yield* statusCommand(args, session);
        return true;
    }

    const key = args[0].toLowerCase();
    const value = args.slice(1).join(' ');

    if (!value) {
        // Get specific config value
        switch (key) {
            case 'module':
                yield fx('output', thinkSuit.config.module);
                break;
            case 'provider':
                yield fx('output', thinkSuit.config.provider);
                break;
            case 'model':
                yield fx('output', thinkSuit.config.model);
                break;
            case 'tools':
                yield fx('output', thinkSuit.config.tools.join(', ') || chalk.dim('(none)'));
                break;
            case 'maxdepth':
                yield fx('output', String(thinkSuit.config.policy.maxDepth));
                break;
            case 'maxfanout':
                yield fx('output', String(thinkSuit.config.policy.maxFanout));
                break;
            default:
                yield fx('error', `Unknown config key: ${key}`);
        }
    } else {
        // Set config value
        switch (key) {
            case 'module':
                thinkSuit.config.module = value;
                yield fx('output', chalk.green(`Module set to: ${value}`));
                break;
            case 'provider':
                thinkSuit.config.provider = value;
                yield fx('output', chalk.green(`Provider set to: ${value}`));
                break;
            case 'model':
                thinkSuit.config.model = value;
                yield fx('output', chalk.green(`Model set to: ${value}`));
                break;
            case 'tools':
                thinkSuit.config.tools = value.split(',').map(t => t.trim()).filter(Boolean);
                yield fx('output', chalk.green(`Tools set to: ${thinkSuit.config.tools.join(', ')}`));
                break;
            case 'maxdepth':
                const maxDepth = parseInt(value, 10);
                if (isNaN(maxDepth) || maxDepth < 1) {
                    yield fx('error', 'maxdepth must be a positive integer');
                } else {
                    thinkSuit.config.policy.maxDepth = maxDepth;
                    yield fx('output', chalk.green(`Max depth set to: ${maxDepth}`));
                }
                break;
            case 'maxfanout':
                const maxFanout = parseInt(value, 10);
                if (isNaN(maxFanout) || maxFanout < 1) {
                    yield fx('error', 'maxfanout must be a positive integer');
                } else {
                    thinkSuit.config.policy.maxFanout = maxFanout;
                    yield fx('output', chalk.green(`Max fanout set to: ${maxFanout}`));
                }
                break;
            default:
                yield fx('error', `Unknown config key: ${key}`);
        }
    }

    return true;
}

/**
 * :clear - Clear the screen
 */
export async function* clearCommand(args, session) {
    yield fx('clear');
    return true;
}

/**
 * :help - Display available commands and usage
 */
export async function* helpCommand(args, session) {
    yield fx('output', '');
    yield fx('output', chalk.bold.cyan('ThinkSuit CLI - System Commands:'));
    yield fx('output', '');
    yield fx('output', chalk.bold('  :session [id]') + ' - Manage session (no args: clear, with ID: set)');
    yield fx('output', chalk.bold('  :status') + ' - Show current session and configuration');
    yield fx('output', chalk.bold('  :config [key] [value]') + ' - Get or set configuration');
    yield fx('output', chalk.bold('  :clear') + ' - Clear the screen');
    yield fx('output', chalk.bold('  :help') + ' - Show this help message');
    yield fx('output', chalk.bold('  :quit, :exit, :q') + ' - Exit the REPL');
    yield fx('output', '');
    yield fx('output', chalk.bold.cyan('Usage:'));
    yield fx('output', '  Commands starting with : control the REPL (vim-like)');
    yield fx('output', '  Regular text sends input to ThinkSuit');
    yield fx('output', '');
    yield fx('output', chalk.bold.cyan('Keyboard Shortcuts:'));
    yield fx('output', chalk.bold('  Shift+Tab') + ' - Cycle through presets (auto → chat → capture → investigate → ...)');
    yield fx('output', chalk.bold('  Ctrl+C') + ' - Exit (double-press)');
    yield fx('output', chalk.bold('  ESC') + ' - Interrupt execution (when busy) or clear input (double-press)');
    yield fx('output', '');
    yield fx('output', chalk.bold.cyan('Config Keys:'));
    yield fx('output', '  module, provider, model, tools, maxdepth, maxfanout');
    yield fx('output', '');
    return true;
}

/**
 * execute - Execute user input through ThinkSuit (for non-slash input)
 */
export async function* executeCommand(args, session) {
    const input = args.join(' ');
    const { thinkSuit, executionState } = session;

    // Lazy imports to avoid circular dependencies
    const { schedule } = await import('../../../thinksuit/engine/schedule.js');
    const { createBaseConfig } = await import('../../../thinksuit/engine/logger.js');
    const { createLoggerStream } = await import('./logger-stream.js');
    const { resolveApproval } = await import('../../../thinksuit/index.js');
    const pino = (await import('pino')).default;
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const __dirname = dirname(fileURLToPath(import.meta.url));

    // Approval queue for managing tool approval requests
    const approvalQueue = [];

    try {
        // Set busy state
        executionState.busy = true;
        executionState.interrupt = null;

        // Show initial busy state
        yield fx('status-show', chalk.dim('⋯ Initializing...'));

        // Use modules already loaded in main.js startup
        const modules = thinkSuit.config.modules;

        // Event handler for ThinkSuit events
        const handleEvent = (event) => {
            // Detect tool approval requests
            if (event.event === 'execution.tool.approval-requested') {
                approvalQueue.push({
                    approvalId: event.approvalId,
                    tool: event.data?.tool || 'unknown',
                    args: event.data?.args || {},
                    sessionId: event.sessionId
                });
            }

            if (event.msg) {
                const message = formatEventMessage(event);
                if (message) {
                    // This won't work with yield inside this callback
                    // We'll need to handle this differently
                    session.controlDock.updateStatus(message);
                }
            }
        };

        // Create custom logger stream that captures events
        const eventStream = createLoggerStream(null, null, handleEvent);

        // Create logger with both event stream and session file transport
        const baseConfig = createBaseConfig('info');

        // Build multistream with event stream + session transport
        const sessionTransportPath = join(__dirname, '../../../thinksuit/engine/transports/session-router.js');
        const transport = pino.transport({
            targets: [
                {
                    target: sessionTransportPath,
                    level: 'info',
                    options: {}
                }
            ]
        });

        // Combine event stream with session transport using multistream
        const streams = [
            { level: 'info', stream: eventStream },
            { level: 'info', stream: transport }
        ];

        const logger = pino(baseConfig, pino.multistream(streams));

        // Build schedule config
        const scheduleConfig = {
            input,
            module: thinkSuit.config.module,
            modules,
            provider: thinkSuit.config.provider,
            model: thinkSuit.config.model,
            providerConfig: thinkSuit.config.providerConfig,
            cwd: thinkSuit.config.cwd,
            tools: thinkSuit.config.tools,
            allowedDirectories: thinkSuit.config.allowedDirectories,
            mcpServers: thinkSuit.config.mcpServers,
            autoApproveTools: false, // Changed to false to enable interactive approval
            policy: thinkSuit.config.policy,
            trace: thinkSuit.config.trace,
            sessionId: thinkSuit.sessionId,
            logger,
            ...(session.presetCycling?.selectedPlan && { selectedPlan: session.presetCycling.selectedPlan })
        };

        // Schedule and execute
        const { sessionId, scheduled, isNew, execution, interrupt, reason } = await schedule(scheduleConfig);

        if (!scheduled) {
            yield fx('status-clear');
            yield fx('error', `Failed to start: ${reason}`);
            executionState.busy = false;
            executionState.interrupt = null;
            return true;
        }

        // Store interrupt function for Ctrl-C handler
        executionState.interrupt = interrupt;

        // Update session ID if new or if we don't have one yet
        if (isNew || !thinkSuit.sessionId) {
            thinkSuit.sessionId = sessionId;
        }

        // Start approval processor in background
        let approvalProcessorRunning = true;
        const approvalProcessorPromise = (async () => {
            while (approvalProcessorRunning && executionState.busy) {
                if (approvalQueue.length > 0) {
                    const approval = approvalQueue.shift();

                    // Use the control dock directly for approval (bypass effect system for background task)
                    const approved = await session.controlDock.getApproval(approval);

                    // Resolve approval in ThinkSuit core
                    resolveApproval(approval.approvalId, approved);
                }

                // Small delay to avoid busy loop
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        })();

        // Wait for execution to complete
        const result = await execution;

        // Stop approval processor
        approvalProcessorRunning = false;
        await approvalProcessorPromise;

        // Clear busy state
        executionState.busy = false;
        executionState.interrupt = null;
        yield fx('status-clear');

        // Clear dock before displaying output
        yield fx('clear-dock');

        // Display response
        if (result.error) {
            yield fx('error', result.error);
            yield fx('output', '');
        } else if (result.interrupted) {
            yield fx('output', chalk.yellow('Execution interrupted'));
            yield fx('output', '');
        } else {
            const [ first, ...rest ] = result.response.split('\n');
            yield fx('output', `⏺ ${first}`);
            for (const line of rest) {
                yield fx('output', indentLines(line, 2));
            }
            yield fx('output', '');
        }

    } catch (error) {
        executionState.busy = false;
        executionState.interrupt = null;
        yield fx('status-clear');
        yield fx('error', `Execution failed: ${error.message}`);
    }

    return true;
}

const LLM_PROCESSING_MESSAGES = [
    'Doodling...',
    'Contemplating the meaning of life...',
    'Consulting the oracle...',
    'Herding cats...',
    'Searching for the perfect GIF...',
    'Counting to infinity...',
    'Polishing virtual apples...',
    'Debugging the matrix...',
    'Chasing butterflies...',
    'Rearranging pixels...'
];

/**
 * Format event message for display
 */
function formatEventMessage(event) {
    const prefix = chalk.dim('⋯');

    // Map event types to user-friendly messages
    switch (event.event) {
        case 'session.started':
            return `${prefix} Session started...`;
        case 'execution.started':
            return `${prefix} Processing...`;
        case 'processing.llm.request':
            return `${prefix} ${LLM_PROCESSING_MESSAGES[Math.floor(Math.random() * LLM_PROCESSING_MESSAGES.length)]}`;
        case 'processing.llm.response':
            return `${prefix} Received response...`;
        case 'tool.execution':
            return `${prefix} Executing tool: ${event.tool || 'unknown'}...`;
        case 'processing.signal.detected':
            return `${prefix} Analyzing signals...`;
        default:
            // For other events, show generic message
            if (event.msg) {
                const shortMsg = event.msg.length > 60
                    ? event.msg.substring(0, 57) + '...'
                    : event.msg;
                return `${prefix} ${shortMsg}`;
            }
            return; //`${prefix} ${event.event}`;
    }
}

/**
 * Default command registry
 */
export const defaultCommands = {
    'session': sessionCommand,
    'status': statusCommand,
    'config': configCommand,
    'clear': clearCommand,
    'help': helpCommand,
    'execute': executeCommand
};
