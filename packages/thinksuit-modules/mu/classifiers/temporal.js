/**
 * Temporal dimension classifier - Unified implementation
 * Detects: time-specified, no-date
 */

import createUnifiedClassifier from './unified-base.js';

// Regex-based classifier (always runs)
async function temporalRegex(thread) {
    const lastMessage = thread.at(-1);
    if (!lastMessage || !lastMessage.content) return [];
    const text = lastMessage.content.toLowerCase();
    const signals = [];

    // Time specified: dates, years, months, specific time references
    const timePatterns = [
        /\b\d{4}\b/, // Years
        /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i,
        /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
        /\b(today|yesterday|tomorrow|last week|next week|last month|next month|last year|next year)\b/i,
        /\b\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?\b/, // Date formats
        /\b(recently|currently|now|present|past|future)\b/i
    ];

    const hasTimeReference = timePatterns.some((pattern) => pattern.test(text));

    if (hasTimeReference) {
        signals.push({ signal: 'time-specified', confidence: 0.75 });
    } else {
        signals.push({ signal: 'no-date', confidence: 0.7 });
    }

    return signals;
}

// Gate function - always check temporal dimension
function temporalGate() {
    return true; // Always run LLM if available (can detect 'no-date')
}

// LLM prompt for enhanced classification
const temporalPrompt = `Analyze temporal references in this text:

Text: {text}

Identify time-related signals:
1. Time-specified - contains specific dates, years, time periods, or relative time references
   Examples: 2023, January, yesterday, last week, recently, in the past
2. No-date - no temporal references or time context provided

Look for both explicit dates/times and implicit temporal context.`;

// Create the unified classifier
export const temporal = createUnifiedClassifier({
    dimension: 'temporal',
    regexClassifier: temporalRegex,
    gate: temporalGate,
    prompt: temporalPrompt,
    signals: ['time-specified', 'no-date']
});

export default temporal;
