import { describe, it, expect } from 'vitest';
import { buildSessionTree } from '../../../engine/sessions/tree.js';

// Fixtures are authored inline in the CURRENT session vocabulary (post de-pipelining):
// a turn contains an `execution` boundary per plan node; task/sequence/parallel all use
// boundaryType 'execution' and are told apart by metadata (task=role, sequence=steps,
// parallel=branches). LLM work nests under a task as an `llm_exchange` boundary. Composite
// children nest under the composite boundary (executePlan threads parentBoundaryId).

// Stamp increasing timestamps so array order == chronological order.
const stamp = (events) =>
    events.map((e, i) => ({ ...e, time: `2025-01-01T00:00:${String(i).padStart(2, '0')}Z` }));

const llm = (id, parent) => [
    { event: 'processing.llm.request', eventRole: 'boundary_start', boundaryType: 'llm_exchange', boundaryId: id, parentBoundaryId: parent, data: {} },
    { event: 'processing.llm.response', eventRole: 'boundary_end', boundaryType: 'llm_exchange', boundaryId: id, parentBoundaryId: parent, data: {} }
];

const task = (id, parent, role) => [
    { event: 'execution.task.start', eventRole: 'boundary_start', boundaryType: 'execution', boundaryId: id, parentBoundaryId: parent, data: { role, maxRounds: 1 } },
    ...llm(`${id}-llm`, id),
    { event: 'execution.task.complete', eventRole: 'boundary_end', boundaryType: 'execution', boundaryId: id, parentBoundaryId: parent, data: { role } }
];

const pending = { event: 'session.pending' };
const turnStart = { event: 'session.turn.start', eventRole: 'boundary_start', boundaryType: 'turn', boundaryId: 'turn-1', parentBoundaryId: 'session-1' };
const input = { event: 'session.input', parentBoundaryId: 'turn-1', data: { input: 'hi' } };
const response = { event: 'session.response', parentBoundaryId: 'turn-1', data: { response: 'ok' } };
const turnComplete = { event: 'session.turn.complete', eventRole: 'boundary_end', boundaryType: 'turn', boundaryId: 'turn-1', parentBoundaryId: 'session-1' };

const taskSession = stamp([
    pending, turnStart, input,
    ...task('task-1', 'turn-1', 'chat'),
    response, turnComplete
]);

const sequenceSession = stamp([
    pending, turnStart, input,
    { event: 'execution.sequential.start', eventRole: 'boundary_start', boundaryType: 'execution', boundaryId: 'seq-1', parentBoundaryId: 'turn-1', data: { steps: 2 } },
    ...task('task-1', 'seq-1', 'investigate'),
    ...task('task-2', 'seq-1', 'synthesize'),
    { event: 'execution.sequential.complete', eventRole: 'boundary_end', boundaryType: 'execution', boundaryId: 'seq-1', parentBoundaryId: 'turn-1', data: { steps: 2 } },
    response, turnComplete
]);

const parallelSession = stamp([
    pending, turnStart, input,
    { event: 'execution.parallel.start', eventRole: 'boundary_start', boundaryType: 'execution', boundaryId: 'par-1', parentBoundaryId: 'turn-1', data: { branches: 2 } },
    ...task('task-1', 'par-1', 'analyze'),
    ...task('task-2', 'par-1', 'critic'),
    { event: 'execution.parallel.complete', eventRole: 'boundary_end', boundaryType: 'execution', boundaryId: 'par-1', parentBoundaryId: 'turn-1', data: { branches: 2 } },
    response, turnComplete
]);

// A turn's plan-node boundaries (execution) are its execution children.
const executionsOf = (turn) => turn.children.filter((c) => c.type === 'execution');
const turnOf = (tree) => tree.children.find((c) => c.type === 'turn');

