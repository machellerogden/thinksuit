/**
 * Mu Rules - Intent-based role routing
 * Maps detected intent signals to appropriate roles
 */

import { createFact } from './facts.js';

const DEFAULT_TIMEOUT_MS = 1000 * 60 * 60 * 12;

const rules = [
  // Capture intent
  {
    name: 'route-capture',
    conditions: {
      all: [{ type: 'Signal', test: (s) => s.dimension === 'intent' && s.signal === 'capture' }]
    },
    action: (facts, engine) => {
      engine.addFact(createFact.executionPlan('direct', {
        name: 'capture-turn',
        role: 'capture',
        lengthLevel: 'brief'
      }));
    }
  },

  // Readback intent
  {
    name: 'route-readback',
    conditions: {
      all: [{ type: 'Signal', test: (s) => s.dimension === 'intent' && s.signal === 'readback' }]
    },
    action: (facts, engine) => {
      engine.addFact(createFact.executionPlan('direct', {
        name: 'readback-turn',
        role: 'readback',
        lengthLevel: 'standard'
      }));
    }
  },

  // Analyze intent
  {
    name: 'route-analyze',
    conditions: {
      all: [{ type: 'Signal', test: (s) => s.dimension === 'intent' && s.signal === 'analyze' }]
    },
    action: (facts, engine) => {
      engine.addFact(createFact.executionPlan('direct', {
        name: 'analyze-turn',
        role: 'analyze',
        lengthLevel: 'standard'
      }));
    }
  },

  // Investigate intent
  {
    name: 'route-investigate',
    conditions: {
      all: [{ type: 'Signal', test: (s) => s.dimension === 'intent' && s.signal === 'investigate' }]
    },
    action: (facts, engine) => {
      engine.addFact(createFact.executionPlan('task', {
        name: 'investigate-task',
        role: 'investigate',
        tools: ['list_directory', 'read_file', 'search'],
        resolution: { maxCycles: 5, maxTokens: 10000, maxToolCalls: 15, timeoutMs: DEFAULT_TIMEOUT_MS },
        lengthLevel: 'standard'
      }));
    }
  },

  // Synthesize intent
  {
    name: 'route-synthesize',
    conditions: {
      all: [{ type: 'Signal', test: (s) => s.dimension === 'intent' && s.signal === 'synthesize' }]
    },
    action: (facts, engine) => {
      engine.addFact(createFact.executionPlan('direct', {
        name: 'synthesize-turn',
        role: 'synthesize',
        lengthLevel: 'comprehensive'
      }));
    }
  },

  // Execute intent
  {
    name: 'route-execute',
    conditions: {
      all: [{ type: 'Signal', test: (s) => s.dimension === 'intent' && s.signal === 'execute' }]
    },
    action: (facts, engine) => {
      engine.addFact(createFact.executionPlan('task', {
        name: 'execute-task',
        role: 'execute',
        tools: ['read_file', 'write_file', 'edit_file', 'list_directory'],
        resolution: { maxCycles: 8, maxTokens: 12000, maxToolCalls: 20, timeoutMs: DEFAULT_TIMEOUT_MS },
        lengthLevel: 'standard'
      }));
    }
  }
];

export default rules;
