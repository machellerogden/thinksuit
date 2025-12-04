/**
 * ControlDock - Persistent control interface for REPL interaction
 *
 * Uses ScreenManager like Inquirer - proper rendering with content + bottomContent
 */

import chalk from 'chalk';
import { ScreenManager } from '../lib/screen-manager.js';
import { readlineWidth } from '../lib/utils.js';

export class ControlDock {
    #rl;
    #screen;
    #pasteFilter;
    #currentStatus = '';
    #currentPreset = ''; // Persistent preset indicator
    #currentFrame = '';  // Persistent frame indicator
    #cycleTarget = 'none'; // Which group Ctrl+N/P navigates
    #currentHint = '';
    #baseHint = ''; // The persistent mode hint
    #promptColor = 'cyan'; // Default prompt color

    constructor(rl, pasteFilter) {
        this.#rl = rl;
        this.#pasteFilter = pasteFilter;
        this.#screen = new ScreenManager(rl);
    }

    /**
     * Get input from user with history support
     * @param {Object} options - Options including history array
     * @returns {Promise<{display: string, expanded: string}>} User input with display and expanded versions
     */
    async getInput(options = {}) {
        const { history = [] } = options;

        return new Promise((resolve) => {
            let historyIndex = history.length;
            let lastFirstChar = '';

            // Set initial hint for empty input
            this.#updateMode('');

            // Render initial empty prompt
            this.#render();

            // Handle line input (Enter key)
            const onLine = (line) => {
                cleanup();
                this.#screen.clear();

                // Expand all paste tokens
                const expandedInput = this.#pasteFilter.expandTokens(line);

                // Clear paste registry after use
                this.#pasteFilter.clearPasteRegistry();

                // Return both versions
                resolve({
                    display: line,      // What user sees (with tokens)
                    expanded: expandedInput  // What ThinkSuit receives
                });
            };

            // Handle keypress for mode detection, history, and re-rendering
            const onKeypress = (char, key) => {
                if (!key) return;

                // Handle history navigation
                if (key.name === 'up' && historyIndex > 0) {
                    historyIndex--;
                    this.#rl.write(null, { ctrl: true, name: 'u' }); // Clear line
                    this.#rl.write(history[historyIndex]);

                    const firstChar = history[historyIndex][0] || '';
                    if (firstChar !== lastFirstChar) {
                        lastFirstChar = firstChar;
                        this.#updateMode(firstChar);
                    }
                    this.#render(this.#rl.line);
                } else if (key.name === 'down' && historyIndex < history.length) {
                    historyIndex++;
                    this.#rl.write(null, { ctrl: true, name: 'u' }); // Clear line
                    const newInput = historyIndex === history.length ? '' : history[historyIndex];
                    this.#rl.write(newInput);

                    const firstChar = newInput[0] || '';
                    if (firstChar !== lastFirstChar) {
                        lastFirstChar = firstChar;
                        this.#updateMode(firstChar);
                    }
                    this.#render(this.#rl.line);
                } else {
                    // Check for mode change AND re-render on every keystroke
                    // ScreenManager needs to know the full content to position hint correctly
                    const firstChar = this.#rl.line[0] || '';
                    if (firstChar !== lastFirstChar) {
                        lastFirstChar = firstChar;
                        this.#updateMode(firstChar);
                    }
                    // Always re-render so ScreenManager knows current input length
                    this.#render(this.#rl.line);
                }
            };

            // Separate checkCursorPos listener (Inquirer pattern)
            // Registered AFTER onKeypress so render happens first
            const checkCursor = () => this.#screen.checkCursorPos();

            const cleanup = () => {
                this.#rl.removeListener('line', onLine);
                this.#rl.input.removeListener('keypress', onKeypress);
                this.#rl.input.removeListener('keypress', checkCursor);
            };

            this.#rl.once('line', onLine);
            this.#rl.input.on('keypress', onKeypress);
            // Register checkCursor after onKeypress to ensure render completes first
            this.#rl.input.on('keypress', checkCursor);
        });
    }

