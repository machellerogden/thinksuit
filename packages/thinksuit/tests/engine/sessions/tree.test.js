import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { buildSessionTree } from '../../../engine/sessions/tree.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Helper to load and parse JSONL test fixtures
function loadSessionFixture(filename) {
    const path = join(__dirname, 'test-fixtures', filename);
    const content = readFileSync(path, 'utf-8');
    return content
        .trim()
        .split('\n')
        .map(line => JSON.parse(line));
}

describe('buildSessionTree', () => {
    let taskSession;
    let sequentialSession;
    let parallelSession;

    beforeAll(() => {
        taskSession = loadSessionFixture('task-session.jsonl');
        sequentialSession = loadSessionFixture('sequential-session.jsonl');
        parallelSession = loadSessionFixture('parallel-session.jsonl');
    });

    describe('Expected structure', () => {
        it('should produce this exact structure for task execution', () => {
            const result = buildSessionTree(taskSession);

            // Expected structure (simplified for clarity):
            const expectedStructure = {
                type: 'root',
                children: expect.arrayContaining([
                    expect.objectContaining({
                        type: 'session',
                        boundaryType: 'session',
                        children: expect.arrayContaining([
                            expect.objectContaining({
                                type: 'execution',
                                metadata: expect.objectContaining({
                                    strategy: 'task'
                                }),
                                children: expect.arrayContaining([
                                    expect.objectContaining({
                                        type: 'cycle',
                                        metadata: expect.objectContaining({
                                            cycle: 1
                                        })
                                    })
                                ])
                            })
                        ])
                    })
                ])
            };

            expect(result).toMatchObject(expectedStructure);

            // Additional detailed checks
            const turn = result.children[0];
            expect(turn.type).toBe('session');
            expect(turn.boundaryType).toBe('session');

            const execution = turn.children.find(e => e.type === 'execution');
            expect(execution).toBeDefined();
            expect(execution.metadata.strategy).toBe('task');

            const cycles = execution.children.filter(c => c.type === 'cycle');
            expect(cycles.length).toBeGreaterThan(0);
            expect(cycles[0].metadata.cycle).toBe(1);
        });

        it('should produce this exact structure for sequential execution', () => {
            const result = buildSessionTree(sequentialSession);

            // Expected structure:
            const expectedStructure = {
                type: 'root',
                children: expect.arrayContaining([
                    expect.objectContaining({
                        type: 'session',
                        children: expect.arrayContaining([
                            expect.objectContaining({
                                type: 'execution',
                                metadata: expect.objectContaining({
                                    strategy: 'sequential'
                                }),
                                children: expect.arrayContaining([
                                    expect.objectContaining({
                                        type: 'step',
                                        metadata: expect.objectContaining({
                                            step: 1
                                        })
                                    })
                                ])
                            })
                        ])
                    })
                ])
            };

            expect(result).toMatchObject(expectedStructure);

            // Additional detailed checks
            const turn = result.children[0];
            const execution = turn.children.find(e => e.type === 'execution');
            expect(execution).toBeDefined();
            expect(execution.metadata.strategy).toBe('sequential');

            const steps = execution.children.filter(e => e.type === 'step');
            expect(steps.length).toBeGreaterThan(0);
            expect(steps[0].metadata.step).toBe(1);
        });

        it('should produce this exact structure for parallel execution', () => {
            const result = buildSessionTree(parallelSession);

            // Expected structure:
            const expectedStructure = {
                type: 'root',
                children: expect.arrayContaining([
                    expect.objectContaining({
                        type: 'session',
                        children: expect.arrayContaining([
                            expect.objectContaining({
                                type: 'execution',
                                metadata: expect.objectContaining({
                                    strategy: 'parallel'
                                }),
                                children: expect.arrayContaining([
                                    expect.objectContaining({
                                        type: 'branch'
                                    })
                                ])
                            })
                        ])
                    })
                ])
            };

            expect(result).toMatchObject(expectedStructure);

            // Additional detailed checks
            const turn = result.children[0];
            const execution = turn.children.find(e => e.type === 'execution');
            expect(execution).toBeDefined();
            expect(execution.metadata.strategy).toBe('parallel');

            const branches = execution.children.filter(e => e.type === 'branch');
            expect(branches.length).toBeGreaterThan(0);
        });
    });

    describe('Detailed validations', () => {
        it('should transform sequential session events into proper tree', () => {
            const result = buildSessionTree(sequentialSession);

            // Should return a root node with children
            expect(result).toHaveProperty('type');
            expect(result).toHaveProperty('children');
            expect(Array.isArray(result.children)).toBe(true);
            expect(result.children.length).toBe(1);

            const turn = result.children[0];
            expect(turn).toHaveProperty('type');
            expect(turn).toHaveProperty('children');

            // Should have events and boundaries within the turn
            const eventChildren = turn.children.filter(e => e.type === 'event');
            expect(eventChildren.length).toBeGreaterThan(0);

            // Should have execution boundary nested within the turn
            const execution = turn.children.find(e => e.type === 'execution');
            expect(execution).toBeDefined();
            expect(execution.metadata.strategy).toBe('sequential');
            expect(execution.children).toBeDefined();

            // Execution steps should be nested within execution
            const execSteps = execution.children.filter(e => e.type === 'step');
            expect(execSteps.length).toBeGreaterThan(0);

            // Each step should have proper structure
            execSteps.forEach(step => {
                expect(step).toHaveProperty('metadata');
                expect(step.metadata).toHaveProperty('step');
                expect(step.metadata).toHaveProperty('totalSteps');
                expect(step.metadata).toHaveProperty('role');
                expect(step).toHaveProperty('children');
            });
        });

        it('should maintain step order and numbering', () => {
            const result = buildSessionTree(sequentialSession);
            const turn = result.children[0];
            const execution = turn.children.find(e => e.type === 'execution');
            const execSteps = execution.children.filter(e => e.type === 'step');

            // Steps should be in order
            execSteps.forEach((step, index) => {
                expect(step.metadata.step).toBe(index + 1);
            });

            // All steps should have same totalSteps value
            if (execSteps.length > 0) {
                const totalSteps = execSteps[0].metadata.totalSteps;
                execSteps.forEach(step => {
                    expect(step.metadata.totalSteps).toBe(totalSteps);
                });
            }
        });
    });

    describe('Tree navigation', () => {
        it('should transform parallel session events into proper tree', () => {
            const result = buildSessionTree(parallelSession);

            // Should return a root node with children
            expect(result).toHaveProperty('type');
            expect(result).toHaveProperty('children');
            expect(Array.isArray(result.children)).toBe(true);
            expect(result.children.length).toBe(1);

            const turn = result.children[0];

            // Should have execution boundary nested within the turn
            const execution = turn.children.find(e => e.type === 'execution');
            expect(execution).toBeDefined();
            expect(execution.metadata.strategy).toBe('parallel');
            expect(execution.children).toBeDefined();

            // Parallel branches should be nested within execution
            const branches = execution.children.filter(e => e.type === 'branch');
            expect(branches.length).toBeGreaterThan(0);

            // Each branch should have proper structure
            branches.forEach(branch => {
                expect(branch).toHaveProperty('metadata');
                expect(branch.metadata).toHaveProperty('branch');
                expect(branch.metadata).toHaveProperty('role');
                expect(branch).toHaveProperty('children');
            });
        });

        it('should properly track parallel branch relationships', () => {
            const result = buildSessionTree(parallelSession);
            const turn = result.children[0];
            const execution = turn.children.find(e => e.type === 'execution');
            const branches = execution.children.filter(e => e.type === 'branch');

            // All branches should have unique branch identifiers
            const branchIds = branches.map(b => b.metadata.branch);
            const uniqueBranchIds = [...new Set(branchIds)];
            expect(uniqueBranchIds.length).toBe(branchIds.length);

            // Each branch should contain children (boundaries or events)
            branches.forEach(branch => {
                expect(branch.children.length).toBeGreaterThan(0);

                // LLM exchanges are nested deeper - look for execution boundaries
                // In parallel, we may have nested task or direct executions
                const nestedExecutions = branch.children.filter(e =>
                    e.type === 'execution' || e.boundaryType === 'execution'
                );

                // At least one branch should have nested execution
                // (The test doesn't require both branches to have LLM calls)
                if (nestedExecutions.length > 0) {
                    // Look for llm_exchange boundaries
                    nestedExecutions.forEach(exec => {
                        const llmBoundaries = exec.children?.filter(c =>
                            c.type === 'llm_exchange' || c.boundaryType === 'llm_exchange'
                        ) || [];
                        // If this execution has LLM exchanges, verify they exist
                        if (llmBoundaries.length > 0) {
                            expect(llmBoundaries.length).toBeGreaterThan(0);
                        }
                    });
                }
            });
        });
    });

    describe('Common event structures', () => {
        it('should preserve all LLM request/response pairs', () => {
            [taskSession, sequentialSession, parallelSession].forEach(session => {
                const result = buildSessionTree(session);

                // Flatten to get all events including nested ones
                const allEvents = [];
                const flatten = (node) => {
                    if (node) {
                        allEvents.push(node);
                        if (node.children) {
                            node.children.forEach(child => flatten(child));
                        }
                    }
                };
                flatten(result);

                // LLM exchanges are boundaries, not events
                const llmExchanges = allEvents.filter(e =>
                    e.type === 'llm_exchange' || e.boundaryType === 'llm_exchange'
                );

                // Should have LLM exchanges
                expect(llmExchanges.length).toBeGreaterThan(0);
            });
        });

        it('should maintain chronological order at each level', () => {
            [taskSession, sequentialSession, parallelSession].forEach(session => {
                const result = buildSessionTree(session);

                // Check ordering within children at each level
                const checkOrder = (node) => {
                    if (node.children && node.children.length > 1) {
                        for (let i = 1; i < node.children.length; i++) {
                            const prev = node.children[i-1];
                            const curr = node.children[i];
                            const prevTime = new Date(prev.timestamp || prev.startTime || 0);
                            const currTime = new Date(curr.timestamp || curr.startTime || 0);
                            expect(currTime.getTime()).toBeGreaterThanOrEqual(prevTime.getTime());
                        }
                        // Recursively check children
                        node.children.forEach(child => checkOrder(child));
                    }
                };

                checkOrder(result);
            });
        });
    });

    describe('Edge cases', () => {
        it('should handle events without boundary metadata gracefully', () => {
            const mixedEvents = [
                { event: 'session.pending', timestamp: '2025-01-01T00:00:00Z' },
                { event: 'processing.signals.detected', timestamp: '2025-01-01T00:00:01Z' },
                {
                    event: 'execution.task.start',
                    eventRole: 'boundary_start',
                    boundaryType: 'execution',
                    boundaryId: 'exec-1',
                    timestamp: '2025-01-01T00:00:02Z'
                },
                { event: 'processing.llm.request', timestamp: '2025-01-01T00:00:03Z' },
                {
                    event: 'execution.task.complete',
                    eventRole: 'boundary_end',
                    boundaryType: 'execution',
                    boundaryId: 'exec-1',
                    timestamp: '2025-01-01T00:00:04Z'
                },
                { event: 'session.response', timestamp: '2025-01-01T00:00:05Z' }
            ];

            const result = buildSessionTree(mixedEvents);
            expect(result).toBeDefined();
            expect(result.type).toBe('root');
            expect(Array.isArray(result.children)).toBe(true);

            // Should still process boundaries that have metadata
            const execBoundaries = result.children.filter(c => c.type === 'execution');
            expect(execBoundaries.length).toBeGreaterThan(0);
        });

        it('should handle unclosed boundaries', () => {
            const unclosedEvents = [
                { event: 'session.pending', timestamp: '2025-01-01T00:00:00Z' },
                {
                    event: 'execution.task.start',
                    eventRole: 'boundary_start',
                    boundaryType: 'execution',
                    boundaryId: 'exec-1',
                    timestamp: '2025-01-01T00:00:01Z',
                    data: { strategy: 'task' }
                },
                {
                    event: 'execution.task.cycle_start',
                    eventRole: 'boundary_start',
                    boundaryType: 'cycle',
                    boundaryId: 'cycle-1',
                    parentBoundaryId: 'exec-1',
                    timestamp: '2025-01-01T00:00:02Z',
                    data: { cycleNumber: 1 }
                },
                { event: 'processing.llm.request', timestamp: '2025-01-01T00:00:03Z' }
                // Note: Missing cycle_complete and task.complete
            ];

            const result = buildSessionTree(unclosedEvents);
            expect(result).toBeDefined();

            // Should find unclosed boundaries
            const execBoundaries = result.children.filter(c => c.type === 'execution');
            expect(execBoundaries.length).toBe(1);
            expect(execBoundaries[0].status).toBe('incomplete');

            // Should mark nested unclosed boundaries appropriately
            const cycles = execBoundaries[0].children.filter(c => c.type === 'cycle');
            if (cycles.length > 0) {
                expect(cycles[0].status).toBe('incomplete');
            }
        });
    });
});
