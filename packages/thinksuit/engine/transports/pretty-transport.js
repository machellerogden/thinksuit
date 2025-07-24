/**
 * Custom pino-pretty transport with response formatting
 */

import pinoPretty from 'pino-pretty';

// Helper function to format multi-line text with box drawing
function formatMultilineText(value, prefix = '    ') {
    if (typeof value !== 'string') return value;

    const lines = value.split('\n');
    if (lines.length === 1) {
        // Single line - just return as is
        return value;
    }

    // Multi-line - format with box drawing characters
    const formatted = lines
        .map((line, index) => {
            if (index === 0) {
                return prefix + '┌─ ' + line;
            } else if (index === lines.length - 1) {
                return prefix + '└─ ' + line;
            } else {
                return prefix + '│  ' + line;
            }
        })
        .join('\n');

    return '\n' + formatted;
}

// Helper function to format thread messages
function formatThread(thread) {
    if (!Array.isArray(thread)) return thread;
    if (thread.length === 0) return '[]';

    const formatted = thread
        .map((msg, index) => {
            const roleLabel = msg.role === 'user' ? '👤' : msg.role === 'assistant' ? '🤖' : '📋';
            const content = msg.content || '';
            const lines = content.split('\n');

            if (lines.length === 1) {
                // Single line message
                return `    [${index}] ${roleLabel} ${msg.role}: ${content}`;
            } else {
                // Multi-line message
                const formattedContent = lines
                    .map((line, lineIndex) => {
                        if (lineIndex === 0) {
                            return `    [${index}] ${roleLabel} ${msg.role}:\n        ┌─ ${line}`;
                        } else if (lineIndex === lines.length - 1) {
                            return `        └─ ${line}`;
                        } else {
                            return `        │  ${line}`;
                        }
                    })
                    .join('\n');
                return formattedContent;
            }
        })
        .join('\n');

    return '\n' + formatted;
}

export default function (opts) {
    // Merge our custom prettifiers with the provided options
    const options = {
        ...opts,
        customPrettifiers: {
            // Format the response field (session.response event)
            response: (value) => formatMultilineText(value),

            // Format the output field (processing.llm.response event)
            output: (value) => formatMultilineText(value),

            // Format the input field
            input: (value) => {
                if (typeof value !== 'string') return value;

                const lines = value.split('\n');
                if (lines.length === 1) {
                    return value;
                }

                // Multi-line input formatting
                return '\n' + lines.map((line) => '    > ' + line).join('\n');
            },

            // Format the thread field (processing.llm.request event)
            thread: (value) => formatThread(value),

            // Format system prompts
            system: (value) => formatMultilineText(value, '    '),

            // Format user prompts
            user: (value) => formatMultilineText(value, '    '),

            // Format instructions field
            instructions: (value) => {
                if (typeof value === 'string') {
                    return formatMultilineText(value);
                } else if (value && typeof value === 'object') {
                    // If it's an object with system and user properties
                    const parts = [];
                    if (value.system) {
                        parts.push('  System:\n' + formatMultilineText(value.system, '    '));
                    }
                    if (value.user) {
                        parts.push('  User:\n' + formatMultilineText(value.user, '    '));
                    }
                    return parts.length > 0 ? '\n' + parts.join('\n') : value;
                }
                return value;
            },

            ...opts?.customPrettifiers
        }
    };

    return pinoPretty(options);
}
