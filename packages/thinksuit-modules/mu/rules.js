/**
 * Mu Rules - Intent-based role routing
 * Maps detected intent signals to appropriate roles
 */

import { createFact } from './facts.js';

const plans = {
  chat: {
    name: 'chat',
    rationale: 'Single turn direct response for conversational interaction',
    strategy: 'direct',
    role: 'chat',
    lengthLevel: 'brief'
  },
  capture: {
    name: 'capture',
    rationale: 'Direct recording preserves exact content without analysis or transformation',
    strategy: 'direct',
    role: 'capture',
    lengthLevel: 'brief'
  },
  readback: {
    name: 'readback',
    rationale: 'Direct recall and presentation of information from conversation history',
    strategy: 'direct',
    role: 'readback',
    lengthLevel: 'standard'
  },
  analyze: {
    name: 'analyze',
    rationale: 'Task strategy with multiple cycles allows iterative thinking and refinement. No tools needed as analysis works on already-gathered information',
    strategy: 'task',
    role: 'analyze',
    tools: [],
    resolution: {
      maxCycles: 3,
      maxTokens: 8000,
      maxToolCalls: 0,
      timeoutMs: 43200000
    },
    lengthLevel: 'standard'
  },
  investigate: {
    name: 'investigate',
    rationale: 'Task strategy with tools for systematic discovery and examination. Multiple cycles support thorough exploration of external sources',
    strategy: 'task',
    role: 'investigate',
    tools: [
      'list_directory',
      'read_text_file', 'read_media_file', 'read_multiple_files',
      'search'
    ],
    resolution: {
      maxCycles: 5,
      maxTokens: 10000,
      maxToolCalls: 15,
      timeoutMs: 43200000
    },
    lengthLevel: 'standard'
  },
  synthesize: {
    name: 'synthesize',
    rationale: 'Direct synthesis integrates findings into unified framework. Comprehensive length for thorough presentation',
    strategy: 'direct',
    role: 'synthesize',
    lengthLevel: 'comprehensive'
  },
  execute: {
    name: 'execute',
    rationale: 'Task strategy with modification tools for chaining operations. Multiple cycles support verification and error handling',
    strategy: 'task',
    role: 'execute',
    tools: [
      'read_text_file', 'read_media_file', 'read_multiple_files',
      'write_file',
      'edit_file',
      'list_directory'
    ],
    resolution: {
      maxCycles: 8,
      maxTokens: 12000,
      maxToolCalls: 20,
      timeoutMs: 43200000
    },
    lengthLevel: 'standard'
  }
};

const rules = [
  // Plan precedence - defines priority order when multiple intents detected
  {
    name: 'define-plan-precedence',
    salience: -20,
    conditions: {
      exists: {
        type: 'ExecutionPlan'
      }
    },
    action: (facts, engine) => {
      engine.addFact(createFact.planPrecedence([
        'execute',      // Highest priority - user wants to do work
        'investigate',  // Search/find information
        'analyze',      // Understand/explain something
        'synthesize',   // Combine information
        'capture',      // Save information
        'readback',     // Retrieve information
        'chat'          // Lowest priority - casual conversation
      ]));
    }
  },

  // Chat intent
  {
    name: 'route-chat',
    conditions: {
      all: [
        { var: 'ctx', type: 'TurnContext' },
        { var: 's', type: 'Signal', test: (s) => s.dimension === 'intent' && s.signal === 'chat' },
        { test: (facts, bindings) => bindings.s.data.turnIndex === bindings.ctx.data.data.currentTurnIndex }
      ]
    },
    action: (facts, engine) => {
      engine.addFact(createFact.executionPlan(plans['chat']));
    }
  },

  // Capture intent
  {
    name: 'route-capture',
    conditions: {
      all: [
        { var: 'ctx', type: 'TurnContext' },
        { var: 's', type: 'Signal', test: (s) => s.dimension === 'intent' && s.signal === 'capture' },
        { test: (facts, bindings) => bindings.s.data.turnIndex === bindings.ctx.data.data.currentTurnIndex }
      ]
    },
    action: (facts, engine) => {
      engine.addFact(createFact.executionPlan(plans['capture']));
    }
  },

  // Readback intent
  {
    name: 'route-readback',
    conditions: {
      all: [
        { var: 'ctx', type: 'TurnContext' },
        { var: 's', type: 'Signal', test: (s) => s.dimension === 'intent' && s.signal === 'readback' },
        { test: (facts, bindings) => bindings.s.data.turnIndex === bindings.ctx.data.data.currentTurnIndex }
      ]
    },
    action: (facts, engine) => {
      engine.addFact(createFact.executionPlan(plans['readback']));
    }
  },

  // Analyze intent
  {
    name: 'route-analyze',
    conditions: {
      all: [
        { var: 'ctx', type: 'TurnContext' },
        { var: 's', type: 'Signal', test: (s) => s.dimension === 'intent' && s.signal === 'analyze' },
        { test: (facts, bindings) => bindings.s.data.turnIndex === bindings.ctx.data.data.currentTurnIndex }
      ]
    },
    action: (facts, engine) => {
      engine.addFact(createFact.executionPlan(plans['analyze']));
    }
  },

  // Investigate intent
  {
    name: 'route-investigate',
    conditions: {
      all: [
        { var: 'ctx', type: 'TurnContext' },
        { var: 's', type: 'Signal', test: (s) => s.dimension === 'intent' && s.signal === 'investigate' },
        { test: (facts, bindings) => bindings.s.data.turnIndex === bindings.ctx.data.data.currentTurnIndex }
      ]
    },
    action: (facts, engine) => {
      engine.addFact(createFact.executionPlan(plans['investigate']));
    }
  },

  // Synthesize intent
  {
    name: 'route-synthesize',
    conditions: {
      all: [
        { var: 'ctx', type: 'TurnContext' },
        { var: 's', type: 'Signal', test: (s) => s.dimension === 'intent' && s.signal === 'synthesize' },
        { test: (facts, bindings) => bindings.s.data.turnIndex === bindings.ctx.data.data.currentTurnIndex }
      ]
    },
    action: (facts, engine) => {
      engine.addFact(createFact.executionPlan(plans['synthesize']));
    }
  },

  // Execute intent
  {
    name: 'route-execute',
    conditions: {
      all: [
        { var: 'ctx', type: 'TurnContext' },
        { var: 's', type: 'Signal', test: (s) => s.dimension === 'intent' && s.signal === 'execute' },
        { test: (facts, bindings) => bindings.s.data.turnIndex === bindings.ctx.data.data.currentTurnIndex }
      ]
    },
    action: (facts, engine) => {
      engine.addFact(createFact.executionPlan(plans['execute']));
    }
  }
];

export default rules;
