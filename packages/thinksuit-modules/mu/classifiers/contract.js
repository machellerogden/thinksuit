/**
 * Contract dimension classifier - Unified implementation
 * Detects: ack-only, capture-only, explore, analyze
 */

import createUnifiedClassifier from './unified-base.js';

// Regex-based classifier (always runs)
async function contractRegex(thread) {
    const lastMessage = thread.at(-1);
    if (!lastMessage || !lastMessage.content) return [];
    const text = lastMessage.content.toLowerCase();
    const signals = [];

    // Ack-only: very short, simple acknowledgments
    if (text.length < 20 && /\b(ok|okay|thanks|got it|understood|yes|no|sure)\b/i.test(text)) {
        signals.push({ signal: 'ack-only', confidence: 0.85 });
        return signals; // Short-circuit for ack-only
    }

    // Capture-only: note, remember, save, record
    if (/\b(note|remember|save|record|capture|store|log)\b/i.test(text)) {
        signals.push({ signal: 'capture-only', confidence: 0.7 });
    }

    // Analyze: analyze, examine, investigate, understand, explain
    if (
        /\b(analyze|examine|investigate|understand|explain|why|how does|what is|break down|dissect)\b/i.test(
            text
        )
    ) {
        signals.push({ signal: 'analyze', confidence: 0.75 });
    }

    // Explore: explore, what if, possibilities, options, alternatives
    if (
        /\b(explore|what if|possibilities|options|alternatives|could we|brainstorm|ideas|consider)\b/i.test(
            text
        )
    ) {
        signals.push({ signal: 'explore', confidence: 0.7 });
    }

    // Default to analyze if question patterns detected but no specific contract
    if (signals.length === 0 && /\?|^(what|why|how|when|where|who)\b/i.test(text)) {
        signals.push({ signal: 'analyze', confidence: 0.6 });
    }

    return signals;
}

// Gate function - always check contract dimension
function contractGate() {
    return true; // Always run LLM if available (determines interaction type)
}

// LLM prompt for enhanced classification
const contractPrompt = `Analyze the interaction contract in this message:

Text: {text}

Identify the interaction type:
1. Ack-only - brief acknowledgment, no elaboration needed (OK, thanks, got it)
2. Capture-only - request to save/note/remember information without analysis
3. Explore - open-ended exploration, brainstorming, considering possibilities
4. Analyze - structured analysis, understanding, explanation, breaking down concepts

Consider:
- Message brevity (very short messages often indicate ack-only)
- Question types (why/how often indicate analyze, what-if indicates explore)
- Action verbs (remember/note = capture, understand/explain = analyze)`;

// Create the unified classifier
export const contract = createUnifiedClassifier({
    dimension: 'contract',
    regexClassifier: contractRegex,
    gate: contractGate,
    prompt: contractPrompt,
    signals: ['ack-only', 'capture-only', 'explore', 'analyze']
});

export default contract;
