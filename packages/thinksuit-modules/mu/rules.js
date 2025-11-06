/**
 * Mu Rules - Intent-based role routing
 * Maps detected intent signals to appropriate roles
 */

import { createFact } from './facts.js';
import { planLibrary } from './planLibrary.js';

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
      engine.addFact(createFact.executionPlan(planLibrary['chat-turn']));
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
      engine.addFact(createFact.executionPlan(planLibrary['capture-turn']));
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
      engine.addFact(createFact.executionPlan(planLibrary['readback-turn']));
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
      engine.addFact(createFact.executionPlan(planLibrary['analyze-turn']));
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
      engine.addFact(createFact.executionPlan(planLibrary['investigate-task']));
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
      engine.addFact(createFact.executionPlan(planLibrary['synthesize-turn']));
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
      engine.addFact(createFact.executionPlan(planLibrary['execute-task']));
    }
  }
];

export default rules;
