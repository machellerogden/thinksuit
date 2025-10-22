/**
 * BracketedPasteFilter - Transform stream that intercepts bracketed paste sequences
 *
 * Detects bracketed paste mode sequences (\x1b[200~ ... \x1b[201~) and replaces
 * large pastes with tokens to keep terminal scrollback clean.
 */

import { Transform } from 'node:stream';

export class BracketedPasteFilter extends Transform {
    #buffer = '';
    #inPaste = false;
    #pasteBuffer = '';
    #pasteCounter = 0;
    #pasteRegistry = new Map();
    #terminalWidth = 80; // Default, will be updated

    constructor(options = {}) {
        super(options);
        this.threshold = options.threshold || { lines: 100, chars: 2000 };
        this.#terminalWidth = options.terminalWidth || 80;
    }

    /**
     * Update terminal width (call when terminal resizes)
     * @param {number} width - New terminal width
     */
    setTerminalWidth(width) {
        this.#terminalWidth = width;
    }

    _transform(chunk, encoding, callback) {
        const data = chunk.toString();

        // Check for Ctrl-C and emit event instead of passing it through
        if (data.includes('\x03')) {
            this.emit('ctrl-c');
            // Remove \x03 from the data before processing
            this.#buffer += data.replace(/\x03/g, '');
        } else {
            this.#buffer += data;
        }

        // Process buffer looking for bracketed paste markers
        while (this.#buffer.length > 0) {
            if (!this.#inPaste) {
                // Look for paste start marker
                const startIdx = this.#buffer.indexOf('\x1b[200~');

                if (startIdx !== -1) {
                    // Found paste start - emit everything before it
                    if (startIdx > 0) {
                        this.push(this.#buffer.slice(0, startIdx));
                    }

                    // Enter paste mode
                    this.#inPaste = true;
                    this.#pasteBuffer = '';

                    // Remove marker and everything before it from buffer
                    this.#buffer = this.#buffer.slice(startIdx + 6);
                } else {
                    // No paste marker - emit buffer and clear
                    this.push(this.#buffer);
                    this.#buffer = '';
                    break;
                }
            } else {
                // In paste mode - look for end marker
                const endIdx = this.#buffer.indexOf('\x1b[201~');

                if (endIdx !== -1) {
                    // Found paste end - accumulate content
                    this.#pasteBuffer += this.#buffer.slice(0, endIdx);

                    // Remove content and end marker from buffer
                    this.#buffer = this.#buffer.slice(endIdx + 6);

                    // Process the completed paste
                    this.#handlePasteComplete();

                    this.#inPaste = false;
                } else {
                    // End marker not yet seen - accumulate all buffer content
                    this.#pasteBuffer += this.#buffer;
                    this.#buffer = '';
                    break;
                }
            }
        }

        callback();
    }

    _flush(callback) {
        // Emit any remaining buffer
        if (this.#buffer.length > 0) {
            this.push(this.#buffer);
        }
        callback();
    }

    #handlePasteComplete() {
        const content = this.#pasteBuffer;

        // In raw mode, terminals send \r instead of \n
        // Count line breaks (both \r and \n for compatibility)
        const crCount = (content.match(/\r/g) || []).length;
        const lfCount = (content.match(/\n/g) || []).length;
        const lineBreaks = Math.max(crCount, lfCount);
        const lineCount = lineBreaks + 1;
        const charCount = content.length;

        // Normalize line endings to \n for storage
        const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        // Check threshold: 100+ lines OR 2000+ characters
        if (lineCount >= this.threshold.lines || charCount >= this.threshold.chars) {
            this.#pasteCounter++;
            const token = `[Pasted text #${this.#pasteCounter} +${lineCount} lines]`;

            // Store normalized content in registry
            this.#pasteRegistry.set(token, normalizedContent);

            // Emit token instead of content
            this.push(token);
        } else {
            // Below threshold - replace line breaks with padding spaces to force visual wrapping
            const promptLength = 2; // "> "
            let displayContent = '';
            let currentCol = promptLength;

            for (let i = 0; i < normalizedContent.length; i++) {
                if (normalizedContent[i] === '\n') {
                    // Calculate spaces needed to reach end of line
                    const spacesNeeded = this.#terminalWidth - currentCol;
                    displayContent += ' '.repeat(spacesNeeded);
                    currentCol = 0; // Next content starts at beginning of next line
                } else {
                    displayContent += normalizedContent[i];
                    currentCol++;
                    if (currentCol >= this.#terminalWidth) {
                        currentCol = 0; // Natural wrap occurred
                    }
                }
            }

            // Store mapping for expansion
            this.#pasteRegistry.set(displayContent, normalizedContent);

            // Emit content with padding spaces
            this.push(displayContent);
        }

        this.#pasteBuffer = '';
    }

    /**
     * Get the paste registry for expanding tokens
     * @returns {Map} Registry mapping tokens to content
     */
    getPasteRegistry() {
        return this.#pasteRegistry;
    }

    /**
     * Clear the paste registry (call after input is submitted)
     */
    clearPasteRegistry() {
        this.#pasteRegistry.clear();
        this.#pasteCounter = 0;
    }

    /**
     * Expand tokens in input string
     * @param {string} input - Input potentially containing tokens
     * @returns {string} - Input with tokens replaced by content
     */
    expandTokens(input) {
        let expanded = input;

        // Expand any registry tokens (both large paste tokens and padded content keys)
        for (const [token, content] of this.#pasteRegistry.entries()) {
            expanded = expanded.replaceAll(token, content);
        }

        return expanded;
    }
}
