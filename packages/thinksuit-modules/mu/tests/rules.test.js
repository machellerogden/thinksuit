/**
 * Rules Tests
 * Tests intent-based routing to execution plans using the-rules-engine
 */

import { describe, it, expect } from 'vitest';
import { RulesEngine } from 'the-rules-engine';
import rules from '../rules.js';
import { createFact } from '../facts.js';

describe('Mu Rules', () => {
    describe('intent routing', () => {
        it('should route capture intent to capture role', () => {
            const engine = new RulesEngine();
            rules.forEach(rule => engine.addRule(rule));

            const currentTurnIndex = 1;
            const turnContext = { type: 'TurnContext', data: { currentTurnIndex } };
            const signal = { ...createFact.signal('intent', 'capture', 0.9), turnIndex: currentTurnIndex };

            engine.addFact(turnContext);
            engine.addFact(signal);
            engine.run();

            const executionPlans = engine.query('ExecutionPlan').execute();

            expect(executionPlans).toHaveLength(1);
            expect(executionPlans[0].data.role).toBe('capture');
            expect(executionPlans[0].data.strategy).toBe('direct');
            expect(executionPlans[0].data.lengthLevel).toBe('brief');
        });

        it('should route readback intent to readback role', () => {
            const engine = new RulesEngine();
            rules.forEach(rule => engine.addRule(rule));

            const currentTurnIndex = 1;
            const turnContext = { type: 'TurnContext', data: { currentTurnIndex } };
            const signal = { ...createFact.signal('intent', 'readback', 0.9), turnIndex: currentTurnIndex };

            engine.addFact(turnContext);
            engine.addFact(signal);
            engine.run();

            const executionPlans = engine.query('ExecutionPlan').execute();

            expect(executionPlans).toHaveLength(1);
            expect(executionPlans[0].data.role).toBe('readback');
            expect(executionPlans[0].data.strategy).toBe('direct');
        });

        it('should route analyze intent to analyze role', () => {
            const engine = new RulesEngine();
            rules.forEach(rule => engine.addRule(rule));

            const currentTurnIndex = 1;
            const turnContext = { type: 'TurnContext', data: { currentTurnIndex } };
            const signal = { ...createFact.signal('intent', 'analyze', 0.8), turnIndex: currentTurnIndex };

            engine.addFact(turnContext);
            engine.addFact(signal);
            engine.run();

            const executionPlans = engine.query('ExecutionPlan').execute();

            expect(executionPlans).toHaveLength(1);
            expect(executionPlans[0].data.role).toBe('analyze');
            expect(executionPlans[0].data.strategy).toBe('task');
        });

        it('should route investigate intent to investigate role with tools', () => {
            const engine = new RulesEngine();
            rules.forEach(rule => engine.addRule(rule));

            const currentTurnIndex = 1;
            const turnContext = { type: 'TurnContext', data: { currentTurnIndex } };
            const signal = { ...createFact.signal('intent', 'investigate', 0.9), turnIndex: currentTurnIndex };

            engine.addFact(turnContext);
            engine.addFact(signal);
            engine.run();

            const executionPlans = engine.query('ExecutionPlan').execute();

            expect(executionPlans).toHaveLength(1);
            expect(executionPlans[0].data.role).toBe('investigate');
            expect(executionPlans[0].data.strategy).toBe('task');
            expect(executionPlans[0].data.tools).toBeDefined();
            expect(executionPlans[0].data.tools).toContain('read_file');
            expect(executionPlans[0].data.resolution).toBeDefined();
            expect(executionPlans[0].data.resolution.maxCycles).toBe(5);
        });

        it('should route synthesize intent to synthesize role', () => {
            const engine = new RulesEngine();
            rules.forEach(rule => engine.addRule(rule));

            const currentTurnIndex = 1;
            const turnContext = { type: 'TurnContext', data: { currentTurnIndex } };
            const signal = { ...createFact.signal('intent', 'synthesize', 0.8), turnIndex: currentTurnIndex };

            engine.addFact(turnContext);
            engine.addFact(signal);
            engine.run();

            const executionPlans = engine.query('ExecutionPlan').execute();

            expect(executionPlans).toHaveLength(1);
            expect(executionPlans[0].data.role).toBe('synthesize');
            expect(executionPlans[0].data.strategy).toBe('direct');
            expect(executionPlans[0].data.lengthLevel).toBe('comprehensive');
        });

        it('should route execute intent to execute role with tools', () => {
            const engine = new RulesEngine();
            rules.forEach(rule => engine.addRule(rule));

            const currentTurnIndex = 1;
            const turnContext = { type: 'TurnContext', data: { currentTurnIndex } };
            const signal = { ...createFact.signal('intent', 'execute', 0.9), turnIndex: currentTurnIndex };

            engine.addFact(turnContext);
            engine.addFact(signal);
            engine.run();

            const executionPlans = engine.query('ExecutionPlan').execute();

            expect(executionPlans).toHaveLength(1);
            expect(executionPlans[0].data.role).toBe('execute');
            expect(executionPlans[0].data.strategy).toBe('task');
            expect(executionPlans[0].data.tools).toBeDefined();
            expect(executionPlans[0].data.tools).toContain('write_file');
            expect(executionPlans[0].data.resolution).toBeDefined();
            expect(executionPlans[0].data.resolution.maxCycles).toBe(8);
        });
    });

    describe('edge cases', () => {
        it('should not fire any rules when no intent signals present', () => {
            const engine = new RulesEngine();
            rules.forEach(rule => engine.addRule(rule));

            // Add a non-intent signal
            const signal = createFact.signal('other', 'something', 0.9);
            engine.addFact(signal);
            engine.run();

            const executionPlans = engine.query('ExecutionPlan').execute();
            expect(executionPlans).toHaveLength(0);
        });

        it('should handle multiple intent signals', () => {
            const engine = new RulesEngine();
            rules.forEach(rule => engine.addRule(rule));

            const currentTurnIndex = 1;
            const turnContext = { type: 'TurnContext', data: { currentTurnIndex } };

            engine.addFact(turnContext);
            engine.addFact({ ...createFact.signal('intent', 'analyze', 0.7), turnIndex: currentTurnIndex });
            engine.addFact({ ...createFact.signal('intent', 'investigate', 0.8), turnIndex: currentTurnIndex });
            engine.run();

            const executionPlans = engine.query('ExecutionPlan').execute();

            // Both rules should fire
            expect(executionPlans.length).toBeGreaterThanOrEqual(2);
            const roles = executionPlans.map(p => p.data.role);
            expect(roles).toContain('analyze');
            expect(roles).toContain('investigate');
        });
    });
});
