/**
 * Intent dimension classifier - Unified implementation
 * Detects: parallel-execution, sequential-execution
 *
 * Intent signals capture user directives about HOW to execute work,
 * providing deterministic control over execution orchestration.
 */

import createUnifiedClassifier from './unified-base.js';

// Regex-based classifier (always runs)
async function intentRegex(thread) {
    const lastMessage = thread.at(-1);
    if (!lastMessage || !lastMessage.content) return [];
    const text = lastMessage.content.toLowerCase();
    const signals = [];

    // Parallel: explicit request for concurrent/parallel execution
    if (/\b(parallel|concurrently|at the same time|in parallel|simultaneously)\b/i.test(text)) {
        signals.push({ signal: 'parallel-execution', confidence: 0.9 });
    }

    // Sequential: explicit request for step-by-step/sequential execution
    if (/\b(sequential|sequentially|step by step|one at a time|in sequence|in order)\b/i.test(text)) {
        signals.push({ signal: 'sequential-execution', confidence: 0.9 });
    }

    return signals;
}

// Gate function - only run LLM if user mentions execution/process
function intentGate(text) {
    if (!text || !text.last) return false;

    // Run LLM if user mentions execution/orchestration concepts
    return /\b(execute|run|process|orchestrate|workflow|approach)\b/i.test(text.last.toLowerCase());
}

// LLM prompt for enhanced classification
const intentPrompt = `Analyze the user's intent about HOW to execute the work in this message:

Text: {text}

Identify execution intent signals:
1. Parallel - User wants concurrent/parallel execution (keywords: parallel, concurrently, at the same time, simultaneously)
2. Sequential - User wants step-by-step/ordered execution (keywords: sequential, step by step, one at a time, in order)

Consider:
- Explicit directives about execution order or concurrency
- Context suggesting parallel exploration vs sequential analysis
- No signal if user doesn't express preference about execution approach`;

// Create the unified classifier
export const intent = createUnifiedClassifier({
    dimension: 'intent',
    regexClassifier: intentRegex,
    gate: intentGate,
    prompt: intentPrompt,
    signals: ['parallel-execution', 'sequential-execution']
});

export default intent;
