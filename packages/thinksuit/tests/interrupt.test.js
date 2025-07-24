import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runCycle } from '../engine/runCycle.js';
import { createInterruptController, InterruptError, isInterruptError } from '../engine/errors/InterruptError.js';
import { initializeHandlers } from '../engine/handlers/index.js';

describe('Interrupt Support', () => {
    let logger;
    let handlers;
    let machineDefinition;

    beforeEach(() => {
        logger = {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
            child: function() { return this; },
            bindings: function() { return {}; }
        };

        handlers = initializeHandlers();
        machineDefinition = {
            StartAt: 'DetectSignals',
            States: {
                DetectSignals: {
                    Type: 'Task',
                    Resource: 'detectSignals',
                    End: true
                }
            }
        };
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('InterruptError', () => {
        it('should create interrupt error with context', () => {
            const error = new InterruptError('Test interrupt', {
                stage: 'test-stage',
                cycleCount: 2,
                tokensUsed: 100
            });

            expect(error.message).to.equal('Test interrupt');
            expect(error.isInterrupt).to.be.true;
            expect(error.stage).to.equal('test-stage');
            expect(error.cycleCount).to.equal(2);
            expect(error.tokensUsed).to.equal(100);
        });

        it('should identify interrupt errors correctly', () => {
            const interruptError = new InterruptError('Interrupted');
            const normalError = new Error('Regular error');

            expect(isInterruptError(interruptError)).to.be.true;
            expect(isInterruptError(normalError)).to.be.false;
        });

        it('should determine if synthesis is possible', () => {
            const errorWithData = new InterruptError('Interrupted', {
                gatheredData: { some: 'data' }
            });
            const errorWithThread = new InterruptError('Interrupted', {
                thread: [{ role: 'user', content: 'test' }, { role: 'assistant', content: 'response' }]
            });
            const errorWithoutData = new InterruptError('Interrupted');

            expect(errorWithData.canSynthesize()).to.be.true;
            expect(errorWithThread.canSynthesize()).to.be.true;
            expect(errorWithoutData.canSynthesize()).to.be.false;
        });
    });

    describe('createInterruptController', () => {
        it('should create controller with interrupt method', () => {
            const controller = createInterruptController();

            expect(controller).to.have.property('signal');
            expect(controller).to.have.property('interrupt');
            expect(controller.signal.aborted).to.be.false;
        });

        it('should mark signal as user interrupt when interrupted', () => {
            const controller = createInterruptController();

            controller.interrupt('Test reason');

            expect(controller.signal.aborted).to.be.true;
            expect(controller.signal.reason).to.have.property('isUserInterrupt', true);
            expect(controller.signal.reason).to.have.property('reason', 'Test reason');
        });
    });

    describe('runCycle with AbortSignal', () => {
        it('should handle pre-execution abort', async () => {
            const controller = createInterruptController();
            controller.interrupt('Early abort');

            const config = {
                logger,
                thread: [],
                module: { name: 'test' },
                machineDefinition,
                handlers,
                config: { apiKey: 'test' },
                abortSignal: controller.signal
            };

            const [status, result] = await runCycle(config);

            expect(status).to.equal('interrupted');
            expect(result).to.have.property('interrupted', true);
            expect(result).to.have.property('message', 'Task interrupted by user');
        });

        it('should propagate abort signal to handlers', async () => {
            const controller = createInterruptController();
            const mockHandler = vi.fn();

            // Override a handler to check signal propagation
            handlers.detectSignals = (input, context) => {
                expect(context).to.have.property('abortSignal');
                expect(context.abortSignal).to.equal(controller.signal);
                mockHandler();
                return { signals: [] };
            };

            const config = {
                logger,
                thread: [{ role: 'user', content: 'test' }],
                module: { name: 'test' },
                machineDefinition,
                handlers,
                config: { apiKey: 'test' },
                abortSignal: controller.signal
            };

            await runCycle(config);
            expect(mockHandler).toHaveBeenCalled();
        });

        it('should interrupt during execution', async () => {
            const controller = createInterruptController();
            let handlerCalled = false;

            // Create a handler that simulates work then gets interrupted
            handlers.detectSignals = async (input, context) => {
                handlerCalled = true;

                // Simulate some async work
                await new Promise(resolve => setTimeout(resolve, 50));

                // Check if we should abort
                if (context.abortSignal?.aborted) {
                    throw new InterruptError('Handler interrupted', {
                        stage: 'signal-detection'
                    });
                }

                return { signals: [] };
            };

            const config = {
                logger,
                thread: [{ role: 'user', content: 'test' }],
                module: { name: 'test' },
                machineDefinition,
                handlers,
                config: { apiKey: 'test' },
                abortSignal: controller.signal
            };

            // Start execution
            const executionPromise = runCycle(config);

            // Interrupt after a short delay
            setTimeout(() => controller.interrupt('Test interrupt'), 20);

            const [status, result] = await executionPromise;

            expect(handlerCalled).toBe(true);
            expect(status).toBe('interrupted');
            expect(result).toHaveProperty('interrupted', true);
        });
    });

    describe('Handler interrupt support', () => {
        it('should handle interrupts in execTask', async () => {
            const { execTaskCore } = await import('../engine/handlers/execTask.js');
            const controller = createInterruptController();

            const input = {
                plan: {
                    role: 'assistant',
                    resolution: {
                        maxCycles: 3,
                        maxTokens: 1000,
                        maxToolCalls: 5
                    }
                },
                thread: [{ role: 'user', content: 'test' }],
                context: { traceId: 'test-trace' }
            };

            const machineContext = {
                module: {},
                config: { apiKey: 'test' },
                execLogger: logger,
                abortSignal: controller.signal,
                machineDefinition: {},
                handlers: {}
            };

            // Interrupt immediately
            controller.interrupt('Test');

            try {
                await execTaskCore(input, machineContext);
                throw new Error('Should have thrown InterruptError');
            } catch (error) {
                expect(isInterruptError(error)).to.be.true;
                expect(error.stage).to.equal('task-cycle');
            }
        });

        it('should handle interrupts in execSequential', async () => {
            const { execSequentialCore } = await import('../engine/handlers/execSequential.js');
            const controller = createInterruptController();

            const input = {
                plan: {
                    sequence: ['role1', 'role2', 'role3']
                },
                thread: [{ role: 'user', content: 'test' }],
                context: { traceId: 'test-trace' }
            };

            const machineContext = {
                module: {},
                config: { apiKey: 'test' },
                execLogger: logger,
                abortSignal: controller.signal,
                machineDefinition: {},
                handlers: {}
            };

            // Interrupt immediately
            controller.interrupt('Test');

            try {
                await execSequentialCore(input, machineContext);
                throw new Error('Should have thrown InterruptError');
            } catch (error) {
                expect(isInterruptError(error)).to.be.true;
                expect(error.stage).to.equal('sequential-step');
            }
        });

        it('should handle interrupts in execParallel', async () => {
            const { execParallelCore } = await import('../engine/handlers/execParallel.js');
            const controller = createInterruptController();

            const input = {
                plan: {
                    roles: ['role1', 'role2', 'role3']
                },
                thread: [{ role: 'user', content: 'test' }],
                context: { traceId: 'test-trace' }
            };

            const machineContext = {
                module: {},
                config: { apiKey: 'test' },
                execLogger: logger,
                abortSignal: controller.signal,
                machineDefinition: {},
                handlers: {}
            };

            // Interrupt immediately
            controller.interrupt('Test');

            try {
                await execParallelCore(input, machineContext);
                throw new Error('Should have thrown InterruptError');
            } catch (error) {
                expect(isInterruptError(error)).to.be.true;
                expect(error.stage).to.equal('parallel-start');
            }
        });
    });
});