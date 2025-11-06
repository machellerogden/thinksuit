import prompts from './prompts.js';
import classifiers from './classifiers/index.js';
import rules from './rules.js';
import { composeInstructions } from './composeInstructions.js';
import { planLibrary } from './planLibrary.js';

/**
 * Core Thinking Companion Module
 * Implements cognitive roles with ExecutionPlan-driven orchestration
 * Signal-to-adaptation mapping is internal; only ExecutionPlan facts drive control flow
 */
const mu = {
    namespace: 'thinksuit',
    name: 'mu',
    version: '0.2.0',

    // Roles enabling intentional selection of cognitive instruments
    roles: [
        {
            name: 'chat',
            isDefault: true,
            temperature: 0.7,
            baseTokens: 400,
            prompts: { system: 'system.chat', primary: 'primary.chat' }
        }, {
            name: 'capture',
            temperature: 0.3,
            baseTokens: 400,
            prompts: { system: 'system.capture', primary: 'primary.capture' }
        }, {
            name: 'readback',
            temperature: 0.3,
            baseTokens: 400,
            prompts: { system: 'system.readback', primary: 'primary.readback' }
        }, {
            name: 'analyze',
            temperature: 0.5,
            baseTokens: 800,
            prompts: { system: 'system.analyze', primary: 'primary.analyze' }
        }, {
            name: 'investigate',
            temperature: 0.4,
            baseTokens: 1000,
            prompts: { system: 'system.investigate', primary: 'primary.investigate' }
        }, {
            name: 'synthesize',
            temperature: 0.6,
            baseTokens: 1000,
            prompts: { system: 'system.synthesize', primary: 'primary.synthesize' }
        }, {
            name: 'execute',
            temperature: 0.4,
            baseTokens: 1200,
            prompts: { system: 'system.execute', primary: 'primary.execute' }
        }
    ],

    // Response length guidance
    lengthGuidance: {
        brief: prompts['length.brief'],
        standard: prompts['length.standard'],
        comprehensive: prompts['length.comprehensive']
    },

    // Tool dependencies - what tools this module needs from MCP servers
    // The system will validate these are available after MCP server startup
    toolDependencies: [
        { name: 'read_file', description: 'Read file contents' },
        { name: 'write_file', description: 'Create or overwrite files' },
        { name: 'edit_file', description: 'Modify existing files' },
        { name: 'list_directory', description: 'List directory contents' },
        { name: 'directory_tree', description: 'Show recursive directory structure' },
        { name: 'create_directory', description: 'Create new directories' },
        { name: 'move_file', description: 'Move or rename files/directories' },
        { name: 'search_files', description: 'Search for files by pattern' },
        { name: 'roll_dice', description: 'Roll dice for decision making' }
    ],

    prompts,
    classifiers,
    rules,
    composeInstructions,
    planLibrary,

    orchestration: {
        formatResponse: (results) => {
            if (!Array.isArray(results)) {
                return results;
            }
            const label = (r) =>
                ({
                    chat: 'Chat',
                    capture: 'Capture',
                    readback: 'Readback',
                    analyze: 'Analyze',
                    investigate: 'Investigate',
                    synthesize: 'Synthesize',
                    execute: 'Execute'
                })[r.role] || r.role;
            return results
                .map((r) => `[${label(r)}]\n${r.content || r.response || r}`)
                .join('\n\n');
        }
    },

    description: 'Core thinking roles and signal-responsive adaptations.',
    author: 'Mac Heller-Ogden',
    license: 'MIT'
};

// Export as modules object
export const modules = {
    'thinksuit/mu': mu
};

// Also export default
export default mu;
