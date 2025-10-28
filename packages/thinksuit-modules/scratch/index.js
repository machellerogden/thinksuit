/**
 * Scratch Module - Minimal Boilerplate
 * A simple module that can be used as a starting point for custom modules
 *
 * This module provides one example of each component type, all inline.
 * Copy and modify these examples to build your own modules.
 */

// Example classifier: detects a simple pattern in the last message
async function exampleClassifier(thread) {
    const lastMessage = thread?.at(-1);
    if (!lastMessage?.content) return [];

    const text = lastMessage.content.toLowerCase();

    // Example: detect questions
    if (text.includes('?')) {
        return [{ signal: 'question', confidence: 0.8 }];
    }

    return [];
}

// Define prompts following naming conventions
const prompts = {
    // System prompts define role identity
    'system.responder': 'You are a helpful assistant.',

    // Primary prompts define task execution
    'primary.responder': 'Respond helpfully to the user\'s message.',

    // Adaptation prompts (optional)
    'adapt.question': 'Provide a clear, direct answer to the question asked.',

    // Length guidance
    'length.brief': 'Respond in 1-3 sentences.',
    'length.standard': 'Respond in 1-2 paragraphs.',
    'length.comprehensive': 'Provide a thorough, detailed response.'
};

const scratch = {
    namespace: 'thinksuit',
    name: 'scratch',
    version: '0.1.0',

    // Example role definition
    roles: [
        {
            name: 'responder',
            isDefault: true,
            temperature: 0.7,
            baseTokens: 800,
            prompts: {
                system: 'system.responder',
                primary: 'primary.responder'
            }
        }
    ],

    // Prompts following naming conventions (required)
    prompts,

    // Example length guidance (derived from prompts)
    lengthGuidance: {
        brief: prompts['length.brief'],
        standard: prompts['length.standard'],
        comprehensive: prompts['length.comprehensive']
    },

    // Example tool dependencies (optional)
    toolDependencies: [],

    // Example classifier - one dimension
    classifiers: {
        example: exampleClassifier
    },

    // Example rule - emits ExecutionPlan fact
    rules: [
        {
            name: 'default-direct',
            conditions: {
                all: [] // Always matches
            },
            action: (facts, engine) => {
                engine.addFact({
                    type: 'ExecutionPlan',
                    strategy: 'direct',
                    name: 'scratch-direct',
                    role: 'responder',
                    confidence: 1.0
                });
            }
        }
    ],

    // Minimal instruction composer (required)
    composeInstructions: async ({ plan = {}, factMap = {} }, module) => {
        const roleConfig = module.roles[0]; // Always use the single responder role

        return {
            system: module.prompts[roleConfig.prompts.system],
            primary: module.prompts[roleConfig.prompts.primary],
            adaptations: '',
            lengthGuidance: module.lengthGuidance.standard,
            toolInstructions: '',
            maxTokens: roleConfig.baseTokens,
            metadata: {
                role: roleConfig.name,
                baseTokens: roleConfig.baseTokens,
                lengthLevel: 'standard',
                adaptations: []
            }
        };
    },

    orchestration: {
        formatResponse: (results) => {
            if (!Array.isArray(results)) {
                return results;
            }
            return results.map(r => r.content || r.response || r).join('\n\n');
        }
    },

    description: 'Minimal boilerplate module for getting started with ThinkSuit.',
    author: 'Mac Heller-Ogden',
    license: 'MIT'
};

// Export as modules object
export const modules = {
    'thinksuit/scratch': scratch
};

// Also export default
export default scratch;
