/**
 * Claim dimension classifier - Unified implementation
 * Detects: universal, high-quantifier, forecast, normative
 */

import createUnifiedClassifier from './unified-base.js';

// Regex-based classifier (always runs)
async function claimRegex(thread) {
    const lastMessage = thread.at(-1);
    if (!lastMessage || !lastMessage.content) return [];
    const text = lastMessage.content.toLowerCase();
    const signals = [];

    // Universal claims: always, never, everyone, no one, all
    if (/\b(always|never|everyone|no one|nobody|all|every|none)\b/i.test(text)) {
        signals.push({ signal: 'universal', confidence: 0.75 });
    }

    // High quantifiers: percentages, most, vast majority, nearly all
    if (/\b(\d{2,}%|most|vast majority|nearly all|majority|overwhelming)\b/i.test(text)) {
        signals.push({ signal: 'high-quantifier', confidence: 0.7 });
    }

    // Forecasts: will, going to, predict, expect, forecast
    if (/\b(will|going to|predict|expect|forecast|anticipate|likely|probably)\b/i.test(text)) {
        signals.push({ signal: 'forecast', confidence: 0.65 });
    }

    // Normative: should, must, ought to, need to, have to
    if (/\b(should|must|ought to|need to|have to|supposed to|better|worse)\b/i.test(text)) {
        signals.push({ signal: 'normative', confidence: 0.7 });
    }

    return signals;
}

// Gate function for LLM enhancement
function claimGate(text) {
    const patterns = [
        /\b(always|never|everyone|no one|nobody|all|every|none)\b/i,
        /\b(\d{2,}%|most|vast majority|nearly all|majority|overwhelming)\b/i,
        /\b(will|going to|predict|expect|forecast|anticipate|likely|probably)\b/i,
        /\b(should|must|ought to|need to|have to|supposed to|better|worse)\b/i
    ];
    return patterns.some((p) => p.test(text.last) || p.test(text.context));
}

// LLM prompt for enhanced classification
const claimPrompt = `Analyze this text for claim-type signals:

Text: {text}

Look for:
1. Universal claims - absolute statements (always, never, all, none)
2. High quantifiers - strong majority claims (most, 80%, vast majority)
3. Forecasts - predictions about future (will, going to, expect)
4. Normative statements - value judgments (should, must, ought to)

Consider the strength and context of these patterns.`;

// Create the unified classifier
export const claim = createUnifiedClassifier({
    dimension: 'claim',
    regexClassifier: claimRegex,
    gate: claimGate,
    prompt: claimPrompt,
    signals: ['universal', 'high-quantifier', 'forecast', 'normative']
});

export default claim;
