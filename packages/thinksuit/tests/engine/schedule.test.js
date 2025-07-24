import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

vi.mock('../../engine/utils/id.js');
vi.mock('../../engine/transports/session-router.js');
vi.mock('../../engine/sessions/index.js');

describe('schedule', () => {
    let tempDir;
    let schedule;
    let mockId;
    let mockSessionRouter;
    let mockSessions;
    /* eslint-disable no-unused-vars */
    let mockExecution;

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();

        tempDir = mkdtempSync(join(tmpdir(), 'thinksuit-test-'));
        process.env.THINKSUIT_HOME = tempDir;

        mockId = await import('../../engine/utils/id.js');
        mockSessionRouter = await import('../../engine/transports/session-router.js');
        mockSessions = await import('../../engine/sessions/index.js');

        mockId.generateId = vi.fn().mockReturnValue('20250109T190000000Z-abc123');

        // Mock successful execution promise
        mockExecution = Promise.resolve({
            response: 'Test response',
            usage: { tokens: 100 }
        });

        // Mock acquireSession to return success/failure
        mockSessionRouter.acquireSession = vi.fn().mockResolvedValue({
            success: true,
            reason: null
        });

        // Mock loadSessionThread for existing sessions
        mockSessionRouter.loadSessionThread = vi.fn().mockResolvedValue([]);

        // Mock forkSession
        mockSessions.forkSession = vi.fn().mockResolvedValue({
            success: true,
            sessionId: 'forked-session-id'
        });

        // Mock the run function
        vi.doMock('../../engine/run.js', () => ({
            run: vi.fn().mockResolvedValue({
                response: 'Test response',
                usage: { tokens: 100 }
            })
        }));

        const scheduleModule = await import('../../engine/schedule.js');
        schedule = scheduleModule.schedule;
    });

    afterEach(() => {
        if (tempDir) {
            rmSync(tempDir, { recursive: true, force: true });
        }
        delete process.env.THINKSUIT_HOME;
        vi.resetModules();
    });

    describe('Basic functionality', () => {
        it('should create a new session when no sessionId provided', async () => {
            const result = await schedule({
                input: 'Test input',
                apiKey: 'test-key'
            });

            expect(result.sessionId).toBe('20250109T190000000Z-abc123');
            expect(result.isNew).toBe(true);
            expect(result.scheduled).toBe(true);
            expect(mockId.generateId).toHaveBeenCalled();
        });

        it('should resume existing session when sessionId provided', async () => {
            // Mock existing session with thread
            mockSessionRouter.loadSessionThread.mockResolvedValue([
                { role: 'user', content: 'Previous message' },
                { role: 'assistant', content: 'Previous response' }
            ]);

            const result = await schedule({
                input: 'Follow-up message',
                sessionId: 'existing-session',
                apiKey: 'test-key'
            });

            expect(result.sessionId).toBe('existing-session');
            expect(result.isNew).toBe(false);
            expect(result.scheduled).toBe(true);
            expect(mockId.generateId).not.toHaveBeenCalled();
        });

        it('should handle session not acquired', async () => {
            mockSessionRouter.acquireSession.mockResolvedValue({
                success: false,
                reason: 'Session is busy'
            });

            const result = await schedule({
                input: 'Test',
                sessionId: 'busy-session',
                apiKey: 'test-key'
            });

            expect(result.scheduled).toBe(false);
            expect(result.reason).toContain('busy');

            // Handle the rejected promise to avoid unhandled rejection
            await expect(result.execution).rejects.toThrow('Session is busy');
        });

        it('should return execution promise', async () => {
            const result = await schedule({
                input: 'Test input',
                apiKey: 'test-key'
            });

            expect(result.execution).toBeInstanceOf(Promise);

            const executionResult = await result.execution;
            expect(executionResult.response).toBe('Test response');
        });
    });

    describe('Configuration handling', () => {
        it('should pass configuration to run function', async () => {
            await schedule({
                input: 'Test',
                apiKey: 'test-key',
                model: 'gpt-4',
                provider: 'openai',
                maxDepth: 10,
                trace: true
            });

            const { run } = await import('../../engine/run.js');
            expect(run).toHaveBeenCalledWith(
                expect.objectContaining({
                    sessionId: '20250109T190000000Z-abc123',
                    input: 'Test',
                    apiKey: 'test-key',
                    model: 'gpt-4',
                    provider: 'openai',
                    maxDepth: 10,
                    trace: true,
                    _thread: []
                })
            );
        });

        it('should handle module configuration', async () => {
            await schedule({
                input: 'Test',
                apiKey: 'test-key',
                module: 'thinksuit/mu'
            });

            const { run } = await import('../../engine/run.js');
            expect(run).toHaveBeenCalledWith(
                expect.objectContaining({
                    module: 'thinksuit/mu'
                })
            );
        });
    });

    describe('Session forking', () => {
        it('should fork session when sourceSessionId provided', async () => {
            const result = await schedule({
                input: 'Forked input',
                sourceSessionId: 'original-session',
                forkFromIndex: 3,
                apiKey: 'test-key'
            });

            expect(mockSessions.forkSession).toHaveBeenCalledWith('original-session', 3);
            expect(result.sessionId).toBe('forked-session-id');
            expect(result.isForked).toBe(true);
        });

        it('should handle fork failure', async () => {
            mockSessions.forkSession.mockResolvedValue({
                success: false,
                error: 'Fork failed'
            });

            const result = await schedule({
                input: 'Test',
                sourceSessionId: 'original-session',
                forkFromIndex: 3,
                apiKey: 'test-key'
            });

            expect(result.scheduled).toBe(false);
            expect(result.reason).toContain('Fork failed');

            // Handle the rejected promise to avoid unhandled rejection
            await expect(result.execution).rejects.toThrow('Fork failed');
        });
    });

    describe('Error handling', () => {
        it('should handle execution failure', async () => {
            const { run } = await import('../../engine/run.js');
            run.mockRejectedValue(new Error('LLM provider error'));

            const result = await schedule({
                input: 'Test',
                apiKey: 'test-key'
            });

            await expect(result.execution).rejects.toThrow('LLM provider error');
        });

        it('should validate schedule returns execution promise', async () => {
            const result = await schedule({
                input: 'Test',
                apiKey: 'test-key'
            });

            expect(result.execution).toBeInstanceOf(Promise);
            const executionResult = await result.execution;
            expect(executionResult.response).toBe('Test response');
        });
    });
});
