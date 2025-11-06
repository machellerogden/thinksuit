/**
 * Mu Plan Library
 * Centralized plan definitions for intent-based routing and console presets
 */

const DEFAULT_TIMEOUT_MS = 1000 * 60 * 60 * 12;

export const planLibrary = {
  'chat-turn': {
    strategy: 'direct',
    name: 'chat-turn',
    role: 'chat',
    lengthLevel: 'brief'
  },

  'capture-turn': {
    strategy: 'direct',
    name: 'capture-turn',
    role: 'capture',
    lengthLevel: 'brief'
  },

  'readback-turn': {
    strategy: 'direct',
    name: 'readback-turn',
    role: 'readback',
    lengthLevel: 'standard'
  },

  'analyze-turn': {
    strategy: 'direct',
    name: 'analyze-turn',
    role: 'analyze',
    lengthLevel: 'standard'
  },

  'investigate-task': {
    strategy: 'task',
    name: 'investigate-task',
    role: 'investigate',
    tools: ['list_directory', 'read_file', 'search'],
    resolution: {
      maxCycles: 5,
      maxTokens: 10000,
      maxToolCalls: 15,
      timeoutMs: DEFAULT_TIMEOUT_MS
    },
    lengthLevel: 'standard'
  },

  'synthesize-turn': {
    strategy: 'direct',
    name: 'synthesize-turn',
    role: 'synthesize',
    lengthLevel: 'comprehensive'
  },

  'execute-task': {
    strategy: 'task',
    name: 'execute-task',
    role: 'execute',
    tools: ['read_file', 'write_file', 'edit_file', 'list_directory'],
    resolution: {
      maxCycles: 8,
      maxTokens: 12000,
      maxToolCalls: 20,
      timeoutMs: DEFAULT_TIMEOUT_MS
    },
    lengthLevel: 'standard'
  }
};
