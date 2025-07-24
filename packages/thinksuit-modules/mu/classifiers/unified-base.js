/**
 * Unified two-stage classifier with built-in fallback
 * Always runs regex patterns, optionally enhances with LLM
 */

/**
 * Creates a unified classifier with regex fallback and optional LLM enhancement
 * @param {Object} config - Classifier configuration
 * @param {string} config.dimension - Signal dimension name
 * @param {Function} config.regexClassifier - Regex-based classifier function
 * @param {Function} config.gate - Optional gate function for LLM stage
 * @param {string} config.prompt - LLM prompt template
 * @param {Array} config.signals - Possible signals for this dimension
 */
export function createUnifiedClassifier(config) {
    const { dimension, regexClassifier, gate, prompt, signals } = config;

    return async function classify(thread, invocationConfig = null, logger = null) {
        const text = extractText(thread);

        // Always run regex classifier first
        const regexResults = await regexClassifier(thread);

        const callLLM = invocationConfig?.callLLM;
        const canUseLLM = typeof callLLM === 'function' && (!gate || gate(text));

        // If no LLM available or gate fails, return regex results
        if (!canUseLLM) {
            logger?.trace(
                {
                    event: 'processing.classifier.regex',
                    dimension,
                    mode: 'regex-only',
                    signalCount: regexResults.length
                },
                'Using regex classification'
            );
            return regexResults;
        }

        // Enhance with LLM classification
        try {
            const systemPrompt = buildSystemPrompt(dimension, signals);
            const userPrompt = buildUserPrompt(prompt, text, thread);

            // Build thread for classification
            const classificationThread = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ];

            const response = await callLLM({
                model: 'gpt-4o-mini',
                thread: classificationThread,
                maxTokens: 150,
                temperature: 0.1
            });

            const llmResults = parseAndValidate(response.output, signals, logger);

            // Merge results, preferring LLM when available
            const merged = mergeResults(regexResults, llmResults);

            logger?.trace(
                {
                    event: 'processing.classifier.llm',
                    dimension,
                    mode: 'llm-enhanced',
                    regexCount: regexResults.length,
                    llmCount: llmResults.length,
                    mergedCount: merged.length
                },
                'Using LLM-enhanced classification'
            );

            return merged;
        } catch (error) {
            logger?.warn(
                { dimension, error: error.message },
                'LLM enhancement failed, using regex results'
            );
            return regexResults;
        }
    };
}

/**
 * Extract text from thread for analysis
 */
function extractText(thread) {
    if (!thread || thread.length === 0) return { last: '', context: '' };

    const lastMessage = thread.at(-1);
    const context = thread
        .slice(-3)
        .map((m) => m.content)
        .join(' ');

    return {
        last: lastMessage?.content || '',
        context: context.toLowerCase()
    };
}

/**
 * Build system prompt for LLM classifier
 */
function buildSystemPrompt(dimension, signals) {
    return `You are a precise signal classifier for the "${dimension}" dimension.

Analyze text and identify which signals are present from this list:
${signals.map((s) => `- ${s}`).join('\n')}

Respond with ONLY valid JSON:
{
  "detected": [
    {"signal": "signal_name", "confidence": 0.8}
  ]
}

Rules:
- Only include signals with confidence >= 0.6
- Confidence must be between 0.6 and 1.0
- If no signals detected, return: {"detected": []}`;
}

/**
 * Build user prompt with the text to analyze
 */
function buildUserPrompt(template, text, _thread) {
    return template.replace('{text}', text.last).replace('{context}', text.context);
}

/**
 * Parse and validate LLM response
 */
function parseAndValidate(output, validSignals, logger) {
    try {
        const jsonMatch = output.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return [];

        const parsed = JSON.parse(jsonMatch[0]);
        const detected = parsed.detected || [];

        return detected
            .filter(
                (item) =>
                    validSignals.includes(item.signal) &&
                    typeof item.confidence === 'number' &&
                    item.confidence >= 0.6 &&
                    item.confidence <= 1
            )
            .map((item) => ({
                signal: item.signal,
                confidence: item.confidence
            }));
    } catch (error) {
        logger?.error({ error: error.message }, 'Failed to parse LLM response');
        return [];
    }
}

/**
 * Merge regex and LLM results intelligently
 */
function mergeResults(regexResults, llmResults) {
    const merged = new Map();

    // Add regex results
    regexResults.forEach((r) => {
        merged.set(r.signal, r);
    });

    // Override or add LLM results (typically higher confidence)
    llmResults.forEach((l) => {
        const existing = merged.get(l.signal);
        if (!existing || l.confidence > existing.confidence) {
            merged.set(l.signal, l);
        }
    });

    return Array.from(merged.values());
}

export default createUnifiedClassifier;
