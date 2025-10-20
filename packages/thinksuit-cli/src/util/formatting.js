import stringWidth from 'string-width';
import wrapAnsi from 'wrap-ansi';
import sliceAnsi from 'slice-ansi';

/**
 * Calculate the visual width of a string, accounting for ANSI escape codes.
 * @param {string} str - The string to measure
 * @returns {number} The visual width
 */
export function getWidth(str) {
    return stringWidth(str);
}

/**
 * Wrap text to a specified width, preserving ANSI codes.
 * @param {string} str - The string to wrap
 * @param {number} width - The maximum width
 * @param {object} options - Wrapping options
 * @returns {string} The wrapped text
 */
export function wrap(str, width, options = {}) {
    if (width <= 0) return '';
    return wrapAnsi(str, width, options);
}

/**
 * Slice a string by visual width, preserving ANSI codes.
 * @param {string} str - The string to slice
 * @param {number} start - Start position
 * @param {number} end - End position (optional)
 * @returns {string} The sliced string
 */
export function slice(str, start, end) {
    return sliceAnsi(str, start, end);
}

/**
 * Pad a string to a specific width, accounting for ANSI codes.
 * @param {string} str - The string to pad
 * @param {number} width - The target width
 * @param {string} char - The padding character (default: space)
 * @returns {string} The padded string
 */
export function pad(str, width, char = ' ') {
    const currentWidth = getWidth(str);
    if (currentWidth >= width) return str;
    return str + char.repeat(width - currentWidth);
}

/**
 * Truncate a string to a maximum width, adding ellipsis if needed.
 * @param {string} str - The string to truncate
 * @param {number} maxWidth - The maximum width
 * @param {string} ellipsis - The ellipsis string (default: '…')
 * @returns {string} The truncated string
 */
export function truncate(str, maxWidth, ellipsis = '…') {
    const width = getWidth(str);
    if (width <= maxWidth) return str;

    const ellipsisWidth = getWidth(ellipsis);
    const targetWidth = maxWidth - ellipsisWidth;
    if (targetWidth <= 0) return ellipsis;

    return slice(str, 0, targetWidth) + ellipsis;
}

/**
 * Split text into lines based on width, preserving ANSI codes.
 * @param {string} text - The text to split
 * @param {number} width - The maximum width per line
 * @returns {string[]} Array of lines
 */
export function splitLines(text, width) {
    if (width <= 0) return [''];
    const wrapped = wrap(text, width, { hard: true, trim: false });
    return wrapped.split('\n');
}
