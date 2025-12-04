import prompts from './prompts.js';
import classifiers from './classifiers/index.js';
import rules from './rules.js';
import { composeInstructions } from './composeInstructions.js';
import presets from './presets.json' with { type: 'json' };

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
            description: 'Natural conversation and direct responses. Use for greetings, questions, and casual interaction.',
            isDefault: true,
            temperature: 0.7,
            baseTokens: 400,
            prompts: { system: 'system.chat', primary: 'primary.chat' }
        }, {
            name: 'capture',
            description: 'Records information verbatim without commentary. Use for taking notes or preserving exact content provided by user.',
            temperature: 0.3,
            baseTokens: 400,
            prompts: { system: 'system.capture', primary: 'primary.capture' }
        }, {
            name: 'readback',
            description: 'Retrieves and restates previously mentioned information. Use for recalling facts from earlier in conversation. NOT for presenting newly created outputs or reports.',
            temperature: 0.3,
            baseTokens: 400,
            prompts: { system: 'system.readback', primary: 'primary.readback' }
        }, {
            name: 'analyze',
            description: 'Examines structure, identifies patterns, and reasons about information. Use for breaking down complex topics or validating logic. Works on information already gathered.',
            temperature: 0.5,
            baseTokens: 800,
            prompts: { system: 'system.analyze', primary: 'primary.analyze' }
        }, {
            name: 'investigate',
            description: 'Gathers information using available tools (reading files, searching, querying systems). Use when new information needs to be collected from external sources.',
            temperature: 0.4,
            baseTokens: 1000,
            prompts: { system: 'system.investigate', primary: 'primary.investigate' }
        }, {
            name: 'synthesize',
            description: 'Combines and integrates information into coherent final output. Use for creating reports, summaries, or unified frameworks from gathered data. This is the appropriate role for presenting final results.',
            temperature: 0.6,
            baseTokens: 1000,
            prompts: { system: 'system.synthesize', primary: 'primary.synthesize' }
        }, {
            name: 'execute',
            description: 'Performs work by calling tools (writing files, making changes, executing operations). Use when modifications or actions need to be performed, not just information gathering.',
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
    presets,
    frames: [],  // Forward-looking: will contain named frame definitions

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
