/**
 * Calibration dimension classifier - Unified implementation
 * Detects: high-certainty, hedged
 */

import createUnifiedClassifier from './unified-base.js';

// Regex-based classifier (always runs)
async function calibrationRegex(thread) {
    const lastMessage = thread.at(-1);
    if (!lastMessage || !lastMessage.content) return [];
    const text = lastMessage.content.toLowerCase();
    const signals = [];

    // High certainty: definitely, certainly, absolutely, obviously, clearly
    if (
        /\b(definitely|certainly|absolutely|obviously|clearly|undoubtedly|surely|without doubt)\b/i.test(
            text
        )
    ) {
        signals.push({ signal: 'high-certainty', confidence: 0.8 });
    }

    // Hedged: maybe, perhaps, might, could, possibly, seems
    if (
        /\b(maybe|perhaps|might|could|possibly|seems|appears|somewhat|relatively|fairly)\b/i.test(
            text
        )
    ) {
        signals.push({ signal: 'hedged', confidence: 0.75 });
    }

    // If both are detected, hedged takes precedence (lower confidence for high-certainty)
    if (signals.length === 2) {
        const highCertIndex = signals.findIndex((s) => s.signal === 'high-certainty');
        if (highCertIndex !== -1) {
            signals[highCertIndex].confidence = 0.5;
        }
    }

    return signals;
}

// Gate function for LLM enhancement
function calibrationGate(text) {
    const patterns = [
        /\b(definitely|certainly|absolutely|obviously|clearly|undoubtedly|surely)\b/i,
        /\b(maybe|perhaps|might|could|possibly|seems|appears|somewhat)\b/i,
        /\b(certain|sure|confident|doubt|uncertain|unsure|tentative)\b/i
    ];
    return patterns.some((p) => p.test(text.last) || p.test(text.context));
}

// LLM prompt for enhanced classification
const calibrationPrompt = `Analyze the certainty level in this text:

Text: {text}

Identify calibration signals:
1. High-certainty - absolute confidence, no doubt expressed (definitely, certainly, obviously)
2. Hedged - uncertainty, qualification, tentative language (maybe, perhaps, might, could)

Note: If both patterns exist, hedged language typically dominates the overall tone.`;

// Create the unified classifier
export const calibration = createUnifiedClassifier({
    dimension: 'calibration',
    regexClassifier: calibrationRegex,
    gate: calibrationGate,
    prompt: calibrationPrompt,
    signals: ['high-certainty', 'hedged']
});

export default calibration;
