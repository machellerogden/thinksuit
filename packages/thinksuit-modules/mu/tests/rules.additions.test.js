import { describe, it, expect } from 'vitest';
import { evaluateRulesCore } from 'thinksuit';
import moduleUnderTest from '../index.js';

const noopLogger = { info() {}, debug() {}, warn() {}, error() {}, trace() {} };

async function evalWithSignals(signals) {
    const machineContext = {
        module: moduleUnderTest,
        config: { trace: false },
        execLogger: noopLogger
    };
    const input = { facts: signals, context: { traceId: 't-1' } };
    const { factMap } = await evaluateRulesCore(input, machineContext);
    return factMap;
}

function sig(dim, signal, confidence = 0.8) {
    return { type: 'Signal', dimension: dim, signal, confidence };
}

describe('mu rule additions', () => {
    it('triage-hedged-unsupported -> sequential analyze→explore→synthesize', async () => {
        const fm = await evalWithSignals([sig('calibration', 'hedged'), sig('support', 'none')]);
        const plan = fm.ExecutionPlan.find((p) => p.strategy === 'sequential');
        expect(plan).toBeTruthy();
        expect(plan.sequence.map((s) => (typeof s === 'string' ? s : s.role))).toEqual([
            'analyzer',
            'explorer',
            'synthesizer'
        ]);
        expect(plan.buildThread).toBe(true);
        expect(plan.resultStrategy).toBe('last');
    });

    it('red-team-forecast -> parallel planner+critic', async () => {
        const fm = await evalWithSignals([
            sig('claim', 'forecast'),
            sig('calibration', 'high-certainty')
        ]);
        const plan = fm.ExecutionPlan.find((p) => p.strategy === 'parallel');
        expect(plan).toBeTruthy();
        expect(plan.roles).toEqual([
            { role: 'planner', strategy: 'direct' },
            { role: 'critic', strategy: 'direct' }
        ]);
        expect(plan.resultStrategy).toBe('label');
    });

    it('normative-without-support -> sequential reflector→critic→planner', async () => {
        const fm = await evalWithSignals([sig('claim', 'normative'), sig('support', 'none')]);
        const plan = fm.ExecutionPlan.find(
            (p) => p.strategy === 'sequential' && p.sequence?.some(s =>
                (typeof s === 'string' ? s : s.role) === 'reflector'
            )
        );
        expect(plan).toBeTruthy();
        expect(plan.sequence).toEqual([
            { role: 'reflector', strategy: 'direct' },
            { role: 'critic', strategy: 'direct' },
            { role: 'planner', strategy: 'direct' }
        ]);
        expect(plan.resultStrategy).toBe('label');
    });

    it('quantification-needed -> analyzer task with quantification request', async () => {
        const fm = await evalWithSignals([
            sig('claim', 'high-quantifier'),
            sig('support', 'none', 0.7)
        ]);
        const plan = fm.ExecutionPlan.find(
            (p) => p.strategy === 'task' && p.role === 'analyzer'
        );
        expect(plan).toBeTruthy();
        const hasDirective = fm.Adaptation.some((a) => a.signal === 'quantification-request');
        expect(hasDirective).toBe(true);
    });

    it('forecast-missing-timeframe -> planner direct with temporal request', async () => {
        const fm = await evalWithSignals([sig('claim', 'forecast'), sig('temporal', 'no-date')]);
        const plan = fm.ExecutionPlan.find((p) => p.strategy === 'direct' && p.role === 'planner');
        expect(plan).toBeTruthy();
        const hasDirective = fm.Adaptation.some(
            (a) => a.directive === 'temporal-assumption-request'
        );
        expect(hasDirective).toBe(true);
        // Check for token reduction
        const tokenMultiplier = fm.TokenMultiplier.find((t) => t.value === 0.95);
        expect(tokenMultiplier).toBeTruthy();
    });

    it('universal-with-sources -> sequential critic→synthesizer', async () => {
        const fm = await evalWithSignals([
            sig('claim', 'universal'),
            sig('support', 'source-cited')
        ]);
        const plan = fm.ExecutionPlan.find(
            (p) =>
                p.strategy === 'sequential' &&
                p.sequence?.some(s => (typeof s === 'string' ? s : s.role) === 'critic') &&
                p.sequence?.some(s => (typeof s === 'string' ? s : s.role) === 'synthesizer')
        );
        expect(plan).toBeTruthy();
        expect(plan.sequence).toEqual([
            { role: 'critic', strategy: 'direct' },
            { role: 'synthesizer', strategy: 'direct' }
        ]);
        expect(plan.resultStrategy).toBe('concat');
    });

    it('tool-result-interpret-optimize -> sequential analyzer→optimizer', async () => {
        const fm = await evalWithSignals([sig('support', 'tool-result-attached')]);
        const plan = fm.ExecutionPlan.find(
            (p) =>
                p.strategy === 'sequential' &&
                p.sequence?.some(s => (typeof s === 'string' ? s : s.role) === 'analyzer') &&
                p.sequence?.some(s => (typeof s === 'string' ? s : s.role) === 'optimizer')
        );
        expect(plan).toBeTruthy();
        expect(plan.sequence).toEqual([
            { role: 'analyzer', strategy: 'task' },
            { role: 'optimizer', strategy: 'direct' }
        ]);
        expect(plan.resultStrategy).toBe('last');
    });

    it('inner-outer-to-plan -> extended debate with planner', async () => {
        const fm = await evalWithSignals([
            sig('claim', 'normative'),
            sig('calibration', 'hedged', 0.65)
        ]);
        const plan = fm.ExecutionPlan.find(
            (p) => p.strategy === 'sequential' && p.sequence?.length === 5
        );
        expect(plan).toBeTruthy();
        expect(plan.buildThread).toBe(true);
        expect(plan.resultStrategy).toBe('last');

        // Check the sequence structure
        const sequence = plan.sequence;
        expect(sequence[0]).toEqual({
            role: 'outer_voice',
            adaptationKey: 'outer_voice_opening'
        });
        expect(sequence[1]).toEqual({
            role: 'inner_voice',
            adaptationKey: 'inner_voice_response'
        });
        expect(sequence[2]).toEqual({
            role: 'outer_voice',
            adaptationKey: 'outer_voice_challenge'
        });
        expect(sequence[3]).toEqual({
            role: 'reflector',
            adaptationKey: 'convergence_synthesis'
        });
        expect(sequence[4]).toEqual({
            role: 'planner',
            adaptationKey: 'planning_synthesis'
        });

        // Check for increased token budget
        const tokenMultiplier = fm.TokenMultiplier.find((t) => t.value === 1.2);
        expect(tokenMultiplier).toBeTruthy();
    });

    it('rules should not conflict - test multiple signal combinations', async () => {
        // Test that multiple rules can fire without conflict
        const fm = await evalWithSignals([
            sig('claim', 'universal'),
            sig('claim', 'forecast'),
            sig('support', 'source-cited'),
            sig('calibration', 'high-certainty'),
            sig('temporal', 'no-date')
        ]);

        // Should have multiple execution plans due to different rule triggers
        expect(fm.ExecutionPlan.length).toBeGreaterThan(0);

        // Token multipliers should be present
        expect(fm.TokenMultiplier.length).toBeGreaterThan(0);
    });
});
