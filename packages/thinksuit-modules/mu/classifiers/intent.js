/**
 * Intent Classifier
 * Detects which role the user intends to engage
 * Based on keywords and patterns in the user's input
 */

const intentPatterns = {
    'readback': /\b(readback|repeat|show me|retrieve|recall|what did|display)\b/i,
    'capture': /\b(save|record|remember|note|store|capture|keep)\b/i,
    'analyze': /\b(analyze|why|explain|break down|examine|dissect|understand|how does)\b/i,
    'investigate': /\b(find|search|look for|locate|what does|where is|show|list)\b/i,
    'synthesize': /\b(combine|integrate|summarize|merge|consolidate|overall|put together)\b/i,
    'execute': /\b(create|build|fix|implement|run|make|change|update|add|remove|delete)\b/i
};

/**
 * Classify user intent based on input text
 * @param {Array} thread - Conversation thread
 * @returns {Array} - Array of signal objects with intent and confidence
 */
async function classifyIntent(thread) {
    const lastMessage = thread?.at(-1);
    if (!lastMessage?.content) return [];

    const text = lastMessage.content.toLowerCase();
    const signals = [];

    // Check each pattern
    for (const [intent, pattern] of Object.entries(intentPatterns)) {
        if (pattern.test(text)) {
            // Higher confidence if keyword appears early in text
            const firstMatchIndex = text.search(pattern);
            const confidence = firstMatchIndex < 50 ? 0.9 : 0.7;

            signals.push({
                signal: intent,
                confidence,
                dimension: 'intent'
            });
        }
    }

    // If no specific intent detected, default to analyze
    if (signals.length === 0) {
        signals.push({
            signal: 'analyze',
            confidence: 0.5,
            dimension: 'intent'
        });
    }

    return signals;
}

export default classifyIntent;
