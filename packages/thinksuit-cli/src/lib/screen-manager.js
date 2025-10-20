/**
 * Screen Manager for terminal rendering
 * Based on @inquirer/core ScreenManager
 */

import { stripVTControlCharacters } from 'node:util';
import { breakLines, readlineWidth, height, lastLine } from './utils.js';
import { cursorDown, cursorUp, cursorTo, cursorShow, eraseLines } from './ansi.js';

export class ScreenManager {
    // These variables keep information to allow correct prompt re-rendering
    #height = 0;
    #extraLinesUnderPrompt = 0;
    #cursorPos = { rows: 0, cols: 0 };
    #rl;

    constructor(rl) {
        this.#rl = rl;
        this.#cursorPos = rl.getCursorPos();
    }

    write(content) {
        // Unmute, write, then re-mute for proper output control
        this.#rl.output.unmute();
        this.#rl.output.write(content);
        this.#rl.output.mute();
    }

    render(content, bottomContent = '') {
        // Write message to screen and setPrompt to control backspace
        const promptLine = lastLine(content);
        const rawPromptLine = stripVTControlCharacters(promptLine);

        // Remove the rl.line from our prompt. We can't rely on the content of
        // rl.line (mainly because of the password prompt), so just rely on its length.
        let prompt = rawPromptLine;
        if (this.#rl.line.length > 0) {
            prompt = prompt.slice(0, -this.#rl.line.length);
        }

        this.#rl.setPrompt(prompt);

        // SetPrompt will change cursor position, now we can get correct value
        this.#cursorPos = this.#rl.getCursorPos();

        const width = readlineWidth(this.#rl.output);
        content = breakLines(content, width);
        bottomContent = breakLines(bottomContent, width);

        // Manually insert an extra line if we're at the end of the line.
        // This prevents the cursor from appearing at the beginning of the current line.
        if (rawPromptLine.length % width === 0) {
            content += '\n';
        }

        let output = content + (bottomContent ? '\n' + bottomContent : '');

        /**
         * Re-adjust the cursor at the correct position.
         */

        // We need to consider parts of the prompt under the cursor as part of the bottom
        // content in order to correctly cleanup and re-render.
        const promptLineUpDiff =
            Math.floor(rawPromptLine.length / width) - this.#cursorPos.rows;
        const bottomContentHeight =
            promptLineUpDiff + (bottomContent ? height(bottomContent) : 0);

        // Return cursor to the input position (on top of the bottomContent)
        if (bottomContentHeight > 0) {
            output += cursorUp(bottomContentHeight);
        }

        // Return cursor to the initial left offset.
        output += cursorTo(this.#cursorPos.cols);

        /**
         * Render and store state for future re-rendering
         */
        this.write(
            cursorDown(this.#extraLinesUnderPrompt) +
            eraseLines(this.#height) +
            output
        );

        this.#extraLinesUnderPrompt = bottomContentHeight;
        this.#height = height(output);
    }

    checkCursorPos() {
        const cursorPos = this.#rl.getCursorPos();
        if (cursorPos.cols !== this.#cursorPos.cols) {
            this.write(cursorTo(cursorPos.cols));
            this.#cursorPos = cursorPos;
        }
    }

    done({ clearContent = false } = {}) {
        this.#rl.setPrompt('');

        let output = cursorDown(this.#extraLinesUnderPrompt);
        output += clearContent ? eraseLines(this.#height) : '\n';
        output += cursorShow;
        this.write(output);

        this.#rl.close();
    }

    /**
     * Clear the current rendering without closing
     * Useful for updating status or clearing prompt
     */
    clear() {
        this.write(
            cursorDown(this.#extraLinesUnderPrompt) +
            eraseLines(this.#height)
        );
        this.#height = 0;
        this.#extraLinesUnderPrompt = 0;
    }

    /**
     * Reset tracking state so next render doesn't erase current content
     * Used when committing content to scrollback
     */
    reset() {
        // Move cursor past the current content
        this.write(cursorDown(this.#extraLinesUnderPrompt) + '\n');
        // Reset state so next render starts fresh
        this.#height = 0;
        this.#extraLinesUnderPrompt = 0;
    }
}
