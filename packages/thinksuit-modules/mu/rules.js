/**
 * Mu Rules - Intent-based role routing
 * Maps detected intent signals to appropriate roles
 */

import { createFact } from './facts.js';

const DEFAULT_TIMEOUT_MS = 1000 * 60 * 60 * 12;

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
        'execute-task',      // Highest priority - user wants to do work
        'investigate-task',  // Search/find information
        'analyze-turn',      // Understand/explain something
        'synthesize-turn',   // Combine information
        'capture-turn',      // Save information
        'readback-turn',     // Retrieve information
        'chat-turn'          // Lowest priority - casual conversation
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
      engine.addFact(createFact.executionPlan('direct', {
        name: 'chat-turn',
        role: 'chat',
        lengthLevel: 'brief'
      }));
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
      all: [
        { var: 'ctx', type: 'TurnContext' },
        { var: 's', type: 'Signal', test: (s) => s.dimension === 'intent' && s.signal === 'readback' },
        { test: (facts, bindings) => bindings.s.data.turnIndex === bindings.ctx.data.data.currentTurnIndex }
      ]
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
      all: [
        { var: 'ctx', type: 'TurnContext' },
        { var: 's', type: 'Signal', test: (s) => s.dimension === 'intent' && s.signal === 'analyze' },
        { test: (facts, bindings) => bindings.s.data.turnIndex === bindings.ctx.data.data.currentTurnIndex }
      ]
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
      all: [
        { var: 'ctx', type: 'TurnContext' },
        { var: 's', type: 'Signal', test: (s) => s.dimension === 'intent' && s.signal === 'investigate' },
        { test: (facts, bindings) => bindings.s.data.turnIndex === bindings.ctx.data.data.currentTurnIndex }
      ]
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
      all: [
        { var: 'ctx', type: 'TurnContext' },
        { var: 's', type: 'Signal', test: (s) => s.dimension === 'intent' && s.signal === 'synthesize' },
        { test: (facts, bindings) => bindings.s.data.turnIndex === bindings.ctx.data.data.currentTurnIndex }
      ]
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
      all: [
        { var: 'ctx', type: 'TurnContext' },
        { var: 's', type: 'Signal', test: (s) => s.dimension === 'intent' && s.signal === 'execute' },
        { test: (facts, bindings) => bindings.s.data.turnIndex === bindings.ctx.data.data.currentTurnIndex }
      ]
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
