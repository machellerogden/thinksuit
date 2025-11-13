/**
 * System-wide default constants
 * These provide fallback values when modules or configurations are missing
 */

// Default instruction set when no module is provided
export const DEFAULT_INSTRUCTIONS = {
    systemInstructions: 'You are a thinking companion.',
    thread: [
        { role: 'user', content: 'Please help the user with their request.' }
    ],
    adaptations: '',
    lengthGuidance: 'Be concise but thorough.',
    toolInstructions: '',
    maxTokens: 400,
    metadata: {
        role: 'assistant',
        baseTokens: 400,
        lengthLevel: 'standard',
        adaptations: []
    }
};

// Default role when none is specified
export const DEFAULT_ROLE = 'assistant';

// Token limits for safety
export const DEFAULT_MIN_TOKENS = 50;
export const DEFAULT_MAX_TOKENS = 4000;

// Config
export const DEFAULT_CONFIG_FILE = '.thinksuit.json';

// Tool approval timeout
// 12 hours * 60 minutes * 60 seconds * 1000 milliseconds = 43,200,000 ms
export const DEFAULT_APPROVAL_TIMEOUT_MS = 12 * 60 * 60 * 1000;

// Execution configuration defaults
export const DEFAULT_MODULE = 'thinksuit/mu';
export const DEFAULT_PROVIDER = 'openai';
export const DEFAULT_MODEL = 'gpt-5';

// Policy defaults
export const DEFAULT_POLICY = {
    maxDepth: 5,
    maxFanout: 3,
    maxChildren: 5,
    perception: {
        profile: 'fast',
        budgetMs: 150,
        dimensions: {}
    },
    selection: {
        preferLowCost: false,
        riskTolerance: 'medium'
    }
};

// Logging defaults
export const DEFAULT_LOGGING = {
    level: 'info',
    silent: false
};
