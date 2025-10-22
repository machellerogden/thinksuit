import prompts from './prompts.js';
import classifiers from './classifiers/index.js';
import rules from './rules.js';
import { composeInstructions } from './composeInstructions.js';

/**
 * Core Thinking Companion Module
 * Implements 11 cognitive roles with signal-responsive adaptations
 */
const mu = {
    namespace: 'thinksuit',
    name: 'mu',
    version: '0.1.1',

    // Roles as cohesive behavioral profiles
    roles: [
        {
            name: 'assistant',
            isDefault: true,
            temperature: 0.7,
            baseTokens: 400,
            prompts: {
                system: prompts['system.assistant'],
                primary: prompts['primary.assistant']
            }
        },
        {
            name: 'analyzer',
            temperature: 0.3,
            baseTokens: 800,
            prompts: {
                system: prompts['system.analyzer'],
                primary: prompts['primary.analyzer']
            }
        },
        {
            name: 'synthesizer',
            temperature: 0.6,
            baseTokens: 1000,
            prompts: {
                system: prompts['system.synthesizer'],
                primary: prompts['primary.synthesizer']
            }
        },
        {
            name: 'critic',
            temperature: 0.5,
            baseTokens: 600,
            prompts: {
                system: prompts['system.critic'],
                primary: prompts['primary.critic']
            }
        },
        {
            name: 'planner',
            temperature: 0.4,
            baseTokens: 800,
            prompts: {
                system: prompts['system.planner'],
                primary: prompts['primary.planner']
            }
        },
        {
            name: 'reflector',
            temperature: 0.6,
            baseTokens: 600,
            prompts: {
                system: prompts['system.reflector'],
                primary: prompts['primary.reflector']
            }
        },
        {
            name: 'explorer',
            temperature: 0.9,
            baseTokens: 1000,
            prompts: {
                system: prompts['system.explorer'],
                primary: prompts['primary.explorer']
            }
        },
        {
            name: 'optimizer',
            temperature: 0.4,
            baseTokens: 600,
            prompts: {
                system: prompts['system.optimizer'],
                primary: prompts['primary.optimizer']
            }
        },
        {
            name: 'integrator',
            temperature: 0.5,
            baseTokens: 1000,
            prompts: {
                system: prompts['system.integrator'],
                primary: prompts['primary.integrator']
            }
        },
        {
            name: 'outer_voice',
            temperature: 0.5,
            baseTokens: 500,
            prompts: {
                system: prompts['system.outer_voice'],
                primary: prompts['primary.outer_voice']
            }
        },
        {
            name: 'inner_voice',
            temperature: 0.7,
            baseTokens: 700,
            prompts: {
                system: prompts['system.inner_voice'],
                primary: prompts['primary.inner_voice']
            }
        }
    ],

    // Signal-based behavioral adjustments
    signals: {
        'universal': {
            adaptation: prompts['adapt.universal']
        },
        'high-quantifier': {
            adaptation: prompts['adapt.high-quantifier']
        },
        'forecast': {
            adaptation: prompts['adapt.forecast']
        },
        'normative': {
            adaptation: prompts['adapt.normative']
        },
        'source-cited': {
            adaptation: prompts['adapt.source-cited']
        },
        'tool-result-attached': {
            adaptation: prompts['adapt.tool-result-attached']
        },
        'anecdote': {
            adaptation: prompts['adapt.anecdote']
        },
        'none': {
            tokenMultiplier: 0.85,
            adaptation: prompts['adapt.none']
        },
        'high-certainty': {
            tokenMultiplier: 0.9,
            adaptation: prompts['adapt.high-certainty']
        },
        'hedged': {
            adaptation: prompts['adapt.hedged']
        },
        'time-specified': {
            adaptation: prompts['adapt.time-specified']
        },
        'no-date': {
            tokenMultiplier: 0.95,
            adaptation: prompts['adapt.no-date']
        },
        'ack-only': {
            tokenMultiplier: 0.5,
            adaptation: prompts['adapt.ack-only']
        },
        'capture-only': {
            tokenMultiplier: 0.6,
            adaptation: prompts['adapt.capture-only']
        },
        'explore': {
            tokenMultiplier: 1.2,
            adaptation: prompts['adapt.explore']
        },
        'analyze': {
            tokenMultiplier: 1.1,
            adaptation: prompts['adapt.analyze']
        }
    },

    // Context-based adaptations (not signal-driven)
    adaptations: {
        'tools-available': prompts['adapt.tools-available'],
        'task-execution': prompts['adapt.task-execution'],
        'task-tool-guidance': prompts['adapt.task-tool-guidance'],
        'task-budget-awareness': prompts['adapt.task-budget-awareness'],
        'outer_voice_opening': prompts['adapt.outer_voice_opening'],
        'inner_voice_response': prompts['adapt.inner_voice_response'],
        'outer_voice_challenge': prompts['adapt.outer_voice_challenge'],
        'convergence_synthesis': prompts['adapt.convergence_synthesis'],
        'initial_analysis': prompts['adapt.initial_analysis'],
        'deeper_investigation': prompts['adapt.deeper_investigation'],
        'final_assessment': prompts['adapt.final_assessment'],
        'quantification-request': prompts['adapt.quantification-request'],
        'temporal-assumption-request': prompts['adapt.temporal-assumption-request'],
        'temporal-context': prompts['adapt.temporal-context'],
        'planning_synthesis': prompts['adapt.planning_synthesis'],
        'task-progress-header': prompts['adapt.task-progress-header'],
        'task-progress-assessment': prompts['adapt.task-progress-assessment'],
        'task-progress-limited': prompts['adapt.task-progress-limited'],
        'task-progress-available': prompts['adapt.task-progress-available'],
        'task-progress-guidance': prompts['adapt.task-progress-guidance'],
        'task-force-synthesis': prompts['adapt.task-force-synthesis']
    },

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

    classifiers,
    rules,
    composeInstructions,

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
