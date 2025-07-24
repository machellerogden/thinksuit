/**
 * Support dimension classifier - Unified implementation
 * Detects: source-cited, tool-result-attached, anecdote, none
 */

import createUnifiedClassifier from './unified-base.js';

// Regex-based classifier (always runs)
async function supportRegex(thread) {
    const lastMessage = thread.at(-1);
    if (!lastMessage || !lastMessage.content) return [];
    const text = lastMessage.content.toLowerCase();
    const signals = [];

    // Source citations: according to, research shows, study, paper, article
    if (
        /\b(according to|research shows|study|paper|article|journal|source|citation|reference)\b/i.test(
            text
        )
    ) {
        signals.push({ signal: 'source-cited', confidence: 0.8 });
    }

    // Tool results: data, results, output, generated, calculated
    if (
        /\b(data shows|results indicate|output|generated|calculated|measured|computed)\b/i.test(
            text
        )
    ) {
        signals.push({ signal: 'tool-result-attached', confidence: 0.75 });
    }

    // Anecdotes: personal experience, I've seen, in my experience
    if (/\b(in my experience|i've seen|personally|anecdotally|once|i remember)\b/i.test(text)) {
        signals.push({ signal: 'anecdote', confidence: 0.7 });
    }

    // If no other support signals detected, mark as none
    if (signals.length === 0) {
        signals.push({ signal: 'none', confidence: 0.65 });
    }

    return signals;
}

// Gate function - always check support dimension
function supportGate() {
    return true; // Always run LLM if available (can detect 'none')
}

// LLM prompt for enhanced classification
const supportPrompt = `Analyze this text for evidence/support signals:

Text: {text}

Identify the type of support or evidence:
1. Source-cited - references to research, papers, authors, studies
2. Tool-result-attached - data outputs, calculations, measurements
3. Anecdote - personal experiences, stories, individual observations
4. None - no evidence or support provided (claims without backing)

Consider both explicit references and implicit evidence patterns.`;

// Create the unified classifier
export const support = createUnifiedClassifier({
    dimension: 'support',
    regexClassifier: supportRegex,
    gate: supportGate,
    prompt: supportPrompt,
    signals: ['source-cited', 'tool-result-attached', 'anecdote', 'none']
});

export default support;
