/**
 * Intent Classifier
 * Detects which cognitive instrument(s) the user is attempting to invoke
 */

const INSTRUMENT_PATTERNS = {
    capture: /\b(save|record|remember|note|store|capture|keep)\b/i,
    readback: /\b(readback|repeat|show me|retrieve|recall|what did|display)\b/i,
    analyze: /\b(why|how does|explain|break down|examine|understand)\b/i,
    investigate: /\b(find|search|look for|locate|where is|show|list)\b/i,
    synthesize: /\b(combine|integrate|summarize|summary|merge|consolidate|overall)\b/i,
    execute: /\b(create|build|fix|implement|make|change|update|add|remove|delete|write)\b/i
};

const VALIDATION_PROMPTS = {
    capture: `The user's message mentions saving, storing, or remembering something.

Look at their message: does it seem like they want you to simply acknowledge receipt without adding commentary or elaboration?

Respond: {"confirmed": true} or {"confirmed": false}`,

    readback: `The user's message asks about what was previously discussed or said.

Are they asking you to retrieve and mirror back specific prior content faithfully, without interpretation?

Respond: {"confirmed": true} or {"confirmed": false}`,

    analyze: `The user is asking "why" or "how" something works.

Do they want you to critically examine and break down reasoning, structure, or causation?

Respond: {"confirmed": true} or {"confirmed": false}`,

    investigate: `The user mentions finding, searching for, or looking up something.

Do they need you to actually search through files, documentation, or information using tools?

Respond: {"confirmed": true} or {"confirmed": false}`,

    synthesize: `The user mentions combining, summarizing, or integrating information.

Do they want you to take multiple pieces and create a unified, coherent output?

Respond: {"confirmed": true} or {"confirmed": false}`,

    execute: `The user mentions creating, building, fixing, or modifying something.

Do they want you to actually perform work - write code, edit files, make changes?

Respond: {"confirmed": true} or {"confirmed": false}`
};

async function validateInstrument(instrument, text, callLLM, model) {
    try {
        const response = await callLLM({
            model,
            thread: [
                {
                    role: 'system',
                    content: VALIDATION_PROMPTS[instrument]
                },
                {
                    role: 'user',
                    content: text
                }
            ],
            responseFormat: {
                name: `${instrument}_validation`,
                schema: {
                    type: 'object',
                    properties: {
                        confirmed: { type: 'boolean' }
                    },
                    required: ['confirmed'],
                    additionalProperties: false
                }
            },
            maxTokens: 20,
            temperature: 0.1
        });

        const result = JSON.parse(response.output);
        return result.confirmed;
    } catch (error) {
        // Validation failed - assume pattern was correct
        return true;
    }
}

async function classifyIntent(thread, config = null) {
    if (!thread || thread.length === 0) return [];

    const lastMessage = thread.at(-1);
    if (!lastMessage?.content) return [];

    const text = lastMessage.content.trim();
    const lowerText = text.toLowerCase();

    // Collect all pattern matches
    const patternMatches = [];
    for (const [instrument, pattern] of Object.entries(INSTRUMENT_PATTERNS)) {
        if (pattern.test(lowerText)) {
            patternMatches.push(instrument);
        }
    }

    // No patterns matched - default to chat
    if (patternMatches.length === 0) {
        return [{ signal: 'chat', confidence: 0.7, dimension: 'intent' }];
    }

    // Single clear match - return without validation
    if (patternMatches.length === 1) {
        return [{ signal: patternMatches[0], confidence: 0.85, dimension: 'intent' }];
    }

    // Multiple matches - validate each with LLM if available
    const callLLM = config?.callLLM;
    const model = config?.model;

    if (typeof callLLM !== 'function' || !model) {
        // No LLM - return all matches with pattern confidence
        return patternMatches.map(instrument => ({
            signal: instrument,
            confidence: 0.85,
            dimension: 'intent'
        }));
    }

    // Validate each match
    const signals = [];
    for (const instrument of patternMatches) {
        const confirmed = await validateInstrument(instrument, text, callLLM, model);
        if (confirmed) {
            signals.push({
                signal: instrument,
                confidence: 0.9,
                dimension: 'intent'
            });
        }
    }

    // If validation rejected all, return highest priority pattern match
    if (signals.length === 0) {
        return [{ signal: patternMatches[0], confidence: 0.7, dimension: 'intent' }];
    }

    return signals;
}

export default classifyIntent;
