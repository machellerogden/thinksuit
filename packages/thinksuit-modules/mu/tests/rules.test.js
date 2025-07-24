import { describe, it, expect, beforeEach } from 'vitest';
import { RulesEngine } from 'the-rules-engine';

import rules from '../rules.js';

describe('Core Module Rules', () => {
    let engine;

    beforeEach(() => {
        engine = new RulesEngine();
        // Add all rules to the engine
        rules.forEach((rule) => engine.addRule(rule));
    });

    // Helper function to run engine with facts and return query results
    function runEngine(facts) {
        // Add facts to engine
        facts.forEach((fact) => engine.addFact(fact));

        // Run the engine
        engine.run();

        // Return all facts for querying
        return engine.query().execute();
    }

    // Helper to find facts by type
    function findFactsByType(facts, type) {
        return facts.filter((f) => f.data.type === type).map((f) => f.data);
    }

    // Helper to find single fact by type
    function findFactByType(facts, type) {
        const fact = facts.find((f) => f.data.type === type);
        return fact ? fact.data : undefined;
    }

    describe('Contract-based Role Selection', () => {
        it('should select assistant with direct strategy for ack-only signal', () => {
            const facts = [
                { type: 'Signal', dimension: 'contract', signal: 'ack-only', confidence: 0.8 }
            ];

            const results = runEngine(facts);

            const roleSelection = findFactByType(results, 'RoleSelection');
            const executionPlan = findFactByType(results, 'ExecutionPlan');
            const tokenMultiplier = findFactByType(results, 'TokenMultiplier');

            expect(roleSelection).toBeDefined();
            expect(roleSelection.role).toBe('assistant');
            expect(roleSelection.confidence).toBe(0.95);

            expect(executionPlan).toBeDefined();
            expect(executionPlan.strategy).toBe('direct');

            expect(tokenMultiplier).toBeDefined();
            expect(tokenMultiplier.value).toBe(0.5);
        });

        it('should select assistant for capture-only signal', () => {
            const facts = [
                { type: 'Signal', dimension: 'contract', signal: 'capture-only', confidence: 0.85 }
            ];

            const results = runEngine(facts);

            const roleSelection = findFactByType(results, 'RoleSelection');
            expect(roleSelection.role).toBe('assistant');
            expect(roleSelection.confidence).toBe(0.95);
        });

        it('should select analyzer for analyze contract signal', () => {
            const facts = [
                { type: 'Signal', dimension: 'contract', signal: 'analyze', confidence: 0.75 }
            ];

            const results = runEngine(facts);

            const roleSelection = findFactByType(results, 'RoleSelection');
            expect(roleSelection).toBeDefined();
            expect(roleSelection.role).toBe('analyzer');
            expect(roleSelection.confidence).toBe(0.9);
        });

        it('should select explorer for explore contract signal', () => {
            const facts = [
                { type: 'Signal', dimension: 'contract', signal: 'explore', confidence: 0.8 }
            ];

            const results = runEngine(facts);

            const roleSelection = findFactByType(results, 'RoleSelection');
            expect(roleSelection).toBeDefined();
            expect(roleSelection.role).toBe('explorer');
            expect(roleSelection.confidence).toBe(0.9);
        });
    });

    describe('Claim-based Role Selection', () => {
        it('should select critic for universal claims', () => {
            const facts = [
                { type: 'Signal', dimension: 'claim', signal: 'universal', confidence: 0.75 }
            ];

            const results = runEngine(facts);

            const roleSelection = findFactByType(results, 'RoleSelection');
            expect(roleSelection).toBeDefined();
            expect(roleSelection.role).toBe('critic');
            expect(roleSelection.confidence).toBe(0.85);
        });

        it('should select planner for forecast claims', () => {
            const facts = [
                { type: 'Signal', dimension: 'claim', signal: 'forecast', confidence: 0.8 }
            ];

            const results = runEngine(facts);

            const roleSelection = findFactByType(results, 'RoleSelection');
            expect(roleSelection).toBeDefined();
            expect(roleSelection.role).toBe('planner');
            expect(roleSelection.confidence).toBe(0.85);
        });

        it('should select reflector for normative claims', () => {
            const facts = [
                { type: 'Signal', dimension: 'claim', signal: 'normative', confidence: 0.75 }
            ];

            const results = runEngine(facts);

            const roleSelection = findFactByType(results, 'RoleSelection');
            expect(roleSelection).toBeDefined();
            expect(roleSelection.role).toBe('reflector');
            expect(roleSelection.confidence).toBe(0.85);
        });
    });

    describe('Support-based Role Selection', () => {
        it('should select synthesizer for source-cited support', () => {
            const facts = [
                { type: 'Signal', dimension: 'support', signal: 'source-cited', confidence: 0.75 }
            ];

            const results = runEngine(facts);

            const roleSelection = findFactByType(results, 'RoleSelection');
            expect(roleSelection).toBeDefined();
            expect(roleSelection.role).toBe('synthesizer');
            expect(roleSelection.confidence).toBe(0.8);
        });

        it('should select analyzer for tool-result-attached support', () => {
            const facts = [
                {
                    type: 'Signal',
                    dimension: 'support',
                    signal: 'tool-result-attached',
                    confidence: 0.8
                }
            ];

            const results = runEngine(facts);

            const roleSelection = findFactByType(results, 'RoleSelection');
            expect(roleSelection).toBeDefined();
            expect(roleSelection.role).toBe('analyzer');
            expect(roleSelection.confidence).toBe(0.8);
        });
    });

    describe('Orchestration Patterns', () => {
        it('should create sequential explore-then-analyze plan', () => {
            const facts = [
                { type: 'Signal', dimension: 'contract', signal: 'explore', confidence: 0.75 },
                { type: 'Signal', dimension: 'claim', signal: 'high-quantifier', confidence: 0.65 }
            ];

            const results = runEngine(facts);

            const executionPlans = findFactsByType(results, 'ExecutionPlan');
            const sequentialPlan = executionPlans.find(
                (p) => p.strategy === 'sequential' && p.sequence &&
                p.sequence.some(step => (typeof step === 'string' ? step : step.role) === 'explorer')
            );

            expect(sequentialPlan).toBeDefined();
            expect(sequentialPlan.sequence).toEqual([
                { role: 'explorer', strategy: 'task', tools: ['list_directory', 'read_file', 'search'] },
                { role: 'analyzer', strategy: 'direct' }
            ]);
            expect(sequentialPlan.confidence).toBe(0.85);
        });

        it('should create full analysis suite for complex analysis', () => {
            const facts = [
                { type: 'Signal', dimension: 'contract', signal: 'analyze', confidence: 0.85 },
                { type: 'Signal', dimension: 'claim', signal: 'universal', confidence: 0.65 },
                { type: 'Signal', dimension: 'support', signal: 'source-cited', confidence: 0.7 }
            ];

            const results = runEngine(facts);

            const executionPlans = findFactsByType(results, 'ExecutionPlan');
            const fullSuite = executionPlans.find(
                (p) => p.strategy === 'sequential' && p.sequence?.length === 3
            );

            expect(fullSuite).toBeDefined();
            expect(fullSuite.sequence).toEqual([
                { role: 'analyzer', strategy: 'task', tools: ['list_directory', 'read_file', 'search'] },
                { role: 'critic', strategy: 'direct' },
                { role: 'synthesizer', strategy: 'direct' }
            ]);
            expect(fullSuite.confidence).toBe(0.9);
        });

        it('should create optimization flow for tool results', () => {
            const facts = [
                { type: 'Signal', dimension: 'contract', signal: 'analyze', confidence: 0.75 },
                {
                    type: 'Signal',
                    dimension: 'support',
                    signal: 'tool-result-attached',
                    confidence: 0.8
                }
            ];

            const results = runEngine(facts);

            const executionPlans = findFactsByType(results, 'ExecutionPlan');
            const optimizerPlans = executionPlans.filter(
                (p) => p.strategy === 'sequential' && p.sequence?.some(s =>
                    (typeof s === 'string' ? s : s?.role) === 'optimizer'
                )
            );
            
            // Three rules should fire: tool-result-optimization-flow, optimization-flow, and tool-result-interpret-optimize
            expect(optimizerPlans.length).toBe(3);
            
            // Find the highest confidence plan (what the system would select)
            const optimizationPlan = optimizerPlans.sort((a, b) => b.confidence - a.confidence)[0];

            expect(optimizationPlan).toBeDefined();
            expect(optimizationPlan.sequence).toEqual([
                { role: 'analyzer', strategy: 'task' },
                { role: 'optimizer', strategy: 'direct' }
            ]);
            expect(optimizationPlan.confidence).toBe(0.85); // Highest confidence plan
        });

        it('should create parallel integration for complex exploration', () => {
            const facts = [
                { type: 'Signal', dimension: 'contract', signal: 'explore', confidence: 0.7 },
                { type: 'Signal', dimension: 'claim', signal: 'forecast', confidence: 0.65 },
                { type: 'Signal', dimension: 'claim', signal: 'normative', confidence: 0.7 }
            ];

            const results = runEngine(facts);

            const executionPlans = findFactsByType(results, 'ExecutionPlan');
            const parallelPlan = executionPlans.find((p) => p.strategy === 'parallel');

            expect(parallelPlan).toBeDefined();
            expect(parallelPlan.roles).toContain('planner');
            expect(parallelPlan.roles).toContain('reflector');
            expect(parallelPlan.roles).toContain('integrator');
            expect(parallelPlan.confidence).toBe(0.8);
        });
    });

    describe('Composite Adaptations', () => {
        it('should detect high-certainty with no-date mismatch', () => {
            const facts = [
                {
                    type: 'Signal',
                    dimension: 'calibration',
                    signal: 'high-certainty',
                    confidence: 0.75
                },
                { type: 'Signal', dimension: 'temporal', signal: 'no-date', confidence: 0.8 }
            ];

            const results = runEngine(facts);

            const derived = findFactByType(results, 'Derived');
            
            expect(derived).toBeDefined();
            expect(derived.name).toBe('temporal-certainty-mismatch');
            // The rule creates 'directive' not 'instruction' 
            expect(derived.directive).toContain('temporal context');
            // Derived facts don't have confidence, remove this assertion
        });

        it('should detect anecdotal overgeneralization', () => {
            const facts = [
                { type: 'Signal', dimension: 'support', signal: 'anecdote', confidence: 0.75 },
                { type: 'Signal', dimension: 'claim', signal: 'universal', confidence: 0.8 }
            ];

            const results = runEngine(facts);

            const derived = findFactByType(results, 'Derived');
            expect(derived).toBeDefined();
            expect(derived.name).toBe('anecdotal-overgeneralization');
            // The rule creates 'directive' not 'instruction'
            expect(derived.directive).toContain('systematic investigation');
            // Derived facts don't have confidence, remove this assertion

            // Should also select critic role (from universal claim rule with salience 55)
            const roleSelection = findFactByType(results, 'RoleSelection');
            expect(roleSelection.role).toBe('critic');
            expect(roleSelection.confidence).toBe(0.85); // From critic-for-universal-claims rule
        });
    });

    describe('Token Adjustments', () => {
        it('should reduce tokens for brief responses', () => {
            const facts = [
                { type: 'Signal', dimension: 'contract', signal: 'ack-only', confidence: 0.85 }
            ];

            const results = runEngine(facts);

            const tokenMultipliers = findFactsByType(results, 'TokenMultiplier');
            // Should have two multipliers: 0.5 from ack-only rule and 0.4 from brief rule
            expect(tokenMultipliers.length).toBe(2);
            expect(tokenMultipliers.some((t) => t.value === 0.5)).toBe(true);
            expect(tokenMultipliers.some((t) => t.value === 0.4)).toBe(true);
        });

        it('should increase tokens for exploration', () => {
            const facts = [
                { type: 'Signal', dimension: 'contract', signal: 'explore', confidence: 0.85 }
            ];

            const results = runEngine(facts);

            const tokenMultipliers = findFactsByType(results, 'TokenMultiplier');
            const increasedToken = tokenMultipliers.find((t) => t.value === 1.3);
            expect(increasedToken).toBeDefined();
        });
    });

    describe('Default Fallback', () => {
        it('should select assistant by default when no signals match', () => {
            const facts = [
                { type: 'Signal', dimension: 'temporal', signal: 'time-specified', confidence: 0.4 }
            ];

            const results = runEngine(facts);

            const roleSelection = findFactByType(results, 'RoleSelection');
            const executionPlan = findFactByType(results, 'ExecutionPlan');

            expect(roleSelection).toBeDefined();
            expect(roleSelection.role).toBe('assistant');
            expect(roleSelection.confidence).toBe(0.7);

            expect(executionPlan).toBeDefined();
            expect(executionPlan.strategy).toBe('task');
            // ExecutionPlan from default-assistant rule doesn't have confidence in the root
            // It's in the resolution object
        });
    });

    describe('Rule Priority (Salience)', () => {
        it('should prioritize high-salience rules', () => {
            // Both ack-only (salience 100) and explore (salience 60) signals present
            // ack-only should win due to higher salience
            const facts = [
                { type: 'Signal', dimension: 'contract', signal: 'ack-only', confidence: 0.8 },
                { type: 'Signal', dimension: 'contract', signal: 'explore', confidence: 0.8 }
            ];

            const results = runEngine(facts);

            const roleSelection = findFactByType(results, 'RoleSelection');
            const executionPlan = findFactByType(results, 'ExecutionPlan');

            // ack-only rule should win
            expect(roleSelection.role).toBe('assistant');
            expect(roleSelection.confidence).toBe(0.95);
            expect(executionPlan.strategy).toBe('direct');
        });

        it('should handle complex signal combinations with critic for high-certainty + no support', () => {
            const facts = [
                {
                    type: 'Signal',
                    dimension: 'calibration',
                    signal: 'high-certainty',
                    confidence: 0.75
                },
                { type: 'Signal', dimension: 'support', signal: 'none', confidence: 0.8 }
            ];

            const results = runEngine(facts);

            const roleSelection = findFactByType(results, 'RoleSelection');
            expect(roleSelection).toBeDefined();
            expect(roleSelection.role).toBe('critic');
            expect(roleSelection.confidence).toBe(0.9);

            const tokenMultiplier = findFactByType(results, 'TokenMultiplier');
            expect(tokenMultiplier).toBeDefined();
            expect(tokenMultiplier.value).toBe(0.8);
        });
    });

    describe('Edge Cases', () => {
        it('should handle multiple signals below confidence threshold', () => {
            const facts = [
                { type: 'Signal', dimension: 'contract', signal: 'analyze', confidence: 0.5 },
                { type: 'Signal', dimension: 'claim', signal: 'universal', confidence: 0.4 }
            ];

            const results = runEngine(facts);

            // Should fall back to default
            const roleSelection = findFactByType(results, 'RoleSelection');
            expect(roleSelection.role).toBe('assistant');
            expect(roleSelection.confidence).toBe(0.7);
        });

        it('should handle empty facts array', () => {
            const facts = [];

            const results = runEngine(facts);

            // Should apply default rule
            const roleSelection = findFactByType(results, 'RoleSelection');
            expect(roleSelection).toBeDefined();
            expect(roleSelection.role).toBe('assistant');
        });

        it('should handle non-signal facts gracefully', () => {
            const facts = [
                { type: 'Random', data: 'test' },
                { type: 'Signal', dimension: 'contract', signal: 'explore', confidence: 0.8 }
            ];

            const results = runEngine(facts);

            // Should still process the valid signal
            const roleSelection = findFactByType(results, 'RoleSelection');
            expect(roleSelection).toBeDefined();
            expect(roleSelection.role).toBe('explorer');
        });
    });

    describe('Tool Integration', () => {
        it('should include tools in ExecutionPlan when explore signal and tools config are present', () => {
            const facts = [
                { type: 'Signal', dimension: 'contract', signal: 'explore', confidence: 0.8 },
                { type: 'ToolAvailability', data: { tools: ['read_file', 'list_directory'] } }
            ];

            const results = runEngine(facts);
            const executionPlans = findFactsByType(results, 'ExecutionPlan');
            
            // Should have at least one execution plan with tools
            const planWithTools = executionPlans.find(p => p.tools && p.tools.length > 0);
            expect(planWithTools).toBeDefined();
            expect(planWithTools.tools).toContain('read_file');
            expect(planWithTools.tools).toContain('list_directory');
        });

        it('should include tools in ExecutionPlan when analyze signal and tools config are present', () => {
            const facts = [
                { type: 'Signal', dimension: 'contract', signal: 'analyze', confidence: 0.8 },
                { type: 'ToolAvailability', data: { tools: ['read_file', 'list_directory'] } }
            ];

            const results = runEngine(facts);
            const executionPlans = findFactsByType(results, 'ExecutionPlan');
            
            // Should have at least one execution plan with tools
            const planWithTools = executionPlans.find(p => p.tools && p.tools.length > 0);
            expect(planWithTools).toBeDefined();
            expect(planWithTools.tools).toContain('read_file');
        });

        it('should include tools in plans even when ToolAvailability is missing', () => {
            // Plans now declare their tool requirements regardless of ToolAvailability
            // Actual filtering happens at runtime based on user's --allow-tools
            const facts = [
                { type: 'Signal', dimension: 'contract', signal: 'explore', confidence: 0.8 }
            ];

            const results = runEngine(facts);
            const executionPlans = findFactsByType(results, 'ExecutionPlan');

            // Plans should exist and declare their tool requirements
            expect(executionPlans.length).toBeGreaterThan(0);
            const plansWithTools = executionPlans.filter(p => p.tools && p.tools.length > 0);
            expect(plansWithTools.length).toBeGreaterThan(0);
        });
    });
});
