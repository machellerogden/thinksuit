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

    // Show selected frame
    if (session.frameCycling?.selectedFrame) {
        const frameInfo = session.frameCycling.frameList[session.frameCycling.currentIndex];
        yield fx('output', `  ${chalk.bold('Frame:')} ${frameInfo.name}${frameInfo.description ? ` - ${frameInfo.description}` : ''}`);
    } else if (thinkSuit.frame?.text) {
        // Frame from --frame CLI flag
        yield fx('output', `  ${chalk.bold('Frame:')} ${thinkSuit.frame.name}${thinkSuit.frame.description ? ` - ${thinkSuit.frame.description}` : ''}`);
    } else {
        yield fx('output', `  ${chalk.bold('Frame:')} ${chalk.dim('(none)')}`);
    }

    // Show selected plan
    if (session.planCycling?.selectedPlan) {
        const planInfo = session.planCycling.planList[session.planCycling.currentIndex];
        yield fx('output', `  ${chalk.bold('Plan:')} ${planInfo.name}${planInfo.description ? ` - ${planInfo.description}` : ''}`);
    } else {
        yield fx('output', `  ${chalk.bold('Plan:')} ${chalk.dim('(auto)')}`);
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
    yield fx('output', chalk.bold('  Shift+Tab') + ' - Toggle between plan/frame cycling');
    yield fx('output', chalk.bold('  Ctrl+N') + ' / ' + chalk.bold('Ctrl+P') + ' - Next/previous in active group');
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

    // The broker hosts the execution out-of-process; the REPL is a thin client.
    const client = await import('thinksuit-broker');

    // Approval queue for managing tool approval requests (filled from the event
    // stream, drained by the approval processor below).
    const approvalQueue = [];

    try {
        executionState.busy = true;
        executionState.interrupt = null;

        yield fx('status-show', chalk.dim('⋯ Initializing...'));

        // Frame rides the contract by NAME/id; the broker resolves it to its text.
        // Prefer the cycled frame, else the session's initial frame.
        const frameId = session.frameCycling?.selectedFrame?.id ?? thinkSuit.frame?.id ?? null;

        // Serializable run config. The worker loads modules itself from
        // modulesPackage (a string); we never send loaded code over the socket.
        const config = {
            input,
            module: thinkSuit.config.module,
            modulesPackage: thinkSuit.config.modulesPackage,
            provider: thinkSuit.config.provider,
            model: thinkSuit.config.model,
            // no providerConfig: the broker worker resolves secrets itself; sending stale client keys causes 401s after rotation.
            cwd: thinkSuit.config.cwd,
            allowedTools: thinkSuit.config.tools,
            allowedDirectories: thinkSuit.config.allowedDirectories,
            mcpServers: thinkSuit.config.mcpServers,
            autoApproveTools: false, // interactive: surface approvals in the dock
            policy: thinkSuit.config.policy,
            trace: thinkSuit.config.trace,
            sessionId: thinkSuit.sessionId || undefined,
            ...(frameId && { frame: frameId }),
            ...(session.planCycling?.selectedPlan && {
                selectedPlan: session.planCycling.selectedPlan
            })
        };

        // Start the turn in the broker. `from` is the pre-run entry count, so we
        // observe only this turn rather than replaying the session's history.
        const { sessionId, from } = await client.run(config);

        if (!thinkSuit.sessionId) {
            thinkSuit.sessionId = sessionId;
        }

        // Interrupt routes over the socket to the owning worker.
        executionState.interrupt = (reason) => client.interrupt(sessionId, reason);

        // Approval processor: drain queued approvals through the dock and resolve
        // them over the socket. Runs concurrently with the turn; awaitTurn's
        // onEvent fills the queue.
        let approvalProcessorRunning = true;
        const approvalProcessorPromise = (async () => {
            while (approvalProcessorRunning && executionState.busy) {
                if (approvalQueue.length > 0) {
                    const approval = approvalQueue.shift();
                    const approved = await session.controlDock.getApproval(approval);
                    try {
                        await client.approve(sessionId, {
                            approved,
                            approvalId: approval.approvalId
                        });
                    } catch {
                        // Turn may have already moved on; ignore.
                    }
                }
                await new Promise((resolve) => setTimeout(resolve, 50));
            }
        })();

        // Observe this turn via the shared turn-lifecycle primitive. `from` is the
        // pre-run entry count, so we see only this turn, not session history. The
        // terminal set + failsafe live in awaitTurn, not here.
        const { outcome, response, error } = await client.awaitTurn(sessionId, {
            from: from || 0,
            onEvent: (event) => {
                const ev = event.event || event.type;
                if (ev === 'execution.tool.approval-requested') {
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
                        session.controlDock.updateStatus(message);
                    }
                }
            }
        });

        approvalProcessorRunning = false;
        await approvalProcessorPromise;

        executionState.busy = false;
        executionState.interrupt = null;
        yield fx('status-clear');
        yield fx('clear-dock');

        if (outcome === 'interrupted') {
            yield fx('output', chalk.yellow('Execution interrupted'));
            yield fx('output', '');
        } else if (outcome === 'failed') {
            yield fx('error', error || (typeof response === 'string' ? response : 'Execution failed'));
            yield fx('output', '');
        } else if (response != null) {
            const text = typeof response === 'string' ? response : JSON.stringify(response);
            const [first, ...rest] = text.split('\n');
            yield fx('output', `⏺ ${first}`);
            for (const line of rest) {
                yield fx('output', indentLines(line, 2));
            }
            yield fx('output', '');
        } else {
            yield fx('output', chalk.dim('(no response captured)'));
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
 * :frame [show|edit|clear] - Manage session frame context
 */
export async function* frameCommand(args, session) {
    const subcommand = args[0];

    if (!subcommand || subcommand === 'show') {
        // Show current frame
        if (session.thinkSuit.frame?.text) {
            yield fx('output', chalk.bold.cyan(`Frame: ${session.thinkSuit.frame.name || '(unnamed)'}`));
            yield fx('output', '');
            yield fx('output', indentLines(session.thinkSuit.frame.text, 2));
        } else {
            yield fx('output', chalk.dim('No frame set'));
        }
    } else if (subcommand === 'edit') {
        // Edit frame (for now, just show message about text editor)
        yield fx('output', chalk.yellow('Frame editing via text editor not yet implemented'));
        yield fx('output', chalk.dim('Use --frame argument when starting CLI for now'));
    } else if (subcommand === 'clear') {
        // Clear frame
        if (session.thinkSuit.frame?.text) {
            const confirmed = yield fx('confirm', chalk.yellow('Clear current frame?'));
            if (!confirmed) {
                yield fx('output', chalk.dim('Frame not cleared'));
                return true;
            }
            session.thinkSuit.frame = null;
            yield fx('output', chalk.green('Frame cleared'));
        } else {
            yield fx('output', chalk.dim('No frame to clear'));
        }
    } else {
        yield fx('error', `Unknown frame subcommand: ${subcommand}`);
        yield fx('output', chalk.dim('Usage: :frame [show|edit|clear]'));
    }

    return true;
}

/**
 * Default command registry
 */
export const defaultCommands = {
    'session': sessionCommand,
    'status': statusCommand,
    'config': configCommand,
    'frame': frameCommand,
    'clear': clearCommand,
    'help': helpCommand,
    'execute': executeCommand
};
