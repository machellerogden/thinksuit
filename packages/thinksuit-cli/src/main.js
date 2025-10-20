#!/usr/bin/env node

import readline from 'node:readline';
import MuteStream from 'mute-stream';
import chalk from 'chalk';
import { buildConfig } from '../../thinksuit/engine/config.js';
import pkg from '../package.json' with { type: 'json' };

import { ControlDock } from './tui/control-dock.js';
import { runWithEffects } from './repl/effects.js';
import { createCliEffects } from './repl/cli-effects.js';
import { defaultCommands } from './repl/commands.js';
import { BracketedPasteFilter } from './lib/bracketed-paste-filter.js';
import { readlineWidth } from './lib/utils.js';

async function main() {
    // Load base configuration using buildConfig
    const baseConfig = buildConfig();

    // Command history
    const commandHistory = [];

    // Execution state (shared between main and commands)
    const executionState = {
        busy: false,
        interrupt: null
    };

    // Create muted output stream for readline
    // We'll handle rendering via ScreenManager, not readline echo
    const output = new MuteStream();
    output.pipe(process.stdout);
    output.mute(); // Mute so ScreenManager controls all rendering

    // Create bracketed paste filter with terminal width
    const pasteFilter = new BracketedPasteFilter({
        terminalWidth: readlineWidth(process.stdout)
    });

    // Pipe stdin through paste filter before readline
    process.stdin.pipe(pasteFilter);

    const rl = readline.createInterface({
        input: pasteFilter,
        output: output,
        terminal: true,
        prompt: ''
    });

    // Enable keypress events on the filtered input
    readline.emitKeypressEvents(pasteFilter, rl);
    if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
        // Enable bracketed paste mode
        process.stdout.write('\x1b[?2004h');
    }

    // Create control dock with paste filter
    const controlDock = new ControlDock(rl, pasteFilter);

    // Create session with commands and ThinkSuit state
    const session = {
        commands: defaultCommands,
        rl,
        controlDock,
        executionState,  // Share execution state with commands
        thinkSuit: {
            sessionId: null,
            lastTraceId: null,
            config: {
                module: baseConfig.module,
                modules: baseConfig.modules,
                modulesPackage: baseConfig.modulesPackage,
                provider: baseConfig.provider,
                model: baseConfig.model,
                providerConfig: baseConfig.providerConfig,
                tools: baseConfig.allowedTools || [],
                allowedDirectories: baseConfig.allowedDirectories,
                mcpServers: baseConfig.mcpServers,
                cwd: baseConfig.cwd || process.cwd(),
                policy: baseConfig.policy,
                trace: baseConfig.trace || false
            }
        }
    };

    // Display welcome message
    console.log();
    console.log(chalk.bold.magenta(`    ╤     ${chalk.reset.dim.gray(`╭─────────────────────────────────────────────╮`)}`));
    console.log(chalk.bold.magenta(`  ╭─┴─╮   ${chalk.reset.dim.gray(`│`)} ${chalk.bold.cyan('ThinkSuit CLI')} ${chalk.reset.dim.cyan(pkg.version)}${' '.repeat(30 - pkg.version.length)}${chalk.reset.dim.gray(`│`)}`));
    console.log(chalk.bold.magenta(` ╭│◐ ◐│╯  ${chalk.reset.dim.gray(`│`)} ${chalk.reset.dim.white(':help for commands')}                          ${chalk.reset.dim.gray(`│`)}`));
    console.log(chalk.bold.magenta(`  ╰┬─┬╯   ${chalk.reset.dim.gray(`│`)} ${chalk.reset.dim.white('Press Ctrl-C twice, or type :quit to exit.')}  ${chalk.reset.dim.gray(`│`)}`));
    console.log(chalk.bold.magenta(`   ╯ ╰    ${chalk.reset.dim.gray(`╰─────────────────────────────────────────────╯`)}`));
    console.log();

    // Create CLI effects
    const cliEffects = createCliEffects({
        rl,
        controlDock
    });

    // Handle process termination
    let running = true;
    let ctrlCPressed = false;
    let ctrlCTimer = null;
    let lastKeyWasEsc = false;

    // Handle SIGINT (Ctrl-C)
    rl.on('SIGINT', () => {
        if (ctrlCPressed) {
            // Second Ctrl-C within timeout - exit immediately
            if (ctrlCTimer) {
                clearTimeout(ctrlCTimer);
                ctrlCTimer = null;
            }
            exit();
        } else {
            // First Ctrl-C - show warning and start timer
            ctrlCPressed = true;
            controlDock.showTemporaryHint(chalk.dim.white('Press Ctrl-C again to exit'));

            // Clear the flag and warning after 3 seconds
            ctrlCTimer = setTimeout(() => {
                ctrlCPressed = false;
                ctrlCTimer = null;
                controlDock.clearTemporaryHint();
            }, 3000);
        }
    });

    // Handle ESC key and Ctrl-C hint clearing
    pasteFilter.on('keypress', (char, key) => {
        if (key && key.name === 'escape') {
            // ESC interrupts execution if busy
            if (executionState.busy && executionState.interrupt) {
                console.log();
                console.log(chalk.yellow('Interrupting execution...'));
                executionState.interrupt('User pressed ESC');
                lastKeyWasEsc = false; // Reset since we used it for interrupt
            } else {
                // When not busy, second consecutive ESC clears input
                if (lastKeyWasEsc) {
                    // Second ESC in a row - clear input
                    rl.write(null, { ctrl: true, name: 'u' });
                    lastKeyWasEsc = false;
                    controlDock.clearTemporaryHint();
                } else {
                    // First ESC - only show hint if there's input to clear
                    if (rl.line.length > 0) {
                        lastKeyWasEsc = true;
                        controlDock.showTemporaryHint(chalk.dim.white('Press ESC again to clear input'));
                    }
                }
            }
        } else if (key && key.name !== undefined) {
            // Any other key resets the ESC sequence and clears hint
            if (lastKeyWasEsc) {
                lastKeyWasEsc = false;
                controlDock.clearTemporaryHint();
            }

            // Clear Ctrl-C hint if any other key is pressed
            if (ctrlCPressed && !(key.ctrl && key.name === 'c')) {
                ctrlCPressed = false;
                if (ctrlCTimer) {
                    clearTimeout(ctrlCTimer);
                    ctrlCTimer = null;
                }
                controlDock.clearTemporaryHint();
            }
        }
    });

    process.on('SIGTERM', () => {
        exit();
    });

    // Handle uncaught errors gracefully
    process.on('uncaughtException', (error) => {
        console.log();
        console.error('Uncaught exception:', error);
        process.exit(1);
    });

    // Main input loop
    async function inputLoop() {
        while (running) {
            try {
                // Reset Ctrl-C flag and clear timer when showing new prompt
                ctrlCPressed = false;
                if (ctrlCTimer) {
                    clearTimeout(ctrlCTimer);
                    ctrlCTimer = null;
                }
                // Reset ESC sequence
                lastKeyWasEsc = false;

                // Get input from control dock (returns both display and expanded versions)
                const { display, expanded } = await controlDock.getInput({
                    history: commandHistory
                });

                // Don't process empty input
                if (!display?.trim()) {
                    continue;
                }

                // Commit display version to scrollback (with tokens, clean)
                controlDock.commitInput(display);

                // Add display version to history (so user can navigate to it)
                if (display.trim()) {
                    commandHistory.push(display);
                }

                // Use expanded version for command processing
                const trimmed = expanded.trim();
                const firstChar = trimmed[0];

                // Route based on prefix character
                // : - System commands (REPL control, vim-like)
                // / - Prompt commands (future: markdown-based like Claude Code)
                // ! - Shell commands (future: direct shell execution)

                if (firstChar === ':') {
                    // System commands
                    const parts = trimmed.slice(1).split(/\s+/);
                    const command = parts[0].toLowerCase();
                    const args = parts.slice(1);

                    // Built-in exit commands
                    if (['quit', 'exit', 'q'].includes(command)) {
                        exit();
                        break;
                    }

                    // Route all system commands through generator pattern
                    if (command in session.commands) {
                        const commandGenerator = session.commands[command](args, session);

                        try {
                            await runWithEffects(commandGenerator, cliEffects, session, (error) => {
                                cliEffects['error'](session, error.message);
                            });
                        } catch (error) {
                            await cliEffects['error'](session, error.message);
                        }
                    } else {
                        await cliEffects['error'](session, `Unknown command: :${command}`);
                    }
                } else {
                    // Regular input - route through executeCommand
                    const executeGenerator = session.commands['execute']([trimmed], session);

                    try {
                        await runWithEffects(executeGenerator, cliEffects, session, (error) => {
                            cliEffects['error'](session, error.message);
                        });
                    } catch (error) {
                        await cliEffects['error'](session, error.message);
                    }
                }
            } catch (error) {
                await cliEffects['error'](session, error.message || String(error));
            }
        }
    }

    function exit() {
        running = false;
        controlDock.clearDock();
        if (process.stdin.isTTY) {
            // Disable bracketed paste mode before exit
            process.stdout.write('\x1b[?2004l');
            process.stdin.setRawMode(false);
        }
        rl.close();
        process.exit(0);
    }

    // Start the input loop
    await inputLoop();
}

// Start the application
main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