    /**
     * Update mode based on first character
     */
    #updateMode(firstChar) {
        if (firstChar === '') {
            // Empty input - show navigation hint
            this.#promptColor = 'cyan';
            this.#baseHint = chalk.dim('  Shift+Tab to change selected control');
        } else if (firstChar === ':') {
            this.#promptColor = 'yellow';
            this.#baseHint = chalk.yellow('  Command Mode');
        } else if (firstChar === '/') {
            this.#promptColor = 'magenta';
            this.#baseHint = chalk.magenta('  Template Mode');
        } else if (firstChar === '!') {
            this.#promptColor = 'red';
            this.#baseHint = chalk.red('  Shell Mode');
        } else {
            this.#promptColor = 'cyan';
            this.#baseHint = chalk.dim('  Language Mode');
        }
        // Update current hint to match base hint (in case no temporary hint is showing)
        this.#currentHint = this.#baseHint;
    }

    /**
     * Render the prompt with ScreenManager
     * Content = status line + top border + colored prompt (readline manages the input)
     * BottomContent = bottom border + hint
     */
    #render(inputValue = '') {
        const width = readlineWidth(this.#rl.output);

        // Status line - combine status, preset, and frame (preset first)
        // Highlight the active cycle target, show placeholders when nothing selected
        const statusParts = [];
        if (this.#currentStatus) statusParts.push(this.#currentStatus);

        // Preset indicator - show placeholder if none selected
        const presetText = this.#currentPreset
            ? `[${this.#currentPreset}]`
            : this.#cycleTarget === 'preset'
                ? '◉ Ctrl+N/P to select a preset'
                : '○';
        statusParts.push(this.#cycleTarget === 'preset' ? chalk.cyan(presetText) : chalk.dim.cyan(presetText));

        // Frame indicator - show placeholder if none selected
        const frameText = this.#currentFrame
            ? `{${this.#currentFrame}}`
            : this.#cycleTarget === 'frame'
                ? '◉ Ctrl+N/P to select a frame'
                : '○';
        statusParts.push(this.#cycleTarget === 'frame' ? chalk.magenta(frameText) : chalk.dim.magenta(frameText));

        const statusLine = statusParts.join(' ');

        // Top border (dim gray)
        const topBorder = chalk.dim.gray('─'.repeat(width));

        // Prompt line with colored prompt
        const coloredPrompt = chalk[this.#promptColor]('> ');
        const promptLine = coloredPrompt + this.#rl.line;

        // Build multi-line content: status + top border + prompt
        const content = statusLine + '\n' + topBorder + '\n' + promptLine;

        // Bottom border and hint (dim gray)
        const bottomBorder = chalk.dim.gray('─'.repeat(width));
        const hintLine = this.#currentHint || '\u200D';
        const bottomContent = bottomBorder + '\n' + hintLine;

        this.#screen.render(content, bottomContent);

        // Don't call checkCursorPos here - it's handled separately on keypress like Inquirer
    }

    /**
     * Show a custom hint message
     */
    showHint(message) {
        this.#currentHint = message;
        this.#render();
    }

    /**
     * Clear the hint
     */
    clearHint() {
        this.#currentHint = '';
        this.#render();
    }

    /**
     * Show a temporary hint that will restore the mode hint when cleared
     */
    showTemporaryHint(message) {
        this.#currentHint = message;
        this.#render();
    }

    /**
     * Clear temporary hint and restore the mode hint
     */
    clearTemporaryHint() {
        this.#currentHint = this.#baseHint;
        this.#render();
    }

    /**
     * Update status message
     */
    updateStatus(message) {
        this.#currentStatus = message;
        this.#render();
    }

    /**
     * Clear status message
     */
    clearStatus() {
        this.#currentStatus = '';
        this.#render();
    }

    /**
     * Update preset indicator
     */
    updatePreset(presetName) {
        this.#currentPreset = presetName;
        this.#render();
    }

    /**
     * Clear preset indicator
     */
    clearPreset() {
        this.#currentPreset = '';
        this.#render();
    }

    /**
     * Update frame indicator
     */
    updateFrame(frameName) {
        this.#currentFrame = frameName;
        this.#render();
    }

    /**
     * Clear frame indicator
     */
    clearFrame() {
        this.#currentFrame = '';
        this.#render();
    }

    /**
     * Update cycle target (which group Ctrl+N/P navigates)
     */
    updateCycleTarget(target) {
        this.#cycleTarget = target;
        this.#render();
    }

    /**
     * Commit current status to scrollback and clear it from the dock
     * Use this when you want to preserve the status line in terminal history
     */
    commitStatus() {
        if (this.#currentStatus) {
            // Write status to scrollback
            this.#screen.write(this.#currentStatus + '\n');
        }
        // Clear status from dock
        this.#currentStatus = '';
        this.#render();
    }

    /**
     * Commit the current input to scrollback
     * Resets ScreenManager state so next render doesn't erase current content
     * @param {string} inputValue - The input value to render before committing
     */
    commitInput(inputValue) {
        // Clear the current dock rendering
        this.#screen.clear();

        // Write just the input line to scrollback (no borders, no hint)
        const coloredPrompt = chalk[this.#promptColor]('> ');
        this.#screen.write(coloredPrompt + inputValue + '\n\n');

        // Note: no need to call reset() since clear() already resets height tracking
    }

    /**
     * Clear the current dock rendering
     * Use before writing output so it doesn't overlay on the dock
     */
    clearDock() {
        this.#screen.clear();
    }

    /**
     * Write output to screen
     */
    write(content) {
        this.#screen.write(content);
    }

    /**
     * Get approval from user for a tool execution
     * @param {Object} options - { tool, args, approvalId }
     * @returns {Promise<boolean>} Approval decision
     */
    async getApproval({ tool, args, approvalId }) {
        return new Promise((resolve) => {
            // Format args for display
            let argsDisplay;
            try {
                argsDisplay = typeof args === 'string'
                    ? args
                    : JSON.stringify(args, null, 2);
            } catch (error) {
                argsDisplay = String(args);
            }

            const width = readlineWidth(this.#rl.output);

            // Build approval UI content
            const statusLine = chalk.yellow('⚠ Approval Required');
            const topBorder = chalk.dim.gray('─'.repeat(width));
            const toolLine = chalk.bold('Tool: ') + chalk.magenta(tool);
            const argsLabel = chalk.bold('Arguments:');
            const argsContent = argsDisplay;
            const bottomBorder = chalk.dim.gray('─'.repeat(width));
            const promptLine = chalk.dim('Enter = Approve | ESC = Deny\n');

            // Compose full content
            const content = [
                statusLine,
                topBorder,
                toolLine,
                argsLabel,
                argsContent,
                bottomBorder,
                promptLine
            ].join('\n');

            // Render approval UI using ScreenManager's render (ephemeral, not committed to scrollback)
            this.#screen.render(content);

            // Handle keypress
            const onKeypress = (char, key) => {
                if (!key) return;

                let decision = null;

                if (key.name === 'return') {
                    decision = true;
                } else if (key.name === 'escape') {
                    decision = false;
                }

                if (decision !== null) {
                    cleanup();

                    // Clear the readline buffer to prevent the keypress from being added to input
                    this.#rl.line = '';
                    this.#rl.cursor = 0;

                    // Clear the entire approval UI
                    this.#screen.clear();

                    // Reconstruct the approval UI with decision instead of prompt
                    const statusLine = chalk.yellow('⚠ Approval Required');
                    const topBorder = chalk.dim.gray('─'.repeat(width));
                    const toolLine = chalk.bold('Tool: ') + chalk.magenta(tool);
                    const argsLabel = chalk.bold('Arguments:');
                    const bottomBorder = chalk.dim.gray('─'.repeat(width));
                    const decisionText = decision ? chalk.green('✓ Approved') : chalk.red('✗ Denied');

                    const finalContent = [
                        statusLine,
                        topBorder,
                        toolLine,
                        argsLabel,
                        argsContent,
                        bottomBorder,
                        decisionText
                    ].join('\n');

                    // Write final approval UI to scrollback
                    this.#screen.write(finalContent + '\n\n');

                    resolve(decision);
                }
            };

            const cleanup = () => {
                this.#rl.input.removeListener('keypress', onKeypress);
            };

            this.#rl.input.on('keypress', onKeypress);
        });
    }

    /**
     * Get the screen manager instance
     */
    get screen() {
        return this.#screen;
    }
}
