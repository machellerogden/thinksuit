import prompts from './prompts.js';
import classifiers from './classifiers/index.js';
import rules from './rules.js';
import { composeInstructions } from './composeInstructions.js';

/**
 * Core Thinking Companion Module
 * Implements 9 cognitive roles with signal-responsive adaptations
 */
const mu = {
    namespace: 'thinksuit',
    name: 'mu',
    version: '0.0.3',

    roles: [
        'assistant',
        'analyzer',
        'synthesizer',
        'critic',
        'planner',
        'reflector',
        'explorer',
        'optimizer',
        'integrator',
        'outer_voice',
        'inner_voice'
    ],

    // Designated roles for system operations
    defaultRole: 'assistant', // Fallback role when none selected

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

    instructionSchema: {
        prompts: {
            system: (role) => prompts[`system.${role}`] || prompts['system.assistant'],
            primary: (role) => prompts[`primary.${role}`] || prompts['primary.assistant'],
            adaptation: (signal) => prompts[`adapt.${signal}`] || '',
            length: (level) => prompts[`length.${level}`] || prompts['length.standard']
        },
        tokens: {
            roleDefaults: {
                assistant: 400,
                analyzer: 800,
                synthesizer: 1000,
                critic: 600,
                planner: 800,
                reflector: 600,
                explorer: 1000,
                optimizer: 600,
                integrator: 1000,
                outer_voice: 500,
                inner_voice: 700
            },
            signalMultipliers: {
                'support.none': 0.85,
                'calibration.high-certainty': 0.9,
                'temporal.no-date': 0.95,
                'contract.ack-only': 0.5,
                'contract.capture-only': 0.6,
                'contract.explore': 1.2,
                'contract.analyze': 1.1
            }
        },
        temperature: {
            // Temperature settings per role (0.0 - 1.0)
            assistant: 0.7,
            analyzer: 0.3,
            synthesizer: 0.6,
            critic: 0.5,
            planner: 0.4,
            reflector: 0.6,
            explorer: 0.9,
            optimizer: 0.4,
            integrator: 0.5,
            outer_voice: 0.5, // Moderate temperature for practical perspective
            inner_voice: 0.7, // Higher temperature for questioning perspective
            fallback: 0.3, // Low temperature for error recovery
            default: 0.7 // Default temperature
        }
    },

    orchestration: {
        formatResponse: (results) => {
            if (!Array.isArray(results)) {
                return results;
            }
            const label = (r) =>
                ({
                    outer_voice: 'Constraints Lens',
                    inner_voice: 'Possibilities Lens',
                    reflector: 'Integrator'
                })[r.role] || r.role;
            return results
                .map((r) => `[${label(r)}]\n${r.content || r.response || r}`)
                .join('\n\n');
        }
    },

    description: 'Core thinking roles and signal-responsive adaptations.',
    author: 'With Bots, LLC',
    license: 'MIT'
};

// Export as modules object
export const modules = {
    'thinksuit/mu': mu
};

// Also export default
export default mu;
