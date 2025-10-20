/**
 * Utility functions for terminal rendering
 * Based on @inquirer/core utils
 */

import cliWidth from 'cli-width';
import wrapAnsi from 'wrap-ansi';

/**
 * Force line returns at specific width. This function is ANSI code friendly
 * and it'll ignore invisible codes during width calculation.
 * @param {string} content
 * @param {number} width
 * @return {string}
 */
export function breakLines(content, width) {
    return content
        .split('\n')
        .flatMap((line) =>
            wrapAnsi(line, width, { trim: false, hard: true, wordWrap: false })
                .split('\n')
                .map((str) => str.trimEnd())
        )
        .join('\n');
}

/**
 * Returns the width of the terminal output stream, or 80 as default value.
 * @param {object} output - The output stream
 * @returns {number}
 */
export function readlineWidth(output = process.stdout) {
    return cliWidth({ defaultWidth: 80, output });
}

/**
 * Count the number of lines in a string
 * @param {string} content
 * @returns {number}
 */
export function height(content) {
    return content.split('\n').length;
}

/**
 * Get the last line of a string
 * @param {string} content
 * @returns {string}
 */
export function lastLine(content) {
    return content.split('\n').pop() ?? '';
}
