#!/usr/bin/env node

import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import MuteStream from 'mute-stream';
import chalk from 'chalk';
import { buildConfig } from '../../thinksuit/engine/config.js';
import pkg from '../package.json' with { type: 'json' };

import { ControlDock } from './lib/control-dock.js';
import { runWithEffects } from './repl/effects.js';
import { createCliEffects } from './repl/cli-effects.js';
import { defaultCommands } from './repl/commands.js';
import { BracketedPasteFilter } from './lib/bracketed-paste-filter.js';
import { readlineWidth } from './lib/utils.js';

async function main() {
    // Load base configuration using buildConfig
    const baseConfig = buildConfig();

    // Setup history file path
    const historyDir = path.join(os.homedir(), '.thinksuit');
    const historyPath = path.join(historyDir, 'history');

    // Ensure .thinksuit directory exists
    if (!fs.existsSync(historyDir)) {
        fs.mkdirSync(historyDir, { recursive: true });
    }

    // Load command history from file
    const commandHistory = [];
    if (fs.existsSync(historyPath)) {
        try {
            const historyContent = fs.readFileSync(historyPath, 'utf-8');
            commandHistory.push(...historyContent.split('\n').filter(line => line.trim()));
        } catch (error) {
            // Ignore history load errors - we'll start fresh
            console.error(chalk.dim.yellow(`Warning: Could not load history: ${error.message}`));
        }
    }

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
    console.log(chalk.bold.magenta(`    ┯    ${chalk.reset.dim.gray(`╭─────────────────────╮`)}`));
    console.log(chalk.bold.magenta(`  ╭─┴─╮  ${chalk.reset.dim.gray(`│`)} ${chalk.bold.cyan('ThinkSuit CLI')} ${chalk.reset.dim.cyan(pkg.version)}${' '.repeat(6 - pkg.version.length)}${chalk.reset.dim.gray(`│`)}`));
    console.log(chalk.bold.magenta(` ╭┤◐ ◐├╯ ${chalk.reset.dim.gray(`│`)} ${chalk.reset.dim.white(':help for commands')}  ${chalk.reset.dim.gray(`│`)}`));
    console.log(chalk.bold.magenta(`  ╰┬─┬╯  ${chalk.reset.dim.gray(`│`)} ${chalk.reset.dim.white(':quit to exit')}       ${chalk.reset.dim.gray(`│`)}`));
    console.log(chalk.bold.magenta(`   ╯ ╰   ${chalk.reset.dim.gray(`╰─────────────────────╯`)}`));
    console.log();

    // Create CLI effects
    const cliEffects = createCliEffects({
        rl,
        controlDock
    });

    // Handle process termination
    // Exit state - consolidated for clarity
    const exitState = {
        sigintCount: 0,
        resetTimer: null
    };

    // Keep running and lastKeyWasEsc as-is (used elsewhere)
    let running = true;
    let lastKeyWasEsc = false;

    // Handle SIGINT (Ctrl-C) at process level
    // This always fires, even if readline/streams are blocked
    process.on('SIGINT', () => {
        // Clear any existing timeout FIRST, before anything else
        if (exitState.resetTimer) {
            clearTimeout(exitState.resetTimer);
            exitState.resetTimer = null;
        }

        // Increment counter
        exitState.sigintCount++;

        if (exitState.sigintCount === 1) {
            // First Ctrl-C - show hint via ControlDock
            controlDock.showTemporaryHint(chalk.dim.white('Press Ctrl-C again to exit'));

            // Set timeout to reset counter
            exitState.resetTimer = setTimeout(() => {
                exitState.sigintCount = 0;
                exitState.resetTimer = null;
                controlDock.clearTemporaryHint();
            }, 3000);

        } else if (exitState.sigintCount === 2) {
            // Second Ctrl-C - exit gracefully
            controlDock.showTemporaryHint(chalk.dim.white('Press Ctrl-C once more to force exit'));
            running = false;
            rl.write('');
            rl.emit('line', '');

        } else {
            // Third Ctrl-C - force exit immediately
            forceExit();
        }
    });

    // Graceful exit - cleanup and exit
    function gracefulExit() {
        running = false;

        try {
            controlDock.clearDock();
        } catch (e) {
            // ControlDock might be in bad state, continue anyway
        }

        if (process.stdin.isTTY) {
            try {
                // Disable bracketed paste mode before exit
                process.stdout.write('\x1b[?2004l');
                process.stdin.setRawMode(false);
            } catch (e) {
                // Terminal reset might fail, continue anyway
            }
        }

        try {
            rl.close();
        } catch (e) {
            // Readline might already be closed or in bad state
        }

        process.exit(0);
    }

    // Force exit - minimal cleanup, immediate exit
    function forceExit() {
        if (process.stdin.isTTY) {
            try {
                process.stdout.write('\x1b[?2004l');
                process.stdin.setRawMode(false);
            } catch (e) {
                // Even if terminal reset fails, still exit
            }
        }
        process.exit(130);  // Standard Unix exit code for SIGINT
    }

    // Listen for Ctrl-C from pasteFilter (it filters out \x03 and emits this event)
    pasteFilter.on('ctrl-c', () => {
        process.kill(process.pid, 'SIGINT');
    });

    // Listen for any data on pasteFilter to cancel Ctrl-C confirmation state
    pasteFilter.on('data', (chunk) => {
        if (exitState.sigintCount > 0) {
            // Any input cancels the Ctrl-C confirmation state
            exitState.sigintCount = 0;
            if (exitState.resetTimer) {
                clearTimeout(exitState.resetTimer);
                exitState.resetTimer = null;
            }
            controlDock.clearTemporaryHint();
        }
    });

    // Handle keypress events - ESC and hint clearing
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
        }
    });

    process.on('SIGTERM', () => {
        rl.close();
        gracefulExit();
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
                // Reset Ctrl-C state when showing new prompt
                exitState.sigintCount = 0;
                if (exitState.resetTimer) {
                    clearTimeout(exitState.resetTimer);
                    exitState.resetTimer = null;
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
                    // Persist to history file
                    try {
                        fs.appendFileSync(historyPath, display + '\n', 'utf-8');
                    } catch (error) {
                        // Silently fail on history write errors
                    }
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

    // Start the input loop
    await inputLoop();

    // Input loop exited (running = false), cleanup and exit
    gracefulExit();
}

// Start the application
main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