describe('buildSessionTree', () => {
    describe('Expected structure', () => {
        it('nests a task under the turn, with its llm_exchange inside', () => {
            const tree = buildSessionTree(taskSession);
            expect(tree.type).toBe('root');

            const turn = turnOf(tree);
            expect(turn).toBeDefined();

            const [taskNode] = executionsOf(turn);
            expect(taskNode.metadata.role).toBe('chat');

            const llmExchanges = taskNode.children.filter((c) => c.type === 'llm_exchange');
            expect(llmExchanges.length).toBe(1);
        });

        it('nests sequence steps (tasks) under the sequence boundary', () => {
            const tree = buildSessionTree(sequenceSession);
            const turn = turnOf(tree);

            const sequence = executionsOf(turn).find((e) => e.metadata.steps === 2);
            expect(sequence).toBeDefined();

            const steps = sequence.children.filter((c) => c.type === 'execution');
            expect(steps.map((s) => s.metadata.role)).toEqual(['investigate', 'synthesize']);
            // each step carries its own llm exchange
            steps.forEach((s) => {
                expect(s.children.some((c) => c.type === 'llm_exchange')).toBe(true);
            });
        });

        it('nests parallel branches (tasks) under the parallel boundary', () => {
            const tree = buildSessionTree(parallelSession);
            const turn = turnOf(tree);

            const parallel = executionsOf(turn).find((e) => e.metadata.branches === 2);
            expect(parallel).toBeDefined();

            const branches = parallel.children.filter((c) => c.type === 'execution');
            expect(branches.map((b) => b.metadata.role).sort()).toEqual(['analyze', 'critic']);
        });
    });

    describe('Common structure', () => {
        it('preserves llm_exchange boundaries across all shapes', () => {
            [taskSession, sequenceSession, parallelSession].forEach((session) => {
                const tree = buildSessionTree(session);
                const all = [];
                const flatten = (n) => {
                    all.push(n);
                    (n.children || []).forEach(flatten);
                };
                flatten(tree);
                expect(all.filter((n) => n.type === 'llm_exchange').length).toBeGreaterThan(0);
            });
        });

        it('maintains chronological order at each level', () => {
            [taskSession, sequenceSession, parallelSession].forEach((session) => {
                const tree = buildSessionTree(session);
                const checkOrder = (node) => {
                    const kids = node.children || [];
                    for (let i = 1; i < kids.length; i++) {
                        const prev = new Date(kids[i - 1].time || kids[i - 1].startTime || 0).getTime();
                        const curr = new Date(kids[i].time || kids[i].startTime || 0).getTime();
                        expect(curr).toBeGreaterThanOrEqual(prev);
                    }
                    kids.forEach(checkOrder);
                };
                checkOrder(tree);
            });
        });
    });

    describe('Edge cases', () => {
        it('handles events without boundary metadata gracefully', () => {
            const tree = buildSessionTree(stamp([
                pending,
                { event: 'system.mcp.tools_discovered', parentBoundaryId: 'turn-1' },
                turnStart,
                input,
                ...task('task-1', 'turn-1', 'chat'),
                response,
                turnComplete
            ]));
            expect(tree.type).toBe('root');
            const turn = turnOf(tree);
            expect(executionsOf(turn).length).toBe(1);
        });

        it('marks unclosed boundaries as incomplete', () => {
            const tree = buildSessionTree(stamp([
                pending,
                turnStart,
                { event: 'execution.task.start', eventRole: 'boundary_start', boundaryType: 'execution', boundaryId: 'task-1', parentBoundaryId: 'turn-1', data: { role: 'chat' } },
                { event: 'processing.llm.request', eventRole: 'boundary_start', boundaryType: 'llm_exchange', boundaryId: 'llm-1', parentBoundaryId: 'task-1', data: {} }
                // Note: missing llm.response, task.complete, turn.complete
            ]));
            expect(tree).toBeDefined();

            const turn = tree.children.find((c) => c.type === 'turn');
            const taskNode = turn.children.find((c) => c.type === 'execution');
            expect(taskNode.status).toBe('incomplete');
        });
    });
});
